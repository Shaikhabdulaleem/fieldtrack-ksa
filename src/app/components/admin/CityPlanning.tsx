import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Polygon, Popup, Tooltip } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import {
  getCityPlanning, getDriverAssignmentHistory, assignDistrict, updateCity,
  calculatePlanKm, splitDistrict, autoAssignZones, assignSurveyZone, getDistrictSurveyZones,
} from "../../lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  ArrowLeft, Zap, Users, MapPin, TrendingUp, ChevronDown, ChevronRight, Target,
  Phone, CreditCard, Car, CheckCircle2, Clock, XCircle, Loader2, FileText, Calendar, Map as MapIcon,
  Fuel, Gauge, Route, Layers, Scissors, PlayCircle,
} from "lucide-react";
import { toast } from "sonner";
import { SurveyZonePanel } from "./SurveyZonePanel";

function statusColor(status: string) {
  switch (status) {
    case "completed": return "default";
    case "in_progress": return "secondary";
    case "skipped": return "destructive";
    default: return "outline";
  }
}

// Map color rules (District-Based Driver Survey Coverage Planner):
// Green=Complete, Orange=Partially Complete, Blue=Assigned,
// Light Blue=Partially Assigned, Red=Not Assigned, Gray=No road data.
// Once a district has been split into survey zones, color is weighted by
// zone status; otherwise falls back to the original street-status logic
// (extended with the "no road data" gray case for districts with no km yet).
function getDistrictColor(district: Record<string, unknown>): string {
  const totalZones = Number(district.total_survey_zones ?? 0);
  if (totalZones > 0) {
    const unassignedZones = Number(district.unassigned_survey_zones ?? 0);
    const completedZones = Number(district.completed_survey_zones ?? 0);
    if (completedZones === totalZones) return '#22c55e';
    if (completedZones > 0) return '#f59e0b';
    if (unassignedZones === 0) return '#3b82f6';
    if (unassignedZones < totalZones) return '#60a5fa';
    return '#ef4444';
  }

  const roadKm = district.road_km;
  if (roadKm === null || roadKm === undefined) return '#9ca3af';

  const total = Number(district.total_streets ?? 0);
  const completed = Number(district.completed_streets ?? 0);
  const assigned = Number(district.assigned_streets ?? 0);
  const inProgress = Number(district.in_progress_streets ?? 0);
  const unassigned = Number(district.unassigned_streets ?? 0);
  if (total === 0) return '#9ca3af';
  const pct = (completed / total) * 100;
  if (pct === 100) return '#22c55e';
  if (pct > 0) return '#f59e0b';
  if (assigned + inProgress > 0 && unassigned === 0) return '#3b82f6';
  if (assigned + inProgress > 0) return '#60a5fa';
  return '#ef4444';
}

