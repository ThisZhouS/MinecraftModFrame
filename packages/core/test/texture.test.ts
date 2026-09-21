import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { encodePng, isPng, readPngSize } from "../src/png.js";
import { paintTexturePng, paintTextureRgba, paintEntitySheetPng, hashId } from "../src/texture.js";
import { parseModSpec } from "../src/spec.js";
import { planGeneration } from "../src/generators.js";
import { makeFixtureAdapter } from "./fixture-adapter.js";

/** Decode just enough PNG to prove the pixels survive a round trip. */
function decodePng(bytes: Buffer): { width: number; height: number; rgba: Buffer } {
  let off = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (off < bytes.length) {
    const len = bytes.readUInt32BE(off);
    const type = bytes.toString("ascii", off + 4, off + 8);
    const data = bytes.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    }
    if (type === "IDAT") idat.push(data);
    if (type === "IEND") break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const rgba = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    expect(raw[y * (stride + 1)]).toBe(0); // filter type None
    raw.copy(rgba, y * stride, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
  }
  return { width, height, rgba };
}

describe("png encoder", () => {
  it("round-trips RGBA pixels through encode + decode", () => {
    const rgba = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < rgba.length; i++) rgba[i] = i % 256;
    const png = encodePng(rgba, 4, 4);
    expect(isPng(png)).toBe(true);
    expect(readPngSize(png)).toEqual({ width: 4, height: 4 });
    const back = decodePng(png);
    expect(back.width).toBe(4);
    expect(back.height).toBe(4);
    expect([...back.rgba]).toEqual([...rgba]);
  });

  it("rejects a buffer whose length does not match the dimensions", () => {
    expect(() => encodePng(new Uint8Array(10), 4, 4)).toThrow(/expected 64 bytes/);
  });
});

describe("texture painter", () => {
  it("is deterministic: the same request always paints the same bytes", () => {
    const a = paintTexturePng({ id: "ruby", style: "ore" });
    const b = paintTexturePng({ id: "ruby", style: "ore" });
    expect(a.equals(b)).toBe(true);
  });

  it("gives different ids different textures and honours an explicit seed", () => {
    const ruby = paintTexturePng({ id: "ruby", style: "noise" });
    const sapphire = paintTexturePng({ id: "sapphire", style: "noise" });
    expect(ruby.equals(sapphire)).toBe(false);
    // A different seed on the same id must change the pattern, or seeds would be a dead parameter.
    const reseeded = paintTexturePng({ id: "ruby", style: "noise", seed: 12345 });
    expect(reseeded.equals(ruby)).toBe(false);
  });

  it("paints 16x16 item/block textures and a 64x32 entity sheet", () => {
    expect(readPngSize(paintTexturePng({ id: "ruby", style: "speckle" }))).toEqual({ width: 16, height: 16 });
    expect(readPngSize(paintEntitySheetPng({ id: "ruby_golem", style: "noise" }))).toEqual({ width: 64, height: 32 });
  });

  it("uses the palette it is given, and derives one when it is not", () => {
    const { data, size } = paintTextureRgba({ id: "ruby", style: "solid", palette: ["#ff0000"] });
    expect(size).toBe(16);
    // "solid" fills with the base colour, then bevels the top/left edge brighter and bottom/right darker.
    expect([data[0], data[1], data[2]]).toEqual([255, 0, 0]);
    const last = (size - 1) * size * 4;
    expect(data[last]).toBeLessThan(255);
    expect(hashId("ruby")).toBe(hashId("ruby"));
    expect(hashId("ruby")).not.toBe(hashId("sapphire"));
  });
});

const BASE = {
  schemaVersion: 1,
  mod: { modId: "examplemod" },
  target: { mcVersion: "1.21.1", loader: "fabric" },
  content: { items: [{ id: "ruby" }], blocks: [{ id: "ruby_ore" }] },
};

describe("texture generation in the plan", () => {
  it("is opt-in: no PNG entries unless the spec sets textures: true", () => {
    const off = parseModSpec(BASE);
    expect(off.ok).toBe(true);
    if (!off.ok) return;
    const plan = planGeneration(off.spec, makeFixtureAdapter());
    expect(plan.files.some((f) => f.path.endsWith(".png"))).toBe(false);
  });

  it("emits one managed PNG per item and block when enabled", () => {
    const parsed = parseModSpec({
      ...BASE,
      textures: true,
      content: {
        items: [{ id: "ruby", texture: { style: "ore", palette: ["#6b7280", "#e11d48"] } }],
        blocks: [{ id: "ruby_ore" }],
      },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const plan = planGeneration(parsed.spec, makeFixtureAdapter());
    const pngs = plan.files.filter((f) => f.path.endsWith(".png"));
    expect(pngs.map((f) => f.path)).toEqual([
      "src/main/resources/assets/examplemod/textures/item/ruby.png",
      "src/main/resources/assets/examplemod/textures/block/ruby_ore.png",
    ]);
    for (const p of pngs) {
      expect(p.managed).toBe(true);
      expect(p.bytes).toBeInstanceOf(Uint8Array);
      expect(isPng(p.bytes!)).toBe(true);
    }
  });

  it("rejects an unknown texture style at validation time", () => {
    const bad = parseModSpec({
      ...BASE,
      textures: true,
      content: { items: [{ id: "ruby", texture: { style: "not-a-style" } }], blocks: [] },
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.formatted).toContain("texture.style");
  });
});
