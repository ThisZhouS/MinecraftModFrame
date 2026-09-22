import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { McmodError, lintAdapter, parseAdapterRecord, planGeneration } from "@mcmodkit/core";
import type { AdapterRecordT, GenerationPlan, ModSpecT, PlanOptions } from "@mcmodkit/core";

/**
 * Adapter loader. Adapters are pure JSON data files under data/ named `<loader>-<mcVersion>.json`.
 * They are validated against the AdapterRecord contract (from @mcmodkit/core) AND linted before
 * being exposed — a broken adapter file fails loudly here, never mid-generation.
 */

// Resolves to <package>/data both from src/ (vitest) and dist/ (built): the file sits one level deep.
const dataDir = new URL("../data/", import.meta.url);

let cache: AdapterRecordT[] | null = null;

export function listAdapters(): AdapterRecordT[] {
  if (cache) return cache;
  const out: AdapterRecordT[] = [];
  const problems: string[] = [];
  let files: string[];
  try {
    files = readdirSync(dataDir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    throw new McmodError("ADAPTER_NOT_FOUND", `Adapter data directory missing or unreadable: ${decodeURIComponent(dataDir.pathname)}`);
  }
  for (const f of files) {
    const raw = readFileSync(new URL(f, dataDir), "utf8");
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      problems.push(`${f}: invalid JSON (${e instanceof Error ? e.message : String(e)})`);
      continue;
    }
    const parsed = parseAdapterRecord(json);
    if (!parsed.ok || !parsed.adapter) {
      problems.push(`${f}: schema issues:\n${parsed.issues.join("\n")}`);
      continue;
    }
    const lint = lintAdapter(parsed.adapter);
    if (lint.length > 0) {
      problems.push(`${f}: lint issues:\n${lint.map((l) => `  - ${l}`).join("\n")}`);
      continue;
    }
    out.push(parsed.adapter);
  }
  if (problems.length > 0) {
    throw new McmodError("ADAPTER_INVALID", `Adapter data has problems (fix the JSON files):\n${problems.join("\n")}`, problems);
  }
  cache = out;
  return cache;
}

export interface AdapterTarget {
  id: string;
  mcVersion: string;
  loader: AdapterRecordT["loader"];
  java: number;
  mappings: string;
  loaderVersion: string;
}

/** All supported (mcVersion × loader) targets, newest MC version first. */
export function listTargets(): AdapterTarget[] {
  return listAdapters()
    .map((a) => ({ id: a.id, mcVersion: a.mcVersion, loader: a.loader, java: a.java, mappings: a.mappings, loaderVersion: a.loaderVersion }))
    .sort((x, y) => y.mcVersion.localeCompare(x.mcVersion, undefined, { numeric: true }) || x.loader.localeCompare(y.loader));
}

export function getAdapter(mcVersion: string, loader: string): AdapterRecordT | undefined {
  return listAdapters().find((a) => a.mcVersion === mcVersion && a.loader === loader);
}

/** Like getAdapter but throws an ADAPTER_NOT_FOUND error listing valid targets. */
export function requireAdapter(mcVersion: string, loader: string): AdapterRecordT {
  const a = getAdapter(mcVersion, loader);
  if (!a) {
    const supported = listTargets().map((t) => `  - ${t.id} (java ${t.java})`).join("\n");
    throw new McmodError(
      "ADAPTER_NOT_FOUND",
      `No adapter for (mcVersion=${mcVersion}, loader=${loader}). Supported targets:\n${supported}`,
      { mcVersion, loader },
    );
  }
  return a;
}

/** True if a data dir contains at least one adapter JSON (used by smoke checks). */
export function adapterCount(): number {
  return listAdapters().length;
}

const assetsRoot = fileURLToPath(new URL("../assets/", import.meta.url));

/** Absolute path of a shipped adapter asset, e.g. "gradle-9.5.1/gradle/wrapper/gradle-wrapper.jar". */
export function resolveAsset(assetKey: string): string {
  if (assetKey.includes("..") || assetKey.startsWith("/") || assetKey.includes("\\")) {
    throw new McmodError("PATH_ESCAPE", `Illegal asset key: ${assetKey}`, { assetKey });
  }
  return join(assetsRoot, ...assetKey.split("/"));
}

/**
 * The agent-facing view of one adapter: the version facts an agent needs, plus the sources those
 * facts came from.
 *
 * Lives here rather than in each surface because the CLI and the MCP server used to hand-roll this
 * field list separately — the exact way two surfaces drift until one of them silently stops
 * reporting a field. `references` is why it matters: it is the only part of an adapter that tells an
 * agent where to look next, so it must reach every surface.
 */
export function adapterSummary(a: AdapterRecordT, includeTemplates = false): Record<string, unknown> {
  return {
    id: a.id,
    mcVersion: a.mcVersion,
    loader: a.loader,
    loaderVersion: a.loaderVersion,
    java: a.java,
    mappings: a.mappings,
    gradleWrapperVersion: a.gradleWrapperVersion,
    contentPaths: a.contentPaths,
    langKeys: a.langKeys,
    notes: a.notes,
    references: a.references,
    templateKeys: Object.keys(a.templates),
    templates: includeTemplates ? a.templates : undefined,
  };
}

/**
 * planGeneration + adapter-owned asset resolution. This is the single planning entry point the
 * CLI, MCP server and HTTP API all call, so no surface can forget the wrapper jar.
 */
export function planProject(spec: ModSpecT, adapter: AdapterRecordT, options: PlanOptions = {}): GenerationPlan {
  return planGeneration(spec, adapter, { resolveAsset, ...options });
}
