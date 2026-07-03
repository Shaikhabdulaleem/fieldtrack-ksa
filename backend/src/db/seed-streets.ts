/**
 * seed-streets.ts
 * Fetches real named streets (with full polyline geometry) from OpenStreetMap
 * (Overpass API) for Jeddah + Riyadh, computes each street's road length in km,
 * assigns each street to its district using point-in-polygon, then inserts/
 * upserts into DB.
 *
 * Run: npm run seed:streets
 *
 * Re-running is safe: streets are matched by (cityId, osmId) — see the
 * streets_city_osm_uidx unique index — so a re-run only refreshes length_km/
 * geometry/names for existing streets rather than creating duplicates or
 * wiping driverAssignments/survey_zones history.
 *
 * One-time exception: any pre-existing "legacy" streets for a city that have
 * no osmId (from the original center-point-only import, before this rewrite)
 * cannot be matched by id — they're enriched in place by (district, name)
 * matching instead, never deleted. See loadLegacyStreetKeys().
 */

import "../config/env";
import { db } from "./index";
import { cities, streets } from "./schema";
import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import { pointInPolygon } from "./lib/pointInPolygon";
import { lineString, length as turfLength } from "@turf/turf";
import { recomputeDistrictRoadKm } from "../services/surveyZone.service";

// Road types included in road-km calculations, per the District-Based Driver
// Survey Coverage Planner spec. Deliberately excludes footway/cycleway/path/
// construction/private roads (anything not in this list).
const ALLOWED_HIGHWAY_TYPES = [
  "motorway", "trunk", "primary", "secondary", "tertiary",
  "residential", "service", "unclassified", "living_street",
];

type OsmStreet = {
  osmId: string;
  nameEn: string;
  nameAr: string;
  lat: number; // representative point (midpoint), for district assignment
  lng: number;
  lengthKm: number;
  geometry: [number, number][]; // [lat,lng][] pairs, this codebase's convention
};

// ── Fetch streets (with geometry) from Overpass ────────────────────────────────
async function fetchStreets(bbox: string, cityLabel: string): Promise<OsmStreet[]> {
  const highwayRegex = `^(${ALLOWED_HIGHWAY_TYPES.join("|")})$`;
  const query = `[out:json][timeout:180];
(
  way["highway"~"${highwayRegex}"]["name"](${bbox});
);
out geom;`;

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
        geometry?: Array<{ lat: number; lon: number }>;
        tags?: { name?: string; "name:ar"?: string; "name:en"?: string };
      }> };

      const results: OsmStreet[] = [];
      for (const el of data.elements ?? []) {
        if (!el.tags?.name || !el.geometry || el.geometry.length < 2) continue;
        const nameEn = el.tags["name:en"] || el.tags.name || "";
        const nameAr = el.tags["name:ar"] || el.tags.name || "";
        if (!nameEn.trim()) continue;

        // turf/GeoJSON coordinate order is [lng,lat] — the OPPOSITE of this
        // codebase's [lat,lng] convention used everywhere else. This is the
        // only place that conversion happens; be careful editing it.
        const geoJsonCoords = el.geometry.map(p => [p.lon, p.lat]);
        let lengthKm: number;
        try {
          lengthKm = turfLength(lineString(geoJsonCoords), { units: "kilometers" });
        } catch {
          continue; // degenerate geometry (e.g. all points identical)
        }
        if (!Number.isFinite(lengthKm) || lengthKm <= 0) continue;

        const mid = el.geometry[Math.floor(el.geometry.length / 2)];

        results.push({
          osmId: String(el.id),
          nameEn,
          nameAr,
          lat: mid.lat,
          lng: mid.lon,
          lengthKm,
          geometry: el.geometry.map(p => [p.lat, p.lon] as [number, number]),
        });
      }

      console.log(`  Got ${results.length} named streets with geometry from OSM`);
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
  osmStreets: OsmStreet[],
  districtList: Array<{ id: string; cityId: string; boundary: number[][] | null }>,
): Array<OsmStreet & { districtId: string; cityId: string }> {
  const assigned: Array<OsmStreet & { districtId: string; cityId: string }> = [];

  for (const street of osmStreets) {
    for (const dist of districtList) {
      if (!dist.boundary || dist.boundary.length < 3) continue;
      if (pointInPolygon(street.lat, street.lng, dist.boundary)) {
        assigned.push({ ...street, districtId: dist.id, cityId: dist.cityId });
        break; // only assign to first matching district
      }
    }
  }

  return assigned;
}

