// In development, Vite proxies /api → http://localhost:4000 (see vite.config.ts).
// In production, set VITE_API_URL to your backend origin (e.g. https://api.fieldtrack.sa)
// or leave it empty and proxy /api from your web server (nginx/Caddy).
const API_BASE = (import.meta.env.VITE_API_URL ?? '') + '/api/v1';

// NEW - shared duplicate lead details returned to Driver and Admin interfaces.
export type NearbyLead = {
  id: string;
  siteName: string | null;
  projectName: string | null;
  plotNumber: string | null;
  phase: string;
  locationLat: string;
  locationLng: string;
  status: string | null;
  createdAt: string | null;
  driverName: string | null;
  photoUrl: string | null;
  distanceMeters: number;
};

// NEW - preserve structured server responses such as a race-time duplicate warning.
export class ApiError extends Error {
  constructor(public status: number, public data: Record<string, unknown>) {
    super(String(data.error || `API Error ${status}`));
  }
}

let authToken: string | null = localStorage.getItem("fieldtrack_token");
let refreshPromise: Promise<string | null> | null = null;

async function tryRefreshToken(): Promise<string | null> {
  if (!authToken) return null;
  if (refreshPromise) return refreshPromise;
  refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
  }).then(async r => {
    if (!r.ok) return null;
    const data = await r.json();
    if (data.token) { setToken(data.token); return data.token as string; }
    return null;
  }).catch(() => null).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export function setToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem("fieldtrack_token", token);
  } else {
    localStorage.removeItem("fieldtrack_token");
  }
}

export function getToken(): string | null {
  return authToken;
}

export function getStoredUser(): { id: string; fullName: string; email: string; role: string; cityId: string | null } | null {
  const raw = localStorage.getItem("fieldtrack_user");
  return raw ? JSON.parse(raw) : null;
}

export function setStoredUser(user: Record<string, unknown> | null) {
  if (user) {
    localStorage.setItem("fieldtrack_user", JSON.stringify(user));
  } else {
    localStorage.removeItem("fieldtrack_user");
  }
}

export function logout() {
  setToken(null);
  setStoredUser(null);
}

async function request<T>(path: string, options: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const isFormData = options.body instanceof FormData;
  if (!isFormData && options.body) {
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out. Check your connection and try again.");
    }
    throw err;
  } finally {
    clearTimeout(timerId);
  }

  // Global 401 handler — try refresh once, then force re-login
  if (res.status === 401 && !path.includes("/auth/")) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
      const retryController = new AbortController();
      const retryTimerId = setTimeout(() => retryController.abort(), timeoutMs);
      try {
        const retryRes = await fetch(`${API_BASE}${path}`, { ...options, headers: retryHeaders, signal: retryController.signal });
        if (retryRes.ok) {
          const ct = retryRes.headers.get("content-type");
          return ct?.includes("application/json") ? retryRes.json() : retryRes.blob() as unknown as T;
        }
        if (retryRes.status !== 401) {
          const err = await retryRes.json().catch(() => ({ error: retryRes.statusText }));
          throw new ApiError(retryRes.status, err);
        }
      } finally {
        clearTimeout(retryTimerId);
      }
    }
    setToken(null);
    setStoredUser(null);
    const isDriverPath = window.location.pathname.startsWith("/driver");
    window.location.href = isDriverPath ? "/driver" : "/login";
    throw new Error("Session expired. Please log in again.");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    // CHANGED - expose duplicate warning data while preserving the existing error message.
    throw new ApiError(res.status, err);
  }

  const contentType = res.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return res.json();
  }
  return res.blob() as unknown as T;
}

// ── Auth ────────────────────────────────────────────────────────────────────
export async function login(loginId: string, password: string) {
  const data = await request<{ token: string; user: Record<string, unknown> }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ login: loginId, password }),
  });
  setToken(data.token);
  setStoredUser(data.user);
  return data;
}

