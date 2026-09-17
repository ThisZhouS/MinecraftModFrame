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
});

export const LangKeysSpec = z.object({
  item: z.string(),
  block: z.string(),
  itemGroup: z.string(),
  /** Optional: required only by adapters that support ui.screens. */
  screenTitle: z.string().optional(),
  screenLine: z.string().optional(),
  keybind: z.string().optional(),
  keybindCategory: z.string().optional(),
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
  /** Sub-package holding client-only classes (screens, key handling). */
  clientSubpackage: z.string().default("client"),
  /** Extra build facts flattened into vars as {{gradle_<key>}} (versions, plugin ids, ...). */
  gradle: z.record(z.string(), z.unknown()),
  /** group key -> constant expression usable inside the registration template. */
  vanillaGroups: z.record(z.string(), z.string()),
  /** Binary/large files shipped with the adapter package (e.g. gradle-wrapper.jar). */
  assetFiles: z.array(z.object({ path: z.string(), asset: z.string() })).default([]),
  projectFiles: z.array(TemplateFileSpec).min(1),
  templates: z.record(z.string(), z.string()),
  contentPaths: ContentPathsSpec,
  langKeys: LangKeysSpec,
  notes: z.array(z.string()).default([]),
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
  itemRegistration: ["{{REG_NAME}}", "{{SETTINGS}}"],
  blockRegistration: ["{{REG_NAME}}", "{{SETTINGS}}"],
  itemSettings: ["{{MAX_COUNT}}"],
  itemSettingsMaxCount: ["{{MAX_COUNT}}"],
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
  for (const [key, wanted] of Object.entries(REQUIRED_PLACEHOLDERS)) {
    const body = a.templates[key];
    if (body === undefined) continue;
    for (const ph of wanted) {
      // itemSettings/itemSettingsMaxCount must both expose {{MAX_COUNT}} only if the generator uses it.
      if (key === "itemSettings" && ph === "{{MAX_COUNT}}") continue;
      if (!body.includes(ph)) problems.push(`template "${key}" must use ${ph}`);
    }
  }
  return problems;
}