// ── Enrich pre-osmId legacy streets in place (no deletion) ─────────────────────
// The original import never stored osmId, so those rows can't be matched by
// id for upsert. Rather than delete them (which would cascade-break the
// driverAssignments referencing them), match each legacy row to a fresh OSM
// street by (districtId, nameEn) and UPDATE it in place — same row id, so
// existing assignments stay valid. Only OSM streets with no legacy-name match
// get inserted as new rows. Legacy rows with no OSM match are left completely
// untouched (still valid, just no length_km — shows as "no road data" gray).
async function loadLegacyStreetKeys(cityId: string): Promise<Map<string, string>> {
  const legacy = await db
    .select({ id: streets.id, nameEn: streets.nameEn, districtId: streets.districtId })
    .from(streets)
    .where(and(eq(streets.cityId, cityId), isNull(streets.osmId)));
  const map = new Map<string, string>();
  for (const row of legacy) {
    if (!row.nameEn || !row.districtId) continue;
    const key = `${row.districtId}::${row.nameEn.toLowerCase().trim()}`;
    if (!map.has(key)) map.set(key, row.id); // first legacy row wins if duplicates exist
  }
  console.log(`  ${legacy.length} legacy (no-osmId) streets loaded for name-match enrichment`);
  return map;
}

async function importCityStreets(cityNameEn: string, bbox: string) {
  console.log(`\n── ${cityNameEn} ──`);

  const [city] = await db.select().from(cities).where(eq(cities.nameEn, cityNameEn)).limit(1);
  if (!city) { console.log(`  City not found, skipping`); return; }

  const legacyByNameDistrict = await loadLegacyStreetKeys(city.id);

  // Load districts with boundaries
  const distList = await db.execute(sql`
    SELECT id, city_id, boundary FROM districts WHERE city_id = ${city.id} AND boundary IS NOT NULL
  `);
  const districtList = distList.map(d => ({
    id: String(d.id),
    cityId: String(d.city_id),
    boundary: d.boundary as number[][] | null,
  }));
  console.log(`  ${districtList.length} districts with boundaries loaded`);

  // Fetch streets (with geometry) from OSM
  const osmStreets = await fetchStreets(bbox, cityNameEn);

  // Assign to districts
  const assigned = assignToDistricts(osmStreets, districtList);
  console.log(`  ${assigned.length} streets matched to districts`);

  if (!assigned.length) {
    console.log(`  No streets to insert`);
    return;
  }

  // Look up which osmIds already exist for this city (from a prior run of
  // this script), to split into insert vs. update-by-osmId vs. enrich-legacy.
  const existing = await db
    .select({ id: streets.id, osmId: streets.osmId })
    .from(streets)
    .where(and(eq(streets.cityId, city.id), inArray(streets.osmId, assigned.map(s => s.osmId))));
  const existingByOsmId = new Map(existing.map(e => [e.osmId, e.id]));

  const toUpdateByOsmId: typeof assigned = [];
  const toEnrichLegacy: Array<(typeof assigned)[number] & { legacyId: string }> = [];
  const toInsert: typeof assigned = [];

  for (const s of assigned) {
    if (existingByOsmId.has(s.osmId)) {
      toUpdateByOsmId.push(s);
      continue;
    }
    const legacyKey = `${s.districtId}::${s.nameEn.toLowerCase().trim()}`;
    const legacyId = legacyByNameDistrict.get(legacyKey);
    if (legacyId) {
      legacyByNameDistrict.delete(legacyKey); // consume — only one segment enriches this row
      toEnrichLegacy.push({ ...s, legacyId });
    } else {
      toInsert.push(s);
    }
  }

  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    await db.insert(streets).values(batch.map(s => ({
      cityId: s.cityId,
      districtId: s.districtId,
      nameEn: s.nameEn,
      nameAr: s.nameAr,
      osmId: s.osmId,
      lengthKm: s.lengthKm.toFixed(3),
      geometry: s.geometry,
      status: "not_assigned" as const,
    })));
    inserted += batch.length;
    process.stdout.write(`\r  Inserted ${inserted}/${toInsert.length}`);
  }
  if (toInsert.length) console.log();

  const UPDATE_CONCURRENCY = 20;
  let updated = 0;
  for (let i = 0; i < toUpdateByOsmId.length; i += UPDATE_CONCURRENCY) {
    const batch = toUpdateByOsmId.slice(i, i + UPDATE_CONCURRENCY);
    await Promise.all(batch.map(s =>
      db.update(streets)
        .set({
          nameEn: s.nameEn,
          nameAr: s.nameAr,
          districtId: s.districtId,
          lengthKm: s.lengthKm.toFixed(3),
          geometry: s.geometry,
        })
        .where(and(eq(streets.cityId, s.cityId), eq(streets.osmId, s.osmId)))
    ));
    updated += batch.length;
    process.stdout.write(`\r  Updated ${updated}/${toUpdateByOsmId.length}`);
  }
  if (toUpdateByOsmId.length) console.log();

  let enriched = 0;
  for (let i = 0; i < toEnrichLegacy.length; i += UPDATE_CONCURRENCY) {
    const batch = toEnrichLegacy.slice(i, i + UPDATE_CONCURRENCY);
    // Enrich in place — keeps the existing row id (and any driverAssignments
    // referencing it) intact; only adds osmId/lengthKm/geometry.
    await Promise.all(batch.map(s =>
      db.update(streets)
        .set({
          osmId: s.osmId,
          lengthKm: s.lengthKm.toFixed(3),
          geometry: s.geometry,
        })
        .where(eq(streets.id, s.legacyId))
    ));
    enriched += batch.length;
    process.stdout.write(`\r  Enriched (legacy, in-place) ${enriched}/${toEnrichLegacy.length}`);
  }
  if (toEnrichLegacy.length) console.log();

  console.log(`  Untouched legacy streets (no OSM name match, no road data): ${legacyByNameDistrict.size}`);

  await recomputeDistrictRoadKm(city.id);

  // Report per-district totals
  const counts = await db.execute(sql`
    SELECT d.name_en, count(s.id) as street_count, round(coalesce(sum(s.length_km), 0)::numeric, 1) as road_km
    FROM districts d
    LEFT JOIN streets s ON s.district_id = d.id
    WHERE d.city_id = ${city.id}
    GROUP BY d.name_en
    HAVING count(s.id) > 0
    ORDER BY sum(s.length_km) DESC NULLS LAST
    LIMIT 10
  `);
  console.log(`  Top districts by road km:`);
  counts.forEach(r => console.log(`    ${r.name_en}: ${r.street_count} streets, ${r.road_km} km`));
}

async function main() {
  // District-Based Driver Survey Coverage Planner is currently scoped to
  // Jeddah only. Riyadh's existing streets/assignments are left untouched —
  // call importCityStreets("Riyadh", "24.45,46.45,25.15,47.10") to extend
  // road-km ingestion there when that city is brought into scope.
  await importCityStreets("Jeddah", "21.25,38.90,21.92,39.50");

  const [total] = await db.execute(sql`SELECT count(*) as total, round(coalesce(sum(length_km),0)::numeric, 1) as total_km FROM streets WHERE city_id = (SELECT id FROM cities WHERE name_en = 'Jeddah')`);
  console.log(`\n✅ Done! Jeddah streets in DB: ${total.total} (${total.total_km} km total)`);
}

main().catch(e => { console.error(e); process.exit(1); });
