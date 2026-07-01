// NEW - centralize persistent, serial lead upload behavior for Lead Form and Offline Sync.
import { ApiError, checkNearbyApprovedLead, createLead, type NearbyLead } from "./api";
import {
  getAllDrafts,
  markDraftReceived,
  updateDraftUploadState,
  type StoredDraft,
} from "./drafts-db";

// NEW - expose queue progress and duplicate pauses without coupling the processor to one screen.
export type QueueProgress = {
  overallProgress: number;
  perPhotoProgress: number[];
  currentPhotoIndex: number | null;
  attemptCount: number;
  status: StoredDraft["syncStatus"];
};

export type QueueUploadResult =
  | { status: "received"; serverLeadId: string }
  | { status: "failed"; error: string }
  | { status: "duplicate_review"; nearbyLead: NearbyLead };

type QueueCallbacks = {
  onProgress?: (draft: StoredDraft, progress: QueueProgress) => void;
  onDuplicate?: (draft: StoredDraft, nearbyLead: NearbyLead) => void;
};

// NEW - preserve the exact existing multipart field names while adding the idempotency key.
export function buildFormData(draft: StoredDraft): FormData {
  const fd = new FormData();
  fd.append("clientSubmissionId", draft.id);
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
  if (draft.location?.accuracy !== undefined) fd.append("gpsAccuracyMeters", String(draft.location.accuracy));
  if (draft.submitAsDifferentSite) fd.append("submitAsDifferentSite", "true");

  const fields = draft.fields;
  if (fields.siteName) fd.append("siteName", fields.siteName);
  if (fields.plotNumber) fd.append("plotNumber", fields.plotNumber);
  if (fields.nearestLandmark) fd.append("nearestLandmark", fields.nearestLandmark);
  if (fields.ownerName) fd.append("ownerName", fields.ownerName);
  if (fields.contractorName) fd.append("contractorName", fields.contractorName);
  if (fields.phoneNumber) fd.append("phoneNumber", fields.phoneNumber);
  if (fields.projectName) fd.append("projectName", fields.projectName);
  if (fields.engineerName) fd.append("engineerName", fields.engineerName);
  if (fields.notes) fd.append("notes", fields.notes);
  if (draft.assignment?.streetId) fd.append("streetId", draft.assignment.streetId);
  if (draft.assignment?.districtId) fd.append("districtId", draft.assignment.districtId);
  if (draft.assignment?.zoneId) fd.append("zoneId", draft.assignment.zoneId);

  draft.photos.billboard.forEach((blob, index) => fd.append("billboard", new File([blob], `billboard_${index}.jpg`, { type: blob.type || "image/jpeg" })));
  draft.photos.front.forEach((blob, index) => fd.append("front", new File([blob], `front_${index}.jpg`, { type: blob.type || "image/jpeg" })));
  draft.photos.side.forEach((blob, index) => fd.append("side", new File([blob], `side_${index}.jpg`, { type: blob.type || "image/jpeg" })));
  draft.photos.contractorBoard.forEach((blob, index) => fd.append("contractor_board", new File([blob], `contractor_board_${index}.jpg`, { type: blob.type || "image/jpeg" })));
  return fd;
}

// NEW - flatten photos in the same order used by FormData for byte-derived bars.
export function getQueuedPhotos(draft: StoredDraft): { label: string; size: number }[] {
  return [
    ...draft.photos.billboard.map((blob, index) => ({ label: `Billboard ${index + 1}`, size: blob.size })),
    ...draft.photos.front.map((blob, index) => ({ label: `Front ${index + 1}`, size: blob.size })),
    ...draft.photos.side.map((blob, index) => ({ label: `Side ${index + 1}`, size: blob.size })),
    ...draft.photos.contractorBoard.map((blob, index) => ({ label: `Contractor board ${index + 1}`, size: blob.size })),
  ];
}

// NEW - distribute real multipart byte progress over ordered photo sizes.
export function calculatePhotoProgress(draft: StoredDraft, loaded: number, total: number) {
  const photos = getQueuedPhotos(draft);
  if (!photos.length) return { overallProgress: total ? Math.min(100, loaded / total * 100) : 0, perPhotoProgress: [], currentPhotoIndex: null };
  const totalPhotoBytes = photos.reduce((sum, photo) => sum + Math.max(photo.size, 1), 0);
  const uploadedPhotoBytes = total > 0 ? Math.min(1, loaded / total) * totalPhotoBytes : 0;
  let consumed = 0;
  const perPhotoProgress = photos.map(photo => {
    const size = Math.max(photo.size, 1);
    const progress = Math.max(0, Math.min(100, (uploadedPhotoBytes - consumed) / size * 100));
    consumed += size;
    return Math.round(progress);
  });
  const firstIncomplete = perPhotoProgress.findIndex(progress => progress < 100);
  return {
    overallProgress: Math.round(total > 0 ? Math.min(100, loaded / total * 100) : 0),
    perPhotoProgress,
    currentPhotoIndex: firstIncomplete === -1 ? photos.length - 1 : firstIncomplete,
  };
}