function DistrictCoverageMap({ data, onSplitDistrict, onViewZones, splittingDistrictId }: {
  data: Record<string, unknown>;
  onSplitDistrict: (districtId: string) => void;
  onViewZones: (districtId: string) => void;
  splittingDistrictId: string | null;
}) {
  const city = data.city as Record<string, unknown>;
  const districts = (data.districts as Record<string, unknown>[]) ?? [];
  const centerLat = Number(city.centerLat ?? 21.49);
  const centerLng = Number(city.centerLng ?? 39.19);

  const mappableDistricts = districts.filter(d => d.boundary && Array.isArray(d.boundary) && (d.boundary as unknown[]).length > 0);

  if (mappableDistricts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapIcon className="w-5 h-5" /> District Coverage Map
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-gray-500 py-8">No district boundaries available yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MapIcon className="w-5 h-5" /> District Coverage Map
          </CardTitle>
          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Complete</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> Partially Done</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Assigned</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-400 inline-block" /> Partially Assigned</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Not Assigned</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-400 inline-block" /> No Road Data</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          <MapContainer
            center={[centerLat, centerLng]}
            zoom={12}
            style={{ height: '500px', width: '100%' }}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {mappableDistricts.map((district) => {
              const boundary = district.boundary as number[][];
              const positions: LatLngExpression[] = boundary.map(([lat, lng]) => [lat, lng] as LatLngExpression);
              const total = Number(district.total_streets ?? 0);
              const completed = Number(district.completed_streets ?? 0);
              const unassigned = Number(district.unassigned_streets ?? 0);
              const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
              const color = getDistrictColor(district);
              const districtId = String(district.district_id);
              const roadKm = district.road_km !== null && district.road_km !== undefined ? Number(district.road_km) : null;
              const remainingRoadKm = district.remaining_road_km !== null && district.remaining_road_km !== undefined ? Number(district.remaining_road_km) : null;
              const totalZones = Number(district.total_survey_zones ?? 0);
              const unassignedZones = Number(district.unassigned_survey_zones ?? 0);
              const isSplitting = splittingDistrictId === districtId;

              return (
                <Polygon
                  key={String(district.district_id)}
                  positions={positions}
                  pathOptions={{
                    fillColor: color,
                    fillOpacity: 0.45,
                    color: color,
                    weight: 2,
                    opacity: 0.9,
                  }}
                >
                  <Tooltip direction="center" sticky>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#111' }}>
                      {String(district.district_name_en)} ({pct}%)
                    </span>
                  </Tooltip>
                  <Popup minWidth={240}>
                    <div style={{ fontFamily: 'sans-serif' }}>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#111827', marginBottom: '2px' }}>
                        {String(district.district_name_en)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '10px' }}>
                        {String(district.district_name_ar ?? '')}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                        <div>
                          <div style={{ color: '#9ca3af', marginBottom: '2px' }}>Coverage</div>
                          <div style={{ fontWeight: 700, fontSize: '18px', color }}>{pct}%</div>
                        </div>
                        <div>
                          <div style={{ color: '#9ca3af', marginBottom: '2px' }}>Total Streets</div>
                          <div style={{ fontWeight: 700, fontSize: '18px', color: '#111827' }}>{total}</div>
                        </div>
                        <div>
                          <div style={{ color: '#22c55e' }}>Completed</div>
                          <div style={{ fontWeight: 600, fontSize: '14px' }}>{completed}</div>
                        </div>
                        <div>
                          <div style={{ color: '#ef4444' }}>Remaining</div>
                          <div style={{ fontWeight: 600, fontSize: '14px' }}>{unassigned}</div>
                        </div>
                        <div>
                          <div style={{ color: '#9ca3af', marginBottom: '2px' }}>Road KM</div>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: '#111827' }}>
                            {roadKm !== null ? `${roadKm.toFixed(1)} km` : 'No data'}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: '#9ca3af', marginBottom: '2px' }}>Remaining KM</div>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: '#111827' }}>
                            {remainingRoadKm !== null ? `${remainingRoadKm.toFixed(1)} km` : '—'}
                          </div>
                        </div>
                      </div>
                      {totalZones > 0 && (
                        <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
                          {totalZones} survey zone{totalZones !== 1 ? 's' : ''} — {totalZones - unassignedZones} assigned, {unassignedZones} unassigned
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                        <button
                          onClick={() => onSplitDistrict(districtId)}
                          disabled={isSplitting || roadKm === null}
                          style={{
                            flex: 1, fontSize: '12px', fontWeight: 600, padding: '6px 8px',
                            borderRadius: '6px', border: '1px solid #1f2937', background: '#111827', color: '#fff',
                            cursor: isSplitting || roadKm === null ? 'not-allowed' : 'pointer',
                            opacity: isSplitting || roadKm === null ? 0.5 : 1,
                          }}
                        >
                          {isSplitting ? 'Splitting…' : 'Start Survey'}
                        </button>
                        <button
                          onClick={() => onViewZones(districtId)}
                          style={{
                            flex: 1, fontSize: '12px', fontWeight: 600, padding: '6px 8px',
                            borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', color: '#111827',
                            cursor: 'pointer',
                          }}
                        >
                          View Zones
                        </button>
                      </div>
                    </div>
                  </Popup>
                </Polygon>
              );
            })}
          </MapContainer>
        </div>
      </CardContent>
    </Card>
  );
}

type ForecastDay = { day: number; date: string; districts: { name: string; km: number }[]; totalKm: number };

// Projects, on the fly, which districts would be worked each remaining day
// given today's saved daily team capacity. Nothing here is persisted or
// actually assigned — real assignments still only happen via "Generate Today".
function computeRemainingPlanForecast(
  districts: Record<string, unknown>[],
  dailyCapacityKm: number,
  todayStr: string | undefined,
): ForecastDay[] {
  const items = districts
    .map(d => ({
      nameEn: String(d.district_name_en),
      remainingKm: d.remaining_road_km !== null && d.remaining_road_km !== undefined ? Number(d.remaining_road_km) : null,
    }))
    .filter((d): d is { nameEn: string; remainingKm: number } => d.remainingKm !== null && d.remainingKm > 0.01)
    .sort((a, b) => b.remainingKm - a.remainingKm);

  if (dailyCapacityKm <= 0.01 || items.length === 0) return [];

  const days: ForecastDay[] = [];
  const baseDate = todayStr ? new Date(todayStr) : new Date();
  let dayNum = 1;
  let capacityLeft = dailyCapacityKm;
  let currentDayDistricts: { name: string; km: number }[] = [];
  let currentDayTotal = 0;

  const pushDay = () => {
    if (currentDayDistricts.length === 0) return;
    const d = new Date(baseDate);
    d.setDate(d.getDate() + (dayNum - 1));
    days.push({ day: dayNum, date: d.toISOString().slice(0, 10), districts: currentDayDistricts, totalKm: currentDayTotal });
    dayNum++;
    capacityLeft = dailyCapacityKm;
    currentDayDistricts = [];
    currentDayTotal = 0;
  };

  const MAX_DAYS = 90;
  for (const item of items) {
    let remaining = item.remainingKm;
    while (remaining > 0.01 && days.length < MAX_DAYS) {
      if (capacityLeft <= 0.01) pushDay();
      const take = Math.min(remaining, capacityLeft);
      const existing = currentDayDistricts.find(x => x.name === item.nameEn);
      if (existing) existing.km += take;
      else currentDayDistricts.push({ name: item.nameEn, km: take });
      currentDayTotal += take;
      capacityLeft -= take;
      remaining -= take;
    }
    if (days.length >= MAX_DAYS) break;
  }
  pushDay();
  return days;
}

