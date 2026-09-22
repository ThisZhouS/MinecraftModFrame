import { z } from "zod";
import { LoaderKind } from "./spec.js";

/**
 * The Adapter Contract — the ONLY place where Minecraft version/loader differences are allowed
 * to live (Project Principle 1). Everything here is pure data so communities can add adapters
 * without touching engine code.
 *
 * Adapter = (mcVersion × loader). It carries:
 *  - build facts (java, mappings, loader/gradle versions)
 *  - skeleton projectFiles (path -> template key)
 *  - named template bodies for registrations / assets
 *  - contentPaths: version-correct resource path conventions (they differ across 1.20/1.21+)
 *  - langKeys / vanillaGroups: loader-specific key & constant expressions
 */

export const TemplateFileSpec = z.object({
  /** Relative posix path; may contain {{vars}} (e.g. {{packagePath}}). */
  path: z.string().min(1),
  /** Key into `templates`. */
  template: z.string().min(1),
  managed: z.boolean().default(true),
  executable: z.boolean().default(false),
});

export const ContentPathsSpec = z.object({
  itemModel: z.string(),
  blockState: z.string(),
  blockModel: z.string(),
  blockItemModel: z.string(),
  lootTable: z.string(),
  mineableTag: z.string(),
  lang: z.string(),
  /** Optional: required only by adapters that support content.recipes. */
  recipe: z.string().optional(),
  /** Optional: required only by adapters that support content.advancements. */
  advancement: z.string().optional(),
  /** Optional: required only by adapters that support content.entities. */
  entityLootTable: z.string().optional(),
  /**
   * Optional: required only by adapters that support spec.textures. The texture directory moved
   * across versions (textures/item vs textures/items on some forks), so it stays adapter data.
   */
  itemTexture: z.string().optional(),
  blockTexture: z.string().optional(),
  entityTexture: z.string().optional(),
});

/**
 * Where a target's version facts come from.
 *
 * The whole point of an adapter is to stop agents re-deriving version knowledge from training data or
 * from scattered tutorials. That only works if the adapter can also say *where to look* when a fact
 * is missing or suspect — so each target carries its own authoritative sources, and they travel to
 * the agent through get_adapter / `mcmod adapter` alongside the facts themselves.
 */
export const ReferenceSpec = z.object({
  label: z.string().min(1),
  url: z.string().regex(/^https:\/\/\S+$/, "reference urls must be https"),
  kind: z.enum([
    "official-docs", // the loader's own documentation
    "mappings", // name-mapping lookup (mojmap/yarn/MCP/SRG)
    "migration", // "what changed between version X and Y" guides
    "example-mod", // a maintained reference project
    "datapack", // datapack/resource-pack format references and tools
    "community", // community tutorials and discussion
  ]),
  /** What this source is good for — keeps the list from being a bare link dump. */
  note: z.string().optional(),
}).strict();

export const LangKeysSpec = z.object({
  item: z.string(),
  block: z.string(),
  itemGroup: z.string(),
  /** Optional: required only by adapters that support ui.screens. */
  screenTitle: z.string().optional(),
  screenLine: z.string().optional(),
  keybind: z.string().optional(),
  keybindCategory: z.string().optional(),
  /** Optional: required only by adapters that support content.advancements. */
  advancementTitle: z.string().optional(),
  advancementDescription: z.string().optional(),
  /** Optional: required only by adapters that support content.entities. */
  entity: z.string().optional(),
});

/** Template keys the built-in generators require. */
export const REQUIRED_TEMPLATE_KEYS = [
  "mainClass",
  "itemsRegistryClass",
  "blocksRegistryClass",
  "itemRegistration",
  "itemRegistrationGroup",
  "itemSettings",
  "itemSettingsMaxCount",
  "blockRegistration",
  "blockSettings",
  "blockSettingsNoTool",
  "tabBlock",
  "tabEntryLineItem",
  "tabEntryLineBlock",
  "blockState",
  "blockModel",
  "blockItemModel",
  "itemModel",
  "lootTable",
  "mineableTag",
] as const;

/**
 * Template keys the UI generator needs. They are OPTIONAL in the contract so minimal adapters stay
 * small: an adapter either declares all of them (screen support) or none, and lint enforces that.
 */
