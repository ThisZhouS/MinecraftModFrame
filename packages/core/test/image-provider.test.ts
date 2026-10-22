import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { encodePng } from "../src/png.js";
import {
  IMAGE_ENV_KEYS,
  MAX_IMAGE_BYTES,
  loadTextureFiles,
  readImageProviderConfig,
  requestImage,
} from "../src/image-provider.js";
import { parseModSpec } from "../src/spec.js";

const CFG = {
  url: "https://img.example.com/generations",
  apiKey: "test-key",
  model: "m",
  size: "1920x1920",
  outputFormat: "png",
  timeoutSeconds: 10,
};

/** Two-step fetch stub: first call is the generation request, second is the image download. */
function fetchStub(first: unknown, second?: unknown): typeof fetch {
  const calls: unknown[] = [];
  return (async (input: unknown) => {
    calls.push(input);
    if (calls.length === 1) {
      return (first instanceof Response ? first : new Response(JSON.stringify(first), { status: 200 })) as Response;
    }
    return (second instanceof Response ? second : new Response(JSON.stringify(second), { status: 200 })) as Response;
  }) as typeof fetch;
}

describe("readImageProviderConfig", () => {
  it("clamps a non-positive timeout to the 180s default", () => {
    expect(readImageProviderConfig({ [IMAGE_ENV_KEYS.url]: "https://x.test", [IMAGE_ENV_KEYS.apiKey]: "k", [IMAGE_ENV_KEYS.timeout]: "-5" })!.timeoutSeconds).toBe(180);
    expect(readImageProviderConfig({ [IMAGE_ENV_KEYS.url]: "https://x.test", [IMAGE_ENV_KEYS.apiKey]: "k", [IMAGE_ENV_KEYS.timeout]: "abc" })!.timeoutSeconds).toBe(180);
    expect(readImageProviderConfig({ [IMAGE_ENV_KEYS.url]: "https://x.test", [IMAGE_ENV_KEYS.apiKey]: "k", [IMAGE_ENV_KEYS.timeout]: "30" })!.timeoutSeconds).toBe(30);
  });

  it("rejects a non-http(s) endpoint URL", () => {
    expect(() =>
      readImageProviderConfig({ [IMAGE_ENV_KEYS.url]: "file:///etc/passwd", [IMAGE_ENV_KEYS.apiKey]: "k" }),
    ).toThrow(/must be an http\(s\) URL/);
  });

  it("still requires the key when the url is set", () => {
    expect(() => readImageProviderConfig({ [IMAGE_ENV_KEYS.url]: "https://x.test" })).toThrow(/never in the spec/);
  });
});

describe("requestImage", () => {
  it("returns b64_json bytes for a normal response", async () => {
    const bytes = await requestImage("prompt", CFG, fetchStub({ data: [{ b64_json: Buffer.from("hello").toString("base64") }] }));
    expect(new TextDecoder().decode(bytes)).toBe("hello");
  });

  it("downloads a url response with a size cap in force", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const bytes = await requestImage("prompt", CFG, fetchStub({ data: [{ url: "https://img.example.com/x.png" }] }, new Response(png, { status: 200 })));
    expect([...bytes]).toEqual([...png]);
  });

  it("refuses a non-http(s) download URL from the API", async () => {
    await expect(
      requestImage("prompt", CFG, fetchStub({ data: [{ url: "file:///etc/passwd" }] })),
    ).rejects.toThrow(/non-http\(s\) image URL/);
  });

  it("rejects an oversized download before returning it", async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    await expect(
      requestImage("prompt", CFG, fetchStub({ data: [{ url: "https://img.example.com/big.png" }] }, new Response(big, { status: 200 }))),
    ).rejects.toThrow(/exceeds/);
  });

  it("rejects an oversized b64_json image", async () => {
    const big = Buffer.alloc(MAX_IMAGE_BYTES + 1);
    await expect(
      requestImage("prompt", CFG, fetchStub({ data: [{ b64_json: big.toString("base64") }] })),
    ).rejects.toThrow(/exceeds/);
  });
});

describe("loadTextureFiles", () => {
  const specWith = (texture: unknown) => {
    const r = parseModSpec({
      schemaVersion: 1,
      mod: { modId: "examplemod" },
      target: { mcVersion: "1.21.1", loader: "fabric" },
      textures: true,
      textureProvider: "file",
      content: { items: [{ id: "ruby", texture }], blocks: [] },
    });
    if (!r.ok) throw new Error("fixture spec invalid: " + r.formatted);
    return r.spec;
  };

  it("loads a PNG, converts it and keys it by content id", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcmod-file-"));
    try {
      // A 16x16 fully opaque red square survives keying: the border colour is the subject colour.
      const rgba = new Uint8Array(16 * 16 * 4);
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = 200;
        rgba[i + 3] = 255;
      }
      await writeFile(join(dir, "ruby.png"), encodePng(rgba, 16, 16));
      const out = await loadTextureFiles(specWith({ file: "ruby.png" }), { baseDir: dir });
      expect(out.has("item:ruby")).toBe(true);
      expect(out.get("item:ruby")!.texture.length).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns an empty map when the provider is not file", async () => {
    const spec = parseModSpec({
      schemaVersion: 1,
      mod: { modId: "examplemod" },
      target: { mcVersion: "1.21.1", loader: "fabric" },
      textures: true,
      textureProvider: "procedural",
      content: { items: [{ id: "ruby", texture: { file: "ruby.png" } }], blocks: [] },
    }).spec!;
    expect((await loadTextureFiles(spec)).size).toBe(0);
  });

  it("requires absolute paths when no baseDir is given", async () => {
    await expect(loadTextureFiles(specWith({ file: "ruby.png" }))).rejects.toThrow(/must be an absolute path/);
  });

  it("reports a missing file as SPEC_INVALID", async () => {
    await expect(
      loadTextureFiles(specWith({ file: resolve("no-such-texture.png") })),
    ).rejects.toMatchObject({ code: "SPEC_INVALID", message: expect.stringMatching(/not readable/) });
  });

  it("rejects a file that is not a usable PNG", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcmod-file-"));
    try {
      await writeFile(join(dir, "fake.png"), Buffer.from("definitely not a png"));
      await expect(loadTextureFiles(specWith({ file: "fake.png" }), { baseDir: dir })).rejects.toMatchObject({
        code: "SPEC_INVALID",
        message: expect.stringMatching(/not a usable PNG/),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects an oversized file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcmod-file-"));
    try {
      const big = Buffer.alloc(MAX_IMAGE_BYTES + 1);
      await writeFile(join(dir, "big.png"), big);
      await expect(loadTextureFiles(specWith({ file: "big.png" }), { baseDir: dir })).rejects.toMatchObject({
        code: "SPEC_INVALID",
        message: expect.stringMatching(/exceeds/),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