function RemainingPlanForecast({ districts, dailyCapacityKm, today }: {
  districts: Record<string, unknown>[];
  dailyCapacityKm: number;
  today: string | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const forecast = computeRemainingPlanForecast(districts, dailyCapacityKm, today);
  const VISIBLE = 5;
  const visibleDays = expanded ? forecast : forecast.slice(0, VISIBLE);
  const hiddenCount = forecast.length - visibleDays.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Remaining Days Plan
        </CardTitle>
        <p className="text-xs text-gray-500">
          Projected schedule based on current daily team capacity ({dailyCapacityKm.toFixed(1)} km/day). Actual driver
          assignments still happen day by day via "Generate Today".
        </p>
      </CardHeader>
      <CardContent>
        {dailyCapacityKm <= 0.01 ? (
          <p className="text-center text-gray-500 py-4 text-sm">
            No active drivers to project capacity. Add drivers to see the remaining-days plan.
          </p>
        ) : forecast.length === 0 ? (
          <div className="flex items-center gap-2 text-green-600 justify-center py-4">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium">All districts fully covered — nothing left to plan.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleDays.map((d, idx) => (
              <div key={d.day} className="flex items-start gap-3 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <div className="flex-shrink-0 w-16 text-center">
                  <p className="text-xs text-gray-400">{idx === 0 ? "Today" : `Day ${d.day}`}</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{d.date}</p>
                </div>
                <div className="flex-1 flex flex-wrap gap-1.5">
                  {d.districts.map(district => (
                    <Badge key={district.name} variant="outline" className="text-xs font-normal">
                      {district.name} &bull; {district.km.toFixed(1)} km
                    </Badge>
                  ))}
                </div>
                <div className="flex-shrink-0 text-sm font-semibold text-gray-500">{d.totalKm.toFixed(1)} km</div>
              </div>
            ))}
            {hiddenCount > 0 && (
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setExpanded(true)}>
                Show {hiddenCount} more day{hiddenCount !== 1 ? "s" : ""}
              </Button>
            )}
            {expanded && forecast.length > VISIBLE && (
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setExpanded(false)}>
                Show less
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ZoneDistrictOverview({ data, drivers, cityId, onAssigned, focusDistrictId }: {
  data: Record<string, unknown>;
  drivers: Record<string, unknown>[];
  cityId: string;
  onAssigned: () => void;
  focusDistrictId: string | null;
}) {
  const zones = (data.zones as Record<string, unknown>[]) ?? [];
  const districts = (data.districts as Record<string, unknown>[]) ?? [];
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  const [expandedDistrictZonePanels, setExpandedDistrictZonePanels] = useState<Set<string>>(new Set());

  // "View Zones" clicked from the map popup — expand the parent geographic
  // zone group, expand this district's survey-zone panel, and scroll to it.
  useEffect(() => {
    if (!focusDistrictId) return;
    const district = districts.find(d => String(d.district_id) === focusDistrictId);
    if (district?.zone_id) {
      setExpandedZones(prev => new Set(prev).add(String(district.zone_id)));
    }
    setExpandedDistrictZonePanels(prev => new Set(prev).add(focusDistrictId));
    const el = document.getElementById(`district-row-${focusDistrictId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusDistrictId, districts]);

  if (zones.length === 0 && districts.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Area Coverage Overview</CardTitle></CardHeader>
        <CardContent>
          <p className="text-center text-gray-500 py-6">No zones or districts set up for this city yet.</p>
        </CardContent>
      </Card>
    );
  }

  const toggleZone = (id: string) => {
    setExpandedZones(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleDistrictZonePanel = (districtId: string) => {
    setExpandedDistrictZonePanels(prev => {
      const next = new Set(prev);
      next.has(districtId) ? next.delete(districtId) : next.add(districtId);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="w-5 h-5" />
          Area Coverage Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {zones.map((zone) => {
          const zoneId = String(zone.zone_id);
          const total = Number(zone.total_streets ?? 0);
          const completed = Number(zone.completed_streets ?? 0);
          const unassigned = Number(zone.unassigned_streets ?? 0);
          const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
          const isExpanded = expandedZones.has(zoneId);
          const zoneDistricts = districts.filter(d => String(d.zone_id) === zoneId);

          return (
            <div key={zoneId} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 text-left transition-colors"
                onClick={() => toggleZone(zoneId)}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{String(zone.zone_name_en)}</p>
                    <p className="text-xs text-gray-500">{String(zone.zone_name_ar ?? "")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden md:flex gap-2 text-xs">
                    <span className="text-green-600 font-medium">{completed} done</span>
                    <span className="text-gray-400">/</span>
                    <span>{total} streets</span>
                    {unassigned > 0 && <Badge variant="destructive" className="text-xs">{unassigned} unassigned</Badge>}
                  </div>
                  <Badge variant={pct === 100 ? "default" : pct >= 50 ? "secondary" : "destructive"}>
                    {pct}%
                  </Badge>
                </div>
              </button>

              <div className="px-4 py-1 bg-gray-50 dark:bg-gray-800">
                <Progress value={pct} className="h-2" />
              </div>

              {isExpanded && zoneDistricts.length > 0 && (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {zoneDistricts.map((district) => {
                    const dTotal = Number(district.total_streets ?? 0);
                    const dCompleted = Number(district.completed_streets ?? 0);
                    const dAssigned = Number(district.assigned_streets ?? 0);
                    const dInProgress = Number(district.in_progress_streets ?? 0);
                    const dUnassigned = Number(district.unassigned_streets ?? 0);
                    const dPct = dTotal > 0 ? Math.round((dCompleted / dTotal) * 100) : 0;
                    const dDistrictId = String(district.district_id);
                    const dRoadKm = district.road_km !== null && district.road_km !== undefined ? Number(district.road_km) : null;
                    const dTotalZones = Number(district.total_survey_zones ?? 0);
                    const zonePanelExpanded = expandedDistrictZonePanels.has(dDistrictId);

                    const handleAssign = async (driverId: string) => {
                      try {
                        const result = await assignDistrict({ cityId, districtId: dDistrictId, driverId });
                        toast.success(`Assigned ${result.created} streets in ${String(district.district_name_en)} to driver`);
                        onAssigned();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Assignment failed");
                      }
                    };

                    return (
                      <div key={dDistrictId} id={`district-row-${dDistrictId}`}>
                        <div className="px-4 py-3 bg-white dark:bg-gray-900">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{String(district.district_name_en)}</p>
                              <p className="text-xs text-gray-400">
                                {String(district.district_name_ar ?? "")}
                                {dRoadKm !== null && <span className="ml-2 text-gray-400">&bull; {dRoadKm.toFixed(1)} km</span>}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {dUnassigned > 0 && drivers.length > 0 && (
                                <Select onValueChange={handleAssign}>
                                  <SelectTrigger className="w-40 h-8 text-xs">
                                    <SelectValue placeholder="Assign driver..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {drivers.filter(d => d.is_active).map(d => (
                                      <SelectItem key={String(d.id)} value={String(d.id)}>
                                        {String(d.full_name)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              <Badge variant={dPct === 100 ? "default" : dPct >= 50 ? "secondary" : "outline"} className="text-xs">
                                {dPct}%
                              </Badge>
                            </div>
                          </div>
                          <Progress value={dPct} className="h-1.5 mb-2" />
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-green-500" /> {dCompleted} done
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-blue-500" /> {dAssigned + dInProgress} assigned
                            </span>
                            {dUnassigned > 0 && (
                              <span className="flex items-center gap-1 text-red-500 font-medium">
                                <XCircle className="w-3 h-3" /> {dUnassigned} remaining
                              </span>
                            )}
                            <span className="ml-auto">{dTotal} total</span>
                            {dRoadKm !== null && (
                              <button
                                className="flex items-center gap-1 text-blue-600 hover:underline"
                                onClick={() => toggleDistrictZonePanel(dDistrictId)}
                              >
                                <Layers className="w-3 h-3" />
                                {dTotalZones > 0 ? `${dTotalZones} zones` : "View Zones"}
                                {zonePanelExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                        </div>
                        {zonePanelExpanded && (
                          <SurveyZonePanel districtId={dDistrictId} drivers={drivers} onAssigned={onAssigned} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {isExpanded && zoneDistricts.length === 0 && (
                <div className="px-4 py-3 bg-white dark:bg-gray-900 text-sm text-gray-400 text-center">
                  No districts in this zone
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function CityPlanning() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);
  const [driverDetail, setDriverDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Coverage Planning Calculator state (District-Based Driver Survey Coverage Planner)
  const [showPlanning, setShowPlanning] = useState(false);
  const [targetDays, setTargetDays] = useState(30);
  const [targetLeads, setTargetLeads] = useState(25);
  const [numberOfDrivers, setNumberOfDrivers] = useState(0);
  const [petrolPerDriverPerDay, setPetrolPerDriverPerDay] = useState(50);
  const [petrolPricePerLiter, setPetrolPricePerLiter] = useState(2.18);
  const [avgCarMileageKmPerLiter, setAvgCarMileageKmPerLiter] = useState(14);
  const [surveyEfficiencyPct, setSurveyEfficiencyPct] = useState(60);
  const [planKmResult, setPlanKmResult] = useState<Record<string, unknown> | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [generatingToday, setGeneratingToday] = useState(false);
  const [splittingDistrictId, setSplittingDistrictId] = useState<string | null>(null);
  const [focusDistrictId, setFocusDistrictId] = useState<string | null>(null);

  const loadData = async () => {
    if (!id) return;
    try {
      const result = await getCityPlanning(id);
      setData(result);
      const city = result.city as Record<string, unknown>;
      const resultDrivers = (result.drivers as Record<string, unknown>[]) ?? [];
      if (city.targetDays) setTargetDays(Number(city.targetDays));
      if (city.targetLeadsPerDriver) setTargetLeads(Number(city.targetLeadsPerDriver));
      if (city.petrolPerDriverPerDay) setPetrolPerDriverPerDay(Number(city.petrolPerDriverPerDay));
      if (city.petrolPricePerLiter) setPetrolPricePerLiter(Number(city.petrolPricePerLiter));
      if (city.avgCarMileageKmPerLiter) setAvgCarMileageKmPerLiter(Number(city.avgCarMileageKmPerLiter));
      if (city.surveyEfficiencyPct) setSurveyEfficiencyPct(Number(city.surveyEfficiencyPct));
      setNumberOfDrivers(prev => prev || resultDrivers.filter(d => d.is_active).length || 1);
    } catch (err) {
      console.error("Failed to load city planning:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [id]);

  const handleCalculateKm = async () => {
    if (!id) return;
    setCalculating(true);
    try {
      await updateCity(id, {
        targetDays, targetLeadsPerDriver: targetLeads,
        petrolPerDriverPerDay, petrolPricePerLiter, avgCarMileageKmPerLiter, surveyEfficiencyPct,
      });
      const result = await calculatePlanKm({
        cityId: id, targetDays, numberOfDrivers: numberOfDrivers || 1,
        petrolPerDriverPerDay, petrolPricePerLiter, avgCarMileageKmPerLiter, surveyEfficiencyPct,
        targetLeadsPerDriver: targetLeads,
      });
      setPlanKmResult(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Calculation failed");
    } finally {
      setCalculating(false);
    }
  };

  const handleGenerateToday = async () => {
    if (!id) return;
    setGeneratingToday(true);
    try {
      const result = await autoAssignZones(id);
      toast.success(`Assigned ${result.zonesAssigned} zone${result.zonesAssigned !== 1 ? 's' : ''} across ${result.driversUsed} driver${result.driversUsed !== 1 ? 's' : ''}. ${result.unassignedZones} zone${result.unassignedZones !== 1 ? 's' : ''} remain unassigned.`);
      setPlanKmResult(null);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auto-assign failed");
    } finally {
      setGeneratingToday(false);
    }
  };

  const handleSplitDistrict = async (districtId: string) => {
    if (!id) return;
    setSplittingDistrictId(districtId);
    try {
      const result = await splitDistrict(id, districtId);
      if (result.created === 0) {
        toast.info("This district's remaining streets are already split into zones.");
      } else {
        toast.success(`Split into ${result.created} survey zone${result.created !== 1 ? 's' : ''}`);
      }
      setFocusDistrictId(districtId);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Split failed");
    } finally {
      setSplittingDistrictId(null);
    }
  };

  const handleViewZones = (districtId: string) => {
    setFocusDistrictId(districtId);
  };

  const handleExpandDriver = async (driverId: string) => {
    if (expandedDriver === driverId) {
      setExpandedDriver(null);
      setDriverDetail(null);
      return;
    }
    setExpandedDriver(driverId);
    setDetailLoading(true);
    try {
      const detail = await getDriverAssignmentHistory(driverId, 30);
      setDriverDetail(detail);
    } catch (err) {
      console.error("Failed to load driver history:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">City not found</p>
        <Button onClick={() => navigate("/")} className="mt-4">Back to Dashboard</Button>
      </div>
    );
  }

  const city = data.city as Record<string, unknown>;
  const drivers = (data.drivers as Record<string, unknown>[]) ?? [];
  const streetStats = (data.streetStats as Record<string, unknown>) ?? {};
  const todayStats = (data.todayStats as Record<string, unknown>) ?? {};
  const dashboardCards = (data.dashboardCards as Record<string, unknown>) ?? {};

  const totalStreets = Number(streetStats.total_streets ?? 0);
  const completedStreets = Number(streetStats.completed ?? 0);
  const unassignedStreets = Number(streetStats.unassigned ?? 0);
  const coveragePct = totalStreets > 0 ? Math.round((completedStreets / totalStreets) * 100) : 0;

  const todayAssigned = Number(todayStats.total_assigned_today ?? 0);
  const todayCompleted = Number(todayStats.completed_today ?? 0);
  const todayInProgress = Number(todayStats.in_progress_today ?? 0);
  const todaySkipped = Number(todayStats.skipped_today ?? 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {String(city.nameEn)} — Daily Planning
            </h2>
            <p className="text-sm text-gray-500">
              {String(city.nameAr)} &bull; {String(city.regionEn)} &bull; {String(data.today)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowPlanning(!showPlanning)}>
            <Target className="w-4 h-4 mr-2" />
            {showPlanning ? "Close Planner" : "Plan Coverage"}
          </Button>
          <Button onClick={handleGenerateToday} disabled={generatingToday}>
            {generatingToday ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
            Generate Today
          </Button>
        </div>
      </div>

      {/* Coverage Planning Calculator */}
      {showPlanning && (
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600" />
              Coverage Planning Calculator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Target Days to Complete</Label>
                <Input type="number" value={targetDays} onChange={e => setTargetDays(Number(e.target.value))} min={1} />
                <p className="text-xs text-gray-500">Working days to cover all streets</p>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Number of Available Drivers</Label>
                <Input type="number" value={numberOfDrivers} onChange={e => setNumberOfDrivers(Number(e.target.value))} min={1} />
                <p className="text-xs text-gray-500">Drivers available for this plan</p>
              </div>
              <div className="space-y-2">
                <Label>Target Leads per Driver / Day</Label>
                <Input type="number" value={targetLeads} onChange={e => setTargetLeads(Number(e.target.value))} min={0} />
                <p className="text-xs text-gray-500">Expected lead conversion rate</p>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Fuel className="w-3.5 h-3.5" /> Petrol per Driver per Day (SAR)</Label>
                <Input type="number" value={petrolPerDriverPerDay} onChange={e => setPetrolPerDriverPerDay(Number(e.target.value))} min={0} step={0.5} />
              </div>
              <div className="space-y-2">
                <Label>Petrol Price per Liter (SAR)</Label>
                <Input type="number" value={petrolPricePerLiter} onChange={e => setPetrolPricePerLiter(Number(e.target.value))} min={0.01} step={0.01} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Gauge className="w-3.5 h-3.5" /> Average Car Mileage (km/liter)</Label>
                <Input type="number" value={avgCarMileageKmPerLiter} onChange={e => setAvgCarMileageKmPerLiter(Number(e.target.value))} min={0} step={0.5} />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label>Survey Efficiency (%)</Label>
                <Input type="number" value={surveyEfficiencyPct} onChange={e => setSurveyEfficiencyPct(Number(e.target.value))} min={0} max={100} />
                <p className="text-xs text-gray-500">Accounts for stops, photos, traffic, U-turns — realistic vs. theoretical driving range</p>
              </div>
            </div>

            <Button onClick={handleCalculateKm} disabled={calculating} className="w-full md:w-auto">
              {calculating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <TrendingUp className="w-4 h-4 mr-2" />}
              Calculate Feasibility
            </Button>

            {planKmResult && (
              <div className="space-y-4">
                <div className={`p-4 rounded-lg border ${planKmResult.feasible ? 'bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-800' : 'bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-800'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {planKmResult.feasible
                      ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                      : <XCircle className="w-5 h-5 text-red-600" />
                    }
                    <span className={`font-semibold ${planKmResult.feasible ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                      {planKmResult.feasible ? 'Plan is Feasible!' : 'Not Feasible — Need More Drivers'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Realistic driver capacity: <strong>{Number(planKmResult.realisticDriverDailyKm).toFixed(1)} km/day</strong>
                    {" "}&bull; Team capacity: <strong>{Number(planKmResult.totalDailyTeamCapacity).toFixed(1)} km/day</strong>
                    {" "}&bull; Estimated completion: <strong>{Number(planKmResult.estimatedCompletionDays)} days</strong>
                  </p>
                  {!planKmResult.feasible && (
                    <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                      You need <strong>{Number(planKmResult.shortfall)} more drivers</strong> (total {Number(planKmResult.driversNeeded)}) to complete in {targetDays} days.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border">
                    <p className="text-xs text-gray-500 mb-1">Total Road KM</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{Number(planKmResult.totalRoadKm).toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border">
                    <p className="text-xs text-gray-500 mb-1">Remaining Road KM</p>
                    <p className="text-xl font-bold text-red-600">{Number(planKmResult.remainingRoadKm).toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border">
                    <p className="text-xs text-gray-500 mb-1">Driver Daily KM Capacity</p>
                    <p className="text-xl font-bold text-blue-600">{Number(planKmResult.driverDailyKmCapacity).toFixed(1)}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border">
                    <p className="text-xs text-gray-500 mb-1">Estimated Completion Days</p>
                    <p className={`text-xl font-bold ${planKmResult.feasible ? 'text-green-600' : 'text-red-600'}`}>{Number(planKmResult.estimatedCompletionDays)}</p>
                    <p className="text-xs text-gray-400">of {targetDays} target</p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border">
                    <p className="text-xs text-gray-500 mb-1">Expected Total Leads</p>
                    <p className="text-xl font-bold text-green-600">{Number(planKmResult.expectedTotalLeads)}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border">
                    <p className="text-xs text-gray-500 mb-1">Current Coverage</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{Number(planKmResult.coveragePct)}%</p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border">
                    <p className="text-xs text-gray-500 mb-1">Total Districts</p>
                    <p className="text-xl font-bold text-purple-600">{Number(planKmResult.totalDistricts)}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border">
                    <p className="text-xs text-gray-500 mb-1">Drivers Needed</p>
                    <p className={`text-xl font-bold ${Number(planKmResult.shortfall) > 0 ? 'text-red-600' : 'text-green-600'}`}>{Number(planKmResult.driversNeeded)}</p>
                    {Number(planKmResult.shortfall) > 0 && <p className="text-xs text-red-500">+{Number(planKmResult.shortfall)} more</p>}
                  </div>
                </div>

                {/* Per-district road-km breakdown table */}
                {Array.isArray(planKmResult.districts) && (planKmResult.districts as Record<string, unknown>[]).length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>District</TableHead>
                          <TableHead className="text-right">Road KM</TableHead>
                          <TableHead className="text-right">Driver Capacity/Day</TableHead>
                          <TableHead className="text-right">Required Driver-Days</TableHead>
                          <TableHead>Recommendation</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(planKmResult.districts as Record<string, unknown>[]).map((d) => {
                          const districtId = String(d.districtId);
                          const needsSplit = Boolean(d.needsSplit);
                          return (
                            <TableRow key={districtId}>
                              <TableCell className="font-medium">{String(d.nameEn)}</TableCell>
                              <TableCell className="text-right">{Number(d.roadKm).toFixed(1)} km</TableCell>
                              <TableCell className="text-right">{Number(planKmResult.driverDailyKmCapacity).toFixed(1)} km</TableCell>
                              <TableCell className="text-right">{Number(d.requiredDriverDays).toFixed(2)}</TableCell>
                              <TableCell className="text-sm text-gray-600 dark:text-gray-400">{String(d.recommendation)}</TableCell>
                              <TableCell>
                                {needsSplit && (
                                  <Button
                                    size="sm" variant="outline"
                                    disabled={splittingDistrictId === districtId}
                                    onClick={() => handleSplitDistrict(districtId)}
                                  >
                                    <Scissors className="w-3 h-3 mr-1" />
                                    Split
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <Button onClick={handleGenerateToday} disabled={generatingToday} className="w-full" size="lg">
                  {generatingToday ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Zap className="w-5 h-5 mr-2" />}
                  Generate Today's Assignments ({numberOfDrivers} drivers × {Number(planKmResult.driverDailyKmCapacity).toFixed(1)} km/driver)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats Row — the operational numbers you check every day */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-green-600">{Number(dashboardCards.coveragePct ?? coveragePct)}%</p>
            <p className="text-xs text-gray-500">Overall Coverage</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Calendar className="w-5 h-5 text-orange-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{Number(dashboardCards.estimatedCompletionDays ?? 0)}</p>
            <p className="text-xs text-gray-500">Days Left at Current Pace</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Zap className="w-5 h-5 text-blue-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{Number(dashboardCards.assignedToday ?? todayAssigned)}</p>
            <p className="text-xs text-gray-500">Assigned Today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <XCircle className="w-5 h-5 text-red-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-red-600">{Number(dashboardCards.unassignedDistrictsOrZones ?? unassignedStreets)}</p>
            <p className="text-xs text-gray-500">Unassigned Zones</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Users className="w-5 h-5 text-purple-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{Number(dashboardCards.totalDrivers ?? drivers.length)}</p>
            <p className="text-xs text-gray-500">Active Drivers</p>
          </CardContent>
        </Card>
      </div>

      {/* Details behind a toggle — km / capacity math, only needed occasionally */}
      <details className="group">
        <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1.5 select-none w-fit">
          <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
          Capacity &amp; road-km details
        </summary>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border">
            <Layers className="w-4 h-4 text-indigo-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-900 dark:text-white">{Number(dashboardCards.totalDistricts ?? 0)}</p>
            <p className="text-xs text-gray-500">Total Districts</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border">
            <MapPin className="w-4 h-4 text-purple-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-900 dark:text-white">{Number(dashboardCards.totalStreets ?? totalStreets)}</p>
            <p className="text-xs text-gray-500">Total Streets</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border">
            <Route className="w-4 h-4 text-cyan-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-900 dark:text-white">{Number(dashboardCards.totalRoadKm ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
            <p className="text-xs text-gray-500">Total Road KM</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border">
            <Gauge className="w-4 h-4 text-blue-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-900 dark:text-white">{Number(dashboardCards.driverDailyKmCapacity ?? 0).toFixed(1)}</p>
            <p className="text-xs text-gray-500">Driver Daily KM Capacity</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border col-span-2 md:col-span-1">
            <TrendingUp className="w-4 h-4 text-blue-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-900 dark:text-white">{Number(dashboardCards.totalDailyTeamCapacity ?? 0).toFixed(1)}</p>
            <p className="text-xs text-gray-500">Total Daily Team Capacity</p>
          </div>
        </div>
      </details>

      {/* Today's Progress */}
      {todayAssigned > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Today's Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500">
                {todayCompleted} completed of {todayAssigned} assigned
              </span>
              <span className="text-sm font-semibold">
                {todayAssigned > 0 ? Math.round((todayCompleted / todayAssigned) * 100) : 0}%
              </span>
            </div>
            <Progress value={todayAssigned > 0 ? (todayCompleted / todayAssigned) * 100 : 0} className="h-3" />
            <div className="flex gap-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" /> {todayCompleted} completed</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-blue-500" /> {todayInProgress} in progress</span>
              <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-red-500" /> {todaySkipped} skipped</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Remaining Days Plan — projected, read-only forward view */}
      <RemainingPlanForecast
        districts={(data.districts as Record<string, unknown>[]) ?? []}
        dailyCapacityKm={Number(dashboardCards.totalDailyTeamCapacity ?? 0)}
        today={data.today as string | undefined}
      />

      {/* District Coverage Map */}
      <DistrictCoverageMap
        data={data}
        onSplitDistrict={handleSplitDistrict}
        onViewZones={handleViewZones}
        splittingDistrictId={splittingDistrictId}
      />

      {/* Zone & District Coverage Overview */}
      <ZoneDistrictOverview data={data} drivers={drivers} cityId={id!} onAssigned={loadData} focusDistrictId={focusDistrictId} />

      {/* Driver Cards */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Drivers ({drivers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {drivers.map((driver) => {
            const driverId = String(driver.id);
            const isExpanded = expandedDriver === driverId;
            const assigned = Number(driver.today_assigned ?? 0);
            const completed = Number(driver.today_completed ?? 0);
            const inProgress = Number(driver.today_in_progress ?? 0);
            const skipped = Number(driver.today_skipped ?? 0);
            const todayLeads = Number(driver.today_leads ?? 0);

            return (
              <div key={driverId} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                {/* Driver Row */}
                <button
                  className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 text-left transition-colors"
                  onClick={() => handleExpandDriver(driverId)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                      <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                        {String(driver.full_name ?? "").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{String(driver.full_name)}</p>
                      <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                        {driver.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{String(driver.phone)}</span>}
                        {driver.iqama_number && <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" />{String(driver.iqama_number)}</span>}
                        {driver.car_plate_number && <span className="flex items-center gap-1"><Car className="w-3 h-3" />{String(driver.car_plate_number)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="hidden md:flex gap-2 text-xs">
                      {assigned > 0 && <Badge variant="outline">{assigned} assigned</Badge>}
                      {completed > 0 && <Badge variant="default">{completed} done</Badge>}
                      {todayLeads > 0 && <Badge className="bg-green-600">{todayLeads} leads</Badge>}
                    </div>
                    <Badge variant={driver.is_active ? "default" : "destructive"}>
                      {driver.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </button>

                {/* Expanded Driver Detail */}
                {isExpanded && (
                  <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
                    {detailLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                      </div>
                    ) : driverDetail ? (
                      <div className="space-y-6">
                        {/* Performance Summary */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3 text-center">
                            <p className="text-xl font-bold text-blue-600">{Number(driver.total_leads)}</p>
                            <p className="text-xs text-gray-500">Total Leads</p>
                          </div>
                          <div className="bg-green-50 dark:bg-green-950 rounded-lg p-3 text-center">
                            <p className="text-xl font-bold text-green-600">{Number(driver.approved_leads)}</p>
                            <p className="text-xs text-gray-500">Approved</p>
                          </div>
                          <div className="bg-purple-50 dark:bg-purple-950 rounded-lg p-3 text-center">
                            <p className="text-xl font-bold text-purple-600">{Number(driver.total_streets_completed)}</p>
                            <p className="text-xs text-gray-500">Streets Done</p>
                          </div>
                          <div className="bg-orange-50 dark:bg-orange-950 rounded-lg p-3 text-center">
                            <p className="text-xl font-bold text-orange-600">
                              {driver.avg_quality_score ? `${Number(driver.avg_quality_score).toFixed(0)}%` : "N/A"}
                            </p>
                            <p className="text-xs text-gray-500">Avg Quality</p>
                          </div>
                        </div>

                        {/* Today's Streets — grouped by district */}
                        {((driverDetail.todayStreets as Record<string, unknown>[]) ?? []).length > 0 && (() => {
                          const todayStreets = (driverDetail.todayStreets as Record<string, unknown>[]) ?? [];
                          const byDistrict = new Map<string, Record<string, unknown>[]>();
                          todayStreets.forEach(s => {
                            const key = String(s.district_name_en ?? "Unassigned District");
                            if (!byDistrict.has(key)) byDistrict.set(key, []);
                            byDistrict.get(key)!.push(s);
                          });

                          return (
                            <div>
                              <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                <MapPin className="w-4 h-4" /> Today's Streets ({todayStreets.length})
                              </h4>
                              <div className="space-y-4">
                                {Array.from(byDistrict.entries()).map(([distName, distStreets]) => (
                                  <div key={distName}>
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                                      <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">{distName}</span>
                                      <Badge variant="outline" className="text-xs">{distStreets.length} streets</Badge>
                                      {distStreets[0]?.district_name_ar && (
                                        <span className="text-xs text-gray-400">{String(distStreets[0].district_name_ar)}</span>
                                      )}
                                    </div>
                                    <div className="space-y-1 ml-4 border-l-2 border-blue-100 dark:border-blue-900 pl-3">
                                      {distStreets.map(street => (
                                        <div key={String(street.id)} className="flex items-center justify-between py-1.5 px-3 rounded-md bg-gray-50 dark:bg-gray-800">
                                          <span className="text-sm text-gray-900 dark:text-white">{String(street.street_name_en ?? "Unknown")}</span>
                                          <Badge variant={statusColor(String(street.status))} className="text-xs">
                                            {String(street.status).replace("_", " ")}
                                          </Badge>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Assignment History */}
                        {((driverDetail.history as Record<string, unknown>[]) ?? []).length > 0 && (
                          <div>
                            <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                              <Calendar className="w-4 h-4" /> Assignment History (Last 30 Days)
                            </h4>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Assigned</TableHead>
                                  <TableHead>Completed</TableHead>
                                  <TableHead>Skipped</TableHead>
                                  <TableHead>Leads</TableHead>
                                  <TableHead>Rate</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {((driverDetail.history as Record<string, unknown>[]) ?? []).map((row) => {
                                  const assigned = Number(row.streets_assigned ?? 0);
                                  const completed = Number(row.streets_completed ?? 0);
                                  const rate = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;
                                  return (
                                    <TableRow key={String(row.date)}>
                                      <TableCell className="font-medium">{String(row.date)}</TableCell>
                                      <TableCell>{assigned}</TableCell>
                                      <TableCell className="text-green-600 font-semibold">{completed}</TableCell>
                                      <TableCell className="text-red-600">{Number(row.streets_skipped ?? 0)}</TableCell>
                                      <TableCell>
                                        <Badge variant="secondary">{Number(row.leads_submitted ?? 0)}</Badge>
                                      </TableCell>
                                      <TableCell>
                                        <Badge variant={rate >= 80 ? "default" : rate >= 50 ? "secondary" : "destructive"}>
                                          {rate}%
                                        </Badge>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        )}

                        {((driverDetail.history as Record<string, unknown>[]) ?? []).length === 0 &&
                         ((driverDetail.todayStreets as Record<string, unknown>[]) ?? []).length === 0 && (
                          <div className="text-center py-6 text-gray-400">
                            <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                            <p>No assignment history yet</p>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}

          {drivers.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No drivers registered for this city. Add drivers from the Drivers page.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
