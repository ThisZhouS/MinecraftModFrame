import fs from "node:fs";
import { execFileSync } from "node:child_process";

/**
 * Derive a new adapter from an existing same-era one, applying only FACTS gathered from
 * authoritative sources.
 *
 * Deliberately NOT automated: the semantic API changes between versions. Those are exactly what the
 * adapter system exists to record, and what the compile step is there to catch — a derived adapter
 * is a starting point, never a claim of correctness.
 *
 * Optional slices (UI / recipes / advancements / entities / datagen) are STRIPPED by default.
 * They are not version-independent: 1.21.2+ changed MobRenderer to three type variables and
 * EntityType.Builder#build to take a ResourceKey, so a 1.21.1 entity template does not compile on
 * 1.21.4. Keeping a stale template would emit broken Java; removing it makes the generator fail
 * with a clear "this adapter does not support entities" instead.
 */
const [srcId, mc, loader, ...flags] = process.argv.slice(2);
if (!srcId || !mc || !loader) {
  console.error("usage: node scripts/derive-adapter.mjs <sourceAdapterId> <mcVersion> <loader> [--keep-optional]");
  process.exit(2);
}
const keepOptional = flags.includes("--keep-optional");

const OPTIONAL_TEMPLATES = [
  // UI
  "screenClass", "clientBootstrap", "keybindField", "keybindRegister", "screenOpenStatement",
  // recipes
  "recipeShaped", "recipeShapeless", "recipeCooking", "recipeStonecutting",
  // advancements
  "advancement", "advancementItemPredicate", "advancementTagPredicate",
  // entities
  "entityClass", "entitiesRegistryClass", "entitiesRegistryInit", "entityRegistration",
  "entityAttributeHook", "entityRendererClass", "entityRendererRegistration", "entityLootTable",
  // datagen
  "dataGenClass", "dataGenProvider", "dataGenRunConfig",
];
const OPTIONAL_CONTENT_PATHS = ["recipe", "advancement", "entityLootTable"];
const OPTIONAL_LANG_KEYS = [
  "screenTitle", "screenLine", "screenButton", "keybind", "keybindCategory",
  "advancementTitle", "advancementDescription", "entity",
];

const facts = JSON.parse(
  execFileSync(process.execPath, ["scripts/version-facts.mjs", mc, loader, "--pack-format"], { encoding: "utf8" }),
);
console.log("facts:", JSON.stringify(facts));

const src = JSON.parse(fs.readFileSync(`packages/adapters/data/${srcId}.json`, "utf8"));
const a = structuredClone(src);

a.id = `${loader}-${mc}`;
a.mcVersion = mc;
a.loader = loader;
a.java = facts.java;
a.gradle = { ...a.gradle };

if (loader === "fabric") {
  a.loaderVersion = facts.loaderVersion;
  // Deliberately NOT using facts.loomVersion: "newest loom" is not "loom this target can use".
  // Loom 1.18.2 requires JVM 25, so a Java 21 target cannot build with it at all. The source
  // adapter's loom is era-matched and already proven by its own compile, so inherit that instead.
  if (facts.fabricApiVersion) a.gradle.fabricApiVersion = facts.fabricApiVersion;
} else if (loader === "forge") {
  a.loaderVersion = facts.forgeVersion;
  a.gradle.forgeVersion = facts.forgeVersion;
} else if (loader === "neoforge") {
  a.loaderVersion = facts.neoforgeVersion;
}
if (facts.packFormat !== undefined) a.gradle.packFormat = facts.packFormat;

if (!keepOptional) {
  for (const k of OPTIONAL_TEMPLATES) delete a.templates[k];
  for (const k of OPTIONAL_CONTENT_PATHS) delete a.contentPaths[k];
  for (const k of OPTIONAL_LANG_KEYS) delete a.langKeys[k];
  delete a.entityModels;
  delete a.entityKinds;
}

a.notes = [
  ...a.notes.filter((n) => !n.startsWith("Derived from") && !n.startsWith("SCOPE:")),
  `Derived from ${srcId}, re-fitted with facts from scripts/version-facts.mjs (loader ${a.loaderVersion}, ` +
    `pack_format ${facts.packFormat ?? "?"} read from the real game jar).`,
  keepOptional
    ? "SCOPE: full slice set inherited from the source adapter — the optional slices are NOT verified on this version."
    : "SCOPE: items + blocks + textures only. UI/recipes/advancements/entities/datagen are deliberately absent " +
      "because their templates are not version-independent (1.21.2+ alone changed MobRenderer's arity and " +
      "EntityType.Builder#build). Asking for them fails with a clear error rather than emitting broken Java.",
];

fs.writeFileSync(`packages/adapters/data/${a.id}.json`, JSON.stringify(a, null, 2) + "\n");
console.log(`wrote packages/adapters/data/${a.id}.json (${Object.keys(a.templates).length} templates)`);
