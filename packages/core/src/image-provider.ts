import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { McmodError } from "./errors.js";
import { imageToTexturePng } from "./image-ops.js";
import type { ModSpecT } from "./spec.js";

/**
 * Image-model texture provider.
 *
 * This is the "AI 生图" path: instead of painting pixels locally, ask an image model for the sprite
 * and reduce the result to a Minecraft texture. It is deliberately kept OUT of the pure planning
 * step — `planGeneration` stays synchronous and I/O-free, and callers fetch images first and hand
 * the bytes in. That keeps the generator testable without a network and makes the network step an
 * explicit, inspectable choice.
 *
 * Credentials come from the environment, never from a spec: specs get committed and shared.
 */

export interface ImageProviderConfig {
  /** Full endpoint, e.g. https://ark.cn-beijing.volces.com/api/plan/v3/images/generations */
  url: string;
  apiKey: string;
  model: string;
  /** Requested generation size, e.g. "1920x1920". The model may enforce a minimum. */
  size: string;
  /** Output encoding; PNG keeps this pipeline's decoder simple (no JPEG support needed). */
  outputFormat: string;
  /** Seconds to wait for a single image. */
  timeoutSeconds: number;
}

export const IMAGE_ENV_KEYS = {
  url: "MCMODKIT_IMAGE_API_URL",
  apiKey: "MCMODKIT_IMAGE_API_KEY",
  model: "MCMODKIT_IMAGE_MODEL",
  size: "MCMODKIT_IMAGE_SIZE",
  outputFormat: "MCMODKIT_IMAGE_FORMAT",
  timeout: "MCMODKIT_IMAGE_TIMEOUT",
} as const;

/** Decoded image bytes an API response may carry at most (generous: 1920x1920 RGBA ≈ 14 MB). */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** Cap on the generation JSON body itself (a b64_json inline image may legitimately reach ~27 MB). */
const MAX_RESPONSE_TEXT = 64 * 1024 * 1024;

function schemeOf(url: string): string {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(url);
  return m ? m[1]!.toLowerCase() : "";
}

function positiveSeconds(raw: string | undefined, fallback: number): number {
  const n = Number(raw ?? "");
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Read a fetch response into bytes, refusing to buffer more than `cap`. */
async function readBodyCapped(res: Response, cap: number, what: string): Promise<Uint8Array> {
  if (res.body === null || res.body === undefined) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > cap) throw new Error(`${what} exceeds ${cap} bytes`);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel();
      throw new Error(`${what} exceeds ${cap} bytes`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/** Read provider config from the environment. Returns null when no endpoint is configured. */
export function readImageProviderConfig(env: NodeJS.ProcessEnv = process.env): ImageProviderConfig | null {
  const url = env[IMAGE_ENV_KEYS.url];
  if (url === undefined || url.trim() === "") return null;
  if (schemeOf(url.trim()) !== "http" && schemeOf(url.trim()) !== "https") {
    throw new Error(
      `${IMAGE_ENV_KEYS.url} must be an http(s) URL (got scheme "${schemeOf(url.trim()) || "(none)"}")`,
    );
  }
  const apiKey = env[IMAGE_ENV_KEYS.apiKey];
  if (apiKey === undefined || apiKey.trim() === "") {
    throw new Error(
      `${IMAGE_ENV_KEYS.url} is set but ${IMAGE_ENV_KEYS.apiKey} is not. ` +
        `Set the credential in the environment - never in the spec, which is meant to be shareable.`,
    );
  }
  return {
    url: url.trim(),
    apiKey: apiKey.trim(),
    model: env[IMAGE_ENV_KEYS.model]?.trim() || "doubao-seedream-5.0-lite",
    // Image APIs commonly reject small requests; 1920x1920 clears a 3.6MP minimum observed in practice.
    size: env[IMAGE_ENV_KEYS.size]?.trim() || "1920x1920",
    outputFormat: env[IMAGE_ENV_KEYS.outputFormat]?.trim() || "png",
    timeoutSeconds: positiveSeconds(env[IMAGE_ENV_KEYS.timeout], 180),
  };
}

interface GenerationResponse {
  data?: { url?: string; b64_json?: string }[];
  error?: { message?: string; code?: string };
}

async function withTimeout<T>(p: Promise<T>, seconds: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} timed out after ${seconds}s`)), seconds * 1000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Ask the model for one image and return the raw encoded bytes. */
export async function requestImage(
  prompt: string,
  cfg: ImageProviderConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array> {
  const body = {
    model: cfg.model,
    prompt,
    size: cfg.size,
    response_format: "url",
    output_format: cfg.outputFormat,
    watermark: false,
  };
  const res = await withTimeout(
    fetchImpl(cfg.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    cfg.timeoutSeconds,
    "image generation request",
  );
  const text = await res.text();
  if (text.length > MAX_RESPONSE_TEXT) {
    throw new Error(`Image API response exceeds ${MAX_RESPONSE_TEXT} characters`);
  }
  let json: GenerationResponse;
  try {
    json = JSON.parse(text) as GenerationResponse;
  } catch {
    throw new Error(`Image API returned non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  if (json.error !== undefined || !res.ok) {
    // Never echo the request (it carries the credential); the message alone is enough to act on.
    throw new Error(`Image API error (HTTP ${res.status}): ${json.error?.message ?? text.slice(0, 300)}`);
  }
  const entry = json.data?.[0];
  if (entry === undefined) throw new Error("Image API returned no image data");
  if (entry.b64_json !== undefined) {
    const decoded = new Uint8Array(Buffer.from(entry.b64_json, "base64"));
    if (decoded.length > MAX_IMAGE_BYTES) throw new Error(`Image API image exceeds ${MAX_IMAGE_BYTES} bytes`);
    return decoded;
  }
  if (entry.url === undefined) throw new Error("Image API returned neither url nor b64_json");
  const dlScheme = schemeOf(entry.url);
  if (dlScheme !== "http" && dlScheme !== "https") {
    // The URL comes from a remote service; refusing other schemes keeps the fetch off the file system.
    throw new Error(`Image API returned a non-http(s) image URL (got scheme "${dlScheme || "(none)"}")`);
  }
  const dl = await withTimeout(fetchImpl(entry.url), cfg.timeoutSeconds, "image download");
  if (!dl.ok) throw new Error(`Failed to download generated image (HTTP ${dl.status})`);
  return await readBodyCapped(dl, MAX_IMAGE_BYTES, "generated image download");
}

export interface PrefetchOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  /** Called per generated texture so a CLI can report progress. */
  onProgress?: (message: string) => void;
}

