import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
// NEW - pause offline synchronization for the required duplicate decision.
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import {
  RefreshCw,
  Wifi,
  WifiOff,
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  Camera,
  Upload,
  RotateCcw,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  getAllDrafts,
  updateDraftStatus,
  deleteDraft,
  clearReceivedDrafts,
  getDraft,
  resetInterruptedUploads,
  updateDraftUploadState,
  type StoredDraft,
} from "../../lib/drafts-db";
import { useOnlineStatus } from "../../lib/useOnlineStatus";
// CHANGED - include duplicate precheck, structured errors, and shared lead details.
import { checkNearbyApprovedLead, ApiError, type NearbyLead } from "../../lib/api";
// NEW - replace direct concurrent-style uploads with the shared serial persistent processor.
import { getQueuedPhotos, uploadQueuedLead, type QueueProgress } from "../../lib/upload-queue";

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return diffMin <= 1 ? "Just now" : `${diffMin} min ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} hour${diffH > 1 ? "s" : ""} ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD} day${diffD > 1 ? "s" : ""} ago`;
}

function photoCount(draft: StoredDraft): number {
  return (
    draft.photos.billboard.length +
    draft.photos.front.length +
    draft.photos.side.length +
    draft.photos.contractorBoard.length
  );
}

// CHANGED - allow only an explicit Driver decision to mark an offline draft as a different site.
function buildFormData(draft: StoredDraft, submitAsDifferentSite = false): FormData {
  const fd = new FormData();
  if (draft.cityId) fd.append("cityId", draft.cityId);

  const phaseMap: Record<string, string> = {
    "Just Digging Started": "just_digging_started",
    "Foundation Phase": "foundation_phase",
    "First Floor Starting": "first_floor_starting",
    "Other": "other",
  };
  fd.append("phase", phaseMap[draft.fields.constructionPhase] ?? "other");

  fd.append("locationLat", String(draft.location?.lat ?? 0));
  fd.append("locationLng", String(draft.location?.lng ?? 0));
  // NEW - persist the Driver's duplicate override when the paused draft resumes.
  if (submitAsDifferentSite) fd.append("submitAsDifferentSite", "true");

  const f = draft.fields;
  if (f.siteName)        fd.append("siteName",         f.siteName);
  if (f.plotNumber)      fd.append("plotNumber",        f.plotNumber);
  if (f.nearestLandmark) fd.append("nearestLandmark",   f.nearestLandmark);
  if (f.ownerName)       fd.append("ownerName",         f.ownerName);
  if (f.contractorName)  fd.append("contractorName",    f.contractorName);
  if (f.phoneNumber)     fd.append("phoneNumber",       f.phoneNumber);
  if (f.projectName)     fd.append("projectName",       f.projectName);
  if (f.engineerName)    fd.append("engineerName",      f.engineerName);
  if (f.notes)           fd.append("notes",             f.notes);

  if (draft.assignment?.streetId)  fd.append("streetId",  draft.assignment.streetId);
  if (draft.assignment?.districtId) fd.append("districtId", draft.assignment.districtId);
  if (draft.assignment?.zoneId)    fd.append("zoneId",    draft.assignment.zoneId);

  // Photos — field names match backend multer config exactly
  draft.photos.billboard.forEach((blob, i) =>
    fd.append("billboard", new File([blob], `billboard_${i}.jpg`, { type: blob.type || "image/jpeg" }))
  );
  draft.photos.front.forEach((blob, i) =>
    fd.append("front", new File([blob], `front_${i}.jpg`, { type: blob.type || "image/jpeg" }))
  );
  draft.photos.side.forEach((blob, i) =>
    fd.append("side", new File([blob], `side_${i}.jpg`, { type: blob.type || "image/jpeg" }))
  );
  draft.photos.contractorBoard.forEach((blob, i) =>
    fd.append("contractor_board", new File([blob], `contractor_board_${i}.jpg`, { type: blob.type || "image/jpeg" }))
  );

  return fd;
}

// ── Status badge ─────────────────────────────────────────────────────────────

// CHANGED - display every persisted queue state including retries and duplicate pauses.
type DisplayStatus = "pending" | "uploading" | "retrying" | "uploaded" | "failed" | "duplicate_review";

