import type { PhotoStore } from "../../src/lib/photos";

/** In-memory stand-in for the private photo bucket (tests and the local demo only). */
export function memoryPhotoStore(): PhotoStore & { objects: Map<string, { bytes: Uint8Array; contentType: string }> } {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  return {
    objects,
    async put(path, bytes, contentType) {
      if (objects.has(path)) throw new Error("object exists");
      objects.set(path, { bytes, contentType });
    },
    async signedUrl(path, expiresInSeconds) {
      if (!objects.has(path)) throw new Error("not found");
      return `https://storage.local/${encodeURIComponent(path)}?expires=${expiresInSeconds}`;
    },
    async remove(path) {
      objects.delete(path);
    },
  };
}
