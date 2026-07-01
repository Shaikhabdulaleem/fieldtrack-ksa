import { db } from "../db";
// CHANGED - include users so duplicate warnings contain the submitting driver.
import { leads, leadPhotos, users } from "../db/schema";
// CHANGED - use range operators for a fast bounding prefilter before exact Haversine calculation.
import { eq, sql, and, ne, gte, lte } from "drizzle-orm";

// NEW - one shared threshold keeps driver and admin duplicate checks identical.
export const DUPLICATE_DISTANCE_METERS = 100;

// NEW - response shape shared by the driver warning and admin comparison panel.
export type NearbyLeadSummary = {
  id: string;
  siteName: string | null;
  projectName: string | null;
  plotNumber: string | null;
  phase: string;
  locationLat: string;
  locationLng: string;
  status: string | null;
  createdAt: Date | null;
  driverName: string | null;
  photoUrl: string | null;
  distanceMeters: number;
};

// NEW - calculate exact great-circle distance without requiring PostGIS.
export function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latDelta = toRadians(lat2 - lat1);
  const lngDelta = toRadians(lng2 - lng1);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(lngDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// NEW - prefer a billboard image, then a front image, then the earliest available image.
async function getPreferredPhotoUrl(leadId: string): Promise<string | null> {
  const [photo] = await db
    .select({ storageUrl: leadPhotos.storageUrl })
    .from(leadPhotos)
    .where(eq(leadPhotos.leadId, leadId))
    .orderBy(sql`case ${leadPhotos.photoType} when 'billboard' then 0 when 'front' then 1 else 2 end`, leadPhotos.uploadedAt)
    .limit(1);
  return photo?.storageUrl ?? null;
}

// NEW - load one lead with the fields required by the admin side-by-side comparison.
export async function getLeadComparisonSummary(leadId: string, distanceMeters = 0): Promise<NearbyLeadSummary | null> {
  const [row] = await db
    .select({
      id: leads.id,
      siteName: leads.siteName,
      projectName: leads.projectName,
      plotNumber: leads.plotNumber,
      phase: leads.phase,
      locationLat: leads.locationLat,
      locationLng: leads.locationLng,
      status: leads.status,
      createdAt: leads.createdAt,
      driverName: users.fullName,
    })
    .from(leads)
    .leftJoin(users, eq(leads.driverId, users.id))
    .where(eq(leads.id, leadId))
    .limit(1);

  if (!row) return null;
  return { ...row, photoUrl: await getPreferredPhotoUrl(row.id), distanceMeters };
}

// NEW - return only the nearest approved lead inside the exact 100 meter radius.
export async function findNearestApprovedLead(
  locationLat: number,
  locationLng: number,
  excludeLeadId?: string,
): Promise<NearbyLeadSummary | null> {
  // CHANGED - use a conservative bounding divisor so exact 100 meter matches are never prefiltered out.
  const latitudeDelta = DUPLICATE_DISTANCE_METERS / 110_000;
  const longitudeScale = Math.max(Math.abs(Math.cos(locationLat * Math.PI / 180)), 0.01);
  const longitudeDelta = DUPLICATE_DISTANCE_METERS / (110_000 * longitudeScale);
  const conditions = [
    eq(leads.status, "approved"),
    gte(leads.locationLat, String(locationLat - latitudeDelta)),
    lte(leads.locationLat, String(locationLat + latitudeDelta)),
    gte(leads.locationLng, String(locationLng - longitudeDelta)),
    lte(leads.locationLng, String(locationLng + longitudeDelta)),
  ];
  if (excludeLeadId) conditions.push(ne(leads.id, excludeLeadId));

  const candidates = await db
    .select({
      id: leads.id,
      siteName: leads.siteName,
      projectName: leads.projectName,
      plotNumber: leads.plotNumber,
      phase: leads.phase,
      locationLat: leads.locationLat,
      locationLng: leads.locationLng,
      status: leads.status,
      createdAt: leads.createdAt,
      driverName: users.fullName,
    })
    .from(leads)
    .leftJoin(users, eq(leads.driverId, users.id))
    .where(and(...conditions));

  const nearest = candidates
    .map(candidate => ({
      ...candidate,
      distanceMeters: haversineDistanceMeters(
        locationLat,
        locationLng,
        Number(candidate.locationLat),
        Number(candidate.locationLng),
      ),
    }))
    .filter(candidate => candidate.distanceMeters <= DUPLICATE_DISTANCE_METERS)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)[0];

  if (!nearest) return null;
  return {
    ...nearest,
    photoUrl: await getPreferredPhotoUrl(nearest.id),
    distanceMeters: Math.round(nearest.distanceMeters * 10) / 10,
  };
}

export async function checkBlur(leadId: string): Promise<{ scores: Record<string, number> }> {
  const photos = await db.select().from(leadPhotos).where(eq(leadPhotos.leadId, leadId));

  const scores: Record<string, number> = {};
  for (const photo of photos) {
    // Deterministic placeholder (70/100) until real image-analysis is integrated.
    // Do NOT use random values — they cause unpredictable approval decisions.
    const score = 70;
    scores[photo.id] = score;
    await db
      .update(leadPhotos)
      .set({ blurScore: String(score) })
      .where(eq(leadPhotos.id, photo.id));
  }
  return { scores };
}

export async function checkDuplicate(
  leadId: string,
): Promise<{ risk: "low" | "medium" | "high"; nearbyCount: number; nearbyLeads: string[] }> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return { risk: "low", nearbyCount: 0, nearbyLeads: [] };

  // CHANGED - use the exact shared Haversine check and approved leads only.
  const nearby = await findNearestApprovedLead(Number(lead.locationLat), Number(lead.locationLng), leadId);
  const count = nearby ? 1 : 0;
  const risk = nearby ? "high" : "low";

  await db.update(leads).set({ duplicateRisk: risk }).where(eq(leads.id, leadId));

  // CHANGED - only the nearest qualifying approved lead is returned.
  return { risk, nearbyCount: count, nearbyLeads: nearby ? [nearby.id] : [] };
}

export async function checkGpsStreetMatch(leadId: string): Promise<{ matched: boolean; distanceMeters: number | null }> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead || !lead.streetId) return { matched: false, distanceMeters: null };

  // Deterministic placeholder — always returns matched until PostGIS integration is added.
  // Do NOT use random values — they cause unpredictable approval decisions.
  return { matched: true, distanceMeters: null };
}
