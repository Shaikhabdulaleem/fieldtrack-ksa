/**
 * seed-streets.ts
 * Fetches real named streets from OpenStreetMap (Overpass API) for Jeddah + Riyadh,
 * assigns each street to its district using point-in-polygon, then inserts into DB.
 *
 * Run: npx tsx src/db/seed-streets.ts
 */

import "../config/env";
import { db } from "./index";
import { cities, districts, streets } from "./schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

// ── Point-in-polygon (ray casting) ────────────────────────────────────────────
function pointInPolygon(lat: number, lng: number, boundary: number[][]): boolean {
  let inside = false;
  const n = boundary.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = boundary[i][0], yi = boundary[i][1];
    const xj = boundary[j][0], yj = boundary[j][1];
    const intersect = ((yi > lng) !== (yj > lng)) &&
      (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// ── Fetch streets from Overpass ────────────────────────────────────────────────
async function fetchStreets(bbox: string, cityLabel: string): Promise<Array<{
  osmId: number;
  nameEn: string;
  nameAr: string;
  lat: number;
  lng: number;
}>> {
  const query = `[out:json][timeout:180];
(
  way["highway"]["name"](${bbox});
);
out center;`;

  console.log(`  Querying Overpass for ${cityLabel}...`);
  const ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];

  let attempt = 0;
  while (attempt < 4) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "FieldTrackKSA/1.0 (construction-lead-saas; contact@fieldtrack.sa)",
          "Accept": "application/json",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(200000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { elements: Array<{
        id: number;
        center?: { lat: number; lon: number };
        tags?: { name?: string; "name:ar"?: string; "name:en"?: string };
      }> };

      const results = (data.elements ?? [])
        .filter(el => el.center && el.tags?.name)
        .map(el => ({
          osmId: el.id,
          nameEn: el.tags?.["name:en"] || el.tags?.name || "",
          nameAr: el.tags?.["name:ar"] || el.tags?.name || "",
          lat: el.center!.lat,
          lng: el.center!.lon,
        }))
        .filter(s => s.nameEn.trim().length > 0);

      console.log(`  Got ${results.length} named streets from OSM`);
      return results;
    } catch (err) {
      attempt++;
      if (attempt === 4) throw err;
      console.log(`  Attempt ${attempt} failed (${url}), retrying in 8s...`);
      await new Promise(r => setTimeout(r, 8000));
    }
  }
  return [];
}

// ── Assign streets to districts ────────────────────────────────────────────────
function assignToDistricts(
  osmStreets: Array<{ osmId: number; nameEn: string; nameAr: string; lat: number; lng: number }>,
  districtList: Array<{ id: string; cityId: string; nameEn: string; boundary: number[][] | null }>,
): Array<{ districtId: string; cityId: string; nameEn: string; nameAr: string }> {
  const assigned: Array<{ districtId: string; cityId: string; nameEn: string; nameAr: string }> = [];
  const seen = new Set<string>(); // deduplicate by name+district

  for (const street of osmStreets) {
    for (const dist of districtList) {
      if (!dist.boundary || dist.boundary.length < 3) continue;
      if (pointInPolygon(street.lat, street.lng, dist.boundary)) {
        const key = `${dist.id}::${street.nameEn.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          assigned.push({
            districtId: dist.id,
            cityId: dist.cityId,
            nameEn: street.nameEn,
            nameAr: street.nameAr,
          });
        }
        break; // only assign to first matching district
      }
    }
  }

  return assigned;
}

async function importCityStreets(cityNameEn: string, bbox: string) {
  console.log(`\n── ${cityNameEn} ──`);

  const [city] = await db.select().from(cities).where(eq(cities.nameEn, cityNameEn)).limit(1);
  if (!city) { console.log(`  City not found, skipping`); return; }

  // Clear existing streets
  const deleted = await db.delete(streets).where(eq(streets.cityId, city.id)).returning({ id: streets.id });
  console.log(`  Cleared ${deleted.length} existing streets`);

  // Load districts with boundaries
  const distList = await db.execute(sql`
    SELECT id, city_id, name_en, boundary FROM districts WHERE city_id = ${city.id} AND boundary IS NOT NULL
  `);
  const districtList = distList.map(d => ({
    id: String(d.id),
    cityId: String(d.city_id),
    nameEn: String(d.name_en),
    boundary: d.boundary as number[][] | null,
  }));
  console.log(`  ${districtList.length} districts with boundaries loaded`);

  // Fetch streets from OSM
  const osmStreets = await fetchStreets(bbox, cityNameEn);

  // Assign to districts
  const assigned = assignToDistricts(osmStreets, districtList);
  console.log(`  ${assigned.length} streets matched to districts`);

  if (!assigned.length) {
    console.log(`  No streets to insert`);
    return;
  }

  // Insert in batches of 100
  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < assigned.length; i += BATCH) {
    const batch = assigned.slice(i, i + BATCH);
    await db.insert(streets).values(batch.map(s => ({
      cityId: s.cityId,
      districtId: s.districtId,
      nameEn: s.nameEn,
      nameAr: s.nameAr,
      status: "not_assigned" as const,
    })));
    inserted += batch.length;
    process.stdout.write(`\r  Inserted ${inserted}/${assigned.length}`);
  }
  console.log();

  // Report per-district counts
  const counts = await db.execute(sql`
    SELECT d.name_en, count(s.id) as street_count
    FROM districts d
    LEFT JOIN streets s ON s.district_id = d.id
    WHERE d.city_id = ${city.id}
    GROUP BY d.name_en
    HAVING count(s.id) > 0
    ORDER BY count(s.id) DESC
    LIMIT 10
  `);
  console.log(`  Top districts by street count:`);
  counts.forEach(r => console.log(`    ${r.name_en}: ${r.street_count}`));
}

async function main() {
  // Jeddah: lat 21.25–21.92, lng 38.90–39.50
  await importCityStreets("Jeddah", "21.25,38.90,21.92,39.50");

  // Riyadh: lat 24.45–25.15, lng 46.45–47.10
  await importCityStreets("Riyadh", "24.45,46.45,25.15,47.10");

  const [total] = await db.execute(sql`SELECT count(*) as total FROM streets`);
  console.log(`\n✅ Done! Total streets in DB: ${total.total}`);
}

main().catch(e => { console.error(e); process.exit(1); });
