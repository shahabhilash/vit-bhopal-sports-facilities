import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { PNG } from "pngjs";

// The pass dialog renders with qrcode; the guard scanner decodes with jsQR.
// This proves a real pass code survives that round trip at the rendered size,
// including when the camera frame is downscaled.
async function renderAndDecode(code: string, width: number) {
  const png = PNG.sync.read(await QRCode.toBuffer(code, { errorCorrectionLevel: "M", margin: 2, width }));
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height, { inversionAttempts: "dontInvert" })?.data;
}

describe("booking pass QR codes", () => {
  const code = `VITB1.${randomBytes(32).toString("hex")}`;

  it("decode back to the exact pass code at the size shown to students", async () => {
    expect(await renderAndDecode(code, 320)).toBe(code);
  });

  it("still decode when the scanner sees a small image", async () => {
    expect(await renderAndDecode(code, 160)).toBe(code);
  });
});
