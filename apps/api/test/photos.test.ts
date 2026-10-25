import { describe, expect, it } from "vitest";
import { photoTooLarge, sniffImage } from "../src/lib/photos";

const bytes = (...xs: (number | string)[]) =>
  new Uint8Array(xs.flatMap((x) => (typeof x === "string" ? [...x].map((ch) => ch.charCodeAt(0)) : [x])));

describe("sniffImage", () => {
  it("recognises JPEG, PNG and WebP by their bytes", () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toEqual({ type: "image/jpeg", ext: "jpg" });
    expect(sniffImage(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0))).toEqual({ type: "image/png", ext: "png" });
    expect(sniffImage(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))).toEqual({ type: "image/webp", ext: "webp" });
  });

  it.each([
    ["HTML", bytes("<!doctype html><script>")],
    ["SVG", bytes('<svg xmlns="http://www.w3.org/2000/svg">')],
    ["GIF", bytes("GIF89a")],
    ["HEIC", bytes(0, 0, 0, 0x18, "ftypheic")],
    ["PDF", bytes("%PDF-1.7")],
    ["empty", bytes()],
    ["truncated PNG", bytes(0x89, "PN")],
    ["RIFF but not WebP", bytes("RIFF", 0, 0, 0, 0, "WAVE")],
  ])("rejects %s", (_name, data) => {
    expect(sniffImage(data)).toBeNull();
  });

  it("enforces the 5 MB limit", () => {
    expect(photoTooLarge(5 * 1024 * 1024)).toBe(false);
    expect(photoTooLarge(5 * 1024 * 1024 + 1)).toBe(true);
  });
});