export interface PrefetchedTexture {
  /** Raw bytes from the model, before conversion (kept for debugging/inspection). */
  source: Uint8Array;
  /** Ready-to-write Minecraft texture PNG. */
  texture: Uint8Array;
  prompt: string;
}

/**
 * Generate every prompt-backed texture the spec asks for, keyed by "<kind>:<id>" so the pure
 * generator can pick them up. Content without a prompt, or with a provider of "procedural", is left
 * to the local painter.
 */
export async function prefetchTextures(
  spec: ModSpecT,
  opts: PrefetchOptions = {},
): Promise<Map<string, PrefetchedTexture>> {
  const out = new Map<string, PrefetchedTexture>();
  if (!spec.textures || spec.textureProvider === "procedural") return out;
  const cfg = readImageProviderConfig(opts.env ?? process.env);
  if (cfg === null) {
    throw new Error(
      `spec.textureProvider is "image-api" but no image endpoint is configured. ` +
        `Set ${IMAGE_ENV_KEYS.url} and ${IMAGE_ENV_KEYS.apiKey}, or set textureProvider back to "procedural".`,
    );
  }
  const jobs: { key: string; prompt: string; size: number }[] = [];
  for (const item of spec.content.items) {
    if (item.texture?.prompt !== undefined) {
      jobs.push({ key: `item:${item.id}`, prompt: item.texture.prompt, size: item.texture.size ?? 16 });
    }
  }
  for (const block of spec.content.blocks) {
    if (block.texture?.prompt !== undefined) {
      jobs.push({ key: `block:${block.id}`, prompt: block.texture.prompt, size: block.texture.size ?? 16 });
    }
  }
  for (const entity of spec.content.entities) {
    if (entity.texture?.prompt !== undefined) {
      jobs.push({ key: `entity:${entity.id}`, prompt: entity.texture.prompt, size: entity.texture.size ?? 16 });
    }
  }
  for (const job of jobs) {
    opts.onProgress?.(`generating texture for ${job.key} ...`);
    const source = await requestImage(job.prompt, cfg, opts.fetchImpl);
    const texture = imageToTexturePng(source, job.size);
    opts.onProgress?.(`  ${job.key}: ${source.length} bytes in, ${texture.length} bytes texture out (${job.size}px)`);
    out.set(job.key, { source, texture, prompt: job.prompt });
  }
  return out;
}

