import { encodePng } from "./png.js";

/**
 * Procedural texture painter.
 *
 * The framework's "image generation" step is deliberately *parameterised* rather than model-backed:
 * a texture is a 16x16 RGBA buffer derived from (style, palette, seed). That keeps generation
 * offline, instant and — crucially — reproducible, so a spec round-trips to byte-identical art and
 * an agent can iterate on the look by editing data instead of pixels. Swapping in a real image model
 * later only means replacing `paintTexture`; the spec fields and the emit path stay as they are.
 *
 * Determinism rule: everything random comes from `mulberry32(hash(seed ?? id))`. No Math.random,
 * no Date — the same spec must always produce the same PNG.
 */

export const TEXTURE_STYLES = ["solid", "noise", "speckle", "ore", "gradient", "border", "planks"] as const;
export type TextureStyle = (typeof TEXTURE_STYLES)[number];

/** Vanilla item/block textures are 16x16; the generator keeps that default but stays parametric. */
export const DEFAULT_TEXTURE_SIZE = 16;

export interface TextureRequest {
  /** Stable identity; drives the default palette and the default seed. */
  id: string;
  style: TextureStyle;
  /** "#rrggbb" entries, base colour first. Absent = derived from the id. */
  palette?: readonly string[];
  seed?: number;
  size?: number;
}

type Rgb = [number, number, number];

/** FNV-1a: small, fast and stable across runs (unlike a language hash map's internal seed). */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: tiny seeded PRNG with good enough distribution for pixel dithering. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function parseHexColor(hex: string): Rgb {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (m === null) throw new Error(`parseHexColor: expected "#rrggbb", got "${hex}"`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/**
 * Default palette for an id: a saturated hue picked from the hash, plus a darker shade for
 * accents. Two different items almost always land on different hues, and a given id is stable.
 */
function defaultPalette(id: string): Rgb[] {
  const h = hashId(id);
  const hue = (h % 360) / 360;
  const base = hslToRgb(hue, 0.55, 0.5);
  const dark = hslToRgb(hue, 0.6, 0.32);
  const light = hslToRgb(hue, 0.45, 0.68);
  return [base, dark, light];
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** Multiply a colour's brightness, preserving hue — used for the noise and bevel passes. */
function shade(c: Rgb, factor: number): Rgb {
  return [clamp255(c[0] * factor), clamp255(c[1] * factor), clamp255(c[2] * factor)];
}

class Canvas {
  readonly data: Uint8Array;
  constructor(readonly width: number, readonly height: number) {
    this.data = new Uint8Array(width * height * 4);
  }
  set(x: number, y: number, c: Rgb, alpha = 255): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = alpha;
  }
  get(x: number, y: number): Rgb {
    const i = (y * this.width + x) * 4;
    return [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!];
  }
  fill(c: Rgb): void {
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) this.set(x, y, c);
  }
}

/** Per-pixel brightness jitter; the base "material" look every non-flat style builds on. */
function applyNoise(canvas: Canvas, rng: () => number, amount: number): void {
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const factor = 1 + (rng() * 2 - 1) * amount;
      canvas.set(x, y, shade(canvas.get(x, y), factor));
    }
  }
}

/**
 * Fake directional lighting: darken the bottom/right edge and lift the top/left. Without it every
 * texture reads as a flat swatch in-game, because vanilla item art is bevel-lit rather than lit
 * by the world renderer.
 */
function applyBevel(canvas: Canvas): void {
  const lastX = canvas.width - 1;
  const lastY = canvas.height - 1;
  for (let x = 0; x < canvas.width; x++) {
    canvas.set(x, lastY, shade(canvas.get(x, lastY), 0.8));
    canvas.set(x, 0, shade(canvas.get(x, 0), 1.12));
  }
  for (let y = 0; y < canvas.height; y++) {
    canvas.set(lastX, y, shade(canvas.get(lastX, y), 0.8));
    canvas.set(0, y, shade(canvas.get(0, y), 1.12));
  }
}

/** Irregular cluster of accent pixels — reads as an ore vein rather than a rectangle. */
function drawBlob(canvas: Canvas, rng: () => number, c: Rgb, pixels: number): void {
  let x = Math.floor(rng() * canvas.width);
  let y = Math.floor(rng() * canvas.height);
  for (let i = 0; i < pixels; i++) {
    canvas.set(x, y, shade(c, 0.9 + rng() * 0.25));
    x = (x + Math.floor(rng() * 3) - 1 + canvas.width) % canvas.width;
    y = (y + Math.floor(rng() * 3) - 1 + canvas.height) % canvas.height;
  }
}

