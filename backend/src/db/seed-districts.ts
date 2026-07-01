/**
 * seed-districts.ts
 * Imports all Jeddah + Riyadh districts with polygon boundaries
 * from the downloaded districts_raw.json (homaily/Saudi-Arabia-Regions-Cities-and-Districts)
 *
 * Run: npx tsx src/db/seed-districts.ts
 */

import "../config/env";
import { db } from "./index";
import { cities, zones, districts, streets, driverAssignments, leads } from "./schema";
import { eq, inArray } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

interface RawDistrict {
  district_id: number;
  city_id: number;
  region_id: number;
  name_ar: string;
  name_en: string;
  boundaries: number[][][]; // [ring][point][lng, lat]
}

// Data format in this file is [lat, lng] (confirmed from sample values like [21.809, 39.058])
function computeCenter(boundaries: number[][][]): { lat: number; lng: number } {
  const ring = boundaries[0];
  if (!ring || ring.length === 0) return { lat: 0, lng: 0 };
  let sumLat = 0, sumLng = 0;
  for (const pt of ring) {
    sumLat += pt[0];
    sumLng += pt[1];
  }
  return { lat: sumLat / ring.length, lng: sumLng / ring.length };
}

// Convert boundaries from [lat, lng] to [[lat, lng]] (our ray-casting format)
function convertBoundary(boundaries: number[][][]): [number, number][] {
  const ring = boundaries[0];
  if (!ring || ring.length === 0) return [];
  return ring.map(pt => [pt[0], pt[1]]);
}

// ── Jeddah Zone Classification ────────────────────────────────────────────────
const NON_RESIDENTIAL_KEYWORDS = [
  "airport", "seaport", "port", "industrial", "naval", "university", "kaust",
  "medical city", "military", "base", "king abdulaziz university", "kau",
  "king faisal naval", "king abdulaziz medical", "king abdullah university",
];

// Jeddah spans roughly lat 21.25-21.92, lng 39.00-39.45
function classifyJeddahZone(name: string, lat: number, lng: number): string {
  const lower = name.toLowerCase();
  if (NON_RESIDENTIAL_KEYWORDS.some(k => lower.includes(k))) return "Non-Residential";
  if (lat > 21.62) return "North Jeddah";   // Northern suburbs
  if (lat < 21.40) return "South Jeddah";   // Southern districts
  if (lng < 39.13) return "West Jeddah";    // Coastal / Historic
  if (lng > 39.23) return "East Jeddah";    // Eastern suburbs
  return "Central Jeddah";                  // Core urban area
}

// Riyadh spans roughly lat 24.45-25.15, lng 46.45-47.10
function classifyRiyadhZone(name: string, lat: number, lng: number): string {
  const lower = name.toLowerCase();
  if (NON_RESIDENTIAL_KEYWORDS.some(k => lower.includes(k))) return "Non-Residential";
  if (lat > 24.86) return "North Riyadh";   // Northern districts
  if (lat < 24.60) return "South Riyadh";   // Southern districts
  if (lng > 46.82) return "East Riyadh";    // Eastern suburbs
  if (lng < 46.60) return "West Riyadh";    // Western areas
  return "Central Riyadh";                  // Core city
}

// Clean district name (remove "Dist." suffix)
function cleanName(name: string): string {
  return name.replace(/\s+Dist\.?\s*$/i, "").trim();
}

