import { inflateSync } from "node:zlib";
import { encodePng } from "./png.js";

/**
 * Image operations for turning a generated (large, opaque) image into a Minecraft item texture
 * (16x16, alpha-keyed, subject filling the frame).
 *
 * Zero dependencies, like the rest of core: the images we decode come from an image API that emits
 * plain 8-bit non-interlaced PNG, which is a small enough subset to decode by hand. Anything outside
 * that subset fails loudly rather than silently producing garbage pixels.
 */

export interface RgbaImage {
  width: number;
  height: number;
  /** Straight (non-premultiplied) RGBA, 4 bytes per pixel, row-major. */
  data: Uint8Array;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * Decode an 8-bit non-interlaced PNG into straight RGBA.
 * Supports colour types 2 (RGB) and 6 (RGBA) — what image APIs actually return. Palette, greyscale,
 * 16-bit and interlaced variants throw, because guessing at them would corrupt the texture silently.
 */
export function decodePng(bytes: Uint8Array): RgbaImage {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("decodePng: not a PNG (bad signature)");
  }
  let off = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let bitDepth = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
      interlace = data[12]!;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`decodePng: only 8-bit PNG is supported, got bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error("decodePng: interlaced (Adam7) PNG is not supported");
  if (colorType !== 2 && colorType !== 6) {
    throw new Error(`decodePng: only RGB (2) and RGBA (6) are supported, got colour type ${colorType}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels]! : 0;
      const b = prev[i]!;
      const c = i >= channels ? prev[i - channels]! : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) add = paeth(a, b, c);
      else if (filter !== 0) throw new Error(`decodePng: unknown scanline filter ${filter}`);
      line[i] = (line[i]! + add) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      out[d] = line[s]!;
      out[d + 1] = line[s + 1]!;
      out[d + 2] = line[s + 2]!;
      out[d + 3] = channels === 4 ? line[s + 3]! : 255;
    }
    prev = line;
  }
  return { width, height, data: out };
}

/**
 * Make the background transparent by flood-filling inward from the border.
 *
 * Image models asked for "transparent background" routinely paint a *checkerboard* instead (the
 * PNG comes back RGB with no alpha at all). Keying on the border colour handles that: the checker
 * is light and desaturated, and the subject is surrounded by a dark outline, so the fill stops at
 * the silhouette and interior light pixels (highlights) survive.
 */
export function keyOutBackground(img: RgbaImage, opts: { minChannel?: number; maxSaturation?: number } = {}): number {
  const minChannel = opts.minChannel ?? 200;
  const maxSaturation = opts.maxSaturation ?? 30;
  const { width, height, data } = img;
  const isBackgroundish = (i: number): boolean => {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const lo = Math.min(r, g, b);
    const hi = Math.max(r, g, b);
    return lo >= minChannel && hi - lo <= maxSaturation;
  };
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (seen[p] === 1) return;
    seen[p] = 1;
    if (!isBackgroundish(p * 4)) return;
    data[p * 4 + 3] = 0;
    stack.push(x, y);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  let cleared = 0;
  for (let p = 0; p < width * height; p++) if (data[p * 4 + 3] === 0) cleared++;
  return cleared;
}

/**
 * Keep only the largest connected opaque blob, clearing everything else.
 *
 * Background keying inevitably leaves a few stray pixels (antialiased corners, specks the model
 * drew). They matter more than they look: the crop box is the bounding box of *all* opaque pixels,
 * so two specks in opposite corners would stretch it across the whole frame and shrink the subject
 * to a thumbnail. Dropping small blobs is more robust than tuning the keying threshold, which would
 * have to be loosened until it started eating real parts of the sprite.
 */
export function keepLargestComponent(img: RgbaImage, alphaThreshold = 8): number {
  const { width, height, data } = img;
  const label = new Int32Array(width * height).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  const opaque = (p: number): boolean => data[p * 4 + 3]! > alphaThreshold;
  for (let start = 0; start < width * height; start++) {
    if (label[start] !== -1 || !opaque(start)) continue;
    const id = sizes.length;
    let size = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length > 0) {
      const p = stack.pop()!;
      size++;
      const x = p % width;
      const y = (p - x) / width;
      if (x > 0 && label[p - 1] === -1 && opaque(p - 1)) { label[p - 1] = id; stack.push(p - 1); }
      if (x < width - 1 && label[p + 1] === -1 && opaque(p + 1)) { label[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && label[p - width] === -1 && opaque(p - width)) { label[p - width] = id; stack.push(p - width); }
      if (y < height - 1 && label[p + width] === -1 && opaque(p + width)) { label[p + width] = id; stack.push(p + width); }
    }
    sizes.push(size);
  }
  if (sizes.length <= 1) return 0;
  let keep = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i]! > sizes[keep]!) keep = i;
  let cleared = 0;
  for (let p = 0; p < width * height; p++) {
    if (label[p] !== -1 && label[p] !== keep) {
      data[p * 4 + 3] = 0;
      cleared++;
    }
  }
  return cleared;
}