function paint(canvas: Canvas, req: TextureRequest, rng: () => number): void {
  const palette = req.palette !== undefined && req.palette.length > 0
    ? req.palette.map(parseHexColor)
    : defaultPalette(req.id);
  const base = palette[0]!;
  const accent = palette[1] ?? shade(base, 0.7);
  const highlight = palette[2] ?? shade(base, 1.25);
  const size = canvas.width;
  if (canvas.width !== canvas.height) {
    throw new Error(`paint: style "${req.style}" needs a square canvas, got ${canvas.width}x${canvas.height}`);
  }

  switch (req.style) {
    case "solid":
      canvas.fill(base);
      break;
    case "noise":
      canvas.fill(base);
      applyNoise(canvas, rng, 0.14);
      break;
    case "speckle":
      canvas.fill(base);
      applyNoise(canvas, rng, 0.1);
      for (let i = 0; i < size; i++) {
        canvas.set(Math.floor(rng() * size), Math.floor(rng() * size), rng() < 0.5 ? accent : highlight);
      }
      break;
    case "ore":
      // Stone-toned ground, then a few accent veins — the classic overworld ore silhouette.
      canvas.fill(shade(base, 0.75));
      applyNoise(canvas, rng, 0.18);
      for (let i = 0; i < 3; i++) drawBlob(canvas, rng, accent, 5 + Math.floor(rng() * 5));
      break;
    case "gradient":
      for (let y = 0; y < size; y++) {
        const t = y / (size - 1);
        const row: Rgb = [
          clamp255(base[0] + (accent[0] - base[0]) * t),
          clamp255(base[1] + (accent[1] - base[1]) * t),
          clamp255(base[2] + (accent[2] - base[2]) * t),
        ];
        for (let x = 0; x < size; x++) canvas.set(x, y, row);
      }
      applyNoise(canvas, rng, 0.06);
      break;
    case "border":
      canvas.fill(base);
      applyNoise(canvas, rng, 0.08);
      for (let i = 0; i < size; i++) {
        canvas.set(i, 0, accent);
        canvas.set(i, size - 1, accent);
        canvas.set(0, i, accent);
        canvas.set(size - 1, i, accent);
      }
      break;
    case "planks":
      // Horizontal boards with darker seams every 4px.
      canvas.fill(base);
      applyNoise(canvas, rng, 0.12);
      for (let y = 3; y < size; y += 4) {
        for (let x = 0; x < size; x++) canvas.set(x, y, shade(base, 0.7));
      }
      break;
  }
  applyBevel(canvas);
}

/** Paint one texture and return the raw RGBA bytes (exposed for tests and previews). */
export function paintTextureRgba(req: TextureRequest): { data: Uint8Array; size: number } {
  const size = req.size ?? DEFAULT_TEXTURE_SIZE;
  const canvas = new Canvas(size, size);
  paint(canvas, req, mulberry32(req.seed ?? hashId(req.id)));
  return { data: canvas.data, size };
}

/** Paint one texture and encode it as PNG — this is what the generator writes to disk. */
export function paintTexturePng(req: TextureRequest): Buffer {
  const { data, size } = paintTextureRgba(req);
  return encodePng(data, size, size);
}

/**
 * Vanilla entity sheets are 64x32 (pig/cow/chicken/sheep), and a generated renderer reuses those
 * models — so its texture must be that size or every UV lands on the wrong pixel. Painting a
 * per-style 64x32 sheet would need the model's UV layout, which the adapter does not carry yet;
 * a uniformly tinted sheet is the honest placeholder: it renders as a solid-coloured mob instead
 * of the black/magenta "missing texture" checkerboard.
 */
export const ENTITY_SHEET_WIDTH = 64;
export const ENTITY_SHEET_HEIGHT = 32;

export function paintEntitySheetPng(req: TextureRequest): Buffer {
  const width = req.size ?? ENTITY_SHEET_WIDTH;
  const height = req.size === undefined ? ENTITY_SHEET_HEIGHT : Math.round(req.size / 2);
  const canvas = new Canvas(width, height);
  const palette = req.palette !== undefined && req.palette.length > 0
    ? req.palette.map(parseHexColor)
    : defaultPalette(req.id);
  canvas.fill(palette[0]!);
  applyNoise(canvas, mulberry32(req.seed ?? hashId(req.id)), 0.08);
  return encodePng(canvas.data, width, height);
}