export const UI_TEMPLATE_KEYS = [
  "screenClass",
  "screenLineDraw",
  "clientBootstrap",
  "keybindField",
  "keybindRegister",
  "screenOpenStatement",
] as const;

/** Language keys the UI generator needs alongside UI_TEMPLATE_KEYS. */
export const UI_LANG_KEYS = ["screenTitle", "screenLine", "keybind", "keybindCategory"] as const;

/** Template keys the recipe generator needs (all-or-nothing, like the UI set). */
export const RECIPE_TEMPLATE_KEYS = ["recipeShaped", "recipeShapeless", "recipeCooking", "recipeStonecutting"] as const;

/** Template keys the advancement generator needs. */
export const ADVANCEMENT_TEMPLATE_KEYS = ["advancement", "advancementItemPredicate", "advancementTagPredicate"] as const;

/** Language keys the advancement generator needs. */
export const ADVANCEMENT_LANG_KEYS = ["advancementTitle", "advancementDescription"] as const;

/** Template keys the opt-in data-generation slice needs (spec.datagen = true). */
export const DATAGEN_TEMPLATE_KEYS = ["dataGenClass", "dataGenProvider", "dataGenRunConfig"] as const;

/** Template keys the entity generator needs (all-or-nothing, like the UI set). */
export const ENTITY_TEMPLATE_KEYS = [
  "entityClass",
  "entitiesRegistryClass",
  "entitiesRegistryInit",
  "entityRegistration",
  "entityAttributeHook",
  "entityRendererClass",
  "entityRendererRegistration",
  "entityLootTable",
] as const;

export const AdapterRecord = z.object({
  /** e.g. "fabric-1.21.1" */
  id: z.string().regex(/^(fabric|neoforge|forge)-\d+\.\d+(\.\d+)?$/),
  mcVersion: z.string().regex(/^\d+\.\d+(\.\d+)?$/),
  loader: LoaderKind,
  /** Loader/API version string injected into build files (fabric-api / neoforge / forge). */
  loaderVersion: z.string().min(1),
  java: z.number().int().min(8).max(25),
  mappings: z.string().min(1),
  /** Java package pattern, e.g. "com.{{modId}}". */
  basePackagePattern: z.string().min(1),
  mainClassSimpleName: z.string().default("ModMain"),
  /** Gradle distribution used by the generated wrapper. */
  gradleWrapperVersion: z.string().min(1),
  /**
   * Expression turning a screen's single-letter key into a key code, e.g.
   * "org.lwjgl.glfw.GLFW.GLFW_KEY_{{KEY}}". Lives here because the input API differs per version.
   */
  keyCodePattern: z.string().default("org.lwjgl.glfw.GLFW.GLFW_KEY_{{KEY}}"),
  /** Sub-package holding client-only classes (screens, key handling, entity renderers). */
  clientSubpackage: z.string().default("client"),
  /** Sub-package holding common (server+client) content classes such as entity types. */
  entitySubpackage: z.string().default("entity"),
  /** Sub-package holding data-generation entry points and example providers. */
  datagenSubpackage: z.string().default("datagen"),
  /**
   * Vanilla models a generated entity renderer may reuse: spec key -> the model class and its
   * ModelLayer constant. Lives here because both names change across versions.
   */
  entityModels: z
    .record(z.string(), z.object({ modelClass: z.string(), modelLayer: z.string() }))
    .default({}),
  /**
   * Mob kinds the spec may ask for: the base class, the attribute-builder source expression and the
   * default MobCategory key. Java fragments live here (not in the engine) so a version that renames
   * any of them only needs a data change.
   */
  entityKinds: z
    .record(
      z.string(),
      z.object({ baseClass: z.string(), attributeBase: z.string(), category: z.string() }),
    )
    .default({
      monster: { baseClass: "Monster", attributeBase: "Monster.createMonsterAttributes()", category: "monster" },
      creature: { baseClass: "PathfinderMob", attributeBase: "Mob.createMobAttributes()", category: "creature" },
    }),
  /** Extra build facts flattened into vars as {{gradle_<key>}} (versions, plugin ids, ...). */
  gradle: z.record(z.string(), z.unknown()),
  /** group key -> constant expression usable inside the registration template. */
  vanillaGroups: z.record(z.string(), z.string()),
  /**
   * Item behaviour key -> the Java expression that constructs the item, with {{SETTINGS}} standing
   * for the Item.Properties expression. Lives here because the class and its constructor differ per
   * version and loader (a fishing rod is `FishingRodItem` on both 1.20.1 and 1.21.1, but that is a
   * version fact, not an engine fact). "plain" must always exist and is the default.
   */
  itemBehaviors: z
    .record(z.string(), z.string())
    .default({ plain: "new Item({{SETTINGS}})" }),
  /**
   * Behaviour key -> fully qualified class the generated registry must import. Only behaviours the
   * spec actually uses get imported, so a project that never asks for a fishing rod does not carry
   * a dangling import.
   */
  itemBehaviorImports: z.record(z.string(), z.string()).default({}),
  /** Binary/large files shipped with the adapter package (e.g. gradle-wrapper.jar). */
  assetFiles: z.array(z.object({ path: z.string(), asset: z.string() })).default([]),
  projectFiles: z.array(TemplateFileSpec).min(1),
  templates: z.record(z.string(), z.string()),
  contentPaths: ContentPathsSpec,
  langKeys: LangKeysSpec,
  notes: z.array(z.string()).default([]),
  /** Authoritative sources for this (version x loader); see ReferenceSpec. */
  references: z.array(ReferenceSpec).default([]),
}).strict();

