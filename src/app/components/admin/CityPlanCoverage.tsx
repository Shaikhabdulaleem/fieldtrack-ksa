import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  getCityPlanning, updateCity, calculatePlanKm, splitDistrict, autoAssignZones,
} from "../../lib/api";
import {
  ArrowLeft, Target, TrendingUp, Users, Fuel, Gauge, Scissors, Zap, Loader2,
  CheckCircle2, XCircle, Calendar, CalendarOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";

// Sequential single-hue series colors, matched to this app's existing brand
// usage (blue = planned work, green = coverage) rather than a generic palette.
const CHART_KM_COLOR = "#2563eb";
const CHART_COVERAGE_COLOR = "#16a34a";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const FRIDAY = 5;

// Working-day math for the calculator's Start/End Date fields — Friday is the
// Saudi weekend and never counts as a working day.
function countWorkingDays(startISO: string, endISO: string): number {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (cursor.getDay() !== FRIDAY) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function addWorkingDays(startISO: string, workingDays: number): string {
  const cursor = new Date(startISO);
  if (isNaN(cursor.getTime()) || workingDays <= 1) return startISO;
  let remaining = workingDays - 1;
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1);
    if (cursor.getDay() !== FRIDAY) remaining--;
  }
  return cursor.toISOString().slice(0, 10);
}

type WorkDayBundle = { districts: { name: string; km: number }[]; totalKm: number };
type TimelineRow = {
  date: string;
  weekday: string;
  isToday: boolean;
  isWeekend: boolean;
  workDayNumber: number | null;
  districts: { name: string; km: number }[];
  km: number;
  cumulativeKm: number;
  cumulativePct: number;
};

// Greedily packs remaining district road-km into capacity-sized work-day
// bundles, largest-remaining-district first. Purely a projection for display —
// nothing here is persisted; real assignments still only happen day by day
// via "Generate Today".
function buildWorkDayBundles(districts: Record<string, unknown>[], dailyCapacityKm: number): WorkDayBundle[] {
  const items = districts
    .map(d => ({
      nameEn: String(d.district_name_en),
      remainingKm: d.remaining_road_km !== null && d.remaining_road_km !== undefined ? Number(d.remaining_road_km) : null,
    }))
    .filter((d): d is { nameEn: string; remainingKm: number } => d.remainingKm !== null && d.remainingKm > 0.01)
    .sort((a, b) => b.remainingKm - a.remainingKm);

  if (dailyCapacityKm <= 0.01 || items.length === 0) return [];

  const bundles: WorkDayBundle[] = [];
  let capacityLeft = dailyCapacityKm;
  let currentDistricts: { name: string; km: number }[] = [];
  let currentTotal = 0;

  const pushBundle = () => {
    if (currentDistricts.length === 0) return;
    bundles.push({ districts: currentDistricts, totalKm: currentTotal });
    capacityLeft = dailyCapacityKm;
    currentDistricts = [];
    currentTotal = 0;
  };

  const MAX_WORK_DAYS = 120;
  for (const item of items) {
    let remaining = item.remainingKm;
    while (remaining > 0.01 && bundles.length < MAX_WORK_DAYS) {
      if (capacityLeft <= 0.01) pushBundle();
      const take = Math.min(remaining, capacityLeft);
      const existing = currentDistricts.find(x => x.name === item.nameEn);
      if (existing) existing.km += take;
      else currentDistricts.push({ name: item.nameEn, km: take });
      currentTotal += take;
      capacityLeft -= take;
      remaining -= take;
    }
    if (bundles.length >= MAX_WORK_DAYS) break;
  }
  pushBundle();
  return bundles;
}

