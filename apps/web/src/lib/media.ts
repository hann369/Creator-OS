import { supabase } from './supabase.js';

// ─────────────────────────────────────────────────────────────────────────────
// Course media — the SINGLE seam between the app and wherever bytes physically
// live. Everything below uploads DIRECT from the browser to Supabase Storage
// (never through our API server, which has small payload + short time limits),
// and reads back through short-lived signed URLs.
//
// This isolation is deliberate: when a creator's library grows into the hundreds
// of GB, only THIS file changes to swap in resumable (tus) uploads for very large
// video or a CDN/streaming provider (Mux, Cloudflare Stream). Blocks keep storing
// just a `path`, so the schema, hooks and views never have to change.
// ─────────────────────────────────────────────────────────────────────────────

export const COURSE_MEDIA_BUCKET = 'course-media';

/**
 * Files at or above this size should move to a resumable/streaming upload path.
 * The standard Storage upload is fine for images/PDFs and short clips; large
 * video is the future tus/Mux seam. We surface it as a soft warning rather than
 * a hard block so nothing breaks before that upgrade lands.
 */
export const LARGE_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

export interface UploadedMedia {
  path: string;        // Storage object path — what the block stores
  mime: string;
  sizeBytes: number;
}

const extOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin';
};

/**
 * Upload one file for a course. Path convention: `{uid}/{courseId}/{uuid}.{ext}`
 * — the leading `{uid}` segment matches the Storage RLS owner policy, and keeps
 * every creator's media in an isolated prefix.
 */
export async function uploadCourseMedia(courseId: string, file: File): Promise<UploadedMedia> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error('Not signed in — cannot upload media.');

  if (file.size >= LARGE_FILE_BYTES) {
    // Not fatal today: standard upload still works. Flags the tus/CDN upgrade point.
    console.warn(`[media] ${file.name} is ${(file.size / 1e6).toFixed(0)}MB — large files should move to resumable upload.`);
  }

  const path = `${uid}/${courseId}/${crypto.randomUUID()}.${extOf(file.name)}`;
  const { error } = await supabase.storage
    .from(COURSE_MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;

  return { path, mime: file.type || 'application/octet-stream', sizeBytes: file.size };
}

/**
 * Short-lived signed URL for a private course-media object. Used by the builder
 * preview (and, in Phase 2, by the entitled buyer viewer). Returns null on error
 * so callers can degrade gracefully instead of throwing in render.
 */
export async function signedMediaUrl(path: string, expiresIn = 3600): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(COURSE_MEDIA_BUCKET)
    .createSignedUrl(path, expiresIn);
  return error ? null : data?.signedUrl ?? null;
}

/** Remove a media object (best-effort; called when a media block is deleted/replaced). */
export async function removeCourseMedia(path: string): Promise<void> {
  if (!path) return;
  await supabase.storage.from(COURSE_MEDIA_BUCKET).remove([path]).catch(() => {});
}