async function importCity(
  cityNameEn: string,
  cityId: string,
  rawDistricts: RawDistrict[],
  zoneNames: string[],
  classifyFn: (name: string, lat: number, lng: number) => string,
) {
  console.log(`\n── Importing ${cityNameEn} (${rawDistricts.length} raw districts) ──`);

  // Step 1: Remove existing zones (cascades to districts via FK)
  // First remove downstream data to avoid FK violations
  const existingDistricts = await db.select({ id: districts.id }).from(districts).where(eq(districts.cityId, cityId));
  const districtIds = existingDistricts.map(d => d.id);

  if (districtIds.length > 0) {
    // Delete driver_assignments referencing these districts
    await db.delete(driverAssignments).where(inArray(driverAssignments.districtId, districtIds));
    // Delete leads referencing these districts
    await db.delete(leads).where(inArray(leads.districtId, districtIds));
    // Delete streets referencing these districts
    await db.delete(streets).where(inArray(streets.districtId, districtIds));
    // Delete districts
    await db.delete(districts).where(eq(districts.cityId, cityId));
  }
  // Delete existing zones for this city
  await db.delete(zones).where(eq(zones.cityId, cityId));

  console.log(`  Cleared existing zones/districts`);

  // Step 2: Create zones
  const zoneArNames: Record<string, string> = {
    "North Jeddah": "شمال جدة",
    "East Jeddah": "شرق جدة",
    "South Jeddah": "جنوب جدة",
    "Central Jeddah": "وسط جدة",
    "West Jeddah": "غرب جدة",
    "Non-Residential": "مناطق غير سكنية",
    "North Riyadh": "شمال الرياض",
    "East Riyadh": "شرق الرياض",
    "South Riyadh": "جنوب الرياض",
    "Central Riyadh": "وسط الرياض",
    "West Riyadh": "غرب الرياض",
  };

  const zoneRecords = await db.insert(zones).values(
    zoneNames.map(name => ({
      cityId,
      nameEn: name,
      nameAr: zoneArNames[name] ?? name,
    }))
  ).returning();

  const zoneMap = new Map(zoneRecords.map(z => [z.nameEn, z.id]));
  console.log(`  Created ${zoneRecords.length} zones: ${zoneNames.join(", ")}`);

  // Step 3: Classify & insert districts in batches
  const zoneCounts: Record<string, number> = {};
  let inserted = 0;
  const BATCH = 20;

  for (let i = 0; i < rawDistricts.length; i += BATCH) {
    const batch = rawDistricts.slice(i, i + BATCH);
    const rows = batch.map(d => {
      const center = computeCenter(d.boundaries);
      const boundary = convertBoundary(d.boundaries);
      const zoneName = classifyFn(d.name_en, center.lat, center.lng);
      const zoneId = zoneMap.get(zoneName) ?? zoneMap.get("Central Jeddah") ?? zoneMap.get("Central Riyadh")!;

      zoneCounts[zoneName] = (zoneCounts[zoneName] ?? 0) + 1;

      return {
        cityId,
        zoneId,
        nameEn: cleanName(d.name_en),
        nameAr: d.name_ar,
        centerLat: String(center.lat.toFixed(6)),
        centerLng: String(center.lng.toFixed(6)),
        boundary: boundary.length > 0 ? boundary : undefined,
      };
    });

    await db.insert(districts).values(rows);
    inserted += batch.length;
    process.stdout.write(`\r  Inserted ${inserted}/${rawDistricts.length}`);
  }
  console.log();

  // Report
  for (const [zone, count] of Object.entries(zoneCounts).sort()) {
    console.log(`    ${zone}: ${count}`);
  }
}

async function main() {
  const jsonPath = path.join(process.cwd(), "districts_raw.json");
  if (!fs.existsSync(jsonPath)) {
    console.error("❌ districts_raw.json not found. Download it first from GitHub.");
    process.exit(1);
  }

  console.log("📂 Reading districts_raw.json ...");
  let raw = fs.readFileSync(jsonPath, "utf8");
  // Strip UTF-8 BOM if present
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  const all: RawDistrict[] = JSON.parse(raw);
  console.log(`  Total districts in file: ${all.length}`);

  // Find city IDs in our DB
  const [jeddah] = await db.select().from(cities).where(eq(cities.nameEn, "Jeddah")).limit(1);
  const [riyadh] = await db.select().from(cities).where(eq(cities.nameEn, "Riyadh")).limit(1);

  if (!jeddah || !riyadh) {
    console.error("❌ Cities not found in DB. Run seed.ts first.");
    process.exit(1);
  }

  const jeddahRaw = all.filter(d => d.city_id === 18);
  const riyadhRaw = all.filter(d => d.city_id === 3);

  await importCity(
    "Jeddah",
    jeddah.id,
    jeddahRaw,
    ["North Jeddah", "East Jeddah", "South Jeddah", "Central Jeddah", "West Jeddah", "Non-Residential"],
    classifyJeddahZone,
  );

  await importCity(
    "Riyadh",
    riyadh.id,
    riyadhRaw,
    ["North Riyadh", "East Riyadh", "South Riyadh", "Central Riyadh", "West Riyadh", "Non-Residential"],
    classifyRiyadhZone,
  );

  const distCount = await db.select().from(districts);
  console.log(`\n✅ Done! Total districts in DB: ${distCount.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