function StatusBadge({ status }: { status: DisplayStatus }) {
  if (status === "uploaded") {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900 dark:text-green-300 dark:border-green-800 gap-1">
        {/* // CHANGED - label only server-confirmed HTTP 200 entries as received. */}
        <CheckCircle2 className="w-3 h-3" /> Received
      </Badge>
    );
  }
  if (status === "uploading") {
    return (
      <Badge className="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-800 gap-1">
        <Loader2 className="w-3 h-3 animate-spin" /> Uploading…
      </Badge>
    );
  }
  // NEW - distinguish automatic retry and duplicate-decision pauses in the queue list.
  if (status === "retrying") {
    return <Badge className="bg-blue-100 text-blue-700 border-blue-200 gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Retrying</Badge>;
  }
  if (status === "duplicate_review") {
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1"><AlertCircle className="w-3 h-3" /> Decision needed</Badge>;
  }
  if (status === "failed") {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900 dark:text-red-300 dark:border-red-800 gap-1">
        <AlertCircle className="w-3 h-3" /> Failed
      </Badge>
    );
  }
  return (
    <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-300 dark:border-yellow-800 gap-1">
      <Clock className="w-3 h-3" /> Pending
    </Badge>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function OfflineSync() {
  const isOnline = useOnlineStatus();
  const [drafts, setDrafts] = useState<StoredDraft[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);
  const [localStatus, setLocalStatus] = useState<Record<string, DisplayStatus>>({});
  // NEW - retain the paused draft and nearest approved lead until the Driver decides.
  const [duplicateDraft, setDuplicateDraft] = useState<StoredDraft | null>(null);
  const [duplicateLead, setDuplicateLead] = useState<NearbyLead | null>(null);

  const loadDrafts = useCallback(async () => {
    const all = await getAllDrafts();
    setDrafts(all);
  }, []);

  // CHANGED - recover refresh-interrupted entries before displaying the persistent queue.
  useEffect(() => { void resetInterruptedUploads().then(loadDrafts); }, [loadDrafts]);

  const handleSyncAll = useCallback(async () => {
    if (!isOnline || isSyncing || syncingRef.current) return;
    syncingRef.current = true;
    const pending = drafts.filter(
      // CHANGED - failed entries wait for the explicit manual Retry button.
      d => d.syncStatus === "pending"
    );
    if (!pending.length) { toast.info("Nothing to sync."); return; }

    setIsSyncing(true);

    for (const draft of pending) {
      // Mark uploading
      setLocalStatus(prev => ({ ...prev, [draft.id]: "uploading" }));
      await updateDraftStatus(draft.id, "uploading");

      try {
        // NEW - stop automatic sync before upload when an approved lead is within 100 meters.
        if (draft.location) {
          const duplicateResult = await checkNearbyApprovedLead(draft.location.lat, draft.location.lng);
          if (duplicateResult.nearbyLead) {
            await updateDraftStatus(draft.id, "duplicate_review");
            setLocalStatus(prev => ({ ...prev, [draft.id]: "duplicate_review" }));
            setDuplicateDraft(draft);
            setDuplicateLead(duplicateResult.nearbyLead);
            break;
          }
        }
        // CHANGED - use the shared retrying uploader and real byte progress.
        const result = await uploadQueuedLead(draft, {
          onProgress: (queuedDraft, progress: QueueProgress) => {
            setLocalStatus(prev => ({ ...prev, [queuedDraft.id]: progress.status as DisplayStatus }));
            setDrafts(prev => prev.map(item => item.id === queuedDraft.id ? {
              ...item,
              syncStatus: progress.status,
              uploadProgress: progress.overallProgress,
              perPhotoProgress: progress.perPhotoProgress,
              currentPhotoIndex: progress.currentPhotoIndex,
              attemptCount: progress.attemptCount,
            } : item));
          },
          onDuplicate: (queuedDraft, nearbyLead) => {
            setDuplicateDraft(queuedDraft);
            setDuplicateLead(nearbyLead);
          },
        });
        if (result.status === "failed") throw new Error(result.error);
        if (result.status === "duplicate_review") break;
        // CHANGED - HTTP 200 marks the retained queue entry as received.
        // CHANGED - keep the lightweight received entry until the Driver clears it.
        setLocalStatus(prev => ({ ...prev, [draft.id]: "uploaded" }));
      } catch (err) {
        // NEW - surface a race-time server duplicate response instead of silently failing the draft.
        if (err instanceof ApiError && err.data.code === "DUPLICATE_CONFIRMATION_REQUIRED" && err.data.nearbyLead) {
          await updateDraftStatus(draft.id, "duplicate_review");
          setLocalStatus(prev => ({ ...prev, [draft.id]: "duplicate_review" }));
          setDuplicateDraft(draft);
          setDuplicateLead(err.data.nearbyLead as NearbyLead);
          break;
        }
        const reason = err instanceof Error ? err.message : "Upload failed";
        await updateDraftStatus(draft.id, "failed", reason);
        setLocalStatus(prev => ({ ...prev, [draft.id]: "failed" }));
      }
    }

    await loadDrafts();
    setIsSyncing(false);
    syncingRef.current = false;
    toast.success("Upload queue processed.");
  }, [isOnline, isSyncing, drafts, loadDrafts]);

  // Auto-sync when connection is restored
  useEffect(() => {
    if (isOnline && drafts.some(d => d.syncStatus === "pending")) {
      toast.success("Connection restored — syncing drafts…");
      handleSyncAll();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  const getStatus = (d: StoredDraft): DisplayStatus =>
    (localStatus[d.id] as DisplayStatus) ?? (d.syncStatus as DisplayStatus);

  const pendingCount = drafts.filter(
    d => getStatus(d) === "pending"
  ).length;
  const uploadedCount = drafts.filter(d => getStatus(d) === "uploaded").length;
  const totalCount = drafts.length;
  const progressPct = totalCount > 0 ? Math.round((uploadedCount / totalCount) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Offline Sync</h1>
            <p className="text-blue-100 text-sm">Draft leads waiting to upload</p>
          </div>
          {isOnline ? (
            <Wifi className="w-7 h-7 text-green-300" />
          ) : (
            <WifiOff className="w-7 h-7 text-red-300" />
          )}
        </div>
      </div>

      {/* Offline banner */}
      {!isOnline && (
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex items-center gap-3">
          <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">أنت غير متصل بالإنترنت</p>
            <p className="text-xs text-amber-700 dark:text-amber-300">You are offline — drafts will sync automatically when connection is restored</p>
          </div>
        </div>
      )}

      {/* Network status card */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${isOnline ? "bg-green-100 dark:bg-green-900" : "bg-red-100 dark:bg-red-900"}`}>
              {isOnline
                ? <Wifi className="w-6 h-6 text-green-600 dark:text-green-400" />
                : <WifiOff className="w-6 h-6 text-red-600 dark:text-red-400" />}
            </div>
            <div>
              <p className={`font-semibold ${isOnline ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                {isOnline ? "Online — Ready to sync" : "Offline — Will sync when connected"}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {isOnline
                  ? "Tap Sync All to upload your drafts now."
                  : "Drafts are saved locally and will upload automatically."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sync queue */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">Sync Queue</p>
              <p className="text-sm text-gray-500">
                {pendingCount} pending · {uploadedCount} received
              </p>
            </div>
            <Badge
              variant="secondary"
              className={pendingCount === 0 ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}
            >
              {pendingCount === 0 ? "All synced" : `${pendingCount} pending`}
            </Badge>
          </div>

          {(isSyncing || uploadedCount > 0) && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{uploadedCount} of {totalCount} received</span>
                <span className="font-semibold text-gray-900 dark:text-white">{progressPct}%</span>
              </div>
              <Progress value={progressPct} className="h-2" />
            </div>
          )}

          <Button
            onClick={handleSyncAll}
            disabled={!isOnline || isSyncing || pendingCount === 0}
            className="w-full h-14 text-base font-semibold"
            size="lg"
          >
            {isSyncing
              ? <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              : <Upload className="w-5 h-5 mr-2" />}
            {isSyncing ? "Uploading…" : "Sync All"}
          </Button>
        </CardContent>
      </Card>

      {/* Draft list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-blue-600" />
            Draft Leads
            <Badge variant="secondary" className="ml-auto">{totalCount}</Badge>
            {/* // NEW - received history remains until the Driver explicitly clears it. */}
            {uploadedCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => { await clearReceivedDrafts(); await loadDrafts(); }}
              >
                Clear received
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {totalCount === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">No drafts saved</p>
              <p className="text-sm mt-1">Leads saved offline will appear here</p>
            </div>
          ) : (
            drafts.map((draft) => {
              const status = getStatus(draft);
              // CHANGED - received entries keep their original photo count after blobs are released.
              const pics = draft.totalPhotos ?? photoCount(draft);
              const displayName = draft.fields.siteName || draft.fields.plotNumber || "Unnamed site";
              const streetLine = draft.assignment?.streetName
                || draft.location?.street
                || draft.location?.district
                || "Unknown location";

              return (
                <div
                  key={draft.id}
                  className={`p-4 rounded-xl border transition-all ${
                    status === "uploaded"
                      ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800"
                      : status === "uploading"
                      ? "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800"
                      : status === "failed"
                      ? "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800"
                      : "bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white truncate">{displayName}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{streetLine}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />{timeAgo(draft.savedAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Camera className="w-3 h-3" />{pics} photo{pics !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {status === "failed" && draft.failReason && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1 whitespace-pre-wrap break-words">
                          {draft.failReason}
                        </p>
                      )}
                      {/* // NEW - show real overall and individual photo progress for the active queue entry. */}
                      {(status === "uploading" || status === "retrying") && (
                        <div className="mt-3 space-y-2">
                          <div className="flex justify-between text-xs font-medium">
                            <span>Uploading photo {Math.min((draft.currentPhotoIndex ?? 0) + 1, pics)} of {pics}</span>
                            <span>{draft.uploadProgress ?? 0}%</span>
                          </div>
                          <Progress value={draft.uploadProgress ?? 0} className="h-2" />
                          {getQueuedPhotos(draft).map((photo, index) => (
                            <div key={`${photo.label}-${index}`} className="space-y-1">
                              <div className="flex justify-between text-[11px]"><span>{photo.label}</span><span>{draft.perPhotoProgress?.[index] ?? 0}%</span></div>
                              <Progress value={draft.perPhotoProgress?.[index] ?? 0} className="h-1" />
                            </div>
                          ))}
                          <p className="text-[11px] text-gray-500">Attempt {draft.attemptCount ?? 1} of 4</p>
                        </div>
                      )}
                      {/* // NEW - show the server confirmation retained in IndexedDB. */}
                      {status === "uploaded" && (
                        <p className="text-xs text-green-600 mt-2">Lead received successfully{draft.serverLeadId ? ` · ID ${draft.serverLeadId.slice(0, 8)}` : ""}</p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <StatusBadge status={status} />
                      {status === "failed" && isOnline && !draft.failReason?.includes("please contact support") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-red-300 text-red-600 hover:bg-red-50"
                          disabled={isSyncing}
                          onClick={async () => {
                            const cycles = (draft.totalAttemptCycles ?? 0) + 1;
                            if (cycles > 5) {
                              toast.error("Upload failed after 5 attempts — please contact support.");
                              return;
                            }
                            // CHANGED - lock the queue so manual retries cannot overlap another lead upload.
                            setIsSyncing(true);
                            setLocalStatus(prev => ({ ...prev, [draft.id]: "uploading" }));
                            await updateDraftStatus(draft.id, "uploading");
                            try {
                              // NEW - retry uses the same mandatory duplicate precheck as automatic sync.
                              if (draft.location) {
                                const duplicateResult = await checkNearbyApprovedLead(draft.location.lat, draft.location.lng);
                                if (duplicateResult.nearbyLead) {
                                  await updateDraftStatus(draft.id, "duplicate_review");
                                  setLocalStatus(prev => ({ ...prev, [draft.id]: "duplicate_review" }));
                                  setDuplicateDraft(draft);
                                  setDuplicateLead(duplicateResult.nearbyLead);
                                  setIsSyncing(false);
                                  return;
                                }
                              }
                              // CHANGED - manual Retry starts a fresh four-attempt queue cycle and retains confirmation history.
                              await updateDraftUploadState(draft.id, { syncStatus: "pending", attemptCount: 0, failReason: undefined, totalAttemptCycles: cycles });
                              const retryDraft = await getDraft(draft.id);
                              if (!retryDraft) throw new Error("Queued lead not found");
                              const retryResult = await uploadQueuedLead(retryDraft, {
                                onProgress: (queuedDraft, progress) => {
                                  setLocalStatus(prev => ({ ...prev, [queuedDraft.id]: progress.status as DisplayStatus }));
                                  setDrafts(prev => prev.map(item => item.id === queuedDraft.id ? { ...item, syncStatus: progress.status, uploadProgress: progress.overallProgress, perPhotoProgress: progress.perPhotoProgress, currentPhotoIndex: progress.currentPhotoIndex, attemptCount: progress.attemptCount } : item));
                                },
                                onDuplicate: (queuedDraft, nearbyLead) => { setDuplicateDraft(queuedDraft); setDuplicateLead(nearbyLead); },
                              });
                              if (retryResult.status === "failed") throw new Error(retryResult.error);
                              if (retryResult.status === "duplicate_review") {
                                setIsSyncing(false);
                                await loadDrafts();
                                return;
                              }
                              setLocalStatus(prev => ({ ...prev, [draft.id]: "uploaded" }));
                              await loadDrafts();
                              setIsSyncing(false);
                            } catch (err) {
                              // NEW - show a server race-time duplicate warning during manual retry.
                              if (err instanceof ApiError && err.data.code === "DUPLICATE_CONFIRMATION_REQUIRED" && err.data.nearbyLead) {
                                await updateDraftStatus(draft.id, "duplicate_review");
                                setLocalStatus(prev => ({ ...prev, [draft.id]: "duplicate_review" }));
                                setDuplicateDraft(draft);
                                setDuplicateLead(err.data.nearbyLead as NearbyLead);
                                setIsSyncing(false);
                                return;
                              }
                              const reason = cycles >= 5
                                ? "Upload failed after 5 attempts — please contact support."
                                : err instanceof Error ? err.message : "Failed";
                              await updateDraftStatus(draft.id, "failed", reason);
                              setLocalStatus(prev => ({ ...prev, [draft.id]: "failed" }));
                              await loadDrafts();
                              setIsSyncing(false);
                            }
                          }}
                        >
                          <RotateCcw className="w-3 h-3 mr-1" /> Retry
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* // NEW - pause the draft until the Driver identifies it as the same or a different site. */}
      <Dialog open={Boolean(duplicateDraft && duplicateLead)} onOpenChange={(open) => { if (!open) { setDuplicateDraft(null); setDuplicateLead(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertCircle className="w-5 h-5" /> Possible duplicate draft
            </DialogTitle>
            <DialogDescription>
              This draft is {duplicateLead ? `${duplicateLead.distanceMeters.toFixed(1)} meters` : "within 100 meters"} from an approved lead.
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
                if (!duplicateDraft) return;
                await deleteDraft(duplicateDraft.id);
                setDuplicateDraft(null);
                setDuplicateLead(null);
                await loadDrafts();
                toast.info("Same-site draft cancelled.");
              }}
            >
              Same site — Cancel
            </Button>
            <Button
              disabled={isSyncing}
              onClick={async () => {
                if (!duplicateDraft) return;
                setIsSyncing(true);
                try {
                  // CHANGED - resume the same queue entry with the Driver's persisted different-site decision.
                  await updateDraftUploadState(duplicateDraft.id, { submitAsDifferentSite: true, syncStatus: "pending", attemptCount: 0 });
                  const resumedDraft = await getDraft(duplicateDraft.id);
                  if (!resumedDraft) throw new Error("Queued lead not found");
                  const resumedResult = await uploadQueuedLead({ ...resumedDraft, submitAsDifferentSite: true });
                  if (resumedResult.status === "failed") throw new Error(resumedResult.error);
                  setDuplicateDraft(null);
                  setDuplicateLead(null);
                  await loadDrafts();
                  // CHANGED - confirm receipt only after the server returns HTTP 200.
                  toast.success("Lead received successfully");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Upload failed");
                } finally {
                  setIsSyncing(false);
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