/** Tight bounding box of pixels with alpha above `threshold`; null when the image is fully clear. */
export function contentBounds(img: RgbaImage, threshold = 8): { x: number; y: number; width: number; height: number } | null {
  let minX = img.width;
  let minY = img.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3]! > threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Box-filter downscale using premultiplied alpha.
 *
 * Averaging straight RGBA would let fully transparent pixels drag colour into the result (their RGB
 * is arbitrary — often black or the keyed checker colour), which is what produces dark halos around
 * a keyed sprite. Weighting by alpha avoids that.
 */
export function downscale(img: RgbaImage, dstW: number, dstH: number): RgbaImage {
  const out = new Uint8Array(dstW * dstH * 4);
  for (let dy = 0; dy < dstH; dy++) {
    const y0 = Math.floor((dy * img.height) / dstH);
    const y1 = Math.max(y0 + 1, Math.floor(((dy + 1) * img.height) / dstH));
    for (let dx = 0; dx < dstW; dx++) {
      const x0 = Math.floor((dx * img.width) / dstW);
      const x1 = Math.max(x0 + 1, Math.floor(((dx + 1) * img.width) / dstW));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const s = (y * img.width + x) * 4;
          const alpha = img.data[s + 3]! / 255;
          r += img.data[s]! * alpha;
          g += img.data[s + 1]! * alpha;
          b += img.data[s + 2]! * alpha;
          a += alpha;
          n++;
        }
      }
      const d = (dy * dstW + dx) * 4;
      if (a > 0) {
        out[d] = Math.round(r / a);
        out[d + 1] = Math.round(g / a);
        out[d + 2] = Math.round(b / a);
      }
      out[d + 3] = Math.round((a / n) * 255);
    }
  }
  return { width: dstW, height: dstH, data: out };
}

/** Nearest-neighbour resample — keeps hard pixel-art edges when scaling up. */
export function resizeNearest(img: RgbaImage, dstW: number, dstH: number): RgbaImage {
  const out = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(img.height - 1, Math.floor((y * img.height) / dstH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x * img.width) / dstW));
      const s = (sy * img.width + sx) * 4;
      const d = (y * dstW + x) * 4;
      out[d] = img.data[s]!;
      out[d + 1] = img.data[s + 1]!;
      out[d + 2] = img.data[s + 2]!;
      out[d + 3] = img.data[s + 3]!;
    }
  }
  return { width: dstW, height: dstH, data: out };
}

function crop(img: RgbaImage, box: { x: number; y: number; width: number; height: number }): RgbaImage {
  const out = new Uint8Array(box.width * box.height * 4);
  for (let y = 0; y < box.height; y++) {
    const src = ((box.y + y) * img.width + box.x) * 4;
    out.set(img.data.subarray(src, src + box.width * 4), y * box.width * 4);
  }
  return { width: box.width, height: box.height, data: out };
}

/**
 * Turn a raw generated image into a square Minecraft texture: key the background, crop to the
 * subject, scale it to fill the target canvas (preserving aspect), and centre it.
 *
 * Cropping first is what makes this usable: a generated sprite occupies maybe half the frame, so
 * downscaling the whole frame to 16x16 would waste most of the pixels on empty background.
 */
export function toMinecraftTexture(
  img: RgbaImage,
  size = 16,
  opts: { keyBackground?: boolean; padding?: number } = {},
): RgbaImage {
  let work = img;
  if (opts.keyBackground !== false) {
    keyOutBackground(work);
    keepLargestComponent(work);
  }
  const box = contentBounds(work);
  if (box === null) throw new Error("toMinecraftTexture: image has no opaque content after background keying");
  work = crop(work, box);
  const padding = opts.padding ?? 0;
  const inner = Math.max(1, size - padding * 2);
  const scale = Math.min(inner / work.width, inner / work.height);
  const w = Math.max(1, Math.min(size, Math.round(work.width * scale)));
  const h = Math.max(1, Math.min(size, Math.round(work.height * scale)));
  const scaled = downscale(work, w, h);
  const canvas = new Uint8Array(size * size * 4);
  const ox = Math.floor((size - w) / 2);
  const oy = Math.floor((size - h) / 2);
  for (let y = 0; y < h; y++) {
    const dst = ((oy + y) * size + ox) * 4;
    canvas.set(scaled.data.subarray(y * w * 4, (y + 1) * w * 4), dst);
  }
  return { width: size, height: size, data: canvas };
}

/** Decode a generated image and reduce it to a square Minecraft texture, PNG-encoded. */
export function imageToTexturePng(bytes: Uint8Array, size = 16): Buffer {
  const tex = toMinecraftTexture(decodePng(bytes), size);
  return encodePng(tex.data, tex.width, tex.height);
}
