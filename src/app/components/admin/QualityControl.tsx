import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { getQcQueue, checkBlur, checkDuplicate, checkGpsMatch } from "../../lib/api";
import { AlertTriangle, Camera, Crosshair, MapPin, ShieldCheck, Stamp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Link } from "react-router";

export function QualityControl() {
  const [queue, setQueue] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getQcQueue()
      .then(setQueue)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const avgScore = queue.length > 0
    ? Math.round(queue.reduce((sum, item) => sum + Number(item.qualityScore ?? 0), 0) / queue.length)
    : 0;

  const handleRunBlur = async (leadId: string) => {
    try {
      await checkBlur(leadId);
      toast.success("Blur check completed");
    } catch { toast.error("Blur check failed"); }
  };

  const handleRunDuplicate = async (leadId: string) => {
    try {
      const res = await checkDuplicate(leadId);
      toast.success(`Duplicate check: ${res.risk as string} risk (${res.nearbyCount as number} nearby)`);
    } catch { toast.error("Duplicate check failed"); }
  };

  const handleRunGps = async (leadId: string) => {
    try {
      const res = await checkGpsMatch(leadId);
      toast.success(`GPS match: ${res.matched ? "Matched" : "Not matched"} (${res.distanceMeters ?? "N/A"}m)`);
    } catch { toast.error("GPS check failed"); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="pt-6">
            <ShieldCheck className="w-6 h-6 text-blue-600 mb-3" />
            <p className="text-sm text-gray-500">Average QC Score</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{avgScore}%</p>
            <Progress value={avgScore} className="mt-3 h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Camera className="w-6 h-6 text-green-600 mb-3" />
            <p className="text-sm text-gray-500">In Queue</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{queue.length}</p>
            <p className="text-xs text-gray-500 mt-2">Leads awaiting review</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Crosshair className="w-6 h-6 text-purple-600 mb-3" />
            <p className="text-sm text-gray-500">High Duplicate Risk</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {queue.filter(l => l.duplicateRisk === "high").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <AlertTriangle className="w-6 h-6 text-red-600 mb-3" />
            <p className="text-sm text-gray-500">Low Quality (&lt;50)</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {queue.filter(l => Number(l.qualityScore ?? 0) < 50).length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Lead Quality Review Queue</CardTitle>
              <p className="text-sm text-gray-500 mt-1">Validate every submitted lead before sending to clients.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead>QC Score</TableHead>
                <TableHead>Duplicate Risk</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((item) => (
                <TableRow key={String(item.id)}>
                  <TableCell className="font-medium">
                    <Link to={`/leads/${String(item.id)}`} className="text-blue-600 hover:underline">
                      {String(item.projectName ?? item.siteName ?? String(item.id).slice(0, 8))}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{String(item.phase)}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-32">
                      <Progress value={Number(item.qualityScore ?? 0)} className="h-2" />
                      <span className="text-xs font-semibold">{Number(item.qualityScore ?? 0)}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.duplicateRisk === "high" ? "destructive" : item.duplicateRisk === "medium" ? "secondary" : "default"}>
                      {String(item.duplicateRisk ?? "low")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{String(item.status)}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => handleRunBlur(String(item.id))}>Blur</Button>
                      <Button variant="outline" size="sm" onClick={() => handleRunDuplicate(String(item.id))}>Dup</Button>
                      <Button variant="outline" size="sm" onClick={() => handleRunGps(String(item.id))}>GPS</Button>
                      <Link to={`/leads/${String(item.id)}`}>
                        <Button variant="outline" size="sm">Review</Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {queue.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                    No leads in the review queue. All clear!
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {[
          { icon: Camera, title: "Photo rules", text: "Minimum 1 billboard photo and 1 front site photo. Optional side and contractor-board photos improve score." },
          { icon: MapPin, title: "GPS rules", text: "Lead GPS must be captured automatically and remain inside the selected street/district polygon." },
          { icon: Stamp, title: "Watermark rules", text: "Every photo is watermarked with driver name, timestamp, lat/lng, and street name before upload." },
        ].map((rule) => {
          const Icon = rule.icon;
          return (
            <Card key={rule.title}>
              <CardContent className="pt-6">
                <Icon className="w-6 h-6 text-blue-600 mb-3" />
                <h3 className="font-semibold text-gray-900 dark:text-white">{rule.title}</h3>
                <p className="text-sm text-gray-500 mt-2">{rule.text}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