export async function getMe() {
  return request<Record<string, unknown>>("/auth/me");
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return request("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

// ── Cities ──────────────────────────────────────────────────────────────────
export async function getCities() {
  return request<Record<string, unknown>[]>("/cities");
}

export async function getCity(id: string) {
  return request<Record<string, unknown>>(`/cities/${id}`);
}

export async function getCityZones(cityId: string) {
  return request<Record<string, unknown>[]>(`/cities/${cityId}/zones`);
}

export async function getCityStreets(cityId: string, params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<Record<string, unknown>[]>(`/cities/${cityId}/streets${qs}`);
}

export async function getZoneDistricts(zoneId: string) {
  return request<Record<string, unknown>[]>(`/zones/${zoneId}/districts`);
}

export async function getDistrictStreets(districtId: string) {
  return request<Record<string, unknown>[]>(`/districts/${districtId}/streets`);
}

// ── Users ───────────────────────────────────────────────────────────────────
export async function getUsers(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<Record<string, unknown>[]>(`/users${qs}`);
}

export async function getUser(id: string) {
  return request<Record<string, unknown>>(`/users/${id}`);
}

export async function createUser(data: Record<string, unknown>) {
  return request<Record<string, unknown>>("/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateUser(id: string, data: Record<string, unknown>) {
  return request<Record<string, unknown>>(`/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// NEW - require a resolution for incomplete streets before Driver deactivation.
export async function deactivateDriver(
  id: string,
  action?: "unassign_all" | "reassign" | "keep_on_hold",
  newDriverId?: string,
) {
  return request<{
    driver: Record<string, unknown>;
    affectedStreetCount: number;
    action: string | null;
  }>(`/users/${id}/deactivate`, {
    method: "POST",
    body: JSON.stringify({ action, newDriverId }),
  });
}

// ── Leads ───────────────────────────────────────────────────────────────────
export async function getLeads(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<{ total: number; leads: Record<string, unknown>[] }>(`/leads${qs}`);
}

export async function getLead(id: string) {
  return request<Record<string, unknown>>(`/leads/${id}`);
}

// CHANGED - use XMLHttpRequest so the persistent queue receives real uploaded-byte progress.
export async function createLead(
  formData: FormData,
  options?: { onProgress?: (loaded: number, total: number) => void },
) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/leads`);
    xhr.timeout = 120_000;
    if (authToken) xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);

    // NEW - report actual multipart request bytes while the browser uploads them.
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options?.onProgress?.(event.loaded, event.total);
    };

    xhr.onload = () => {
      let data: Record<string, unknown> = {};
      try { data = xhr.responseText ? JSON.parse(xhr.responseText) : {}; } catch { data = { error: xhr.statusText }; }
      if (xhr.status === 200) {
        resolve(data);
        return;
      }
      if (xhr.status === 401) {
        setToken(null);
        setStoredUser(null);
      }
      reject(new ApiError(xhr.status, data));
    };
    // NEW - preserve actionable transport errors for automatic and manual retry displays.
    xhr.onerror = () => reject(new ApiError(0, { error: "Network error while uploading lead" }));
    xhr.ontimeout = () => reject(new ApiError(408, { error: "Lead upload timed out after 120 seconds" }));
    xhr.onabort = () => reject(new ApiError(0, { error: "Lead upload was interrupted" }));
    xhr.send(formData);
  });
}

// NEW - check exact nearby approved leads before uploading driver photos.
export async function checkNearbyApprovedLead(locationLat: number, locationLng: number) {
  return request<{ hasNearbyLead: boolean; nearbyLead: NearbyLead | null; distanceMeters: number | null }>("/leads/duplicate-precheck", {
    method: "POST",
    body: JSON.stringify({ locationLat, locationLng }),
  });
}

// CHANGED - approval can request a comparison or submit the Admin's duplicate decision.
export async function approveLead(id: string, duplicateDecision?: "approve_unique" | "mark_duplicate") {
  return request<Record<string, unknown> & {
    requiresDuplicateDecision?: boolean;
    currentLead?: NearbyLead;
    nearbyLead?: NearbyLead;
    distanceMeters?: number;
  }>(`/leads/${id}/approve`, {
    method: "PATCH",
    body: JSON.stringify(duplicateDecision ? { duplicateDecision } : {}),
  });
}

export async function rejectLead(id: string, reason: string) {
  return request<Record<string, unknown>>(`/leads/${id}/reject`, {
    method: "PATCH",
    body: JSON.stringify({ reason }),
  });
}

export async function sendLeadToClient(id: string) {
  return request<Record<string, unknown>>(`/leads/${id}/sent-to-client`, { method: "PATCH" });
}

export async function deleteLead(id: string) {
  return request<Record<string, unknown>>(`/leads/${id}`, { method: "DELETE" });
}

export async function deleteUser(id: string) {
  return request<Record<string, unknown>>(`/users/${id}`, { method: "DELETE" });
}

export async function deleteAssignment(id: string) {
  return request<Record<string, unknown>>(`/assignments/${id}`, { method: "DELETE" });
}

export async function bulkDeleteAssignments(assignmentIds: string[]) {
  return request<{ ok: boolean; deleted: number }>("/assignments/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ assignmentIds }),
  });
}

// ── Assignments ─────────────────────────────────────────────────────────────
export async function getAssignments(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<Record<string, unknown>[]>(`/assignments${qs}`);
}

