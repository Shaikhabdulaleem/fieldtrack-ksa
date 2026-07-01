import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { getDashboardStats, getTopDrivers, getCityOverview, getLeadsByDay, downloadExport } from "../../lib/api";
import { Download, FileSpreadsheet, FileText, TrendingUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { useState, useEffect } from "react";

export function Reports() {
  const [timeRange, setTimeRange] = useState("week");
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [topDrivers, setTopDrivers] = useState<Record<string, unknown>[]>([]);
  const [cities, setCities] = useState<Record<string, unknown>[]>([]);
  const [leadsByDay, setLeadsByDay] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const days = timeRange === "week" ? 7 : timeRange === "month" ? 30 : timeRange === "quarter" ? 90 : 365;
    async function load() {
      setLoading(true);
      try {
        const [s, td, c, lbd] = await Promise.all([
          getDashboardStats(),
          getTopDrivers(undefined, 12),
          getCityOverview(),
          getLeadsByDay(undefined, days),
        ]);
        setStats(s);
        setTopDrivers(td);
        setCities(c);
        setLeadsByDay(lbd);
      } catch (err) {
        console.error("Reports load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [timeRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const totalLeads = Number(stats?.total_leads ?? 0);
  const approvedLeads = Number(stats?.approved_leads ?? 0);
  const totalDrivers = Number(stats?.total_drivers ?? 0);
  const totalStreets = Number(stats?.total_streets ?? 0);
  const completedStreets = Number(stats?.completed_streets ?? 0);
  const approvalRate = totalLeads > 0 ? Math.round((approvedLeads / totalLeads) * 100) : 0;
  const avgLeadsPerDriver = totalDrivers > 0 ? (totalLeads / totalDrivers).toFixed(1) : "0";
  const coverageRate = totalStreets > 0 ? Math.round((completedStreets / totalStreets) * 100) : 0;

  const performanceData = leadsByDay.map(d => ({
    date: String(d.date ?? "").slice(5),
    leads: Number(d.total ?? 0),
    approved: Number(d.approved ?? 0),
  })).reverse();

  const driverComparisonData = topDrivers.map(d => ({
    name: String(d.full_name ?? "").split(" ")[0],
    leads: Number(d.total_leads ?? 0),
    streets: Number(d.streets_completed ?? 0),
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Performance Reports</h3>
              <p className="text-sm text-gray-500">Comprehensive multi-city KSA analytics and insights</p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="quarter">This Quarter</SelectItem>
                  <SelectItem value="year">This Year</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => downloadExport("xlsx").catch(() => toast.error("Export failed"))}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadExport("pdf").catch(() => toast.error("Export failed"))}>
                <FileText className="w-4 h-4 mr-2" />
                PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>City Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {cities.map((city) => (
              <Badge key={String(city.id)} variant="secondary" className="px-3 py-1">
                {String(city.name_en)}: {Number(city.coverage_pct)}% coverage &bull; {Number(city.active_drivers)} drivers
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">Total Leads</p>
                <TrendingUp className="w-4 h-4 text-green-600" />
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{totalLeads}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="text-sm text-gray-500">Approval Rate</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{approvalRate}%</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="text-sm text-gray-500">Avg Leads/Driver</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{avgLeadsPerDriver}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="text-sm text-gray-500">Coverage Rate</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{coverageRate}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily Performance Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={performanceData}>
              <defs>
                <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorApproved" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip />
              <Area type="monotone" dataKey="leads" stroke="#3b82f6" fillOpacity={1} fill="url(#colorLeads)" />
              <Area type="monotone" dataKey="approved" stroke="#10b981" fillOpacity={1} fill="url(#colorApproved)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Driver Performance Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={driverComparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip />
              <Bar dataKey="leads" fill="#3b82f6" name="Leads" />
              <Bar dataKey="streets" fill="#10b981" name="Streets" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Driver Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {topDrivers.map((driver) => (
              <div key={String(driver.id)} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                      <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                        {String(driver.full_name ?? "").split(" ").map((n: string) => n[0]).join("")}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{String(driver.full_name)}</p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Total Leads</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{Number(driver.total_leads)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Approved</p>
                    <p className="text-lg font-semibold text-green-600">{Number(driver.approved_leads)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Streets Completed</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{Number(driver.streets_completed)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Avg Quality</p>
                    <p className="text-lg font-semibold text-blue-600">
                      {driver.avg_quality_score ? Number(driver.avg_quality_score).toFixed(0) + "%" : "N/A"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {topDrivers.length === 0 && (
              <p className="text-center text-gray-500 py-8">No driver data available yet.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
