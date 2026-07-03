import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
// NEW - allow bulk selection of Grey on-hold streets.
import { Checkbox } from "../ui/checkbox";
// CHANGED - include the dedicated on-hold bulk reassignment API.
import { getCities, getCityZones, getZoneDistricts, getDistrictStreets, getUsers, autoPlan, getAssignments, assignDistrict, reassignDistrict, reassignOnHoldStreets, bulkDeleteAssignments } from "../../lib/api";
import { Save, RefreshCw, MapPin, Zap, ChevronDown, ChevronRight, Loader2, UserCheck, Map as MapIcon, ArrowRightLeft, Trash2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { DistrictActivityMap } from "./DistrictActivityMap";

interface ZoneData {
  id: string;
  nameEn: string;
  nameAr: string;
  districtCount: number;
  streetCount: number;
  completedStreets: number;
  coverage: number;
  districts: DistrictData[];
}

interface AssignmentData {
  id: string;
  streetId: string;
  streetNameEn: string;
  driverId: string;
  driverName: string;
  status: string;
  assignedDate: string;
}

interface DistrictData {
  id: string;
  nameEn: string;
  nameAr: string;
  streets: StreetData[];
  assignments: AssignmentData[];
  assignedDrivers: { driverId: string; driverName: string; count: number }[];
  unassignedCount: number;
}

interface StreetData {
  id: string;
  nameEn: string;
  nameAr: string;
  status: string;
}

export function AssignmentManager() {
  const [cities, setCities] = useState<Record<string, unknown>[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string>("");
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [drivers, setDrivers] = useState<Record<string, unknown>[]>([]);
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  const [expandedDistricts, setExpandedDistricts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [activityMap, setActivityMap] = useState<{ districtId: string; districtName: string; assignedDrivers: { driverId: string; driverName: string; count: number }[] } | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "on_hold">("all");
  const [selectedOnHoldStreetIds, setSelectedOnHoldStreetIds] = useState<Set<string>>(new Set());
  const [bulkDriverId, setBulkDriverId] = useState("");
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    getCities().then(c => {
      setCities(c);
      if (c.length > 0) setSelectedCityId(String(c[0].id));
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const loadCityData = useCallback(async () => {
    if (!selectedCityId) return;
    setLoading(true);
    try {
      const [zoneData, driverData, assignmentData] = await Promise.all([
        getCityZones(selectedCityId),
        getUsers({ role: "driver", city_id: selectedCityId }),
        getAssignments({ city_id: selectedCityId }),
      ]);

      setDrivers(driverData);

      const driverMap = new Map<string, string>();
      driverData.forEach(d => driverMap.set(String(d.id), String(d.fullName)));

      const zonesWithDetails: ZoneData[] = await Promise.all(
        zoneData.map(async (z) => {
          const dists = await getZoneDistricts(String(z.id));
          const districtsWithStreets: DistrictData[] = await Promise.all(
            dists.map(async (d) => {
              const sts = await getDistrictStreets(String(d.id));

              const districtAssignments = assignmentData.filter(
                (a) => String(a.districtId) === String(d.id)
              );
              const activeAssignments = districtAssignments.filter(a => String(a.status) === "assigned");
              const driverCounts = new Map<string, number>();
              activeAssignments.forEach(a => {
                const did = String(a.driverId);
                driverCounts.set(did, (driverCounts.get(did) || 0) + 1);
              });
              const assignedDrivers = Array.from(driverCounts.entries()).map(([driverId, count]) => ({
                driverId,
                driverName: driverMap.get(driverId) || "Unknown",
                count,
              }));

              const streetNameMap = new Map<string, string>();
              sts.forEach(s => streetNameMap.set(String(s.id), String(s.nameEn ?? "")));

              const assignments: AssignmentData[] = districtAssignments.map(a => ({
                id: String(a.id),
                streetId: String(a.streetId ?? ""),
                streetNameEn: streetNameMap.get(String(a.streetId)) || "Unknown street",
                driverId: String(a.driverId),
                driverName: driverMap.get(String(a.driverId)) || "Unknown",
                status: String(a.status ?? "assigned"),
                assignedDate: String(a.assignedDate ?? ""),
              }));

              const unassignedCount = sts.filter(s => String(s.status) === "not_assigned").length;

              return {
                id: String(d.id),
                nameEn: String(d.nameEn),
                nameAr: String(d.nameAr ?? ""),
                streets: sts.map(s => ({
                  id: String(s.id),
                  nameEn: String(s.nameEn ?? ""),
                  nameAr: String(s.nameAr ?? ""),
                  status: String(s.status ?? "not_assigned"),
                })),
                assignments,
                assignedDrivers,
                unassignedCount,
              };
            })
          );
          return {
            id: String(z.id),
            nameEn: String(z.nameEn),
            nameAr: String(z.nameAr ?? ""),
            districtCount: Number(z.districtCount ?? 0),
            streetCount: Number(z.streetCount ?? 0),
            completedStreets: Number(z.completedStreets ?? 0),
            coverage: Number(z.coverage ?? 0),
            districts: districtsWithStreets,
          };
        })
      );
      setZones(zonesWithDetails);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedCityId]);

  useEffect(() => { loadCityData(); }, [loadCityData]);

  useEffect(() => {
    setSelectedOnHoldStreetIds(new Set());
    setBulkDriverId("");
    setSelectedAssignmentIds(new Set());
  }, [selectedCityId]);

  const handleAssignDriver = async (districtId: string, driverId: string, district: DistrictData) => {
    setAssigning(districtId);
    try {
      if (district.assignedDrivers.length > 0) {
        const result = await reassignDistrict({ districtId, newDriverId: driverId });
        if (district.unassignedCount > 0) {
          await assignDistrict({ cityId: selectedCityId, districtId, driverId });
        }
        toast.success(`Reassigned district to driver (${result.updated} streets updated)`);
      } else {
        const result = await assignDistrict({ cityId: selectedCityId, districtId, driverId });
        toast.success(`Assigned ${result.created} streets to driver`);
      }
      await loadCityData();
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : "Assignment failed"));
    } finally {
      setAssigning(null);
    }
  };

  const handleAutoPlan = async () => {
    try {
      const result = await autoPlan(selectedCityId);
      toast.success(`Auto-planned: ${result.created} assignments for ${result.driversAssigned} drivers`);
      await loadCityData();
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : "Auto-plan failed"));
    }
  };

  // NEW - move selected Grey streets to one active Driver and restore Blue status.
  const handleBulkReassign = async () => {
    if (!selectedOnHoldStreetIds.size || !bulkDriverId) return;
    setBulkAssigning(true);
    try {
      const result = await reassignOnHoldStreets({
        streetIds: [...selectedOnHoldStreetIds],
        newDriverId: bulkDriverId,
      });
      toast.success(`Reassigned ${result.updated} on-hold streets`);
      setSelectedOnHoldStreetIds(new Set());
      setBulkDriverId("");
      await loadCityData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk reassignment failed");
    } finally {
      setBulkAssigning(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedAssignmentIds.size) return;
    setBulkDeleting(true);
    try {
      const ids = [...selectedAssignmentIds];
      const CHUNK = 5000;
      let totalDeleted = 0;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const result = await bulkDeleteAssignments(ids.slice(i, i + CHUNK));
        totalDeleted += result.deleted;
      }
      toast.success(`Deleted ${totalDeleted} assignment(s)`);
      setSelectedAssignmentIds(new Set());
      await loadCityData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk delete failed");
    } finally {
      setBulkDeleting(false);
    }
  };

  const allAssignmentIds = zones.flatMap(z => z.districts.flatMap(d => d.assignments.map(a => a.id)));

  const toggleSelectAllAssignments = (checked: boolean) => {
    setSelectedAssignmentIds(checked ? new Set(allAssignmentIds) : new Set());
  };

  const toggleDistrictAssignments = (district: DistrictData, checked: boolean) => {
    setSelectedAssignmentIds(prev => {
      const next = new Set(prev);
      district.assignments.forEach(a => checked ? next.add(a.id) : next.delete(a.id));
      return next;
    });
  };

  const toggleZone = (id: string) => {
    setExpandedZones(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleDistrict = (id: string) => {
    setExpandedDistricts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // NEW - filter nested city data so On hold only displays no unrelated streets or districts.
  const visibleZones = statusFilter === "all"
    ? zones
    : zones
        .map(zone => ({
          ...zone,
          districts: zone.districts
            .map(district => ({
              ...district,
              streets: district.streets.filter(street => street.status === "on_hold"),
              assignments: district.assignments.filter(a => a.status === "on_hold"),
            }))
            .filter(district => district.streets.length > 0),
        }))
        .filter(zone => zone.districts.length > 0);
  const visibleOnHoldStreetIds = visibleZones.flatMap(zone => zone.districts.flatMap(district => district.streets.map(street => street.id)));

  // NEW - enforce the requested assignment colors without changing unrelated statuses.
  const getStatusClassName = (status: string) => {
    if (status === "not_assigned") return "bg-red-100 text-red-700 border-red-300";
    if (status === "assigned") return "bg-blue-100 text-blue-700 border-blue-300";
    if (status === "in_progress") return "bg-yellow-100 text-yellow-700 border-yellow-300";
    if (status === "completed") return "bg-green-100 text-green-700 border-green-300";
    if (status === "on_hold") return "bg-gray-200 text-gray-700 border-gray-400";
    return "";
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
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Zone &amp; District Assignments
              </h3>
              <p className="text-sm text-gray-500">
                Assign drivers to districts — all unassigned streets will be allocated
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={selectedCityId} onValueChange={setSelectedCityId}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Select city" />
                </SelectTrigger>
                <SelectContent>
                  {cities.map((city) => (
                    <SelectItem key={String(city.id)} value={String(city.id)}>
                      {String(city.nameEn)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* // NEW - filter the assignment tree to Grey on-hold streets only. */}
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as "all" | "on_hold");
                  setSelectedOnHoldStreetIds(new Set());
                  setBulkDriverId("");
                }}
              >
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All streets</SelectItem>
                  <SelectItem value="on_hold">On hold only</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleAutoPlan}>
                <Zap className="w-4 h-4 mr-2" />
                Auto-Plan
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* // NEW - display the exact assignment color contract and on-hold bulk controls. */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {[
              ["Red", "not assigned", "bg-red-100 text-red-700 border-red-300"],
              ["Blue", "assigned", "bg-blue-100 text-blue-700 border-blue-300"],
              ["Yellow", "in progress", "bg-yellow-100 text-yellow-700 border-yellow-300"],
              ["Green", "completed", "bg-green-100 text-green-700 border-green-300"],
              ["Grey", "on hold", "bg-gray-200 text-gray-700 border-gray-400"],
            ].map(([color, label, className]) => (
              <Badge key={color} variant="outline" className={className}>{color} = {label}</Badge>
            ))}
          </div>
          {statusFilter === "on_hold" && (
            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={visibleOnHoldStreetIds.length > 0 && selectedOnHoldStreetIds.size === visibleOnHoldStreetIds.length}
                  onCheckedChange={(checked) => setSelectedOnHoldStreetIds(checked ? new Set(visibleOnHoldStreetIds) : new Set())}
                />
                Select all ({visibleOnHoldStreetIds.length})
              </label>
              <Select value={bulkDriverId} onValueChange={setBulkDriverId}>
                <SelectTrigger className="w-52"><SelectValue placeholder="Replacement Driver" /></SelectTrigger>
                <SelectContent>
                  {drivers.filter(driver => Boolean(driver.isActive)).map(driver => (
                    <SelectItem key={String(driver.id)} value={String(driver.id)}>{String(driver.fullName)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => void handleBulkReassign()}
                disabled={!selectedOnHoldStreetIds.size || !bulkDriverId || bulkAssigning}
              >
                {bulkAssigning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRightLeft className="w-4 h-4 mr-2" />}
                Reassign selected ({selectedOnHoldStreetIds.size})
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {allAssignmentIds.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={allAssignmentIds.length > 0 && selectedAssignmentIds.size === allAssignmentIds.length}
                  onCheckedChange={(checked) => toggleSelectAllAssignments(!!checked)}
                />
                Select All Assignments ({allAssignmentIds.length})
              </label>
              {selectedAssignmentIds.size > 0 && (
                <Button
                  variant="destructive"
                  onClick={() => void handleBulkDelete()}
                  disabled={bulkDeleting}
                >
                  {bulkDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                  Delete Selected ({selectedAssignmentIds.size})
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Drivers in City ({drivers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {drivers.map((driver) => (
              <div key={String(driver.id)} className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                    <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                      {String(driver.fullName ?? "").split(" ").map((n: string) => n[0]).join("")}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-gray-900 dark:text-white">{String(driver.fullName)}</p>
                    <p className="text-xs text-gray-500">{String(driver.phone ?? "")}</p>
                  </div>
                  <Badge variant={driver.isActive ? "default" : "secondary"} className="ml-auto">
                    {driver.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
            ))}
            {drivers.length === 0 && (
              <p className="text-gray-500 col-span-full text-center py-4">No drivers in this city</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* // CHANGED - render the filtered assignment tree when On hold only is selected. */}
      {visibleZones.map((zone) => (
        <Card key={zone.id}>
          <CardHeader>
            <button className="flex items-center justify-between w-full text-left" onClick={() => toggleZone(zone.id)}>
              <div className="flex items-center gap-3">
                {expandedZones.has(zone.id) ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                  <MapPin className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle>{zone.nameEn}</CardTitle>
                  <p className="text-sm text-gray-500 mt-1">
                    {zone.nameAr} &bull; {zone.districtCount} districts &bull; {zone.streetCount} streets
                  </p>
                </div>
              </div>
              <Badge variant={zone.coverage >= 70 ? "default" : "secondary"}>
                {zone.coverage}% Covered
              </Badge>
            </button>
          </CardHeader>
          {expandedZones.has(zone.id) && (
            <CardContent>
              <div className="space-y-3">
                {zone.districts.map((district) => (
                  <div key={district.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {district.assignments.length > 0 && (
                          <Checkbox
                            checked={district.assignments.length > 0 && district.assignments.every(a => selectedAssignmentIds.has(a.id))}
                            onCheckedChange={(checked) => toggleDistrictAssignments(district, !!checked)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                        <button
                          className="flex items-center gap-3 text-left flex-1 min-w-0"
                          onClick={() => toggleDistrict(district.id)}
                        >
                        {expandedDistricts.has(district.id) ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                        <div className="min-w-0">
                          <h4 className="font-semibold text-gray-900 dark:text-white">{district.nameEn}</h4>
                          <p className="text-sm text-gray-500">{district.nameAr} &bull; {district.streets.length} streets &bull; {district.assignments.length} assignments</p>
                          {district.assignedDrivers.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {district.assignedDrivers.map(ad => (
                                <span key={ad.driverId} className="inline-flex items-center gap-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                                  <UserCheck className="w-3 h-3" />
                                  {ad.driverName} ({ad.count})
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </button>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary">
                          {district.streets.filter(s => s.status === "completed").length}/{district.streets.length} done
                        </Badge>
                        {district.unassignedCount > 0 && (
                          <Badge variant="outline" className="text-orange-600 border-orange-300">
                            {district.unassignedCount} unassigned
                          </Badge>
                        )}
                        {district.assignedDrivers.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActivityMap({
                                districtId: district.id,
                                districtName: district.nameEn,
                                assignedDrivers: district.assignedDrivers,
                              });
                            }}
                          >
                            <MapIcon className="w-4 h-4" />
                          </Button>
                        )}
                        <Select
                          value=""
                          onValueChange={(driverId) => handleAssignDriver(district.id, driverId, district)}
                          disabled={assigning === district.id}
                        >
                          <SelectTrigger className="w-44 h-9 text-sm">
                            {assigning === district.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <SelectValue placeholder={district.assignedDrivers.length > 0 ? "Reassign..." : "Assign driver"} />
                            )}
                          </SelectTrigger>
                          <SelectContent>
                            {drivers.filter(d => d.isActive).map((driver) => (
                              <SelectItem key={String(driver.id)} value={String(driver.id)}>
                                {String(driver.fullName)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {expandedDistricts.has(district.id) && (
                      <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 space-y-1">
                        {district.assignments.length > 0 && (
                          <div className="mb-3">
                            <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Assignments ({district.assignments.length})</h5>
                            {district.assignments.map((assignment) => (
                              <div key={assignment.id} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800">
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    checked={selectedAssignmentIds.has(assignment.id)}
                                    onCheckedChange={(checked) => setSelectedAssignmentIds(prev => {
                                      const next = new Set(prev);
                                      checked ? next.add(assignment.id) : next.delete(assignment.id);
                                      return next;
                                    })}
                                  />
                                  <span className="text-sm text-gray-800 dark:text-gray-200">{assignment.streetNameEn}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500">{assignment.driverName}</span>
                                  <Badge variant="outline" className={`text-xs ${getStatusClassName(assignment.status)}`}>
                                    {assignment.status.replace("_", " ")}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {district.streets.filter(s => s.status === "not_assigned" || s.status === "on_hold").length > 0 && (
                          <div>
                            <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Streets</h5>
                            {district.streets.filter(s => statusFilter === "on_hold" ? s.status === "on_hold" : true).map((street) => (
                              <div key={street.id} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800">
                                <div className="flex items-center gap-2">
                                  {street.status === "on_hold" && (
                                    <Checkbox
                                      checked={selectedOnHoldStreetIds.has(street.id)}
                                      onCheckedChange={(checked) => setSelectedOnHoldStreetIds(prev => {
                                        const next = new Set(prev);
                                        checked ? next.add(street.id) : next.delete(street.id);
                                        return next;
                                      })}
                                    />
                                  )}
                                  <span className="text-sm text-gray-800 dark:text-gray-200">{street.nameEn}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-400">{street.nameAr}</span>
                                  <Badge variant="outline" className={`text-xs ${getStatusClassName(street.status)}`}>
                                    {street.status.replace("_", " ")}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {district.streets.length === 0 && district.assignments.length === 0 && (
                          <p className="text-sm text-gray-400 text-center py-2">No streets loaded for this district</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {zone.districts.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No districts in this zone</p>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      ))}

      {/* // CHANGED - empty state reflects the active all/on-hold filter. */}
      {visibleZones.length === 0 && !loading && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-gray-500 py-8">
              {statusFilter === "on_hold" ? "No on-hold streets found in this city." : "No zones found for this city. Add zones and districts first."}
            </p>
          </CardContent>
        </Card>
      )}

      {activityMap && (
        <DistrictActivityMap
          open={!!activityMap}
          onOpenChange={(open) => { if (!open) setActivityMap(null); }}
          districtId={activityMap.districtId}
          districtName={activityMap.districtName}
          assignedDrivers={activityMap.assignedDrivers}
        />
      )}
    </div>
  );
}
