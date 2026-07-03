import { useState, useEffect } from "react";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Loader2 } from "lucide-react";
import { getDistrictSurveyZones, assignSurveyZone } from "../../lib/api";
import { toast } from "sonner";

const ZONE_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  not_assigned: "destructive",
  assigned: "secondary",
  partially_assigned: "outline",
  in_progress: "secondary",
  completed: "default",
  partially_completed: "outline",
  rejected_needs_review: "destructive",
};

// Per-district list of survey zones (capacity-based sub-divisions used by the
// District-Based Driver Survey Coverage Planner) with manual per-zone driver
// assignment — this is the manual override alongside the "Generate Today"
// auto-assign-zones flow.
export function SurveyZonePanel({ districtId, drivers, onAssigned }: {
  districtId: string;
  drivers: Record<string, unknown>[];
  onAssigned: () => void;
}) {
  const [zones, setZones] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const result = await getDistrictSurveyZones(districtId);
      setZones(Array.isArray(result) ? result : [result]);
    } catch (err) {
      console.error("Failed to load survey zones:", err);
      setZones([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [districtId]);

  const handleAssign = async (zoneId: string, driverId: string) => {
    try {
      const result = await assignSurveyZone({ zoneId, driverId });
      toast.success(`Assigned ${result.created} streets to driver`);
      await load();
      onAssigned();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Assignment failed");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!zones || zones.length === 0) {
    return (
      <div className="px-4 py-4 text-sm text-gray-400 text-center">
        No survey zones yet. Use "Start Survey" on the map to split this district into zones.
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800">
      {zones.map((zone) => {
        const zoneId = String(zone.id);
        const streetCount = Number(zone.street_count ?? 0);
        const completedStreetCount = Number(zone.completed_street_count ?? 0);
        const zonePct = streetCount > 0 ? Math.round((completedStreetCount / streetCount) * 100) : 0;
        const status = String(zone.status ?? "not_assigned");

        return (
          <div key={zoneId} className="px-4 py-3 bg-white dark:bg-gray-900">
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{String(zone.label)}</p>
                <p className="text-xs text-gray-400">
                  {Number(zone.target_km).toFixed(1)} km target &bull; {streetCount} streets
                  {zone.assigned_driver_name ? ` • ${String(zone.assigned_driver_name)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {status === "not_assigned" && drivers.length > 0 && (
                  <Select onValueChange={(driverId) => handleAssign(zoneId, driverId)}>
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
                <Badge variant={ZONE_STATUS_VARIANT[status] ?? "outline"} className="text-xs">
                  {status.replace(/_/g, " ")}
                </Badge>
              </div>
            </div>
            {(status === "completed" || status === "partially_completed" || status === "rejected_needs_review") && (
              <p className="text-xs text-gray-500 mt-1">
                Actual: {zone.actual_km !== null && zone.actual_km !== undefined ? `${Number(zone.actual_km).toFixed(1)} km` : "—"}
                {zone.verification_notes ? ` — ${String(zone.verification_notes)}` : ""}
              </p>
            )}
            {streetCount > 0 && status !== "not_assigned" && (
              <div className="mt-1.5 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500" style={{ width: `${zonePct}%` }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
