import { z } from "zod";

/** Regexes are part of the public contract (adapters/CLI/MCP reuse them for early checks). */
export const MOD_ID_RE = /^[a-z][a-z0-9_-]{1,63}$/;
export const ENTRY_ID_RE = /^[a-z][a-z0-9_]*$/;
export const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
export const MC_VERSION_RE = /^\d+\.\d+(\.\d+)?$/;

export const LOADER_VALUES = ["fabric", "neoforge", "forge"] as const;
export const LoaderKind = z.enum(LOADER_VALUES);
export type LoaderKind = z.infer<typeof LoaderKind>;

const idField = (what: string) =>
  z.string().regex(ENTRY_ID_RE, `${what} id must be snake_case (lowercase letters/digits/underscore, start with a letter)`);

export const ItemSpec = z.object({
  id: idField("item"),
  /** Display name; default derived from id ("ruby_ore" -> "Ruby Ore"). */
  name: z.string().min(1).optional(),
  /** Vanilla creative group key (adapter-interpreted); absent = the mod's own tab. */
  group: z.string().regex(ENTRY_ID_RE).optional(),
  maxCount: z.number().int().min(1).max(99).optional(),
}).strict();

export const BlockSpec = z.object({
  id: idField("block"),
  name: z.string().min(1).optional(),
  hardness: z.number().min(0).max(50).default(1.5),
  resistance: z.number().min(0).max(1200).default(6),
  tool: z.enum(["pickaxe", "axe", "shovel", "hoe", "none"]).default("pickaxe"),
}).strict();

export const ModMetaSpec = z.object({
  modId: z.string().regex(MOD_ID_RE, "modId must be lowercase, start with a letter, 2-64 chars of [a-z0-9_-]"),
  namespace: z.string().regex(ENTRY_ID_RE).optional(),
  name: z.string().min(1).optional(),
  version: z.string().regex(SEMVER_RE, "version must be semver like 1.0.0").default("1.0.0"),
  description: z.string().optional(),
  authors: z.array(z.string().min(1)).optional(),
  license: z.string().optional(),
}).strict();

export const ContentSpec = z.object({
  items: z.array(ItemSpec).default([]),
  blocks: z.array(BlockSpec).default([]),
}).strict();

export const ModSpec = z.object({
  schemaVersion: z.literal(1),
  mod: ModMetaSpec,
  target: z.object({
    mcVersion: z.string().regex(MC_VERSION_RE, "mcVersion must look like 1.21.1"),
    loader: LoaderKind,
  }).strict(),
  content: ContentSpec.default({ items: [], blocks: [] }),
}).strict();

export type ItemSpecT = z.infer<typeof ItemSpec>;
export type BlockSpecT = z.infer<typeof BlockSpec>;
export type ModMetaT = z.infer<typeof ModMetaSpec>;
export type ModSpecT = z.infer<typeof ModSpec>;

export interface SpecIssue { path: string; message: string }
export type ParseResult =
  | { ok: true; spec: ModSpecT }
  | { ok: false; issues: SpecIssue[]; formatted: string };

/** Parse + validate a ModSpec. Errors are formatted so an agent can fix them without human help. */
export function parseModSpec(input: unknown): ParseResult {
  const r = ModSpec.safeParse(input);
  if (r.success) return { ok: true, spec: r.data };
  const issues: SpecIssue[] = r.error.issues.map((i) => ({
    path: i.path.map(String).join("."),
    message: i.message,
  }));
  const formatted = issues.map((i) => `- ${i.path || "<root>"}: ${i.message}`).join("\n");
  return { ok: false, issues, formatted };
}

/** Effective namespace (explicit or the modId). */
export function namespaceOf(spec: ModSpecT): string {
  return spec.mod.namespace ?? spec.mod.modId;
}