export interface TextureFileOptions {
  /**
   * Directory that relative `texture.file` paths resolve against. Absent = only absolute paths are
   * accepted (the MCP/HTTP surfaces run far from the spec file; the CLI passes the spec's directory).
   */
  baseDir?: string;
  onProgress?: (message: string) => void;
}

/**
 * Read every `texture.file` the spec declares and reduce each to a Minecraft texture PNG, keyed
 * "<kind>:<id>" like prefetchTextures. This is the third texture source: the spec points at local
 * art instead of painting procedurally or asking an image model.
 */
export async function loadTextureFiles(
  spec: ModSpecT,
  opts: TextureFileOptions = {},
): Promise<Map<string, PrefetchedTexture>> {
  const out = new Map<string, PrefetchedTexture>();
  if (!spec.textures || spec.textureProvider !== "file") return out;
  const jobs: { key: string; file: string; size: number }[] = [];
  for (const item of spec.content.items) {
    if (item.texture?.file !== undefined) jobs.push({ key: `item:${item.id}`, file: item.texture.file, size: item.texture.size ?? 16 });
  }
  for (const block of spec.content.blocks) {
    if (block.texture?.file !== undefined) jobs.push({ key: `block:${block.id}`, file: block.texture.file, size: block.texture.size ?? 16 });
  }
  for (const entity of spec.content.entities) {
    if (entity.texture?.file !== undefined) jobs.push({ key: `entity:${entity.id}`, file: entity.texture.file, size: entity.texture.size ?? 16 });
  }
  for (const job of jobs) {
    opts.onProgress?.(`reading texture file for ${job.key}: ${job.file}`);
    const path = isAbsolute(job.file)
      ? job.file
      : opts.baseDir !== undefined
        ? resolve(opts.baseDir, job.file)
        : null;
    if (path === null) {
      throw new McmodError(
        "SPEC_INVALID",
        `texture.file must be an absolute path here: "${job.file}" (the CLI resolves relative paths against the spec file's directory)`,
        { key: job.key, file: job.file },
      );
    }
    let source: Uint8Array;
    try {
      source = new Uint8Array(await readFile(path));
    } catch (err) {
      throw new McmodError("SPEC_INVALID", `texture file not readable: ${path}`, {
        key: job.key,
        file: job.file,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
    if (source.length > MAX_IMAGE_BYTES) {
      throw new McmodError("SPEC_INVALID", `texture file exceeds ${MAX_IMAGE_BYTES} bytes: ${path}`, { key: job.key, file: job.file });
    }
    let texture: Uint8Array;
    try {
      texture = imageToTexturePng(source, job.size);
    } catch (err) {
      throw new McmodError("SPEC_INVALID", `texture file is not a usable PNG: ${path} (${err instanceof Error ? err.message : String(err)})`, {
        key: job.key,
        file: job.file,
      });
    }
    out.set(job.key, { source, texture, prompt: job.file });
  }
  return out;
}

export interface PrepareTexturesOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  /** Base directory for relative `texture.file` paths (see loadTextureFiles). */
  baseDir?: string;
  onProgress?: (message: string) => void;
}

/**
 * One entry point for every surface: prepare whatever the spec's textureProvider asks for and hand
 * back ready-to-write texture PNGs keyed "<kind>:<id>". Procedural specs get an empty map (the
 * generator paints locally). Kept as a single dispatcher so CLI/MCP/HTTP cannot drift apart.
 */
export async function prepareTextures(
  spec: ModSpecT,
  opts: PrepareTexturesOptions = {},
): Promise<Map<string, Uint8Array>> {
  if (!spec.textures || spec.textureProvider === "procedural") return new Map();
  if (spec.textureProvider === "file") {
    const loaded = await loadTextureFiles(spec, { baseDir: opts.baseDir, onProgress: opts.onProgress });
    return new Map([...loaded].map(([k, v]) => [k, v.texture]));
  }
  const prefetched = await prefetchTextures(spec, { env: opts.env, fetchImpl: opts.fetchImpl, onProgress: opts.onProgress });
  return new Map([...prefetched].map(([k, v]) => [k, v.texture]));
}
