import multer from "multer";
import path from "path";
import { StorageClient } from "@supabase/storage-js";
import { env } from "../config/env";

// ── Supabase Storage client (service role — server-side only) ────────────────
const storageClient = new StorageClient(`${env.SUPABASE_URL}/storage/v1`, {
  apikey: env.SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
});

const bucket = storageClient.from(env.SUPABASE_STORAGE_BUCKET);

// ── Multer — memory storage (no disk writes) ────────────────────────────────
// Files are held in req.file.buffer and then streamed to Supabase.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"];
    const allowedExts = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif"];
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = allowedMimes.includes(file.mimetype) && (ext === "" || allowedExts.includes(ext));
    if (!ok) console.warn(`[upload] Rejected file: mimetype=${file.mimetype} ext=${ext} name=${file.originalname}`);
    cb(null, ok);
  },
});

// ── Upload a single file to Supabase Storage ─────────────────────────────────
/**
 * Uploads one multer in-memory file to the Supabase bucket and returns its
 * permanent public URL. Throws on upload failure so the caller can surface
 * the error via the route's error handler.
 *
 * Path inside bucket:  uploads/<timestamp>-<random>.<ext>
 */
export async function uploadFile(file: Express.Multer.File): Promise<string> {
  const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
  const filename = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const contentType = file.mimetype === "application/octet-stream" ? "image/jpeg" : file.mimetype;

  console.log(`[upload] Uploading ${filename} (${contentType}, ${file.size} bytes)`);

  const { error } = await bucket.upload(filename, file.buffer, {
    contentType,
    upsert: false,
  });

  if (error) {
    console.error(`[upload] Supabase upload failed:`, error);
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  const { data } = bucket.getPublicUrl(filename);
  console.log(`[upload] Uploaded OK → ${data.publicUrl}`);
  return data.publicUrl;
}

// ── Upload multiple files from a multer fields() result ──────────────────────
/**
 * Convenience helper: upload every file in a multer `fields()` result map
 * and return a flat array of { photoType, storageUrl } objects ready to
 * insert into lead_photos.
 */
export async function uploadPhotoFields(
  files: Record<string, Express.Multer.File[]>,
): Promise<{ photoType: string; storageUrl: string }[]> {
  const results: { photoType: string; storageUrl: string }[] = [];

  for (const [photoType, fileList] of Object.entries(files)) {
    for (const file of fileList) {
      const storageUrl = await uploadFile(file);
      results.push({ photoType, storageUrl });
    }
  }

  return results;
}

// ── Delete files from Supabase Storage by their public URLs ──────────────────
export async function deleteFilesByUrls(storageUrls: string[]): Promise<void> {
  if (!storageUrls.length) return;
  const urlPrefix = `${env.SUPABASE_URL}/storage/v1/object/public/${env.SUPABASE_STORAGE_BUCKET}/`;
  const paths = storageUrls
    .filter(u => u.startsWith(urlPrefix))
    .map(u => u.slice(urlPrefix.length));
  if (!paths.length) return;
  const { error } = await bucket.remove(paths);
  if (error) console.error("[upload] Supabase delete failed:", error);
}