export type AdapterRecordT = z.infer<typeof AdapterRecord>;
export type AdapterFileSpecT = z.infer<typeof TemplateFileSpec>;

export interface AdapterParseResult {
  ok: boolean;
  adapter?: AdapterRecordT;
  issues: string[];
}

export function parseAdapterRecord(input: unknown): AdapterParseResult {
  const r = AdapterRecord.safeParse(input);
  if (r.success) return { ok: true, adapter: r.data, issues: [] };
  return {
    ok: false,
    issues: r.error.issues.map((i) => `- ${i.path.map(String).join(".") || "<root>"}: ${i.message}`),
  };
}

/** Substitute the adapter-independent placeholders so lint can inspect rendered-looking text. */
function normalizeForLint(a: AdapterRecordT, s: string): string {
  return s
    .replaceAll("{{mainClassSimpleName}}", a.mainClassSimpleName)
    .replaceAll("{{packageName}}", "com.example")
    .replaceAll("{{modId}}", "examplemod");
}

/** Placeholders a template must consume or its emitted code silently loses information. */
const REQUIRED_PLACEHOLDERS: Record<string, string[]> = {
  // {{CONST}} (as written) and {{CONST_UPPER}} (SCREAMING_SNAKE) are both supplied to templates.
  // {{ITEM_CTOR}} lets the spec pick an item class (plain / fishing rod / ...) without the engine
  // knowing any Minecraft class name; {{DURABILITY_SUFFIX}} keeps durability out of the engine too.
  itemRegistration: ["{{REG_NAME}}", "{{ITEM_CTOR}}"],
  blockRegistration: ["{{REG_NAME}}", "{{SETTINGS}}"],
  itemSettings: ["{{DURABILITY_SUFFIX}}"],
  itemSettingsMaxCount: ["{{MAX_COUNT}}", "{{DURABILITY_SUFFIX}}"],
  tabEntryLineItem: ["{{CONST"],
  tabEntryLineBlock: ["{{CONST"],
  blockState: ["{{REG_NAME}}"],
  blockModel: ["{{REG_NAME}}"],
  blockItemModel: ["{{REG_NAME}}"],
  itemModel: ["{{REG_NAME}}"],
  mineableTag: ["{{VALUES}}"],
  itemsRegistryClass: ["{{ITEM_REGISTRATIONS}}"],
  blocksRegistryClass: ["{{BLOCK_REGISTRATIONS}}"],
  // UI templates (present only on screen-capable adapters).
  screenClass: ["{{SCREEN_CLASS}}", "{{SCREEN_TITLE_KEY}}", "{{SCREEN_LINE_DRAWS}}"],
  screenLineDraw: ["{{LINE_KEY}}", "{{LINE_N}}"],
  clientBootstrap: ["{{KEYBIND_FIELDS}}", "{{KEYBIND_REGISTRATIONS}}", "{{SCREEN_OPEN_BODY}}"],
  keybindField: ["{{KEYBIND_CONST}}", "{{KEY_CODE}}", "{{KEYBIND_LANG_KEY}}"],
  keybindRegister: ["{{KEYBIND_CONST}}"],
  screenOpenStatement: ["{{KEYBIND_CONST}}", "{{SCREEN_CLASS}}"],
  // Recipe templates (present only on recipe-capable adapters).
  recipeShaped: ["{{PATTERN_JSON}}", "{{KEY_JSON}}", "{{RESULT_ITEM}}", "{{COUNT}}"],
  recipeShapeless: ["{{INGREDIENTS_JSON}}", "{{RESULT_ITEM}}", "{{COUNT}}"],
  recipeCooking: ["{{RECIPE_TYPE}}", "{{INGREDIENT_JSON}}", "{{RESULT_ITEM}}", "{{COOKING_TIME}}"],
  recipeStonecutting: ["{{INGREDIENT_JSON}}", "{{RESULT_ITEM}}", "{{COUNT}}"],
  advancement: ["{{ADV_ICON_ITEM}}", "{{ADV_TITLE_JSON}}", "{{ADV_CRITERIA_JSON}}", "{{ADV_REQUIREMENTS_JSON}}"],
  advancementItemPredicate: ["{{ITEM_ID}}"],
  advancementTagPredicate: ["{{TAG_ID}}"],
  // Entity templates (present only on entity-capable adapters).
  entityClass: ["{{ENTITY_CLASS}}", "{{ENTITY_HEALTH}}", "{{ENTITY_ATTACK_DAMAGE}}", "{{ENTITY_ATTRIBUTE_BASE}}"],
  entitiesRegistryClass: ["{{ENTITY_REGISTRATIONS}}", "{{ENTITY_ATTRIBUTE_HOOKS}}"],
  entitiesRegistryInit: ["{{ENTITIES_CLASS}}"],
  entityRegistration: ["{{ENTITY_CONST}}", "{{ENTITY_ID}}"],
  entityAttributeHook: ["{{ENTITY_CONST}}", "{{ENTITY_FQ}}"],
  entityRendererClass: ["{{ENTITY_CLASS}}", "{{MODEL_CLASS}}", "{{MODEL_LAYER}}", "{{ENTITY_ID}}"],
  entityRendererRegistration: ["{{ENTITY_CONST}}", "{{RENDERER_FQ}}"],
  entityLootTable: ["{{LOOT_POOLS_JSON}}"],
  dataGenClass: ["{{DATAGEN_PROVIDER_CLASS}}"],
  dataGenProvider: ["{{DATAGEN_PROVIDER_CLASS}}", "{{modId}}", "{{namespace}}"],
  dataGenRunConfig: [],
  // Without this the project README tells users to hand-draw art the generator already painted.
  projectReadme: ["{{TEXTURE_NOTES}}"],
};

