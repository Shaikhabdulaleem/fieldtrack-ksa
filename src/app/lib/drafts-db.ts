const DB_NAME = "fieldtrack_offline";
const DB_VERSION = 1;
const STORE = "lead_drafts";

export interface StoredDraft {
  id: string;
  savedAt: string;
  driverId: string;
  cityId: string | null;
  fields: {
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
  };
  location: {
    lat: number;
    lng: number;
    district: string;
    zone: string;
    street: string;
    city: string;
    // NEW - retain GPS accuracy when an online submission is persisted before upload.
    accuracy?: number;
  } | null;
  assignment: {
    streetId: string;
    districtId?: string;
    zoneId?: string;
    streetName: string;
    districtName: string;
  } | null;
  photos: {
    billboard: Blob[];
    front: Blob[];
    side: Blob[];
    contractorBoard: Blob[];
  };
  // CHANGED - persist every upload queue state across refreshes.
  syncStatus: "pending" | "uploading" | "retrying" | "uploaded" | "failed" | "duplicate_review";
  failReason?: string;
  // NEW - persistent byte-derived upload progress and retry metadata.
  uploadProgress?: number;
  perPhotoProgress?: number[];
  currentPhotoIndex?: number | null;
  attemptCount?: number;
  totalPhotos?: number;
  serverLeadId?: string;
  confirmedAt?: string;
  submitAsDifferentSite?: boolean;
  totalAttemptCycles?: number;
}

function openDraftsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("syncStatus", "syncStatus", { unique: false });
        store.createIndex("savedAt", "savedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function filesToBlobs(files: File[]): Promise<Blob[]> {
  return Promise.all(
    files.map(f => f.arrayBuffer().then(ab => new Blob([ab], { type: f.type })))
  );
}

export async function saveDraft(draft: Omit<StoredDraft, "syncStatus">): Promise<void> {
  const db = await openDraftsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    // CHANGED - initialize a durable queue entry before any upload begins.
    const totalPhotos = draft.photos.billboard.length + draft.photos.front.length + draft.photos.side.length + draft.photos.contractorBoard.length;
    tx.objectStore(STORE).put({
      ...draft,
      syncStatus: "pending",
      uploadProgress: 0,
      perPhotoProgress: Array(totalPhotos).fill(0),
      currentPhotoIndex: null,
      attemptCount: 0,
      totalPhotos,
    });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getAllDrafts(): Promise<StoredDraft[]> {
  const db = await openDraftsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      db.close();
      const all = (req.result as StoredDraft[]).sort(
        (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
      );
      resolve(all);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function getPendingCount(): Promise<number> {
  const all = await getAllDrafts();
  return all.filter(d => d.syncStatus === "pending" || d.syncStatus === "failed").length;
}

export async function updateDraftStatus(
  id: string,
  status: StoredDraft["syncStatus"],
  failReason?: string
): Promise<void> {
  const db = await openDraftsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const draft = getReq.result as StoredDraft | undefined;
      if (!draft) { db.close(); resolve(); return; }
      draft.syncStatus = status;
      if (failReason !== undefined) draft.failReason = failReason;
      else delete draft.failReason;
      store.put(draft);
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// NEW - update upload progress, retries, errors, or confirmation without replacing photo blobs.
export async function updateDraftUploadState(
  id: string,
  updates: Partial<Pick<StoredDraft,
    "syncStatus" | "failReason" | "uploadProgress" | "perPhotoProgress" | "currentPhotoIndex" |
    "attemptCount" | "serverLeadId" | "confirmedAt" | "submitAsDifferentSite"
  >>,
): Promise<StoredDraft | null> {
  const db = await openDraftsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    let updated: StoredDraft | null = null;
    getReq.onsuccess = () => {
      const draft = getReq.result as StoredDraft | undefined;
      if (!draft) return;
      updated = { ...draft, ...updates };
      store.put(updated);
    };
    tx.oncomplete = () => { db.close(); resolve(updated); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// NEW - load one queue entry for manual retry or duplicate resolution.
export async function getDraft(id: string): Promise<StoredDraft | null> {
  const db = await openDraftsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => { db.close(); resolve((req.result as StoredDraft | undefined) ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

// NEW - recover an upload interrupted by refresh without losing its queue position.
export async function resetInterruptedUploads(): Promise<void> {
  const drafts = await getAllDrafts();
  await Promise.all(drafts
    .filter(draft => draft.syncStatus === "uploading" || draft.syncStatus === "retrying")
    .map(draft => updateDraftUploadState(draft.id, {
      syncStatus: "pending",
      currentPhotoIndex: null,
      failReason: "Upload interrupted by refresh; ready to resume.",
    })));
}

// NEW - retain a lightweight received history entry while releasing large photo blobs.
export async function markDraftReceived(id: string, serverLeadId: string): Promise<void> {
  const db = await openDraftsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const draft = getReq.result as StoredDraft | undefined;
      if (!draft) return;
      // NEW - preserve photo count for queue entries created before upload metadata existed.
      const totalPhotos = draft.totalPhotos ?? (draft.photos.billboard.length + draft.photos.front.length + draft.photos.side.length + draft.photos.contractorBoard.length);
      draft.syncStatus = "uploaded";
      draft.uploadProgress = 100;
      draft.perPhotoProgress = Array(totalPhotos).fill(100);
      draft.totalPhotos = totalPhotos;
      draft.currentPhotoIndex = null;
      draft.serverLeadId = serverLeadId;
      draft.confirmedAt = new Date().toISOString();
      delete draft.failReason;
      draft.photos = { billboard: [], front: [], side: [], contractorBoard: [] };
      store.put(draft);
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// NEW - let the Driver remove only server-confirmed queue history.
export async function clearReceivedDrafts(): Promise<void> {
  const drafts = await getAllDrafts();
  await Promise.all(drafts.filter(draft => draft.syncStatus === "uploaded").map(draft => deleteDraft(draft.id)));
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await openDraftsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