// NEW - only transport, throttling, and server failures are safe for automatic retry.
function isRetryable(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500);
}

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

// NEW - upload one queue entry with one initial attempt and at most three automatic retries.
export async function uploadQueuedLead(draft: StoredDraft, callbacks: QueueCallbacks = {}): Promise<QueueUploadResult> {
  if (!draft.submitAsDifferentSite && draft.location) {
    const duplicateResult = await checkNearbyApprovedLead(draft.location.lat, draft.location.lng);
    if (duplicateResult.nearbyLead) {
      await updateDraftUploadState(draft.id, { syncStatus: "duplicate_review", currentPhotoIndex: null });
      callbacks.onDuplicate?.(draft, duplicateResult.nearbyLead);
      return { status: "duplicate_review", nearbyLead: duplicateResult.nearbyLead };
    }
  }

  const backoff = [0, 500, 1_000, 2_000];
  let finalError = "Upload failed";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    if (backoff[attempt - 1]) await wait(backoff[attempt - 1]);
    const status: StoredDraft["syncStatus"] = attempt === 1 ? "uploading" : "retrying";
    await updateDraftUploadState(draft.id, { syncStatus: status, attemptCount: attempt, failReason: undefined });
    callbacks.onProgress?.(draft, { overallProgress: 0, perPhotoProgress: Array(draft.totalPhotos ?? getQueuedPhotos(draft).length).fill(0), currentPhotoIndex: 0, attemptCount: attempt, status });

    let lastPersistedPercent = -1;
    try {
      const response = await createLead(buildFormData(draft), {
        onProgress: (loaded, total) => {
          const progress = calculatePhotoProgress(draft, loaded, total);
          callbacks.onProgress?.(draft, { ...progress, attemptCount: attempt, status });
          if (progress.overallProgress !== lastPersistedPercent) {
            lastPersistedPercent = progress.overallProgress;
            void updateDraftUploadState(draft.id, { ...progress, attemptCount: attempt, syncStatus: status });
          }
        },
      });
      if (response.confirmed !== true || !response.id) throw new ApiError(502, { error: "Server response did not confirm the lead" });
      await markDraftReceived(draft.id, String(response.id));
      callbacks.onProgress?.(draft, { overallProgress: 100, perPhotoProgress: Array(draft.totalPhotos ?? 0).fill(100), currentPhotoIndex: null, attemptCount: attempt, status: "uploaded" });
      return { status: "received", serverLeadId: String(response.id) };
    } catch (err) {
      if (err instanceof ApiError && err.data.code === "DUPLICATE_CONFIRMATION_REQUIRED" && err.data.nearbyLead) {
        const nearbyLead = err.data.nearbyLead as NearbyLead;
        await updateDraftUploadState(draft.id, { syncStatus: "duplicate_review", currentPhotoIndex: null, failReason: undefined });
        callbacks.onDuplicate?.(draft, nearbyLead);
        return { status: "duplicate_review", nearbyLead };
      }
      finalError = err instanceof Error ? err.message : "Upload failed";
      if (!isRetryable(err) || attempt === 4) break;
      await updateDraftUploadState(draft.id, { syncStatus: "retrying", failReason: finalError, attemptCount: attempt });
    }
  }

  await updateDraftUploadState(draft.id, { syncStatus: "failed", failReason: finalError, currentPhotoIndex: null });
  return { status: "failed", error: finalError };
}

let processorRunning = false;

// NEW - process pending leads oldest-first with a module-level single-flight guard.
export async function processUploadQueue(callbacks: QueueCallbacks = {}): Promise<void> {
  if (processorRunning) return;
  processorRunning = true;
  try {
    const drafts = (await getAllDrafts())
      .filter(draft => draft.syncStatus === "pending")
      .sort((a, b) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime());
    for (const draft of drafts) await uploadQueuedLead(draft, callbacks);
  } finally {
    processorRunning = false;
  }
}
