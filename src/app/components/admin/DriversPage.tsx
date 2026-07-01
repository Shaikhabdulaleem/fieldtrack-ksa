import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
// NEW - provide a blocking Driver-deactivation decision modal.
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
// CHANGED - use the guarded deactivation endpoint and structured assignment warning.
import { getUsers, getCities, createUser, updateUser, deleteUser, deactivateDriver, ApiError } from "../../lib/api";
import { UserPlus, Users, Phone, CreditCard, Car, Loader2, Search, Shield, Trash2, Pencil, X } from "lucide-react";
import { toast } from "sonner";

export function DriversPage() {
  const [drivers, setDrivers] = useState<Record<string, unknown>[]>([]);
  const [cities, setCities] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  // NEW - hold the blocked Driver and required incomplete-street resolution.
  const [deactivationDriver, setDeactivationDriver] = useState<Record<string, unknown> | null>(null);
  const [incompleteStreetCount, setIncompleteStreetCount] = useState(0);
  const [deactivationAction, setDeactivationAction] = useState<"unassign_all" | "reassign" | "keep_on_hold" | "">("");
  const [replacementDriverId, setReplacementDriverId] = useState("");
  const [deactivating, setDeactivating] = useState(false);

  // Form state (shared for create + edit)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [iqamaNumber, setIqamaNumber] = useState("");
  const [carPlateNumber, setCarPlateNumber] = useState("");
  const [cityId, setCityId] = useState("");
  const [password, setPassword] = useState("Driver1234");
  const [resetPassword, setResetPassword] = useState("");

  const loadDrivers = async () => {
    try {
      const [d, c] = await Promise.all([
        getUsers({ role: "driver" }),
        getCities(),
      ]);
      setDrivers(d);
      setCities(c);
      if (c.length > 0 && !cityId) setCityId(String(c[0].id));
    } catch (err) {
      console.error("Failed to load drivers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDrivers(); }, []);

  const resetForm = () => {
    setEditingId(null);
    setFullName("");
    setPhone("");
    setIqamaNumber("");
    setCarPlateNumber("");
    setPassword("Driver1234");
    setResetPassword("");
    if (cities.length > 0) setCityId(String(cities[0].id));
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (driver: Record<string, unknown>) => {
    setEditingId(String(driver.id));
    setFullName(String(driver.fullName ?? ""));
    setPhone(String(driver.phone ?? ""));
    setIqamaNumber(String(driver.iqamaNumber ?? ""));
    setCarPlateNumber(String(driver.carPlateNumber ?? ""));
    setCityId(String(driver.cityId ?? ""));
    setPassword("");
    setResetPassword("");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim() || !cityId) {
      toast.error("Please fill in name, phone, and city");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        if (resetPassword && resetPassword.length < 6) {
          toast.error("New password must be at least 6 characters");
          setSaving(false);
          return;
        }
        const updates: Record<string, unknown> = {
          fullName,
          phone,
          cityId,
          iqamaNumber: iqamaNumber || undefined,
          carPlateNumber: carPlateNumber || undefined,
          ...(resetPassword ? { password: resetPassword } : {}),
        };
        await updateUser(editingId, updates);
        toast.success(`Driver "${fullName}" updated successfully!`);
      } else {
        if (!password || password.length < 6) {
          toast.error("Password must be at least 6 characters");
          setSaving(false);
          return;
        }
        await createUser({
          fullName,
          phone,
          password,
          role: "driver",
          cityId,
          iqamaNumber: iqamaNumber || undefined,
          carPlateNumber: carPlateNumber || undefined,
        });
        toast.success(`Driver "${fullName}" created successfully!`);
      }
      resetForm();
      setShowForm(false);
      await loadDrivers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save driver");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      // CHANGED - deactivation is guarded; activation remains the existing simple update.
      if (currentActive) {
        await deactivateDriver(id);
        toast.success("Driver deactivated");
      } else {
        await updateUser(id, { isActive: true });
        toast.success("Driver activated");
      }
      await loadDrivers();
    } catch (err) {
      // NEW - open the mandatory resolution modal with the server-authoritative count.
      if (err instanceof ApiError && err.data.code === "DRIVER_ASSIGNMENT_ACTION_REQUIRED") {
        setDeactivationDriver(drivers.find(driver => String(driver.id) === id) ?? null);
        setIncompleteStreetCount(Number(err.data.incompleteStreetCount ?? 0));
        setDeactivationAction("");
        setReplacementDriverId("");
        return;
      }
      toast.error(err instanceof Error ? err.message : "Failed to update driver");
    }
  };

  // NEW - submit exactly one assignment resolution before deactivation can finish.
  const handleConfirmDeactivation = async () => {
    if (!deactivationDriver || !deactivationAction) return;
    if (deactivationAction === "reassign" && !replacementDriverId) return;
    setDeactivating(true);
    try {
      const result = await deactivateDriver(
        String(deactivationDriver.id),
        deactivationAction,
        deactivationAction === "reassign" ? replacementDriverId : undefined,
      );
      toast.success(`Driver deactivated; ${result.affectedStreetCount} streets updated.`);
      setDeactivationDriver(null);
      setDeactivationAction("");
      setReplacementDriverId("");
      await loadDrivers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deactivate Driver");
    } finally {
      setDeactivating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete driver "${name}"? This action cannot be undone.`)) return;
    try {
      await deleteUser(id);
      toast.success(`Driver "${name}" deleted`);
      await loadDrivers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete driver");
    }
  };

  const filteredDrivers = searchQuery
    ? drivers.filter(d => {
        const q = searchQuery.toLowerCase();
        return (
          String(d.fullName ?? "").toLowerCase().includes(q) ||
          String(d.phone ?? "").toLowerCase().includes(q) ||
          String(d.iqamaNumber ?? "").toLowerCase().includes(q) ||
          String(d.carPlateNumber ?? "").toLowerCase().includes(q)
        );
      })
    : drivers;

  const getCityName = (id: string) => {
    const city = cities.find(c => String(c.id) === id);
    return city ? String(city.nameEn) : "—";
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
      {/* Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Driver Management</h3>
              <p className="text-sm text-gray-500">{drivers.length} drivers registered</p>
            </div>
            <Button onClick={() => showForm && !editingId ? setShowForm(false) : openCreateForm()}>
              <UserPlus className="w-4 h-4 mr-2" />
              {showForm && !editingId ? "Cancel" : "Add Driver"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Add / Edit Driver Form */}
      {showForm && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {editingId ? <Pencil className="w-5 h-5 text-blue-600" /> : <UserPlus className="w-5 h-5 text-blue-600" />}
                {editingId ? "Edit Driver" : "Register New Driver"}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => { setShowForm(false); resetForm(); }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name *</Label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="fullName"
                      placeholder="e.g. Ahmed Al-Rashid"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="phone"
                      placeholder="+966501234567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="iqama">Iqama Number</Label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="iqama"
                      placeholder="e.g. 2XXXXXXXXX"
                      value={iqamaNumber}
                      onChange={(e) => setIqamaNumber(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="carPlate">Car Plate Number</Label>
                  <div className="relative">
                    <Car className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="carPlate"
                      placeholder="e.g. ABC 1234"
                      value={carPlateNumber}
                      onChange={(e) => setCarPlateNumber(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="city">Assigned City *</Label>
                  <Select value={cityId} onValueChange={setCityId}>
                    <SelectTrigger>
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
                </div>

              </div>

              {!editingId ? (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <Label htmlFor="password" className="text-amber-800 dark:text-amber-300 font-semibold">
                    Login Password *
                  </Label>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                    The driver will use their phone number + this password to log in
                  </p>
                  <div className="relative max-w-md">
                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500" />
                    <Input
                      id="password"
                      type="text"
                      placeholder="Min 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900"
                    />
                  </div>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Default: Driver1234</p>
                </div>
              ) : (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <Label htmlFor="resetPassword" className="text-blue-800 dark:text-blue-300 font-semibold">
                    Reset Password (optional)
                  </Label>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mb-2">
                    Leave blank to keep the current password. Fill in to set a new one.
                  </p>
                  <div className="relative max-w-md">
                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500" />
                    <Input
                      id="resetPassword"
                      type="text"
                      placeholder="New password (min 6 characters)"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      className="pl-10 border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-900"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {editingId ? "Saving..." : "Creating..."}
                    </>
                  ) : editingId ? (
                    <>
                      <Pencil className="w-4 h-4 mr-2" />
                      Save Changes
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4 mr-2" />
                      Create Driver
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by name, phone, iqama, or plate number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Drivers Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Drivers ({filteredDrivers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Iqama</TableHead>
                <TableHead>Car Plate</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDrivers.map((driver) => (
                <TableRow key={String(driver.id)}>
                  <TableCell>
                    <button
                      className="flex items-center gap-2 hover:opacity-70 transition-opacity"
                      onClick={() => openEditForm(driver)}
                    >
                      <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                          {String(driver.fullName ?? "").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                        </span>
                      </div>
                      <span className="font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
                        {String(driver.fullName)}
                      </span>
                      <Pencil className="w-3 h-3 text-gray-400" />
                    </button>
                  </TableCell>
                  <TableCell className="text-sm">{String(driver.phone ?? "—")}</TableCell>
                  <TableCell className="text-sm">{String(driver.iqamaNumber ?? "—")}</TableCell>
                  <TableCell className="text-sm">{String(driver.carPlateNumber ?? "—")}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{getCityName(String(driver.cityId))}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={driver.isActive ? "default" : "destructive"}>
                      {driver.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {driver.createdAt ? new Date(String(driver.createdAt)).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(String(driver.id), Boolean(driver.isActive))}
                      >
                        {driver.isActive ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDelete(String(driver.id), String(driver.fullName))}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredDrivers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                    {searchQuery ? "No drivers match your search" : "No drivers registered yet. Click 'Add Driver' to create one."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* // NEW - block Driver deactivation until one incomplete-street action is selected. */}
      <Dialog open={Boolean(deactivationDriver)} onOpenChange={(open) => { if (!open && !deactivating) setDeactivationDriver(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve incomplete streets</DialogTitle>
            <DialogDescription>
              {String(deactivationDriver?.fullName ?? "This Driver")} has {incompleteStreetCount} incomplete street{incompleteStreetCount === 1 ? "" : "s"}. Choose what happens before deactivation.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={deactivationAction}
            onValueChange={(value) => {
              setDeactivationAction(value as "unassign_all" | "reassign" | "keep_on_hold");
              if (value !== "reassign") setReplacementDriverId("");
            }}
            className="space-y-2"
          >
            <Label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
              <RadioGroupItem value="unassign_all" className="mt-1" />
              <span><span className="block font-semibold">Unassign all</span><span className="text-sm text-gray-500">Return all incomplete streets to Red.</span></span>
            </Label>
            <Label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
              <RadioGroupItem value="reassign" className="mt-1" />
              <span><span className="block font-semibold">Reassign to another Driver</span><span className="text-sm text-gray-500">Transfer all incomplete streets and return them to Blue.</span></span>
            </Label>
            <Label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
              <RadioGroupItem value="keep_on_hold" className="mt-1" />
              <span><span className="block font-semibold">Keep on hold</span><span className="text-sm text-gray-500">Keep ownership history and change streets to Grey.</span></span>
            </Label>
          </RadioGroup>
          {deactivationAction === "reassign" && deactivationDriver && (
            <div className="space-y-2">
              <Label>Replacement Driver</Label>
              <Select value={replacementDriverId} onValueChange={setReplacementDriverId}>
                <SelectTrigger><SelectValue placeholder="Select active Driver" /></SelectTrigger>
                <SelectContent>
                  {drivers
                    .filter(driver => Boolean(driver.isActive)
                      && String(driver.cityId) === String(deactivationDriver.cityId)
                      && String(driver.id) !== String(deactivationDriver.id))
                    .map(driver => (
                      <SelectItem key={String(driver.id)} value={String(driver.id)}>{String(driver.fullName)}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivationDriver(null)} disabled={deactivating}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmDeactivation()}
              disabled={!deactivationAction || (deactivationAction === "reassign" && !replacementDriverId) || deactivating}
            >
              {deactivating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm deactivation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