export async function createAssignment(data: Record<string, unknown>) {
  return request<Record<string, unknown>>("/assignments", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function autoPlan(cityId: string, date?: string, maxStreetsPerDriver?: number) {
  return request<Record<string, unknown>>("/assignments/auto-plan", {
    method: "POST",
    body: JSON.stringify({ cityId, date, maxStreetsPerDriver }),
  });
}

export async function calculatePlan(data: { cityId: string; targetDays: number; targetLeadsPerDriver: number; maxStreetsPerDriver: number }) {
  return request<Record<string, unknown>>("/assignments/calculate-plan", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateCity(cityId: string, data: Record<string, unknown>) {
  return request<Record<string, unknown>>(`/cities/${cityId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function assignDistrict(data: { cityId: string; districtId: string; driverId: string; date?: string }) {
  return request<{ created: number }>("/assignments/assign-district", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function reassignDistrict(data: { districtId: string; newDriverId: string }) {
  return request<{ updated: number }>("/assignments/reassign-district", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── District-Based Driver Survey Coverage Planner ───────────────────────────
export async function calculatePlanKm(data: {
  cityId: string;
  targetDays: number;
  numberOfDrivers: number;
  petrolPerDriverPerDay: number;
  petrolPricePerLiter: number;
  avgCarMileageKmPerLiter: number;
  surveyEfficiencyPct: number;
  targetLeadsPerDriver: number;
}) {
  return request<Record<string, unknown>>("/assignments/calculate-plan-km", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function splitDistrict(cityId: string, districtId: string) {
  return request<{ created: number; zones: Record<string, unknown>[] }>("/assignments/split-district", {
    method: "POST",
    body: JSON.stringify({ cityId, districtId }),
  });
}

export async function autoAssignZones(cityId: string, date?: string) {
  return request<Record<string, unknown>>("/assignments/auto-assign-zones", {
    method: "POST",
    body: JSON.stringify({ cityId, date }),
  });
}

export async function assignSurveyZone(data: { zoneId: string; driverId: string; date?: string }) {
  return request<{ created: number }>("/assignments/assign-survey-zone", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getDistrictSurveyZones(districtId: string) {
  return request<Record<string, unknown>[]>(`/districts/${districtId}/survey-zones`);
}

export async function startSurveyZone(zoneId: string) {
  return request<Record<string, unknown>>(`/driver/survey-zones/${zoneId}/start`, {
    method: "POST",
  });
}

export async function completeSurveyZone(zoneId: string, formData: FormData) {
  return request<Record<string, unknown>>(`/driver/survey-zones/${zoneId}/complete`, {
    method: "POST",
    body: formData,
  });
}

// NEW - bulk reassign selected Grey on-hold streets to an active same-city Driver.
export async function reassignOnHoldStreets(data: { streetIds: string[]; newDriverId: string }) {
  return request<{ updated: number }>("/assignments/reassign-on-hold", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Tracking ────────────────────────────────────────────────────────────────
export async function getLiveTracking(cityId?: string) {
  const qs = cityId ? `?city_id=${cityId}` : "";
  return request<Record<string, unknown>[]>(`/tracking/live${qs}`);
}

export async function sendPing(data: { lat: number; lng: number; speedKmh?: number; accuracyMeters?: number; batteryPercent?: number }) {
  return request<Record<string, unknown>>("/tracking/ping", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getDistrictActivity(params: { district_id: string; driver_id: string; date?: string }) {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return request<{
    pings: { lat: string; lng: string; recordedAt: string; speedKmh: string | null }[];
    leads: { id: string; site_name: string; phase: string; location_lat: string; location_lng: string; status: string; created_at: string; photos: { storageUrl: string; photoType: string }[] }[];
    streets: { id: string; nameEn: string; nameAr: string; status: string }[];
  }>(`/tracking/district-activity?${qs}`);
}

export async function getDriverHistory(driverId: string, date?: string) {
  const qs = date ? `?date=${date}` : "";
  return request<Record<string, unknown>[]>(`/tracking/drivers/${driverId}/history${qs}`);
}

export async function getTrackingAlerts(cityId?: string) {
  const qs = cityId ? `?city_id=${cityId}` : "";
  return request<Record<string, unknown>[]>(`/tracking/alerts${qs}`);
}

export async function acknowledgeAlert(driverId: string, date?: string) {
  return request<{ ok: boolean }>("/tracking/alerts/acknowledge", {
    method: "POST",
    body: JSON.stringify({ driverId, date }),
  });
}

// ── QC ──────────────────────────────────────────────────────────────────────
export async function getQcQueue() {
  return request<Record<string, unknown>[]>("/qc/queue");
}

export async function checkBlur(leadId: string) {
  return request<Record<string, unknown>>("/qc/photo-blur-check", {
    method: "POST",
    body: JSON.stringify({ leadId }),
  });
}

export async function checkDuplicate(leadId: string) {
  return request<Record<string, unknown>>("/qc/duplicate-check", {
    method: "POST",
    body: JSON.stringify({ leadId }),
  });
}

export async function checkGpsMatch(leadId: string) {
  return request<Record<string, unknown>>("/qc/gps-street-match", {
    method: "POST",
    body: JSON.stringify({ leadId }),
  });
}

// ── Reports ─────────────────────────────────────────────────────────────────
export async function getReportSummary(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<Record<string, unknown>[]>(`/reports/summary${qs}`);
}

export async function getDriverReports(cityId?: string) {
  const qs = cityId ? `?city_id=${cityId}` : "";
  return request<Record<string, unknown>[]>(`/reports/drivers${qs}`);
}

export async function getCoverageReport(cityId?: string) {
  const qs = cityId ? `?city_id=${cityId}` : "";
  return request<Record<string, unknown>[]>(`/reports/coverage${qs}`);
}

// ── Dashboard ───────────────────────────────────────────────────────────────
export async function getDashboardStats(cityId?: string) {
  const qs = cityId ? `?city_id=${cityId}` : "";
  return request<Record<string, unknown>>(`/dashboard/stats${qs}`);
}

export async function getLeadsByDay(cityId?: string, days?: number) {
  const params = new URLSearchParams();
  if (cityId) params.set("city_id", cityId);
  if (days) params.set("days", String(days));
  const qs = params.toString() ? `?${params}` : "";
  return request<Record<string, unknown>[]>(`/dashboard/leads-by-day${qs}`);
}

export async function getTopDrivers(cityId?: string, limit?: number) {
  const params = new URLSearchParams();
  if (cityId) params.set("city_id", cityId);
  if (limit) params.set("limit", String(limit));
  const qs = params.toString() ? `?${params}` : "";
  return request<Record<string, unknown>[]>(`/dashboard/top-drivers${qs}`);
}

export async function getRecentActivity(cityId?: string, limit?: number) {
  const params = new URLSearchParams();
  if (cityId) params.set("city_id", cityId);
  if (limit) params.set("limit", String(limit));
  const qs = params.toString() ? `?${params}` : "";
  return request<Record<string, unknown>[]>(`/dashboard/recent-activity${qs}`);
}

export async function getCityOverview() {
  return request<Record<string, unknown>[]>("/dashboard/city-overview");
}

export async function getCityPlanning(cityId: string) {
  return request<Record<string, unknown>>(`/cities/${cityId}/planning`);
}

export async function getDriverAssignmentHistory(driverId: string, days?: number) {
  const qs = days ? `?days=${days}` : "";
  return request<Record<string, unknown>>(`/drivers/${driverId}/assignment-history${qs}`);
}

export async function locateByGps(lat: number, lng: number) {
  return request<{ city: string | null; district: string | null; districtAr: string | null; zone: string | null; nearestStreet: string | null }>(`/locate?lat=${lat}&lng=${lng}`);
}

// ── Driver ──────────────────────────────────────────────────────────────────
export async function getDriverToday() {
  return request<Record<string, unknown>>("/driver/today");
}

export async function driverCheckIn(formData: FormData) {
  return request<Record<string, unknown>>("/driver/check-in", {
    method: "POST",
    body: formData,
  });
}

export async function driverCheckOut(formData?: FormData) {
  return request<Record<string, unknown>>("/driver/check-out", {
    method: "POST",
    body: formData,
  });
}

export async function visitStreet(streetId: string, status: string, skippedReason?: string) {
  return request<Record<string, unknown>>(`/streets/${streetId}/visit`, {
    method: "POST",
    body: JSON.stringify({ status, skippedReason }),
  });
}

export async function syncOffline(data: { leads?: Record<string, unknown>[]; streetVisits?: Record<string, unknown>[] }) {
  return request<Record<string, unknown>>("/sync/offline", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Exports ─────────────────────────────────────────────────────────────────
// Uses fetch() with Authorization header so the token never appears in URLs or logs.
export async function downloadExport(format: "xlsx" | "csv" | "pdf", cityId?: string): Promise<void> {
  const qs = cityId ? `?city_id=${cityId}` : "";
  const headers: Record<string, string> = {};
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  const res = await fetch(`${API_BASE}/exports/leads.${format}${qs}`, { headers });
  if (!res.ok) throw new Error(`Export failed: ${res.statusText}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leads.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** @deprecated Use downloadExport() instead — keeps token out of URLs */
export function getExportUrl(format: "xlsx" | "csv" | "pdf", cityId?: string): string {
  const qs = cityId ? `?city_id=${cityId}` : "";
  const token = getToken();
  const tokenParam = token ? `${qs ? "&" : "?"}token=${encodeURIComponent(token)}` : "";
  return `${API_BASE}/exports/leads.${format}${qs}${tokenParam}`;
}
