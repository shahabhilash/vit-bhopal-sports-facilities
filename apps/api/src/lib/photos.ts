import { createClient } from "@supabase/supabase-js";
import { MAX_PHOTO_BYTES } from "@vitb/shared";
import type { Config } from "../config";

export const PHOTO_BUCKET = "feedback-photos";

/** Private object storage for issue photos. Only the API (service role) touches it. */
export interface PhotoStore {
  put(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  signedUrl(path: string, expiresInSeconds: number): Promise<string>;
  remove(path: string): Promise<void>;
  /** Stored photos that no report references (older than a day). */
  findOrphans(limit: number): Promise<string[]>;
}

/** Deletes orphaned issue photos in batches. Safe to run on several instances at once. */
export async function cleanupOrphanPhotos(store: PhotoStore, batch = 100): Promise<number> {
  let removed = 0;
  for (let round = 0; round < 10; round++) {
    const orphans = await store.findOrphans(batch);
    if (orphans.length === 0) break;
    for (const path of orphans) {
      await store.remove(path);
      removed += 1;
    }
    if (orphans.length < batch) break;
  }
  return removed;
}

export type SniffedImage = { type: "image/jpeg"; ext: "jpg" } | { type: "image/png"; ext: "png" } | { type: "image/webp"; ext: "webp" };

/**
 * Identifies JPEG, PNG and WebP from their leading bytes. The declared MIME
 * type and file name are ignored; anything else (HTML, SVG, executables,
 * HEIC) is rejected.
 */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  const at = (i: number) => bytes[i];
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return { type: "image/jpeg", ext: "jpg" };
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => at(i) === b)) return { type: "image/png", ext: "png" };
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { type: "image/webp", ext: "webp" };
  return null;
}

export function photoTooLarge(size: number): boolean {
  return size > MAX_PHOTO_BYTES;
}

/** Supabase Storage with the service-role key, or null when it is not configured. */
export function createSupabasePhotoStore(config: Pick<Config, "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY">): PhotoStore | null {
  if (!config.SUPABASE_SERVICE_ROLE_KEY) return null;
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const bucket = () => client.storage.from(PHOTO_BUCKET);

  return {
    async put(path, bytes, contentType) {
      const { error } = await bucket().upload(path, bytes, { contentType, upsert: false, cacheControl: "private, max-age=0" });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);
    },
    async signedUrl(path, expiresInSeconds) {
      const { data, error } = await bucket().createSignedUrl(path, expiresInSeconds);
      if (error || !data) throw new Error(`Storage signing failed: ${error?.message ?? "no URL"}`);
      return data.signedUrl;
    },
    async remove(path) {
      await bucket().remove([path]);
    },
    async findOrphans(limit) {
      const { data, error } = await client.rpc("orphan_feedback_photos", { p_limit: limit });
      if (error) throw new Error(`Orphan lookup failed: ${error.message}`);
      return (data as string[] | null) ?? [];
    },
  };
}
