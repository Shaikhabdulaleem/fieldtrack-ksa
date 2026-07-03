import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Camera, CheckCircle2, Loader2, Upload, Video, ShieldCheck, AlertTriangle,
} from "lucide-react";
import { useRef, useState, useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { toast } from "sonner";
import { completeSurveyZone } from "../../lib/api";

type Step = "photos" | "video" | "confirm" | "done";

interface CapturedMedia { url: string; file: File }

// Zone-completion proof upload — modeled directly on DriverCheckIn.tsx's
// step-wizard pattern. GPS route is NOT collected here — it's derived
// server-side from the pings already sent throughout the day via the
// existing tracking/ping flow in DriverNavigation.tsx.
export function SurveyZoneComplete() {
  const navigate = useNavigate();
  const location = useLocation();
  const zoneState = (location.state as { zoneId?: string; label?: string; targetKm?: number; districtName?: string } | null) ?? null;

  const [step, setStep] = useState<Step>("photos");
  const [photos, setPhotos] = useState<CapturedMedia[]>([]);
  const [video, setVideo] = useState<CapturedMedia | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const photoCameraRef = useRef<HTMLInputElement>(null);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const videoCameraRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      photos.forEach(p => { if (p.url.startsWith("blob:")) URL.revokeObjectURL(p.url); });
      if (video?.url.startsWith("blob:")) URL.revokeObjectURL(video.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePhotoCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const input = e.target;
    if (!file) return;
    if (file.size === 0) { toast.error("Camera returned an empty file — please try again."); input.value = ""; return; }
    if (photos.length >= 10) { toast.error("Maximum 10 photos"); input.value = ""; return; }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      if (dataUrl) { setPhotos(prev => [...prev, { url: dataUrl, file }]); toast.success("Photo added!"); }
      else toast.error("Failed to read photo — please try again.");
      input.value = "";
    };
    reader.onerror = () => { toast.error("Failed to read photo — please try again."); input.value = ""; };
    reader.readAsDataURL(file);
  }, [photos.length]);

  const handleVideoCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const input = e.target;
    if (!file) return;
    if (file.size === 0) { toast.error("Camera returned an empty file — please try again."); input.value = ""; return; }
    setVideo({ url: URL.createObjectURL(file), file });
    toast.success("Video added!");
    input.value = "";
  }, []);

  const removePhoto = (idx: number) => {
    setPhotos(prev => {
      const next = [...prev];
      if (next[idx].url.startsWith("blob:")) URL.revokeObjectURL(next[idx].url);
      next.splice(idx, 1);
      return next;
    });
  };

  const handleSubmit = useCallback(async () => {
    if (!zoneState?.zoneId) { toast.error("No survey zone context — go back and try again."); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      photos.forEach(p => fd.append("photos", p.file));
      if (video) fd.append("videos", video.file);

      const res = await completeSurveyZone(zoneState.zoneId, fd);
      setResult(res);
      setStep("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete survey zone");
    } finally {
      setSubmitting(false);
    }
  }, [zoneState, photos, video]);

  const allSteps: { key: Step; label: string }[] = [
    { key: "photos", label: "Photos" },
    { key: "video", label: "Video" },
    { key: "confirm", label: "Confirm" },
  ];
  const stepIdx = (s: Step) => allSteps.findIndex(x => x.key === s);

  const statusDisplay: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
    completed: { label: "Completed", color: "bg-green-600", icon: CheckCircle2 },
    partially_completed: { label: "Partially Completed", color: "bg-amber-500", icon: AlertTriangle },
    rejected_needs_review: { label: "Needs Review", color: "bg-red-600", icon: AlertTriangle },
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 space-y-4">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold">Complete Survey Zone</h1>
        <p className="text-sm text-blue-100 mt-1">
          {zoneState?.label ? `${zoneState.label} — ${zoneState.districtName ?? ""}` : "Upload proof to submit for verification"}
        </p>
        {zoneState?.targetKm != null && (
          <p className="text-xs text-blue-200 mt-1">Target: {zoneState.targetKm.toFixed(1)} km</p>
        )}
      </div>

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

      {/* STEP 1: Photos */}
      {step === "photos" && (
        <Card className="shadow-lg">
          <CardHeader><CardTitle className="flex items-center gap-2"><Camera className="w-5 h-5 text-blue-600" /> Step 1 — Proof Photos</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-gray-500">At least 1 photo is required for the zone to be marked Completed.</p>
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p, idx) => (
                  <div key={idx} className="relative h-24 rounded-lg overflow-hidden border">
                    <img src={p.url} alt={`Proof ${idx + 1}`} className="w-full h-full object-cover" />
                    <button onClick={() => removePhoto(idx)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-12" onClick={() => photoCameraRef.current?.click()}><Camera className="w-4 h-4 mr-2" /> Capture</Button>
              <Button variant="outline" className="flex-1 h-12" onClick={() => photoFileRef.current?.click()}><Upload className="w-4 h-4 mr-2" /> Attach</Button>
            </div>
            <input ref={photoCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture} />
            <input ref={photoFileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoCapture} />
            <Button className="w-full h-12" onClick={() => setStep("video")} disabled={photos.length === 0}>
              Next: Video ({photos.length} photo{photos.length !== 1 ? "s" : ""})
            </Button>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: Video (optional) */}
      {step === "video" && (
        <Card className="shadow-lg">
          <CardHeader><CardTitle className="flex items-center gap-2"><Video className="w-5 h-5 text-blue-600" /> Step 2 — Video (Optional)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {video ? (
              <div className="relative rounded-lg overflow-hidden border">
                <video src={video.url} controls className="w-full h-40 object-cover" />
                <button onClick={() => setVideo(null)} className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">✕</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 h-12" onClick={() => videoCameraRef.current?.click()}><Video className="w-4 h-4 mr-2" /> Record</Button>
                <Button variant="outline" className="flex-1 h-12" onClick={() => videoFileRef.current?.click()}><Upload className="w-4 h-4 mr-2" /> Attach</Button>
              </div>
            )}
            <input ref={videoCameraRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={handleVideoCapture} />
            <input ref={videoFileRef} type="file" accept="video/*" className="hidden" onChange={handleVideoCapture} />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-12" onClick={() => setStep("photos")}>← Back</Button>
              <Button className="flex-1 h-12" onClick={() => setStep("confirm")}>Next: Confirm</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: Confirm */}
      {step === "confirm" && (
        <Card className="shadow-lg">
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-blue-600" /> Step 3 — Confirm & Submit</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-4 rounded-xl border p-3">
              <div className="w-16 h-16 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><Camera className="w-7 h-7 text-blue-600" /></div>
              <div><p className="font-semibold">Photos</p><p className="text-xs text-gray-500">{photos.length} attached</p><Badge className="bg-green-600 mt-1">Ready</Badge></div>
            </div>
            <div className="flex items-center gap-4 rounded-xl border p-3">
              <div className="w-16 h-16 rounded-lg bg-purple-50 flex items-center justify-center shrink-0"><Video className="w-7 h-7 text-purple-600" /></div>
              <div><p className="font-semibold">Video</p><p className="text-xs text-gray-500">{video ? "1 attached" : "None"}</p><Badge className={video ? "bg-green-600 mt-1" : "bg-gray-400 mt-1"}>{video ? "Ready" : "Optional"}</Badge></div>
            </div>
            <p className="text-xs text-gray-500">
              GPS route is verified automatically from your location pings today — no need to submit it manually.
            </p>

            <Button className="w-full h-14 text-base" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <ShieldCheck className="w-5 h-5 mr-2" />}
              {submitting ? "Submitting..." : "Complete Task"}
            </Button>
            <Button variant="ghost" className="w-full text-gray-500" onClick={() => setStep("video")} disabled={submitting}>← Back</Button>
          </CardContent>
        </Card>
      )}

      {/* DONE */}
      {step === "done" && result && (() => {
        const status = String(result.status ?? "");
        const display = statusDisplay[status] ?? { label: status, color: "bg-gray-500", icon: CheckCircle2 };
        const Icon = display.icon;
        return (
          <Card className="shadow-lg">
            <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
              <Icon className={`w-20 h-20 ${status === "completed" ? "text-green-600" : status === "partially_completed" ? "text-amber-500" : "text-red-600"}`} />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Survey Submitted</h2>
              <Badge className={`${display.color} text-sm px-4 py-1.5`}>{display.label}</Badge>
              <div className="text-sm text-gray-500 space-y-1">
                <p>Actual: {Number(result.actualKm).toFixed(1)} km / Target: {Number(result.targetKm).toFixed(1)} km</p>
                {result.verificationNotes ? <p className="text-xs">{String(result.verificationNotes)}</p> : null}
              </div>
              <Button onClick={() => navigate("/driver/home")} className="mt-2">Back to Home</Button>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
