import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
// NEW - display real overall and per-photo upload progress.
import { Progress } from "../ui/progress";
// NEW - show the required duplicate decision without leaving the completed form.
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import {
  Camera,
  Check,
  MapPin,
  Save,
  Send,
  ArrowLeft,
  Upload,
  WifiOff,
  Stamp,
  UserRound,
  Loader2,
  X,
  LocateFixed,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { useNavigate } from "react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { toast } from "sonner";
// CHANGED - include the server duplicate precheck and shared warning type.
import { getDriverToday, getStoredUser, locateByGps, checkNearbyApprovedLead, type NearbyLead } from "../../lib/api";
// CHANGED - persist and update the same queue entry through confirmation or failure.
import { saveDraft, filesToBlobs, getPendingCount, getDraft, updateDraftUploadState, deleteDraft, type StoredDraft } from "../../lib/drafts-db";
// NEW - use the shared serial uploader and byte-derived photo progress.
import { getQueuedPhotos, uploadQueuedLead, type QueueProgress } from "../../lib/upload-queue";
import { useOnlineStatus } from "../../lib/useOnlineStatus";

// ---------------------------------------------------------------------------
// Photo groups configuration
// ---------------------------------------------------------------------------
const photoGroups = [
  { key: "billboard", title: "Billboard Photo", subtitle: "Required • min 1, max 5" },
  { key: "front", title: "Site Front Photo", subtitle: "Required • min 1, max 5" },
  { key: "side", title: "Side Photo", subtitle: "Optional" },
  { key: "contractorBoard", title: "Owner / Contractor Board", subtitle: "If visible" },
] as const;

type PhotoKey = (typeof photoGroups)[number]["key"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface FormData {
  siteName: string;
  plotNumber: string;
  constructionPhase: string;
  nearestLandmark: string;
  ownerName: string;
  contractorName: string;
  phoneNumber: string;
  projectName: string;
  engineerName: string;
  notes: string;
}

interface GpsLocation {
  lat: number;
  lng: number;
  accuracy: number;
  city: string;
  street: string;
  district: string;
  zone: string;
}

interface PhotoEntry { url: string; file: File }
type PhotoMap = Record<PhotoKey, PhotoEntry[]>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function LeadForm() {
  const navigate = useNavigate();

  // ── assignment context (fetched from driver's today data) ──────────────────
  const [assignmentContext, setAssignmentContext] = useState<{
    cityName: string;
    currentStreet: string;
    districtName: string;
    zoneName: string;
  } | null>(null);

  useEffect(() => {
    getDriverToday()
      .then((data) => {
        const streets = (data.streets as Record<string, unknown>[]) ?? [];
        const currentStreet = streets.find(
          (s) => String(s.status) === "assigned" || String(s.status) === "in_progress"
        ) ?? streets[0];
        setAssignmentContext({
          cityName: String(data.cityName ?? ""),
          currentStreet: String(currentStreet?.streetNameEn ?? ""),
          districtName: String(currentStreet?.districtName ?? ""),
          zoneName: String(currentStreet?.zoneName ?? data.zoneName ?? ""),
        });
      })
      .catch(() => {});
  }, []);

  // ── form state ─────────────────────────────────────────────────────────────
  const [formData, setFormData] = useState<FormData>({
    siteName: "",
    plotNumber: "",
    constructionPhase: "",
    nearestLandmark: "",
    ownerName: "",
    contractorName: "",
    phoneNumber: "",
    projectName: "",
    engineerName: "",
    notes: "",
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FormData | "photos", string>>>({});

  // ── GPS state ───────────────────────────────────────────────────────────────
  const [location, setLocation] = useState<GpsLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [gpsWarning, setGpsWarning] = useState(false);

  // ── photo state ─────────────────────────────────────────────────────────────
  const [photos, setPhotos] = useState<PhotoMap>({
    billboard: [] as PhotoEntry[],
    front: [] as PhotoEntry[],
    side: [] as PhotoEntry[],
    contractorBoard: [] as PhotoEntry[],
  });

  // hidden file-input refs: one for gallery, one for camera per group
  const fileInputRefs = useRef<Record<PhotoKey, HTMLInputElement | null>>({
    billboard: null,
    front: null,
    side: null,
    contractorBoard: null,
  });
  const cameraInputRefs = useRef<Record<PhotoKey, HTMLInputElement | null>>({
    billboard: null,
    front: null,
    side: null,
    contractorBoard: null,
  });

  // Revoke any remaining blob URLs on unmount (data URLs are plain strings, no cleanup needed)
  const photosRef = useRef(photos);
  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => {
    return () => { Object.values(photosRef.current).flat().forEach(p => { if (p.url.startsWith("blob:")) URL.revokeObjectURL(p.url); }); };
  }, []);

  // ── online / offline ─────────────────────────────────────────────────────────
  const isOnline = useOnlineStatus();

  // ── submit / draft state ────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  // NEW - hold the nearest approved lead until the Driver makes the required decision.
  const [duplicateLead, setDuplicateLead] = useState<NearbyLead | null>(null);
  // NEW - retain current queue progress and exact final failure on the Lead form.
  const [duplicateQueueId, setDuplicateQueueId] = useState<string | null>(null);
  const [activeUpload, setActiveUpload] = useState<StoredDraft | null>(null);
  const [queueProgress, setQueueProgress] = useState<QueueProgress | null>(null);

  // ── derived ─────────────────────────────────────────────────────────────────
  const mandatoryPhotosComplete = useMemo(
    () => photos.billboard.length >= 1 && photos.front.length >= 1,
    [photos.billboard.length, photos.front.length]
  );

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const updateField = (key: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  // GPS capture — uses reverse geocoding to find actual district
  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        const accuracy = Math.round(pos.coords.accuracy);

        // Reverse geocode: find which district polygon contains this point
        try {
          const located = await locateByGps(lat, lng);
          setLocation({
            lat, lng, accuracy,
            city: located.city || assignmentContext?.cityName || "Unknown",
            street: located.nearestStreet || assignmentContext?.currentStreet || "Unknown",
            district: located.district || assignmentContext?.districtName || "Unknown",
            zone: located.zone || assignmentContext?.zoneName || "Unknown",
          });
        } catch {
          // Fallback to assignment context if locate API fails
          setLocation({
            lat, lng, accuracy,
            city: assignmentContext?.cityName || "Unknown",
            street: assignmentContext?.currentStreet || "Unknown",
            district: assignmentContext?.districtName || "Unknown",
            zone: assignmentContext?.zoneName || "Unknown",
          });
        }

        setIsLocating(false);
        setGpsWarning(accuracy > 30);
        toast.success("GPS location captured");
      },
      (err) => {
        setIsLocating(false);
        toast.error(`GPS error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // Photo upload — opens hidden file input (gallery)
  const handleUploadClick = (key: PhotoKey) => {
    if (photos[key].length >= 5) {
      toast.error("Maximum 5 photos allowed in this section");
      return;
    }
    fileInputRefs.current[key]?.click();
  };

  // Camera capture — opens camera directly
  const handleCameraClick = (key: PhotoKey) => {
    if (photos[key].length >= 5) {
      toast.error("Maximum 5 photos allowed in this section");
      return;
    }
    cameraInputRefs.current[key]?.click();
  };

  const handleFileChange = (key: PhotoKey, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const current = photos[key];
    const slots = 5 - current.length;
    const accepted = files.slice(0, slots).filter(f => f.size > 0);

    if (files.length > slots) {
      toast.warning(`Only ${slots} more photo(s) allowed in this section. ${files.length - slots} skipped.`);
    }

    // Use FileReader → data URL (more reliable than createObjectURL on Android WebView)
    Promise.all(
      accepted.map(
        (f) =>
          new Promise<PhotoEntry>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (evt) => {
              const dataUrl = evt.target?.result as string;
              if (dataUrl) resolve({ url: dataUrl, file: f });
              else reject(new Error("empty data URL"));
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(f);
          })
      )
    )
      .then((newEntries) => {
        setPhotos((prev) => ({ ...prev, [key]: [...prev[key], ...newEntries] }));
        if ((key === "billboard" || key === "front") && errors.photos) {
          setErrors((prev) => ({ ...prev, photos: undefined }));
        }
        toast.success(`${newEntries.length} photo(s) added`);
      })
      .catch(() => toast.error("Failed to read photo — please try again."));

    e.target.value = "";
  };

  const handleRemovePhoto = (key: PhotoKey, index: number) => {
    setPhotos((prev) => {
      const updated = [...prev[key]];
      if (updated[index].url.startsWith("blob:")) URL.revokeObjectURL(updated[index].url);
      updated.splice(index, 1);
      return { ...prev, [key]: updated };
    });
  };

  // Validation
  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (!formData.siteName.trim() && !formData.plotNumber.trim()) {
      newErrors.siteName = "Enter at least a site name or plot number";
      newErrors.plotNumber = "Enter at least a site name or plot number";
    }
    if (!formData.constructionPhase) {
      newErrors.constructionPhase = "Select a construction phase";
    }
    if (!mandatoryPhotosComplete) {
      newErrors.photos = "Billboard and front site photos are mandatory";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // NEW - persist the exact lead and photo blobs before any network upload starts.
  const persistCurrentLead = async (submitAsDifferentSite = false): Promise<StoredDraft> => {
    const user = getStoredUser();
    const id = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const photoBlobs = {
      billboard: await filesToBlobs(photos.billboard.map(photo => photo.file)),
      front: await filesToBlobs(photos.front.map(photo => photo.file)),
      side: await filesToBlobs(photos.side.map(photo => photo.file)),
      contractorBoard: await filesToBlobs(photos.contractorBoard.map(photo => photo.file)),
    };
    await saveDraft({
        id,
        savedAt: new Date().toISOString(),
        driverId: user?.id ?? "",
        cityId: user?.cityId ?? null,
        fields: { ...formData },
        location,
        assignment: assignmentContext
          ? {
              streetId: "",
              streetName: assignmentContext.currentStreet,
              districtName: assignmentContext.districtName,
            }
          : null,
        photos: photoBlobs,
        submitAsDifferentSite,
      });
    const draft = await getDraft(id);
    if (!draft) throw new Error("Upload queue could not save this lead");
    return draft;
  };

  // CHANGED - Save Draft uses the same durable queue record as online submission.
  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      await persistCurrentLead();
      const count = await getPendingCount();
      toast.success(`Draft saved! You have ${count} unsynced draft(s).`);
    } catch {
      toast.error("Failed to save draft — storage may be full");
    } finally {
      setIsSaving(false);
    }
  };

  // NEW - update this form from the persistent queue processor and wait for HTTP 200 confirmation.
  const uploadDraft = async (draft: StoredDraft) => {
    setActiveUpload(draft);
    setIsSubmitting(true);
    const result = await uploadQueuedLead(draft, {
      onProgress: (_queuedDraft, progress) => {
        setQueueProgress(progress);
        setActiveUpload(current => current ? {
          ...current,
          syncStatus: progress.status,
          uploadProgress: progress.overallProgress,
          perPhotoProgress: progress.perPhotoProgress,
          currentPhotoIndex: progress.currentPhotoIndex,
          attemptCount: progress.attemptCount,
        } : current);
      },
      onDuplicate: (queuedDraft, nearbyLead) => {
        setDuplicateQueueId(queuedDraft.id);
        setDuplicateLead(nearbyLead);
      },
    });
    const refreshed = await getDraft(draft.id);
    setActiveUpload(refreshed);
    setIsSubmitting(false);

    if (result.status === "received") {
      toast.success("Lead received successfully");
      setTimeout(() => navigate("/driver/home"), 1000);
    } else if (result.status === "failed") {
      toast.error(result.error);
    }
  };

  // Submit — real API upload (auto-saves as draft when offline)
  // CHANGED - precheck exact duplicate distance before the real API upload.
  const handleSubmit = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      if (!isOnline) {
        await handleSaveDraft();
        toast.info("You're offline — lead saved as draft and will upload when connected.");
        return;
      }
      if (!validate()) {
        toast.error("Please fix the highlighted fields before submitting");
        return;
      }
      if (!location) {
        toast.error("Please capture GPS location first");
        return;
      }

      // NEW - warn before any photo upload and require the Driver's site decision.
      setIsSubmitting(true);
      try {
        const result = await checkNearbyApprovedLead(location.lat, location.lng);
        if (result.nearbyLead) {
          setDuplicateLead(result.nearbyLead);
          return;
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Duplicate check failed. Try again.");
        return;
      } finally {
        setIsSubmitting(false);
      }

      await submitLead(false);
    } finally {
      submittingRef.current = false;
    }
  };

  // CHANGED - enqueue first, then upload the same persistent record with automatic retries.
  const submitLead = async (submitAsDifferentSite: boolean) => {
    if (!location) return;
    setIsSubmitting(true);
    try {
      const draft = await persistCurrentLead(submitAsDifferentSite);
      await uploadDraft(draft);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed. Try again.");
      setIsSubmitting(false);
    }
  };

  // NEW - manual retry starts a fresh automatic retry cycle for the failed queue entry.
  const handleRetryUpload = async () => {
    if (!activeUpload) return;
    await updateDraftUploadState(activeUpload.id, { syncStatus: "pending", attemptCount: 0, failReason: undefined });
    const draft = await getDraft(activeUpload.id);
    if (draft) await uploadDraft(draft);
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const fieldClass = (key: keyof FormData | "photos") =>
    errors[key] ? "border-red-500 focus-visible:ring-red-500" : "";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-blue-600 text-white p-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() => navigate("/driver/navigation")}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">New Construction Lead</h1>
              <p className="text-xs text-blue-100">
                عميل بناء جديد •{" "}
                {location ? `${location.city} / ${location.district}` : "Location not captured"}
              </p>
            </div>
          </div>
          <Badge className="bg-white/20 text-white border-white/30">
            <WifiOff className="w-3 h-3 mr-1" /> Offline ready
          </Badge>
        </div>
      </div>

      {/* ── Offline banner ───────────────────────────────────────────────── */}
      {!isOnline && (
        <div className="bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center gap-3">
          <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">أنت غير متصل بالإنترنت</p>
            <p className="text-xs text-amber-700 dark:text-amber-300">You are offline — leads will be saved as drafts and synced when connected</p>
          </div>
        </div>
      )}

      <div className="p-4 space-y-4 pb-28">
        {/* ── GPS Location Card ────────────────────────────────────────────── */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" /> GPS Location
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {location ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                    <p className="text-gray-500">City</p>
                    <p className="font-semibold">{location.city}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                    <p className="text-gray-500">Street</p>
                    <p className="font-semibold">{location.street}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                    <p className="text-gray-500">District</p>
                    <p className="font-semibold">{location.district}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                    <p className="text-gray-500">Zone</p>
                    <p className="font-semibold">{location.zone}</p>
                  </div>
                  <div className={`rounded-lg p-3 ${
                    location.accuracy < 20 ? "bg-green-50 dark:bg-green-950"
                    : location.accuracy <= 30 ? "bg-yellow-50 dark:bg-yellow-950"
                    : location.accuracy <= 50 ? "bg-orange-50 dark:bg-orange-950"
                    : "bg-red-50 dark:bg-red-950"
                  }`}>
                    <p className="text-gray-500">GPS Accuracy</p>
                    <p className={`font-semibold ${
                      location.accuracy < 20 ? "text-green-700 dark:text-green-400"
                      : location.accuracy <= 30 ? "text-yellow-700 dark:text-yellow-400"
                      : location.accuracy <= 50 ? "text-orange-700 dark:text-orange-400"
                      : "text-red-700 dark:text-red-400"
                    }`}>
                      ±{location.accuracy}m
                    </p>
                  </div>
                </div>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-3 text-xs text-blue-700 dark:text-blue-300">
                  Lat {location.lat}, Lng {location.lng}. GPS must match the selected street before
                  final submit.
                </div>
              </>
            ) : (
              <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950 p-4 text-sm text-yellow-800 dark:text-yellow-300 text-center">
                No GPS location captured yet. Tap the button below to get your current position.
              </div>
            )}

            <Button
              variant="outline"
              className="w-full"
              onClick={handleCaptureGps}
              disabled={isLocating}
            >
              {isLocating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <LocateFixed className="w-4 h-4 mr-2" />
              )}
              {isLocating ? "Acquiring GPS…" : location ? "Re-capture GPS Location" : "Capture GPS Location"}
            </Button>

            {gpsWarning && location && (
              <div className="rounded-xl border border-orange-300 bg-orange-50 dark:bg-orange-950 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-orange-800 dark:text-orange-200 text-sm">دقة GPS ضعيفة</p>
                    <p className="text-xs text-orange-700 dark:text-orange-300">
                      GPS accuracy is weak (±{location.accuracy}m). Photos may not match location.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 border-orange-300"
                    onClick={handleCaptureGps}
                    disabled={isLocating}
                  >
                    {isLocating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <LocateFixed className="w-3 h-3 mr-1" />}
                    Retry GPS
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 border-orange-300 text-orange-700"
                    onClick={() => setGpsWarning(false)}
                  >
                    Continue Anyway
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Site Information ─────────────────────────────────────────────── */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Site Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="siteName">
                  Site Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="siteName"
                  value={formData.siteName}
                  onChange={(e) => updateField("siteName", e.target.value)}
                  placeholder="e.g., Al Salam Residential Complex"
                  className={fieldClass("siteName")}
                />
                {errors.siteName && (
                  <p className="text-xs text-red-500">{errors.siteName}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="plotNumber">
                  Plot Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="plotNumber"
                  value={formData.plotNumber}
                  onChange={(e) => updateField("plotNumber", e.target.value)}
                  placeholder="e.g., Plot 245"
                  className={fieldClass("plotNumber")}
                />
                {errors.plotNumber && (
                  <p className="text-xs text-red-500">{errors.plotNumber}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                Construction Phase <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.constructionPhase}
                onValueChange={(value) => updateField("constructionPhase", value)}
              >
                <SelectTrigger className={fieldClass("constructionPhase")}>
                  <SelectValue placeholder="Select construction phase" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Just Digging Started">Just Digging Started</SelectItem>
                  <SelectItem value="Foundation Phase">Foundation Phase</SelectItem>
                  <SelectItem value="First Floor Starting">First Floor Starting</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              {errors.constructionPhase && (
                <p className="text-xs text-red-500">{errors.constructionPhase}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="nearestLandmark">Nearest Landmark</Label>
              <Input
                id="nearestLandmark"
                value={formData.nearestLandmark}
                onChange={(e) => updateField("nearestLandmark", e.target.value)}
                placeholder="e.g., near mosque, mall, petrol station"
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Photos ───────────────────────────────────────────────────────── */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-blue-600" /> Photos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {errors.photos && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
                {errors.photos}
              </div>
            )}

            {photoGroups.map((group) => {
              const required = group.key === "billboard" || group.key === "front";
              const count = photos[group.key].length;
              const complete = required ? count >= 1 : true;

              return (
                <div
                  key={group.key}
                  className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3"
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {group.title}
                        </h3>
                        {required && (
                          <Badge variant={complete ? "default" : "destructive"}>
                            {complete ? "Done" : "Required"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{group.subtitle}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCameraClick(group.key)}
                        disabled={count >= 5}
                      >
                        <Camera className="w-4 h-4 mr-1" />
                        Capture
                      </Button>
                      <span className="text-xs text-gray-500 font-medium">{count}/5</span>
                    </div>
                  </div>

                  {/* Hidden file input — camera capture only (gallery not allowed) */}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    ref={(el) => {
                      cameraInputRefs.current[group.key] = el;
                    }}
                    onChange={(e) => handleFileChange(group.key, e)}
                  />

                  {/* Image previews */}
                  {photos[group.key].length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {photos[group.key].map((entry, idx) => (
                        <div key={entry.url} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                          <img
                            src={entry.url}
                            alt={`${group.title} ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(group.key, idx)}
                            className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="flex items-start gap-2 rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-xs text-gray-500">
              <Stamp className="w-4 h-4 mt-0.5 text-blue-600 shrink-0" />
              Photos are watermarked with driver name, timestamp, GPS coordinates, and street name.
            </div>
          </CardContent>
        </Card>

        {/* ── Contact Information ───────────────────────────────────────────── */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="w-5 h-5 text-blue-600" /> Contact Information from Billboard
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ownerName">Owner Name</Label>
                <Input
                  id="ownerName"
                  value={formData.ownerName}
                  onChange={(e) => updateField("ownerName", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contractorName">Contractor Name</Label>
                <Input
                  id="contractorName"
                  value={formData.contractorName}
                  onChange={(e) => updateField("contractorName", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={(e) => updateField("phoneNumber", e.target.value)}
                  placeholder="+966 5X XXX XXXX"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="projectName">Project Name</Label>
                <Input
                  id="projectName"
                  value={formData.projectName}
                  onChange={(e) => updateField("projectName", e.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="engineerName">Engineer Name</Label>
                <Input
                  id="engineerName"
                  value={formData.engineerName}
                  onChange={(e) => updateField("engineerName", e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Notes ────────────────────────────────────────────────────────── */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder="Additional observations: activity level, workers present, machine visible, access notes…"
              rows={4}
            />
          </CardContent>
        </Card>

        {/* ── Action Buttons ────────────────────────────────────────────────── */}
        {/* // NEW - show real overall and per-photo queue progress instead of only a spinner. */}
        {activeUpload && (
          <Card className={activeUpload.syncStatus === "failed" ? "border-red-300" : "border-blue-300"}>
            <CardHeader>
              <CardTitle className="text-base">
                {activeUpload.syncStatus === "failed"
                  ? "Upload failed"
                  : activeUpload.syncStatus === "uploaded"
                    ? "Lead received successfully"
                    : `Uploading photo ${Math.min((queueProgress?.currentPhotoIndex ?? activeUpload.currentPhotoIndex ?? 0) + 1, activeUpload.totalPhotos ?? 0)} of ${activeUpload.totalPhotos ?? 0}`}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Attempt {queueProgress?.attemptCount ?? activeUpload.attemptCount ?? 1} of 4</span>
                <span>{queueProgress?.overallProgress ?? activeUpload.uploadProgress ?? 0}%</span>
              </div>
              <Progress value={queueProgress?.overallProgress ?? activeUpload.uploadProgress ?? 0} className="h-2" />
              {getQueuedPhotos(activeUpload).map((photo, index) => (
                <div key={`${photo.label}-${index}`} className="space-y-1">
                  <div className="flex justify-between text-xs"><span>{photo.label}</span><span>{queueProgress?.perPhotoProgress[index] ?? activeUpload.perPhotoProgress?.[index] ?? 0}%</span></div>
                  <Progress value={queueProgress?.perPhotoProgress[index] ?? activeUpload.perPhotoProgress?.[index] ?? 0} className="h-1.5" />
                </div>
              ))}
              {activeUpload.failReason && <p className="text-sm text-red-600">{activeUpload.failReason}</p>}
              {activeUpload.syncStatus === "failed" && (
                <Button onClick={() => void handleRetryUpload()} disabled={isSubmitting} className="w-full">
                  <RefreshCw className="w-4 h-4 mr-2" /> Retry upload
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-3 sticky bottom-20 bg-gray-50 dark:bg-gray-950 py-3">
          <Button
            variant="outline"
            size="lg"
            className="h-14"
            onClick={handleSaveDraft}
            disabled={isSaving || isSubmitting}
          >
            {isSaving ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <Save className="w-5 h-5 mr-2" />
            )}
            {isSaving ? "Saving…" : "Save Draft"}
          </Button>

          <Button
            size="lg"
            className="h-14"
            onClick={handleSubmit}
            disabled={isSubmitting || isSaving}
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : mandatoryPhotosComplete ? (
              <Check className="w-5 h-5 mr-2" />
            ) : (
              <Send className="w-5 h-5 mr-2" />
            )}
            {isSubmitting ? "Submitting…" : "Submit Lead"}
          </Button>
        </div>
      </div>

      {/* // NEW - require an explicit same-site or different-site decision from the Driver. */}
      <Dialog open={Boolean(duplicateLead)} onOpenChange={(open) => { if (!open) setDuplicateLead(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" /> Possible duplicate lead
            </DialogTitle>
            <DialogDescription>
              An approved lead already exists {duplicateLead ? `${duplicateLead.distanceMeters.toFixed(1)} meters` : "nearby"} from this GPS location.
            </DialogDescription>
          </DialogHeader>
          {duplicateLead && (
            <div className="space-y-3">
              {duplicateLead.photoUrl ? (
                <img src={duplicateLead.photoUrl} alt="Existing approved lead" className="w-full h-48 object-cover rounded-lg border" />
              ) : (
                <div className="h-32 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500">No existing photo</div>
              )}
              <div className="rounded-lg border p-3 text-sm space-y-1">
                <p className="font-semibold">{duplicateLead.projectName || duplicateLead.siteName || duplicateLead.plotNumber || "Existing approved lead"}</p>
                <p>Phase: {duplicateLead.phase}</p>
                <p>GPS: {Number(duplicateLead.locationLat).toFixed(6)}, {Number(duplicateLead.locationLng).toFixed(6)}</p>
                <p>Submitted: {duplicateLead.createdAt ? new Date(duplicateLead.createdAt).toLocaleString() : "N/A"}</p>
                <p>Driver: {duplicateLead.driverName || "Unknown Driver"}</p>
              </div>
            </div>
          )}
          <DialogFooter className="sm:justify-between gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                // CHANGED - remove the persisted same-site queue entry before leaving.
                if (duplicateQueueId) await deleteDraft(duplicateQueueId);
                setDuplicateLead(null);
                setDuplicateQueueId(null);
                navigate("/driver/home");
              }}
            >
              Same site — Cancel
            </Button>
            <Button
              onClick={async () => {
                setDuplicateLead(null);
                // CHANGED - resume the same queue entry after a race-time duplicate decision.
                if (duplicateQueueId) {
                  await updateDraftUploadState(duplicateQueueId, { submitAsDifferentSite: true, syncStatus: "pending" });
                  const draft = await getDraft(duplicateQueueId);
                  setDuplicateQueueId(null);
                  if (draft) await uploadDraft({ ...draft, submitAsDifferentSite: true });
                } else {
                  await submitLead(true);
                }
              }}
            >
              Different site — Submit anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
