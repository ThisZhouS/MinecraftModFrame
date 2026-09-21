import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { decodePng, keyOutBackground, keepLargestComponent, contentBounds, downscale, toMinecraftTexture, imageToTexturePng, type RgbaImage } from "../src/image-ops.js";
import { encodePng } from "../src/png.js";

/** Build a PNG the way an image API would: opaque, no alpha channel, one IDAT. */
function makeRgbPng(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const chunk = (type: string, data: Uint8Array): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    return Buffer.concat([len, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB, no alpha — what the image API returns
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** A 64x64 image: light checkerboard background with a dark square subject in the middle. */
function checkerboardWithSubject(): Buffer {
  return makeRgbPng(64, 64, (x, y) => {
    if (x >= 20 && x < 44 && y >= 16 && y < 48) return [40, 30, 20];
    return ((x >> 3) + (y >> 3)) % 2 === 0 ? [255, 255, 255] : [230, 230, 230];
  });
}

function alphaAt(img: RgbaImage, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4 + 3]!;
}

describe("png decoding", () => {
  it("decodes an RGB (no alpha) PNG and fills alpha opaque", () => {
    const img = decodePng(makeRgbPng(4, 4, () => [10, 20, 30]));
    expect(img.width).toBe(4);
    expect(img.height).toBe(4);
    expect([...img.data.subarray(0, 4)]).toEqual([10, 20, 30, 255]);
  });

  it("round-trips an RGBA PNG written by our own encoder", () => {
    const rgba = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 7) % 256;
    const img = decodePng(encodePng(rgba, 4, 4));
    expect([...img.data]).toEqual([...rgba]);
  });

  it("rejects formats it cannot decode instead of guessing", () => {
    const bad = makeRgbPng(2, 2, () => [0, 0, 0]);
    bad[24] = 16; // bit depth 16
    expect(() => decodePng(bad)).toThrow(/bit depth 16/);
  });
});

describe("background keying", () => {
  it("clears the checkerboard and keeps the subject", () => {
    const img = decodePng(checkerboardWithSubject());
    keyOutBackground(img);
    expect(alphaAt(img, 0, 0)).toBe(0);
    expect(alphaAt(img, 63, 63)).toBe(0);
    expect(alphaAt(img, 32, 32)).toBe(255);
    // The dark outline is the reason the fill stops where it does.
    expect(alphaAt(img, 20, 30)).toBe(255);
  });

  it("keeps interior light pixels, which a global brightness threshold would have eaten", () => {
    const png = makeRgbPng(32, 32, (x, y) => {
      const inside = x >= 8 && x < 24 && y >= 8 && y < 24;
      const border = x === 8 || x === 23 || y === 8 || y === 23;
      if (inside) return border ? [0, 0, 0] : [255, 255, 255];
      return [255, 255, 255];
    });
    const img = decodePng(png);
    keyOutBackground(img);
    expect(alphaAt(img, 0, 0)).toBe(0);
    expect(alphaAt(img, 16, 16)).toBe(255); // white highlight inside the black outline survives
  });

  it("drops stray specks so they cannot stretch the crop box", () => {
    const img = decodePng(checkerboardWithSubject());
    keyOutBackground(img);
    // Two lone specks in opposite corners, as antialiasing tends to leave behind.
    img.data[(0 * 64 + 0) * 4 + 3] = 255;
    img.data[(63 * 64 + 63) * 4 + 3] = 255;
    expect(contentBounds(img)!.width).toBeGreaterThan(60);
    keepLargestComponent(img);
    const box = contentBounds(img)!;
    expect(box.x).toBe(20);
    expect(box.y).toBe(16);
    expect(box.width).toBe(24);
    expect(box.height).toBe(32);
  });
});

describe("downscaling", () => {
  it("averages without letting transparent pixels darken the result", () => {
    // Half opaque red, half fully transparent with black RGB — naive averaging would darken it.
    const img: RgbaImage = { width: 2, height: 1, data: new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0]) };
    const out = downscale(img, 1, 1);
    expect([...out.data]).toEqual([255, 0, 0, 128]);
  });
});

describe("toMinecraftTexture", () => {
  it("keys, crops to the subject and produces a square texture of the requested size", () => {
    const tex = toMinecraftTexture(decodePng(checkerboardWithSubject()), 16);
    expect(tex.width).toBe(16);
    expect(tex.height).toBe(16);
    let opaque = 0;
    for (let i = 3; i < tex.data.length; i += 4) if (tex.data[i]! > 8) opaque++;
    expect(opaque).toBeGreaterThan(0);
    // Cropping first means the subject fills the canvas rather than sitting in a sea of background.
    expect(opaque).toBeGreaterThan(16 * 16 * 0.5);
  });

  it("preserves aspect ratio rather than stretching the subject", () => {
    // Subject twice as tall as wide -> should occupy full height, half width.
    const png = makeRgbPng(64, 64, (x, y) => (x >= 16 && x < 32 && y >= 8 && y < 56 ? [0, 0, 0] : [255, 255, 255]));
    const tex = toMinecraftTexture(decodePng(png), 16);
    let minX = 16;
    let maxX = -1;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (tex.data[(y * 16 + x) * 4 + 3]! > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }
    expect(maxX - minX + 1).toBeLessThanOrEqual(8);
  });

  it("fails loudly when there is nothing to crop", () => {
    const blank = decodePng(makeRgbPng(8, 8, () => [255, 255, 255]));
    expect(() => toMinecraftTexture(blank, 16)).toThrow(/no opaque content/);
  });

  it("produces a decodable PNG end to end", () => {
    const png = imageToTexturePng(checkerboardWithSubject(), 16);
    const back = decodePng(png);
    expect(back.width).toBe(16);
    expect(back.height).toBe(16);
  });
});
