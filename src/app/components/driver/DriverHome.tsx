import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  MapPin, Navigation, TrendingUp, Clock, Target, Play, Square,
  FileText, Loader2, Camera, Gauge, Fuel, X, CheckCircle2, WifiOff
} from "lucide-react";
import { Link } from "react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { getDriverToday, getStoredUser, driverCheckOut } from "../../lib/api";
import { getPendingCount } from "../../lib/drafts-db";
import { useOnlineStatus } from "../../lib/useOnlineStatus";

// ── Checkout Modal ──────────────────────────────────────────────────────────
function CheckoutModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [odometerReading, setOdometerReading] = useState("");
  const [fuelLevel, setFuelLevel] = useState("");
  const [odometerPhoto, setOdometerPhoto] = useState<{ url: string; file: File } | null>(null);
  const [fuelPhoto, setFuelPhoto] = useState<{ url: string; file: File } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const odometerCameraRef = useRef<HTMLInputElement>(null);
  const fuelCameraRef = useRef<HTMLInputElement>(null);

  // Revoke blob URLs on change/unmount (no-op for data: URLs)
  useEffect(() => { return () => { if (odometerPhoto?.url.startsWith("blob:")) URL.revokeObjectURL(odometerPhoto.url); }; }, [odometerPhoto]);
  useEffect(() => { return () => { if (fuelPhoto?.url.startsWith("blob:")) URL.revokeObjectURL(fuelPhoto.url); }; }, [fuelPhoto]);

  const handlePhoto = (setter: (v: { url: string; file: File } | null) => void) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size === 0) { toast.error("Camera returned an empty file — please try again."); e.target.value = ""; return; }
      const capturedFile = file;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const dataUrl = evt.target?.result as string;
        if (dataUrl) setter({ url: dataUrl, file: capturedFile });
        else toast.error("Failed to read photo — please try again.");
      };
      reader.onerror = () => toast.error("Failed to read photo — please try again.");
      reader.readAsDataURL(file);
      e.target.value = "";
    };

  const handleSubmit = useCallback(async () => {
    if (!odometerReading && !fuelLevel) {
      toast.error("Please record odometer reading or fuel level before checking out.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      if (odometerReading) fd.append("odometerReading", odometerReading);
      if (fuelLevel) fd.append("fuelLevel", fuelLevel);
      if (odometerPhoto) fd.append("odometerPhoto", odometerPhoto.file);
      if (fuelPhoto) fd.append("fuelPhoto", fuelPhoto.file);

      // Capture current GPS
      if (navigator.geolocation) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            pos => {
              fd.append("lat", String(pos.coords.latitude));
              fd.append("lng", String(pos.coords.longitude));
              resolve();
            },
            () => resolve(),
            { timeout: 5000 }
          );
        });
      }

      const result = await driverCheckOut(fd) as Record<string, unknown>;
      toast.success(`Day complete! ${result.streetsCompleted ?? 0} streets covered${result.kmDriven ? `, ${result.kmDriven} km driven` : ""}`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check-out failed");
    } finally {
      setSubmitting(false);
    }
  }, [odometerReading, fuelLevel, odometerPhoto, fuelPhoto, onDone]);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center sm:items-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">End Day Check-out</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Odometer End */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Gauge className="w-5 h-5 text-orange-500" />
              <Label className="text-base font-semibold">End Odometer Reading (KM)</Label>
            </div>
            <Input
              type="number"
              placeholder="e.g. 45470"
              value={odometerReading}
              onChange={e => setOdometerReading(e.target.value)}
              className="h-12 text-lg"
            />
            {odometerPhoto ? (
              <div className="relative h-32 rounded-lg overflow-hidden border">
                <img src={odometerPhoto.url} alt="Odometer" className="w-full h-full object-cover" />
                <button onClick={() => setOdometerPhoto(null)} className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <Button variant="outline" className="w-full h-11" onClick={() => odometerCameraRef.current?.click()}>
                <Camera className="w-4 h-4 mr-2" /> Capture Photo
              </Button>
            )}
            <input ref={odometerCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto(setOdometerPhoto)} />
          </div>

          {/* Fuel End */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Fuel className="w-5 h-5 text-purple-500" />
              <Label className="text-base font-semibold">End Fuel Level</Label>
            </div>
            <Select value={fuelLevel} onValueChange={setFuelLevel}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Select fuel level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full</SelectItem>
                <SelectItem value="3/4">3/4</SelectItem>
                <SelectItem value="1/2">1/2 (Half)</SelectItem>
                <SelectItem value="1/4">1/4</SelectItem>
                <SelectItem value="low">Low / Near Empty</SelectItem>
              </SelectContent>
            </Select>
            {fuelPhoto ? (
              <div className="relative h-32 rounded-lg overflow-hidden border">
                <img src={fuelPhoto.url} alt="Fuel" className="w-full h-full object-cover" />
                <button onClick={() => setFuelPhoto(null)} className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <Button variant="outline" className="w-full h-11" onClick={() => fuelCameraRef.current?.click()}>
                <Camera className="w-4 h-4 mr-2" /> Capture Photo
              </Button>
            )}
            <input ref={fuelCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto(setFuelPhoto)} />
          </div>

          <p className="text-xs text-gray-400 text-center">GPS location will be captured automatically on submit</p>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex gap-3">
          <Button variant="outline" className="flex-1 h-12" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button className="flex-1 h-12 bg-red-600 hover:bg-red-700" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            {submitting ? "Submitting..." : "End Day"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main DriverHome ──────────────────────────────────────────────────────────
export function DriverHome() {
  const isOnline = useOnlineStatus();
  const [draftCount, setDraftCount] = useState(0);
  const [dayStarted, setDayStarted] = useState(false);
  const [currentTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [todayData, setTodayData] = useState<Record<string, unknown> | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const user = getStoredUser();

  useEffect(() => {
    const refresh = () => { getPendingCount().then(setDraftCount).catch(() => {}); };
    refresh();
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    getDriverToday()
      .then(data => {
        setTodayData(data);
        if (Number(data.targetStreets ?? 0) > 0) setDayStarted(true);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const streets = (todayData?.streets as Record<string, unknown>[]) ?? [];
  const targetStreets = streets.length;
  const completedStreets = streets.filter(s => s.status === "completed").length;
  const driverName = user?.fullName ?? "Driver";
  const initials = driverName.split(" ").map((n: string) => n[0]).join("").slice(0, 2);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 space-y-4">
      {showCheckout && (
        <CheckoutModal
          onClose={() => setShowCheckout(false)}
          onDone={() => { setShowCheckout(false); setDayStarted(false); }}
        />
      )}

      {!isOnline && (
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex items-center gap-3">
          <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">أنت غير متصل بالإنترنت</p>
            <p className="text-xs text-amber-700 dark:text-amber-300">You are offline — drafts sync when connected</p>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Welcome, {driverName.split(" ")[0]}</h1>
            <p className="text-blue-100 text-sm">{driverName}</p>
          </div>
          <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
            <span className="text-2xl font-bold">{initials}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-blue-100">
          <Clock className="w-4 h-4" />
          <span>{currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>

      <Card className="shadow-lg">
        <CardContent className="pt-6">
          {!dayStarted ? (
            <Link to="/driver/check-in">
              <Button className="w-full h-16 text-lg" size="lg">
                <Play className="w-6 h-6 mr-2" />
                Start Day Check-in
              </Button>
            </Link>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                  <span className="font-semibold text-gray-900 dark:text-white">Day Active</span>
                </div>
                <Badge variant="default" className="text-sm">
                  {targetStreets} streets assigned
                </Badge>
              </div>
              <Button
                onClick={() => setShowCheckout(true)}
                variant="destructive"
                className="w-full h-14 text-base"
                size="lg"
              >
                <Square className="w-5 h-5 mr-2" />
                End Day (Check-out)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-600" />
            Today's Assignment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {targetStreets > 0 ? (
            <>
              <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg">
                    {targetStreets} Streets Assigned
                  </h3>
                  <Badge variant="outline" className="text-sm">
                    {String(todayData?.date ?? "Today")}
                  </Badge>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-gray-600 dark:text-gray-400">Coverage Progress</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {completedStreets}/{targetStreets} streets
                    </span>
                  </div>
                  <Progress value={targetStreets > 0 ? (completedStreets / targetStreets) * 100 : 0} className="h-3" />
                </div>
              </div>
              <Link to="/driver/navigation">
                <Button className="w-full h-14 text-base" size="lg">
                  <Navigation className="w-5 h-5 mr-2" />
                  Start Navigation
                </Button>
              </Link>
            </>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <MapPin className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">No streets assigned today</p>
              <p className="text-sm mt-1">Contact your manager for assignments</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            Today's Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{completedStreets}</p>
              <p className="text-xs text-gray-500">Streets Done</p>
            </div>
            <div className="bg-green-50 dark:bg-green-950 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{targetStreets}</p>
              <p className="text-xs text-gray-500">Assigned</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-600">
                {targetStreets > 0 ? Math.round((completedStreets / targetStreets) * 100) : 0}%
              </p>
              <p className="text-xs text-gray-500">Complete</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Link to="/driver/lead-form">
            <Button variant="outline" className="w-full h-14 justify-start" size="lg">
              <FileText className="w-5 h-5 mr-3" />
              Submit New Lead
            </Button>
          </Link>
          <Link to="/driver/sync">
            <Button variant="outline" className="w-full h-14 justify-start relative" size="lg">
              <Target className="w-5 h-5 mr-3" />
              View Offline Drafts
              {draftCount > 0 && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {draftCount > 9 ? "9+" : draftCount}
                </span>
              )}
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
