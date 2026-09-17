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

/**
 * An item/block reference inside a recipe: either a content id declared in this spec, or an explicit
 * resource location ("minecraft:stick", "#c:ingots" for a tag). The declared-id case is validated by
 * the generator, which is the only place that knows which ids exist.
 */
export const ItemRefSpec = z
  .string()
  .min(1)
  .regex(/^[#]?[a-z0-9_.:-]+$/, "item reference must be a content id or a resource location like minecraft:stick");

export const RECIPE_TYPES = [
  "crafting_shaped",
  "crafting_shapeless",
  "smelting",
  "blasting",
  "smoking",
  "campfire_cooking",
  "stonecutting",
] as const;
export const RecipeType = z.enum(RECIPE_TYPES);
export type RecipeTypeT = z.infer<typeof RecipeType>;

export const RecipeSpec = z
  .object({
    /** File name and stable identity of the recipe. */
    id: idField("recipe"),
    type: RecipeType,
    /** The produced item (content id or resource location). */
    result: ItemRefSpec,
    /** How many items the recipe produces. */
    count: z.number().int().min(1).max(64).default(1),
    /** Recipe-book group; optional. */
    group: z.string().min(1).optional(),
    /** crafting_shaped only: rows of key characters, e.g. ["RR", "RR"]. */
    pattern: z.array(z.string().min(1)).min(1).max(3).optional(),
    /** crafting_shaped only: key character -> item reference. */
    key: z.record(z.string().regex(/^[A-Za-z]$/), ItemRefSpec).optional(),
    /** crafting_shapeless only: the unordered ingredient list. */
    ingredients: z.array(ItemRefSpec).min(1).max(9).optional(),
    /** Cooking and stonecutting: the single input. */
    ingredient: ItemRefSpec.optional(),
    /** Cooking types only: experience granted. */
    experience: z.number().min(0).max(100).default(0.1),
    /** Cooking types only: ticks; default 200 for smelting, 100 for blasting/smoking. */
    cookingTime: z.number().int().min(1).max(72000).optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    const fail = (field: string, message: string) => ctx.addIssue({ code: "custom", path: [field], message });
    const shaped = r.type === "crafting_shaped";
    const shapeless = r.type === "crafting_shapeless";
    const cooking = r.type === "smelting" || r.type === "blasting" || r.type === "smoking" || r.type === "campfire_cooking";
    if (shaped && r.pattern === undefined) fail("pattern", "crafting_shaped requires pattern (e.g. [\"RR\", \"RR\"])");
    if (shaped && r.key === undefined) fail("key", "crafting_shaped requires key (e.g. { \"R\": \"ruby\" })");
    if (shapeless && r.ingredients === undefined) fail("ingredients", "crafting_shapeless requires ingredients");
    if (!shaped && r.pattern !== undefined) fail("pattern", "pattern is only valid for crafting_shaped");
    if (!shaped && r.key !== undefined) fail("key", "key is only valid for crafting_shaped");
    if (!shapeless && r.ingredients !== undefined) fail("ingredients", "ingredients is only valid for crafting_shapeless");
    if ((cooking || r.type === "stonecutting") && r.ingredient === undefined) {
      fail("ingredient", r.type + " requires ingredient");
    }
    if (shaped && r.pattern !== undefined && r.key !== undefined) {
      for (const ch of r.pattern.join("")) {
        if (ch !== " " && !(ch in r.key)) fail("pattern", "pattern uses character \"" + ch + "\" that is missing from key");
      }
    }
  });

export const AdvancementSpec = z
  .object({
    id: idField("advancement"),
    /** Shown in the advancement toast; defaults derived from the id. */
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    /** Parent advancement (id of another advancement in this spec) or an explicit resource location. */
    parent: z.string().min(1).optional(),
    /** Root advancements only: tab background texture, e.g. minecraft:textures/block/stone.png. */
    background: z.string().min(1).optional(),
    /** Icon item; defaults to the result of the first unlocked recipe, else the first item of the mod. */
    icon: ItemRefSpec.optional(),
    /** Declared recipe ids whose recipe-book entry this advancement unlocks. */
    unlockRecipes: z.array(z.string().min(1)).default([]),
    /** Items in the inventory that grant the advancement. */
    hasItems: z.array(ItemRefSpec).default([]),
    frame: z.enum(["task", "goal", "challenge"]).default("task"),
    announceToChat: z.boolean().default(true),
    showToast: z.boolean().default(true),
    hidden: z.boolean().default(false),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (a.unlockRecipes.length === 0 && a.hasItems.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["unlockRecipes"],
        message: "an advancement needs at least one trigger: unlockRecipes and/or hasItems",
      });
    }
  });

export const ContentSpec = z.object({
  items: z.array(ItemSpec).default([]),
  blocks: z.array(BlockSpec).default([]),
  recipes: z.array(RecipeSpec).default([]),
  advancements: z.array(AdvancementSpec).default([]),
}).strict();

/** One generated in-game screen. Layout numbers are data so agents can adjust UI without editing Java. */
export const ScreenSpec = z.object({
  id: idField("screen"),
  /** Window title; default derived from the id. */
  title: z.string().min(1).optional(),
  /** Single letter (A-Z) that opens this screen; absent = generated but not bound to a key. */
  key: z.string().regex(/^[A-Z]$/, "key must be a single uppercase letter, e.g. K").optional(),
  /** Translation keys appended verbatim are not allowed; use lines for text. */
  width: z.number().int().min(80).max(1200).default(220),
  height: z.number().int().min(60).max(1200).default(140),
  /** Body text, one line per entry, rendered top-down. */
  lines: z.array(z.string().min(1)).default([]),
}).strict();

export const UiSpec = z.object({
  screens: z.array(ScreenSpec).default([]),
}).strict();

export const ModSpec = z.object({
  schemaVersion: z.literal(1),
  mod: ModMetaSpec,
  target: z.object({
    mcVersion: z.string().regex(MC_VERSION_RE, "mcVersion must look like 1.21.1"),
    loader: LoaderKind,
  }).strict(),
  content: ContentSpec.default({ items: [], blocks: [], recipes: [], advancements: [] }),
  ui: UiSpec.default({ screens: [] }),
}).strict();

export type ScreenSpecT = z.infer<typeof ScreenSpec>;
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
