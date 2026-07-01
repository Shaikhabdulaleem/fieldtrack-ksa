import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  Camera, CheckCircle2, MapPin, ShieldCheck,
  RefreshCw, Loader2, Gauge, Fuel, Upload
} from "lucide-react";
import { useRef, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { driverCheckIn } from "../../lib/api";

type Step = "selfie" | "gps" | "odometer" | "fuel" | "confirm" | "done";

// Convert a data URL back to a Blob (used when restoring selfie from sessionStorage)
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// sessionStorage keys — survive Android camera-induced page reloads within the same tab
const SS_SELFIE = "checkin_selfie";
const SS_STEP   = "checkin_step";
const SS_GPS    = "checkin_gps";

interface GPSCoords { latitude: number; longitude: number; accuracy: number }

export function DriverCheckIn() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("selfie");

  // Selfie
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [selfieBlob, setSelfieBlob] = useState<Blob | null>(null);

  // GPS
  const [gpsCoords, setGpsCoords] = useState<GPSCoords | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Odometer
  const [odometerReading, setOdometerReading] = useState("");
  const [odometerPhoto, setOdometerPhoto] = useState<{ url: string; file: File } | null>(null);

  // Fuel
  const [fuelLevel, setFuelLevel] = useState("");
  const [fuelPhoto, setFuelPhoto] = useState<{ url: string; file: File } | null>(null);

  // Submit
  const [submitting, setSubmitting] = useState(false);

  const selfieCameraRef = useRef<HTMLInputElement>(null);
  const odometerFileRef = useRef<HTMLInputElement>(null);
  const odometerCameraRef = useRef<HTMLInputElement>(null);
  const fuelFileRef = useRef<HTMLInputElement>(null);
  const fuelCameraRef = useRef<HTMLInputElement>(null);

  // ── sessionStorage persistence ───────────────────────────────────────────
  // Android Chrome sometimes reloads the page when returning from the camera
  // app (popstate / activity back-stack). sessionStorage survives same-tab
  // reloads, so we save critical check-in state here and restore on mount.

  // Restore on mount
  useEffect(() => {
    const savedSelfie = sessionStorage.getItem(SS_SELFIE);
    const savedStep   = sessionStorage.getItem(SS_STEP) as Step | null;
    const savedGps    = sessionStorage.getItem(SS_GPS);

    if (savedSelfie) {
      setSelfieDataUrl(savedSelfie);
      try { setSelfieBlob(dataUrlToBlob(savedSelfie)); } catch { /* ignore */ }
    }
    if (savedGps) {
      try { setGpsCoords(JSON.parse(savedGps)); } catch { /* ignore */ }
    }
    // Only restore step when we have a selfie — never skip step 1 without one
    if (savedStep && savedStep !== "done" && savedSelfie) {
      setStep(savedStep);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist selfie data URL
  useEffect(() => {
    if (selfieDataUrl) sessionStorage.setItem(SS_SELFIE, selfieDataUrl);
    else sessionStorage.removeItem(SS_SELFIE);
  }, [selfieDataUrl]);

  // Persist step (and clear everything when done)
  useEffect(() => {
    sessionStorage.setItem(SS_STEP, step);
    if (step === "done") {
      sessionStorage.removeItem(SS_SELFIE);
      sessionStorage.removeItem(SS_GPS);
      sessionStorage.removeItem(SS_STEP);
    }
  }, [step]);

  // Persist GPS coords
  useEffect(() => {
    if (gpsCoords) sessionStorage.setItem(SS_GPS, JSON.stringify(gpsCoords));
    else sessionStorage.removeItem(SS_GPS);
  }, [gpsCoords]);

  // ── Selfie ───────────────────────────────────────────────────────────────
  const handleSelfieFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const input = e.target; // capture before async — e.target stays valid in React 17+
    if (!file) return;
    if (file.size === 0) {
      toast.error("Camera returned an empty file — please try again.");
      input.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      if (dataUrl) {
        // Set blob and dataUrl together inside onload so both state updates
        // land in the same React render — eliminates the async gap where
        // selfieBlob is set but selfieDataUrl is still null.
        setSelfieBlob(file);
        setSelfieDataUrl(dataUrl);
      } else {
        toast.error("Failed to read photo — please try again.");
      }
      input.value = "";
    };
    reader.onerror = () => {
      toast.error("Failed to read photo — please try again.");
      input.value = "";
    };
    reader.readAsDataURL(file);
  }, []);

  // ── GPS ──────────────────────────────────────────────────────────────────
  const gpsErrorMessage = (code: number) => {
    if (code === 1) {
      // On Android Chrome, geolocation is blocked on HTTP (non-localhost) even with permission granted.
      // The fix is to access the app via HTTPS (https://...) instead of http://.
      const isHttp = window.location.protocol === "http:" && window.location.hostname !== "localhost";
      if (isHttp) {
        return "Location blocked — Chrome requires HTTPS for GPS access. Open the app using https:// instead of http:// and accept the certificate warning.";
      }
      return "Location access denied. Tap the lock/info icon in your browser address bar, tap Permissions, and enable Location. Then try again.";
    }
    if (code === 2) return "Location unavailable. Move to an open area away from buildings and try again.";
    if (code === 3) return "Location timed out. Move to an open area and try again.";
    return "Could not get location. Please try again.";
  };

  const captureGPS = useCallback(() => {
    if (!navigator.geolocation) { setGpsError("Geolocation is not supported by this browser."); return; }
    setGpsLoading(true); setGpsError(null);

    const onSuccess = (pos: GeolocationPosition) => {
      setGpsCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) });
      setGpsLoading(false);
      toast.success("GPS captured!");
    };

    const onErrorFallback = (err: GeolocationPositionError) => {
      setGpsLoading(false);
      setGpsError(gpsErrorMessage(err.code));
    };

    // Try high-accuracy first; if unavailable/timeout, retry with low accuracy
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (err) => {
        if (err.code === 2 || err.code === 3) {
          navigator.geolocation.getCurrentPosition(onSuccess, onErrorFallback, {
            enableHighAccuracy: false, timeout: 10000, maximumAge: 30000,
          });
        } else {
          onErrorFallback(err);
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  }, []);

  // ── Photo helpers ────────────────────────────────────────────────────────
  const handlePhotoCapture = (setter: (v: { url: string; file: File } | null) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const input = e.target;
    if (!file) return;
    if (file.size === 0) { toast.error("Camera returned an empty file — please try again."); input.value = ""; return; }
    const capturedFile = file;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      if (dataUrl) { setter({ url: dataUrl, file: capturedFile }); toast.success("Photo captured!"); }
      else toast.error("Failed to read photo — please try again.");
      input.value = "";
    };
    reader.onerror = () => { toast.error("Failed to read photo — please try again."); input.value = ""; };
    reader.readAsDataURL(file);
  };

  // Revoke blob URLs on change/unmount (no-op for data: URLs which are plain strings)
  useEffect(() => { return () => { if (selfieDataUrl?.startsWith("blob:")) URL.revokeObjectURL(selfieDataUrl); }; }, [selfieDataUrl]);
  useEffect(() => { return () => { if (odometerPhoto?.url.startsWith("blob:")) URL.revokeObjectURL(odometerPhoto.url); }; }, [odometerPhoto]);
  useEffect(() => { return () => { if (fuelPhoto?.url.startsWith("blob:")) URL.revokeObjectURL(fuelPhoto.url); }; }, [fuelPhoto]);

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!selfieBlob || !gpsCoords) { toast.error("Selfie and GPS required"); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("lat", String(gpsCoords.latitude));
      fd.append("lng", String(gpsCoords.longitude));
      fd.append("accuracy", String(gpsCoords.accuracy));
      fd.append("selfie", selfieBlob, "selfie.jpg");
      if (odometerReading) fd.append("odometerReading", odometerReading);
      if (fuelLevel) fd.append("fuelLevel", fuelLevel);
      if (odometerPhoto) fd.append("odometerPhoto", odometerPhoto.file);
      if (fuelPhoto) fd.append("fuelPhoto", fuelPhoto.file);

      await driverCheckIn(fd);
      setStep("done");
      toast.success("Check-in complete!");
      setTimeout(() => navigate("/driver/home"), 1800);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check-in failed");
    } finally { setSubmitting(false); }
  }, [selfieBlob, gpsCoords, odometerReading, fuelLevel, odometerPhoto, fuelPhoto, navigate]);

  // ── Steps config ─────────────────────────────────────────────────────────
  const allSteps: { key: Step; label: string }[] = [
    { key: "selfie", label: "Selfie" },
    { key: "gps", label: "GPS" },
    { key: "odometer", label: "Odometer" },
    { key: "fuel", label: "Fuel" },
    { key: "confirm", label: "Confirm" },
  ];
  const stepIdx = (s: Step) => allSteps.findIndex(x => x.key === s);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 space-y-4">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold">Start Day Check-in</h1>
        <p className="text-sm text-blue-100 mt-1">Selfie + GPS + Odometer + Fuel proof before route starts</p>
      </div>

      {/* Step progress */}
      {step !== "done" && (
        <div className="flex items-center gap-1 overflow-x-auto">
          {allSteps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1 flex-1 min-w-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${stepIdx(step) > i ? "bg-green-600 text-white" : stepIdx(step) === i ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"}`}>
                {stepIdx(step) > i ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={`text-xs font-medium truncate ${stepIdx(step) === i ? "text-blue-600" : "text-gray-400"}`}>{s.label}</span>
              {i < allSteps.length - 1 && <div className={`flex-1 h-0.5 min-w-2 ${stepIdx(step) > i ? "bg-green-500" : "bg-gray-200"}`} />}
            </div>
          ))}
        </div>
      )}

      {/* STEP 1: Selfie */}
      {step === "selfie" && (
        <Card className="shadow-lg">
          <CardHeader><CardTitle className="flex items-center gap-2"><Camera className="w-5 h-5 text-blue-600" /> Step 1 — Selfie</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="relative h-64 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-100 dark:bg-gray-800 overflow-hidden flex items-center justify-center">
              {selfieDataUrl
                ? <img src={selfieDataUrl} alt="Selfie" className="absolute inset-0 w-full h-full object-cover" />
                : <div className="flex flex-col items-center gap-2"><Camera className="w-12 h-12 text-gray-400" /><p className="text-sm text-gray-500">Tap below to take your selfie</p></div>}
            </div>
            {!selfieDataUrl && (
              <div className="space-y-2">
                <Button className="w-full h-12" onClick={() => selfieCameraRef.current?.click()}>
                  <Camera className="w-4 h-4 mr-2" /> Open Front Camera
                </Button>
                <p className="text-xs text-center text-gray-400">Camera only — gallery upload is not allowed</p>
                <p className="text-xs text-center text-gray-400">If camera fails, close other apps to free memory and try again</p>
                <input ref={selfieCameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handleSelfieFile} />
              </div>
            )}
            {selfieDataUrl && (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 h-12" onClick={() => { setSelfieDataUrl(null); setSelfieBlob(null); sessionStorage.removeItem(SS_SELFIE); sessionStorage.removeItem(SS_STEP); }}><RefreshCw className="w-4 h-4 mr-2" /> Retake</Button>
                <Button className="flex-1 h-12" onClick={() => setStep("gps")}>Next: GPS</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* STEP 2: GPS */}
      {step === "gps" && (
        <Card className="shadow-lg">
          <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="w-5 h-5 text-blue-600" /> Step 2 — GPS Location</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {gpsCoords ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-green-50 dark:bg-green-950 p-3"><p className="text-xs text-gray-500">Lat</p><p className="font-semibold text-green-700">{gpsCoords.latitude.toFixed(6)}</p></div>
                  <div className="rounded-lg bg-green-50 dark:bg-green-950 p-3"><p className="text-xs text-gray-500">Lng</p><p className="font-semibold text-green-700">{gpsCoords.longitude.toFixed(6)}</p></div>
                </div>
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-3 rounded-lg"><span className="text-sm">Accuracy</span><Badge className="bg-green-600">±{gpsCoords.accuracy}m</Badge></div>
              </div>
            ) : (
              <div className="h-32 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-100 dark:bg-gray-800 flex flex-col items-center justify-center">
                {gpsLoading ? <><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /><p className="text-sm text-gray-500 mt-2">Acquiring...</p></> : <><MapPin className="w-8 h-8 text-gray-400" /><p className="text-sm text-gray-500 mt-2">Tap below to capture GPS</p></>}
              </div>
            )}
            {gpsError && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{gpsError}</div>}
            {!gpsCoords ? <Button className="w-full h-12" onClick={captureGPS} disabled={gpsLoading}>{gpsLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2" />} Get Location</Button>
              : <div className="flex gap-2"><Button variant="outline" className="flex-1 h-12" onClick={() => setGpsCoords(null)}><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button><Button className="flex-1 h-12" onClick={() => setStep("odometer")}>Next: Odometer</Button></div>}
            <Button variant="ghost" className="w-full text-gray-500" onClick={() => setStep("selfie")}>← Back</Button>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: Odometer */}
      {step === "odometer" && (
        <Card className="shadow-lg">
          <CardHeader><CardTitle className="flex items-center gap-2"><Gauge className="w-5 h-5 text-blue-600" /> Step 3 — Odometer Reading</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Current Odometer (KM)</Label>
              <Input type="number" placeholder="e.g. 45230" value={odometerReading} onChange={e => setOdometerReading(e.target.value)} className="h-12 text-lg" />
            </div>
            <div className="space-y-2">
              <Label>Odometer Photo</Label>
              {odometerPhoto ? (
                <div className="relative h-40 rounded-lg overflow-hidden border">
                  <img src={odometerPhoto.url} alt="Odometer" className="w-full h-full object-cover" />
                  <button onClick={() => setOdometerPhoto(null)} className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">✕</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 h-12" onClick={() => odometerCameraRef.current?.click()}><Camera className="w-4 h-4 mr-2" /> Capture</Button>
                  <Button variant="outline" className="flex-1 h-12" onClick={() => odometerFileRef.current?.click()}><Upload className="w-4 h-4 mr-2" /> Attach</Button>
                </div>
              )}
              <input ref={odometerCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture(setOdometerPhoto)} />
              <input ref={odometerFileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoCapture(setOdometerPhoto)} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-12" onClick={() => setStep("gps")}>← Back</Button>
              <Button className="flex-1 h-12" onClick={() => setStep("fuel")}>Next: Fuel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4: Fuel */}
      {step === "fuel" && (
        <Card className="shadow-lg">
          <CardHeader><CardTitle className="flex items-center gap-2"><Fuel className="w-5 h-5 text-blue-600" /> Step 4 — Fuel Level</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Fuel Level</Label>
              <Select value={fuelLevel} onValueChange={setFuelLevel}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Select fuel level" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full</SelectItem>
                  <SelectItem value="3/4">3/4</SelectItem>
                  <SelectItem value="1/2">1/2 (Half)</SelectItem>
                  <SelectItem value="1/4">1/4</SelectItem>
                  <SelectItem value="low">Low / Near Empty</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fuel Gauge Photo</Label>
              {fuelPhoto ? (
                <div className="relative h-40 rounded-lg overflow-hidden border">
                  <img src={fuelPhoto.url} alt="Fuel" className="w-full h-full object-cover" />
                  <button onClick={() => setFuelPhoto(null)} className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">✕</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 h-12" onClick={() => fuelCameraRef.current?.click()}><Camera className="w-4 h-4 mr-2" /> Capture</Button>
                  <Button variant="outline" className="flex-1 h-12" onClick={() => fuelFileRef.current?.click()}><Upload className="w-4 h-4 mr-2" /> Attach</Button>
                </div>
              )}
              <input ref={fuelCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture(setFuelPhoto)} />
              <input ref={fuelFileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoCapture(setFuelPhoto)} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-12" onClick={() => setStep("odometer")}>← Back</Button>
              <Button className="flex-1 h-12" onClick={() => setStep("confirm")}>Next: Confirm</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 5: Confirm */}
      {step === "confirm" && (
        <Card className="shadow-lg">
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-blue-600" /> Step 5 — Confirm & Submit</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {selfieDataUrl && (
              <div className="flex items-center gap-4 rounded-xl border p-3">
                <img src={selfieDataUrl} alt="Selfie" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                <div><p className="font-semibold">Selfie</p><Badge className="bg-green-600 mt-1">Ready</Badge></div>
              </div>
            )}
            {gpsCoords && (
              <div className="flex items-center gap-4 rounded-xl border p-3">
                <div className="w-16 h-16 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><MapPin className="w-7 h-7 text-blue-600" /></div>
                <div><p className="font-semibold">GPS</p><p className="text-xs text-gray-500">{gpsCoords.latitude.toFixed(5)}, {gpsCoords.longitude.toFixed(5)}</p><Badge className="bg-green-600 mt-1">±{gpsCoords.accuracy}m</Badge></div>
              </div>
            )}
            <div className="flex items-center gap-4 rounded-xl border p-3">
              <div className="w-16 h-16 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                {odometerPhoto ? <img src={odometerPhoto.url} alt="Odo" className="w-full h-full rounded-lg object-cover" /> : <Gauge className="w-7 h-7 text-orange-600" />}
              </div>
              <div><p className="font-semibold">Odometer</p><p className="text-xs text-gray-500">{odometerReading ? `${odometerReading} KM` : "Not entered"}</p><Badge className={odometerReading ? "bg-green-600 mt-1" : "bg-gray-400 mt-1"}>{odometerReading ? "Ready" : "Optional"}</Badge></div>
            </div>
            <div className="flex items-center gap-4 rounded-xl border p-3">
              <div className="w-16 h-16 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                {fuelPhoto ? <img src={fuelPhoto.url} alt="Fuel" className="w-full h-full rounded-lg object-cover" /> : <Fuel className="w-7 h-7 text-purple-600" />}
              </div>
              <div><p className="font-semibold">Fuel Level</p><p className="text-xs text-gray-500">{fuelLevel || "Not selected"}</p><Badge className={fuelLevel ? "bg-green-600 mt-1" : "bg-gray-400 mt-1"}>{fuelLevel || "Optional"}</Badge></div>
            </div>

            <Button className="w-full h-14 text-base" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <ShieldCheck className="w-5 h-5 mr-2" />}
              {submitting ? "Submitting..." : "Submit Check-In"}
            </Button>
            <Button variant="ghost" className="w-full text-gray-500" onClick={() => setStep("fuel")} disabled={submitting}>← Back</Button>
          </CardContent>
        </Card>
      )}

      {/* DONE */}
      {step === "done" && (
        <Card className="shadow-lg">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="w-20 h-20 text-green-600" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Check-In Complete!</h2>
            <p className="text-sm text-gray-500">Route is active. Redirecting...</p>
            <Badge className="bg-green-600 text-sm px-4 py-1.5">Route Active</Badge>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
