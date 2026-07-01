import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import {
  Users,
  MapPin,
  FileText,
  TrendingUp,
  Building2,
  Download,
  ArrowUp,
  Loader2
} from "lucide-react";
import { getDashboardStats, getCityOverview, getLeadsByDay, getTopDrivers, getLeads } from "../../lib/api";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Link } from "react-router";

export function AdminDashboard() {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [cities, setCities] = useState<Record<string, unknown>[]>([]);
  const [leadsByDay, setLeadsByDay] = useState<Record<string, unknown>[]>([]);
  const [topDrivers, setTopDrivers] = useState<Record<string, unknown>[]>([]);
  const [recentLeads, setRecentLeads] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, c, lbd, td, rl] = await Promise.all([
          getDashboardStats(),
          getCityOverview(),
          getLeadsByDay(undefined, 7),
          getTopDrivers(undefined, 10),
          getLeads({ limit: "5" }),
        ]);
        setStats(s);
        setCities(c);
        setLeadsByDay(lbd);
        setTopDrivers(td);
        setRecentLeads(rl.leads);
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const totalStreets = Number(stats?.total_streets ?? 0);
  const completedStreets = Number(stats?.completed_streets ?? 0);
  const coveragePercentage = totalStreets > 0 ? Math.round((completedStreets / totalStreets) * 100) : 0;

  const leadStatusData = [
    { name: "Pending", value: Number(stats?.pending_leads ?? 0), color: "#f59e0b" },
    { name: "Approved", value: Number(stats?.approved_leads ?? 0), color: "#10b981" },
    { name: "Rejected", value: Number(stats?.rejected_leads ?? 0), color: "#ef4444" },
  ];

  const driverPerformanceData = topDrivers.map(d => ({
    name: String(d.full_name ?? "").split(" ")[0],
    leads: Number(d.total_leads ?? 0),
  }));

  const weeklyLeadsData = leadsByDay.map(d => ({
    day: String(d.date ?? "").slice(5),
    leads: Number(d.total ?? 0),
  })).reverse();

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Active Drivers
            </CardTitle>
            <Users className="w-4 h-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {Number(stats?.active_drivers ?? 0)}/{Number(stats?.total_drivers ?? 0)}
            </div>
            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-2">
              <ArrowUp className="w-3 h-3" />
              <span>Online now</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Coverage Progress
            </CardTitle>
            <MapPin className="w-4 h-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {coveragePercentage}%
            </div>
            <Progress value={coveragePercentage} className="mt-2" />
            <p className="text-xs text-gray-500 mt-2">
              {completedStreets} of {totalStreets} streets
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Today's Leads
            </CardTitle>
            <FileText className="w-4 h-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {Number(stats?.leads_today ?? 0)}
            </div>
            <p className="text-xs text-gray-500 flex items-center gap-1 mt-2">
              <Badge variant="secondary" className="text-xs">
                {Number(stats?.pending_leads ?? 0)} pending
              </Badge>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Cities Covered
            </CardTitle>
            <Building2 className="w-4 h-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {cities.length}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {totalStreets.toLocaleString()} total streets across KSA
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>KSA City Operations Overview</CardTitle>
            <Badge variant="secondary">Scalable: city &rarr; zone &rarr; district &rarr; street</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {cities.map((city) => (
              <Link key={String(city.id)} to={`/city/${String(city.id)}`} className="block">
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{String(city.name_en)}</p>
                      <p className="text-xs text-gray-500">{String(city.region_en)} &bull; {String(city.name_ar)}</p>
                    </div>
                    <Badge>{Number(city.active_drivers)} drivers</Badge>
                  </div>
                  <Progress value={Number(city.coverage_pct ?? 0)} />
                  <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
                    <div><strong className="block text-gray-900 dark:text-white">{Number(city.coverage_pct ?? 0)}%</strong> coverage</div>
                    <div><strong className="block text-gray-900 dark:text-white">{Number(city.leads_today ?? 0)}</strong> leads today</div>
                    <div><strong className="block text-gray-900 dark:text-white">{Number(city.total_streets ?? 0).toLocaleString()}</strong> streets</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Weekly Leads Overview</CardTitle>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={weeklyLeadsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip />
                <Line type="monotone" dataKey="leads" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={leadStatusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {leadStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top Driver Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={driverPerformanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip />
                <Bar dataKey="leads" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>City Coverage Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cities.map((city) => (
              <div key={String(city.id)} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{String(city.name_en)}</p>
                    <p className="text-xs text-gray-500">
                      {String(city.region_en)} &bull; {Number(city.completed_streets)} / {Number(city.total_streets)} streets
                    </p>
                  </div>
                  <Badge variant={Number(city.coverage_pct) >= 70 ? "default" : Number(city.coverage_pct) >= 40 ? "secondary" : "destructive"}>
                    {Number(city.coverage_pct)}%
                  </Badge>
                </div>
                <Progress value={Number(city.coverage_pct ?? 0)} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent Leads */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Leads</CardTitle>
            <Link to="/leads">
              <Button variant="outline" size="sm">View All</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentLeads.map((lead) => (
              <div key={String(lead.id)} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                    <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{String(lead.projectName ?? lead.siteName ?? "Untitled")}</p>
                    <p className="text-sm text-gray-500">{String(lead.phase)} &bull; {String(lead.cityId ?? "")}</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant={
                    lead.status === "approved" ? "default" :
                    lead.status === "new" ? "secondary" :
                    "destructive"
                  }>
                    {String(lead.status)}
                  </Badge>
                  <p className="text-xs text-gray-500 mt-1">
                    {lead.createdAt ? new Date(String(lead.createdAt)).toLocaleDateString() : ""}
                  </p>
                </div>
              </div>
            ))}
            {recentLeads.length === 0 && (
              <p className="text-center text-gray-500 py-8">No leads yet. Drivers will submit leads from the field.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