/** Static sanity checks beyond the schema: referenced template keys must exist and stay wired up. */
export function lintAdapter(a: AdapterRecordT): string[] {
  const problems: string[] = [];
  for (const f of a.projectFiles) {
    if (!(f.template in a.templates)) {
      problems.push(`projectFile "${f.path}" references missing template "${f.template}"`);
    }
  }
  for (const key of REQUIRED_TEMPLATE_KEYS) {
    if (!(key in a.templates)) problems.push(`missing required template "${key}"`);
  }
  // Tab entry lines must reference the registry class name this adapter will actually emit.
  const itemsClass = `${a.mainClassSimpleName}Items.`;
  const blocksClass = `${a.mainClassSimpleName}Blocks.`;
  const tabItem = normalizeForLint(a, a.templates.tabEntryLineItem ?? "");
  const tabBlockLine = normalizeForLint(a, a.templates.tabEntryLineBlock ?? "");
  if (a.templates.tabEntryLineItem && !tabItem.includes(itemsClass)) {
    problems.push(`tabEntryLineItem must reference the emitted registry class "${itemsClass}"`);
  }
  if (a.templates.tabEntryLineBlock && !tabBlockLine.includes(blocksClass)) {
    problems.push(`tabEntryLineBlock must reference the emitted registry class "${blocksClass}"`);
  }
  // Screen support is all-or-nothing: half an implementation would emit Java that cannot compile.
  const uiTemplates = UI_TEMPLATE_KEYS.filter((k) => k in a.templates);
  if (uiTemplates.length > 0 && uiTemplates.length !== UI_TEMPLATE_KEYS.length) {
    const missing = UI_TEMPLATE_KEYS.filter((k) => !(k in a.templates));
    problems.push(`adapter declares screen support but is missing UI template(s): ${missing.join(", ")}`);
  }
  if (uiTemplates.length > 0) {
    const missingLang = UI_LANG_KEYS.filter((k) => a.langKeys[k] === undefined);
    if (missingLang.length > 0) {
      problems.push(`adapter declares screen support but is missing langKeys: ${missingLang.join(", ")}`);
    }
    if (!a.keyCodePattern.includes("{{KEY}}")) {
      problems.push("keyCodePattern must contain {{KEY}} or every generated keybinding maps to the same key");
    }
    if (a.clientSubpackage.trim() === "") problems.push("clientSubpackage must not be empty");
  }
  // Recipes: the datapack directory is the only version difference, so hold it in contentPaths.
  const recipeTemplates = RECIPE_TEMPLATE_KEYS.filter((k) => k in a.templates);
  if (recipeTemplates.length > 0) {
    const missing = RECIPE_TEMPLATE_KEYS.filter((k) => !(k in a.templates));
    if (missing.length > 0) problems.push(`adapter declares recipe support but is missing recipe template(s): ${missing.join(", ")}`);
    const path = a.contentPaths.recipe;
    if (path === undefined) problems.push("adapter declares recipe templates but contentPaths.recipe");
    else {
      if (!path.includes("{{id}}")) problems.push("contentPaths.recipe must contain {{id}} or every recipe overwrites the same file");
      if (!path.includes("{{namespace}}")) problems.push("contentPaths.recipe must contain {{namespace}}");
    }
  }
  // Entities: registry class, attributes hook and client renderer all differ per loader.
  const entityTemplates = ENTITY_TEMPLATE_KEYS.filter((k) => k in a.templates);
  if (entityTemplates.length > 0) {
    const missing = ENTITY_TEMPLATE_KEYS.filter((k) => !(k in a.templates));
    if (missing.length > 0) problems.push(`adapter declares entity support but is missing entity template(s): ${missing.join(", ")}`);
    if (a.contentPaths.entityLootTable === undefined) problems.push("adapter declares entity templates but no contentPaths.entityLootTable");
    if (a.langKeys.entity === undefined) problems.push("adapter declares entity support but no langKeys.entity");
    if (Object.keys(a.entityModels).length === 0) problems.push("adapter declares entity support but entityModels is empty");
    for (const [key, k] of Object.entries(a.entityKinds)) {
      if (!k.baseClass || !k.attributeBase || !k.category) problems.push(`entityKinds.${key} needs baseClass, attributeBase and category`);
    }
    if (a.entityKinds.monster === undefined) problems.push("entityKinds must define the default \"monster\" kind");
    for (const [key, m] of Object.entries(a.entityModels)) {
      if (!m.modelClass.includes(".")) problems.push(`entityModels.${key}.modelClass must be a fully qualified class name`);
      if (!m.modelLayer.includes(".")) problems.push(`entityModels.${key}.modelLayer must be a fully qualified constant`);
    }
    if (!(a.templates.mainClass ?? "").includes("{{REGISTRY_INIT_CALLS}}")) {
      problems.push("adapter declares entity support but mainClass template has no {{REGISTRY_INIT_CALLS}} injection point");
    }
    if (!(a.templates.clientBootstrap ?? "").includes("{{ENTITY_RENDERER_REGISTRATIONS}}")) {
      problems.push("adapter declares entity support but clientBootstrap has no {{ENTITY_RENDERER_REGISTRATIONS}} injection point");
    }
  }
  // Data generation is opt-in per spec, so an adapter either supports it fully or not at all.
  const datagenTemplates = DATAGEN_TEMPLATE_KEYS.filter((k) => k in a.templates);
  if (datagenTemplates.length > 0) {
    const missing = DATAGEN_TEMPLATE_KEYS.filter((k) => !(k in a.templates));
    if (missing.length > 0) problems.push(`adapter declares datagen support but is missing template(s): ${missing.join(", ")}`);
    if (!(a.templates.buildGradle ?? "").includes("{{DATAGEN_RUN_CONFIG}}")) {
      problems.push("adapter declares datagen support but buildGradle has no {{DATAGEN_RUN_CONFIG}} injection point");
    }
  }
  // Advancements: same reasoning (advancements/ on 1.20.1, advancement/ on 1.21+).
  if (ADVANCEMENT_TEMPLATE_KEYS.some((k) => k in a.templates)) {
    const path = a.contentPaths.advancement;
    if (path === undefined) problems.push("adapter declares an advancement template but no contentPaths.advancement");
    else if (!path.includes("{{id}}")) problems.push("contentPaths.advancement must contain {{id}}");
    const missingLang = ADVANCEMENT_LANG_KEYS.filter((k) => a.langKeys[k] === undefined);
    if (missingLang.length > 0) problems.push(`adapter declares advancement support but is missing langKeys: ${missingLang.join(", ")}`);
  }
  // Textures are opt-in per spec, so an adapter either ships the whole path set or none of it:
  // a partial set would emit a plan that fails halfway through with a confusing error.
  const texturePaths = (["itemTexture", "blockTexture", "entityTexture"] as const).filter(
    (k) => a.contentPaths[k] !== undefined,
  );
  if (texturePaths.length > 0 && texturePaths.length < 3) {
    const missing = (["itemTexture", "blockTexture", "entityTexture"] as const).filter(
      (k) => a.contentPaths[k] === undefined,
    );
    problems.push(`adapter declares some texture paths but is missing contentPaths: ${missing.join(", ")}`);
  }
  for (const key of texturePaths) {
    const p = a.contentPaths[key]!;
    if (!p.includes("{{id}}")) problems.push(`contentPaths.${key} must contain {{id}} or every texture overwrites the same file`);
    if (!p.includes("{{namespace}}")) problems.push(`contentPaths.${key} must contain {{namespace}}`);
    if (!p.endsWith(".png")) problems.push(`contentPaths.${key} must end in .png`);
  }
  for (const [key, wanted] of Object.entries(REQUIRED_PLACEHOLDERS)) {
    const body = a.templates[key];
    if (body === undefined) continue;
    for (const ph of wanted) {
      if (!body.includes(ph)) problems.push(`template "${key}" must use ${ph}`);
    }
  }
  // A duplicated link is almost always a copy-paste slip, and it makes the list look longer than the
  // knowledge behind it actually is.
  const seenUrls = new Set<string>();
  for (const r of a.references) {
    if (seenUrls.has(r.url)) problems.push(`duplicate reference url: ${r.url}`);
    seenUrls.add(r.url);
  }
  if (a.references.length > 0 && !a.references.some((r) => r.kind === "official-docs")) {
    problems.push('references should include the loader\'s own documentation (kind "official-docs")');
  }
  // Tab-entry lines are emitted into register(), which runs from the mod constructor — before any
  // RegisterEvent has populated a DeferredRegister. Resolving a registry entry there throws
  // "Registry Object not present" at load time, and compilation cannot catch it: the bug only shows
  // up when the game actually starts. Add the deferred holder itself (it is a Supplier) and let the
  // creative-tab lambda resolve it later.
  for (const key of ["tabEntryLineItem", "tabEntryLineBlock"] as const) {
    const body = a.templates[key];
    if (body !== undefined && /\.get\(\)/.test(body)) {
      problems.push(
        `template "${key}" resolves a registry entry during mod construction (.get()); ` +
          `add the deferred holder itself and resolve it lazily in the tab, or the mod throws "Registry Object not present" at load time`,
      );
    }
  }
  // Every item must be constructible: without "plain" a spec that names no behaviour cannot build.
  if (a.itemBehaviors.plain === undefined) {
    problems.push('itemBehaviors must define "plain" (the default item constructor)');
  }
  if (Object.keys(a.itemBehaviorImports).length > 0) {
    if (!(a.templates.itemsRegistryClass ?? "").includes("{{ITEM_BEHAVIOR_IMPORTS}}")) {
      problems.push("adapter declares itemBehaviorImports but itemsRegistryClass has no {{ITEM_BEHAVIOR_IMPORTS}} injection point");
    }
    for (const key of Object.keys(a.itemBehaviorImports)) {
      if (a.itemBehaviors[key] === undefined) {
        problems.push(`itemBehaviorImports.${key} has no matching itemBehaviors entry`);
      }
    }
  }
  for (const [key, expr] of Object.entries(a.itemBehaviors)) {
    if (!expr.includes("{{SETTINGS}}")) {
      problems.push(`itemBehaviors.${key} must use {{SETTINGS}} or the item ignores its properties`);
    }
  }
  return problems;
}