// Walks calendar dates from today, placing one work-day bundle per non-Friday
// day (Friday is Saudi weekend — shown as a row but never assigned work) until
// every bundle has a date. Stops once the last bundle is placed.
function buildTimeline(
  bundles: WorkDayBundle[],
  todayStr: string | undefined,
  alreadyCompletedKm: number,
  totalRoadKm: number,
): TimelineRow[] {
  const rows: TimelineRow[] = [];
  if (bundles.length === 0) return rows;

  const cursor = todayStr ? new Date(todayStr) : new Date();
  let bundleIdx = 0;
  let cumulativeKm = alreadyCompletedKm;
  const MAX_CALENDAR_DAYS = 250;

  for (let i = 0; i < MAX_CALENDAR_DAYS && bundleIdx < bundles.length; i++) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const dow = cursor.getDay();
    const isToday = i === 0;

    if (dow === FRIDAY) {
      rows.push({
        date: dateStr, weekday: WEEKDAY_NAMES[dow], isToday, isWeekend: true,
        workDayNumber: null, districts: [], km: 0, cumulativeKm, cumulativePct: totalRoadKm > 0 ? (cumulativeKm / totalRoadKm) * 100 : 0,
      });
    } else {
      const bundle = bundles[bundleIdx];
      cumulativeKm += bundle.totalKm;
      rows.push({
        date: dateStr, weekday: WEEKDAY_NAMES[dow], isToday, isWeekend: false,
        workDayNumber: bundleIdx + 1, districts: bundle.districts, km: bundle.totalKm,
        cumulativeKm, cumulativePct: totalRoadKm > 0 ? (cumulativeKm / totalRoadKm) * 100 : 0,
      });
      bundleIdx++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return rows;
}

export function CityPlanCoverage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().slice(0, 10);
  const [planStartDate, setPlanStartDate] = useState(today);
  const [planEndDate, setPlanEndDate] = useState(() => addWorkingDays(today, 30));
  const targetDays = countWorkingDays(planStartDate, planEndDate);
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
  // Date-range filter for the Remaining Days Forecast chart/table — empty means "use the default window".
  const [chartFrom, setChartFrom] = useState("");
  const [chartTo, setChartTo] = useState("");

  const loadData = async () => {
    if (!id) return;
    try {
      const result = await getCityPlanning(id);
      setData(result);
      const city = result.city as Record<string, unknown>;
      const resultDrivers = (result.drivers as Record<string, unknown>[]) ?? [];
      const startISO = String(result.today ?? today);
      setPlanStartDate(startISO);
      if (city.targetDays) setPlanEndDate(addWorkingDays(startISO, Number(city.targetDays)));
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
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Split failed");
    } finally {
      setSplittingDistrictId(null);
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
  const dashboardCards = (data.dashboardCards as Record<string, unknown>) ?? {};
  const streetStats = (data.streetStats as Record<string, unknown>) ?? {};
  const todayStats = (data.todayStats as Record<string, unknown>) ?? {};
  const districts = (data.districts as Record<string, unknown>[]) ?? [];

  const totalStreets = Number(streetStats.total_streets ?? 0);
  const completedStreets = Number(streetStats.completed ?? 0);
  const coveragePct = totalStreets > 0 ? Math.round((completedStreets / totalStreets) * 100) : 0;
  const totalRoadKm = Number(dashboardCards.totalRoadKm ?? 0);
  const dailyCapacityKm = Number(dashboardCards.totalDailyTeamCapacity ?? 0);
  const completedRoadKm = totalRoadKm > 0 ? totalRoadKm * (coveragePct / 100) : 0;

  const todayAssigned = Number(todayStats.total_assigned_today ?? 0);
  const todayCompleted = Number(todayStats.completed_today ?? 0);
  const todayInProgress = Number(todayStats.in_progress_today ?? 0);
  const todaySkipped = Number(todayStats.skipped_today ?? 0);
  const todayPending = Math.max(0, todayAssigned - todayCompleted - todayInProgress - todaySkipped);

  const bundles = buildWorkDayBundles(districts, dailyCapacityKm);
  const timeline = buildTimeline(bundles, data.today as string | undefined, completedRoadKm, totalRoadKm);
  const workingDaysLeft = bundles.length;
  const calendarDaysLeft = timeline.length;
  const fridaysInPlan = timeline.filter(r => r.isWeekend).length;

  const defaultChartFrom = timeline[0]?.date;
  const defaultChartTo = timeline[Math.min(13, timeline.length - 1)]?.date;
  const effectiveChartFrom = chartFrom || defaultChartFrom;
  const effectiveChartTo = chartTo || defaultChartTo;
  const filteredTimeline = timeline.filter(r => r.date >= effectiveChartFrom && r.date <= effectiveChartTo);
  const chartData = filteredTimeline.map(r => ({
    date: r.date,
    label: `${r.date.slice(5)}`,
    km: r.km,
    cumulativePct: Math.round(r.cumulativePct * 10) / 10,
    isToday: r.isToday,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/city/${id}`)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {String(city.nameEn)} — Plan Coverage
            </h2>
            <p className="text-sm text-gray-500">
              {String(city.nameAr)} &bull; {String(city.regionEn)} &bull; A stakeholder view of the coverage plan and remaining-days forecast
            </p>
          </div>
        </div>
        <Button onClick={handleGenerateToday} disabled={generatingToday}>
          {generatingToday ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
          Generate Today
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-green-600">{coveragePct}%</p>
            <p className="text-xs text-gray-500">Coverage So Far</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Calendar className="w-5 h-5 text-blue-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{workingDaysLeft}</p>
            <p className="text-xs text-gray-500">Working Days Left</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <CalendarOff className="w-5 h-5 text-gray-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{calendarDaysLeft}</p>
            <p className="text-xs text-gray-500">Calendar Days ({fridaysInPlan} Friday{fridaysInPlan !== 1 ? "s" : ""} off)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Gauge className="w-5 h-5 text-purple-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{dailyCapacityKm.toFixed(1)}</p>
            <p className="text-xs text-gray-500">Team KM / Working Day</p>
          </CardContent>
        </Card>
      </div>

      {/* Today's actual status — what's assigned, pending, done right now */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-orange-600" />
            Today ({String(data.today)}) — Actual Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todayAssigned === 0 ? (
            <p className="text-sm text-gray-500">No work assigned yet today — use "Generate Today" to hand out today's zones.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-blue-600">{todayAssigned}</p>
                <p className="text-xs text-gray-500">Assigned</p>
              </div>
              <div className="bg-green-50 dark:bg-green-950 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-green-600">{todayCompleted}</p>
                <p className="text-xs text-gray-500">Completed</p>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-950 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-yellow-600">{todayInProgress}</p>
                <p className="text-xs text-gray-500">In Progress</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-gray-600 dark:text-gray-300">{todayPending}</p>
                <p className="text-xs text-gray-500">Pending / Not Started</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Forecast Timeline — the day-by-day plan for stakeholders */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Remaining Days Forecast
          </CardTitle>
          <p className="text-xs text-gray-500">
            Projected which districts get worked each day at the current team capacity ({dailyCapacityKm.toFixed(1)} km/day).
            Fridays show as a gap — no work planned. This is a forward projection for visibility only — it does not
            pre-assign anything; real driver assignments still happen day by day via "Generate Today".
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {dailyCapacityKm <= 0.01 ? (
            <p className="text-center text-gray-500 py-6 text-sm">No active drivers to project capacity.</p>
          ) : timeline.length === 0 ? (
            <div className="flex items-center gap-2 text-green-600 justify-center py-6">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">All districts fully covered — nothing left to plan.</span>
            </div>
          ) : (
            <>
              {/* Date-range filter */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Show from</Label>
                  <Input
                    type="date" className="w-40"
                    value={chartFrom || defaultChartFrom} min={timeline[0]?.date} max={timeline[timeline.length - 1]?.date}
                    onChange={e => setChartFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Show to</Label>
                  <Input
                    type="date" className="w-40"
                    value={chartTo || defaultChartTo} min={timeline[0]?.date} max={timeline[timeline.length - 1]?.date}
                    onChange={e => setChartTo(e.target.value)}
                  />
                </div>
                {(chartFrom || chartTo) && (
                  <Button variant="ghost" size="sm" onClick={() => { setChartFrom(""); setChartTo(""); }}>
                    Reset
                  </Button>
                )}
                <span className="text-xs text-gray-400">{filteredTimeline.length} of {timeline.length} days shown</span>
              </div>

              {/* Planned KM per day */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Planned KM per Day</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e1e0d9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#898781" }} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#898781" }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip
                      formatter={(value: number) => [`${value.toFixed(1)} km`, "Planned"]}
                      labelFormatter={(_label, payload) => payload?.[0]?.payload?.date ?? ""}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Bar dataKey="km" fill={CHART_KM_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
                    {chartData.some(d => d.isToday) && (
                      <ReferenceLine
                        x={chartData.find(d => d.isToday)?.label}
                        stroke="#898781" strokeDasharray="4 4"
                        label={{ value: "Today", position: "top", fontSize: 11, fill: "#898781" }}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Cumulative coverage % */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Cumulative Coverage %</p>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e1e0d9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#898781" }} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#898781" }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip
                      formatter={(value: number) => [`${value.toFixed(1)}%`, "Cumulative coverage"]}
                      labelFormatter={(_label, payload) => payload?.[0]?.payload?.date ?? ""}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Line type="monotone" dataKey="cumulativePct" stroke={CHART_COVERAGE_COLOR} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Per-day detail table */}
              <div className="border rounded-lg overflow-hidden overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Day</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Districts Planned</TableHead>
                      <TableHead className="text-right">KM Planned</TableHead>
                      <TableHead className="text-right">Cumulative Coverage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTimeline.map(row => (
                      <TableRow key={row.date} className={row.isToday ? "bg-blue-50/50 dark:bg-blue-950/30" : row.isWeekend ? "bg-gray-50 dark:bg-gray-900/40" : ""}>
                        <TableCell className="font-medium whitespace-nowrap">{row.date}</TableCell>
                        <TableCell className="whitespace-nowrap">{row.weekday}</TableCell>
                        <TableCell>
                          {row.isToday ? (
                            <Badge className="bg-blue-600">Today</Badge>
                          ) : row.isWeekend ? (
                            <Badge variant="outline" className="text-gray-500">Weekend — No Work Planned</Badge>
                          ) : (
                            <Badge variant="secondary">Planned</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.districts.length === 0 ? (
                            <span className="text-gray-400 text-sm">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {row.districts.map(d => (
                                <Badge key={d.name} variant="outline" className="text-xs font-normal">
                                  {d.name} &bull; {d.km.toFixed(1)} km
                                </Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">{row.km > 0 ? `${row.km.toFixed(1)} km` : "—"}</TableCell>
                        <TableCell className="text-right">{row.cumulativePct.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Coverage Planning Calculator */}
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
              <Label className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Start Date</Label>
              <Input type="date" value={planStartDate} onChange={e => setPlanStartDate(e.target.value)} />
              <p className="text-xs text-gray-500">When the plan begins</p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> End Date</Label>
              <Input type="date" value={planEndDate} min={planStartDate} onChange={e => setPlanEndDate(e.target.value)} />
              <p className="text-xs text-gray-500">When the plan should be complete</p>
            </div>
            <div className="space-y-2">
              <Label>Target Days to Complete</Label>
              <div className="flex h-9 items-center rounded-md border border-input bg-gray-50 dark:bg-gray-900 px-3 text-sm font-medium">
                {targetDays} working day{targetDays !== 1 ? "s" : ""}
              </div>
              <p className="text-xs text-gray-500">Auto-calculated from the dates above, Fridays excluded</p>
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
    </div>
  );
}
