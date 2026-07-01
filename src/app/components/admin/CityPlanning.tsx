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
import { getCityPlanning, getDriverAssignmentHistory, autoPlan, assignDistrict, calculatePlan, updateCity } from "../../lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  ArrowLeft, Zap, Users, MapPin, TrendingUp, ChevronDown, ChevronRight, Target,
  Phone, CreditCard, Car, CheckCircle2, Clock, XCircle, Loader2, FileText, Calendar, Map as MapIcon
} from "lucide-react";
import { toast } from "sonner";

function statusColor(status: string) {
  switch (status) {
    case "completed": return "default";
    case "in_progress": return "secondary";
    case "skipped": return "destructive";
    default: return "outline";
  }
}

function getDistrictColor(district: Record<string, unknown>): string {
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

function DistrictCoverageMap({ data }: { data: Record<string, unknown> }) {
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
                  <Popup minWidth={220}>
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

function ZoneDistrictOverview({ data, drivers, cityId, onAssigned }: { data: Record<string, unknown>; drivers: Record<string, unknown>[]; cityId: string; onAssigned: () => void }) {
  const zones = (data.zones as Record<string, unknown>[]) ?? [];
  const districts = (data.districts as Record<string, unknown>[]) ?? [];
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());

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

                    const handleAssign = async (driverId: string) => {
                      try {
                        const result = await assignDistrict({ cityId, districtId: String(district.district_id), driverId });
                        const driverName = drivers.find(d => String(d.id || d.full_name) === driverId);
                        toast.success(`Assigned ${result.created} streets in ${String(district.district_name_en)} to driver`);
                        onAssigned();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Assignment failed");
                      }
                    };

                    return (
                      <div key={String(district.district_id)} className="px-4 py-3 bg-white dark:bg-gray-900">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{String(district.district_name_en)}</p>
                            <p className="text-xs text-gray-400">{String(district.district_name_ar ?? "")}</p>
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
                        <div className="flex gap-3 text-xs text-gray-500">
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
                        </div>
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

  // Planning panel state
  const [showPlanning, setShowPlanning] = useState(false);
  const [targetDays, setTargetDays] = useState(30);
  const [targetLeads, setTargetLeads] = useState(3);
  const [maxStreets, setMaxStreets] = useState(20);
  const [planResult, setPlanResult] = useState<Record<string, unknown> | null>(null);
  const [calculating, setCalculating] = useState(false);

  const loadData = async () => {
    if (!id) return;
    try {
      const result = await getCityPlanning(id);
      setData(result);
      const city = result.city as Record<string, unknown>;
      if (city.targetDays) setTargetDays(Number(city.targetDays));
      if (city.targetLeadsPerDriver) setTargetLeads(Number(city.targetLeadsPerDriver));
      if (city.maxStreetsPerDriver) setMaxStreets(Number(city.maxStreetsPerDriver));
    } catch (err) {
      console.error("Failed to load city planning:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [id]);

  const handleCalculate = async () => {
    if (!id) return;
    setCalculating(true);
    try {
      // First get driver count to auto-calculate streets per driver
      const driverCount = drivers.length || 1;
      const autoMaxStreets = Math.ceil(unassignedStreets / (driverCount * targetDays)) || 20;
      setMaxStreets(autoMaxStreets);
      await updateCity(id, { targetDays, targetLeadsPerDriver: targetLeads, maxStreetsPerDriver: autoMaxStreets });
      const result = await calculatePlan({ cityId: id, targetDays, targetLeadsPerDriver: targetLeads, maxStreetsPerDriver: autoMaxStreets });
      setPlanResult(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Calculation failed");
    } finally {
      setCalculating(false);
    }
  };

  const handleGenerateToday = async () => {
    if (!id) return;
    try {
      const driverCount = drivers.length || 1;
      const autoMaxStreets = maxStreets || Math.ceil(unassignedStreets / (driverCount * targetDays)) || 20;
      const result = await autoPlan(id, undefined, autoMaxStreets);
      toast.success(`Assigned ${result.created} streets across ${result.driversAssigned} drivers. ${result.remainingUnassigned} remaining.`);
      setPlanResult(null);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auto-plan failed");
    }
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
          <Button onClick={handleGenerateToday}>
            <Zap className="w-4 h-4 mr-2" />
            Generate Today
          </Button>
        </div>
      </div>

      {/* Planning Panel */}
      {showPlanning && (
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600" />
              Coverage Planning Calculator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Target Days to Complete</Label>
                <Input type="number" value={targetDays} onChange={e => setTargetDays(Number(e.target.value))} min={1} />
                <p className="text-xs text-gray-500">Working days to cover all streets</p>
              </div>
              <div className="space-y-2">
                <Label>Target Leads per Driver / Day</Label>
                <Input type="number" value={targetLeads} onChange={e => setTargetLeads(Number(e.target.value))} min={0} />
                <p className="text-xs text-gray-500">Expected lead conversion rate</p>
              </div>
            </div>

            <Button onClick={handleCalculate} disabled={calculating} className="w-full md:w-auto">
              {calculating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <TrendingUp className="w-4 h-4 mr-2" />}
              Calculate Feasibility
            </Button>

            {planResult && (
              <div className="space-y-4">
                <div className={`p-4 rounded-lg border ${planResult.feasible ? 'bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-800' : 'bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-800'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {planResult.feasible
                      ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                      : <XCircle className="w-5 h-5 text-red-600" />
                    }
                    <span className={`font-semibold ${planResult.feasible ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                      {planResult.feasible ? 'Plan is Feasible!' : 'Not Feasible — Need More Drivers'}
                    </span>
                  </div>
                  {!planResult.feasible && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      You need <strong>{Number(planResult.shortfall)} more drivers</strong> (total {Number(planResult.driversNeeded)}) to complete in {targetDays} days,
                      or increase the target days to {Number(planResult.daysNeeded)}.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border">
                    <p className="text-xs text-gray-500 mb-1">Unassigned Streets</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{Number(planResult.totalUnassigned).toLocaleString()}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border">
                    <p className="text-xs text-gray-500 mb-1">Active Drivers</p>
                    <p className="text-xl font-bold text-blue-600">{Number(planResult.activeDrivers)}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border">
                    <p className="text-xs text-gray-500 mb-1">Days Needed</p>
                    <p className={`text-xl font-bold ${planResult.feasible ? 'text-green-600' : 'text-red-600'}`}>{Number(planResult.daysNeeded)}</p>
                    <p className="text-xs text-gray-400">of {targetDays} target</p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border">
                    <p className="text-xs text-gray-500 mb-1">Streets / Driver / Day</p>
                    <p className="text-xl font-bold text-orange-600">{Number(planResult.streetsPerDriverPerDay)}</p>
                    <p className="text-xs text-gray-400">auto-calculated</p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border">
                    <p className="text-xs text-gray-500 mb-1">Expected Total Leads</p>
                    <p className="text-xl font-bold text-green-600">{Number(planResult.expectedTotalLeads)}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border">
                    <p className="text-xs text-gray-500 mb-1">Current Coverage</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{Number(planResult.coveragePct)}%</p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border">
                    <p className="text-xs text-gray-500 mb-1">Total Streets</p>
                    <p className="text-xl font-bold text-purple-600">{Number(planResult.totalStreets).toLocaleString()}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border">
                    <p className="text-xs text-gray-500 mb-1">Drivers Needed</p>
                    <p className={`text-xl font-bold ${Number(planResult.shortfall) > 0 ? 'text-red-600' : 'text-green-600'}`}>{Number(planResult.driversNeeded)}</p>
                    {Number(planResult.shortfall) > 0 && <p className="text-xs text-red-500">+{Number(planResult.shortfall)} more</p>}
                  </div>
                </div>

                <Button onClick={handleGenerateToday} className="w-full" size="lg">
                  <Zap className="w-5 h-5 mr-2" />
                  Generate Today's Assignments ({Number(planResult.activeDrivers)} drivers × {Number(planResult.streetsPerDriverPerDay)} streets/driver)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <Users className="w-5 h-5 text-blue-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{drivers.length}</p>
            <p className="text-xs text-gray-500">Drivers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <MapPin className="w-5 h-5 text-purple-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalStreets}</p>
            <p className="text-xs text-gray-500">Total Streets</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-green-600">{coveragePct}%</p>
            <p className="text-xs text-gray-500">Coverage</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Calendar className="w-5 h-5 text-orange-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{todayAssigned}</p>
            <p className="text-xs text-gray-500">Assigned Today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <TrendingUp className="w-5 h-5 text-red-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-red-600">{unassignedStreets}</p>
            <p className="text-xs text-gray-500">Unassigned</p>
          </CardContent>
        </Card>
      </div>

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

      {/* District Coverage Map */}
      <DistrictCoverageMap data={data} />

      {/* Zone & District Coverage Overview */}
      <ZoneDistrictOverview data={data} drivers={drivers} cityId={id!} onAssigned={loadData} />

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
