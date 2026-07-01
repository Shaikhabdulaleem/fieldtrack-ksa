import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { getLeads, getCities, downloadExport, deleteLead } from "../../lib/api";
import { Search, Download, FileSpreadsheet, FileText, Eye, Loader2, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

export function LeadsDatabase() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [leads, setLeads] = useState<Record<string, unknown>[]>([]);
  const [cities, setCities] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCities().then(setCities).catch(console.error);
  }, []);

  const loadLeads = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: "200" };
      if (statusFilter !== "all") params.status = statusFilter === "pending" ? "new" : statusFilter;
      if (cityFilter !== "all") params.city_id = cityFilter;
      const data = await getLeads(params);
      setLeads(data.leads);
      setTotal(data.total);
    } catch (err) {
      console.error("Failed to load leads:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLeads(); }, [statusFilter, cityFilter]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this lead? This cannot be undone.")) return;
    try {
      await deleteLead(id);
      toast.success("Lead deleted");
      await loadLeads();
    } catch (err) {
      toast.error("Failed to delete lead");
    }
  };

  const filteredLeads = searchQuery
    ? leads.filter((lead) => {
        const q = searchQuery.toLowerCase();
        return (
          String(lead.projectName ?? "").toLowerCase().includes(q) ||
          String(lead.siteName ?? "").toLowerCase().includes(q) ||
          String(lead.phase ?? "").toLowerCase().includes(q)
        );
      })
    : leads;

  const statusCounts = {
    total,
    pending: leads.filter(l => l.status === "new").length,
    approved: leads.filter(l => l.status === "approved").length,
    rejected: leads.filter(l => l.status === "rejected").length,
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Leads Database</h3>
              <p className="text-sm text-gray-500">
                {filteredLeads.length} of {total} leads
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => downloadExport("xlsx", cityFilter !== "all" ? cityFilter : undefined).catch(() => toast.error("Export failed"))}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadExport("pdf", cityFilter !== "all" ? cityFilter : undefined).catch(() => toast.error("Export failed"))}>
                <FileText className="w-4 h-4 mr-2" />
                PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadExport("csv", cityFilter !== "all" ? cityFilter : undefined).catch(() => toast.error("Export failed"))}>
                <Download className="w-4 h-4 mr-2" />
                CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by project name, site name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={cityFilter} onValueChange={setCityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="City" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cities</SelectItem>
                {cities.map((city) => (
                  <SelectItem key={String(city.id)} value={String(city.id)}>{String(city.nameEn)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-gray-500">Total Leads</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{statusCounts.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-gray-500">Pending Review</p>
              <p className="text-3xl font-bold text-yellow-600">{statusCounts.pending}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-gray-500">Approved</p>
              <p className="text-3xl font-bold text-green-600">{statusCounts.approved}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-gray-500">Rejected</p>
              <p className="text-3xl font-bold text-red-600">{statusCounts.rejected}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Leads</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project / Site</TableHead>
                  <TableHead>Phase</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Quality</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.map((lead) => (
                  <TableRow key={String(lead.id)}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {String(lead.projectName ?? lead.siteName ?? "Untitled")}
                        </p>
                        {lead.plotNumber && (
                          <p className="text-xs text-gray-500">Plot: {String(lead.plotNumber)}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{String(lead.phase ?? "")}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p className="text-gray-900 dark:text-white">
                          {Number(lead.locationLat).toFixed(4)}, {Number(lead.locationLng).toFixed(4)}
                        </p>
                        {lead.nearestLandmark && (
                          <p className="text-xs text-gray-500">{String(lead.nearestLandmark)}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={Number(lead.qualityScore) >= 70 ? "default" : "secondary"}>
                        {Number(lead.qualityScore ?? 0)}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          lead.status === "approved" ? "default" :
                          lead.status === "new" ? "secondary" :
                          lead.status === "rejected" ? "destructive" : "outline"
                        }
                      >
                        {String(lead.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {lead.createdAt ? new Date(String(lead.createdAt)).toLocaleDateString() : ""}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Link to={`/leads/${String(lead.id)}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDelete(String(lead.id))}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredLeads.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                      No leads found. Drivers will submit leads from the field.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
