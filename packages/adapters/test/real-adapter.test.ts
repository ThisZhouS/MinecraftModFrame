import { describe, expect, it } from "vitest";
import { exampleSpec } from "@mcmodkit/core";
import { listAdapters, planProject, requireAdapter } from "../src/index.js";

const spec = exampleSpec();
const adapter = requireAdapter("1.21.1", "fabric");
const plan = planProject(spec, adapter);
const paths = plan.files.map((f) => f.path);

/**
 * Adapters may legitimately carry only a subset of the slices: UI/recipes/advancements/entities/
 * datagen are all-or-nothing, and the lint enforces that. A slice's templates are not
 * version-independent — 1.21.2 alone changed MobRenderer's type-variable arity and made
 * EntityType.Builder#build take a ResourceKey — so a newly added version starts without them and
 * gains them as each is ported and compile-verified.
 *
 * These tests therefore drive each adapter with a spec trimmed to what it actually declares, and a
 * separate test below pins that asking for an undeclared slice fails loudly instead of emitting
 * broken Java.
 */
function declares(a: ReturnType<typeof listAdapters>[number], key: string): boolean {
  return (a.templates as Record<string, string>)[key] !== undefined;
}

function specFor(a: ReturnType<typeof listAdapters>[number]) {
  const s = structuredClone(spec);
  if (!declares(a, "screenClass")) s.ui = { screens: [] };
  if (!declares(a, "recipeShaped")) s.content.recipes = [];
  if (!declares(a, "advancement")) s.content.advancements = [];
  if (!declares(a, "entityClass")) s.content.entities = [];
  if (!declares(a, "dataGenClass")) s.datagen = false;
  return s;
}

const planFor = (a: ReturnType<typeof listAdapters>[number]) => (a.id === adapter.id ? plan : planProject(specFor(a), a));

describe("fabric-1.21.1 adapter", () => {
  it("ships a runnable gradle wrapper as binary assets", () => {
    const jar = plan.files.find((f) => f.path === "gradle/wrapper/gradle-wrapper.jar");
    expect(jar).toBeDefined();
    expect(jar!.copyFrom).toMatch(/gradle-wrapper\.jar$/);
    expect(paths).toContain("gradlew");
    expect(paths).toContain("gradlew.bat");
    // gradlew must be marked executable so unix checkouts work.
    expect(plan.files.find((f) => f.path === "gradlew")!.executable).toBe(true);
  });

  it("uses the singular 1.21 datapack directories", () => {
    expect(paths).toContain("src/main/resources/data/examplemod/loot_table/blocks/ruby_ore.json");
    expect(paths).toContain("src/main/resources/data/minecraft/tags/block/mineable/pickaxe.json");
    // Pre-1.21 plural names fail silently in game - never emit them.
    expect(paths.some((p) => p.includes("loot_tables"))).toBe(false);
    expect(paths.some((p) => p.includes("tags/blocks"))).toBe(false);
  });

  it("places every java source next to the adapter-declared main class", () => {
    expect(paths).toContain("src/main/java/com/examplemod/ModMain.java");
    expect(paths).toContain("src/main/java/com/examplemod/ModMainItems.java");
    expect(paths).toContain("src/main/java/com/examplemod/ModMainBlocks.java");
  });

  it("routes a vanilla-group item into the vanilla tab and the rest into the mod tab", () => {
    const items = plan.files.find((f) => f.path.endsWith("ModMainItems.java"))!.content;
    expect(items).toContain("ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.INGREDIENTS)");
    expect(items).toContain("TAB_ENTRIES.add(ModMainItems.CHARGED_RUBY);");
    expect(items).not.toContain("TAB_ENTRIES.add(ModMainItems.RUBY);");
  });

  it("renders version facts from the adapter, never hard-coded in templates", () => {
    expect(plan.files.find((f) => f.path === "gradle.properties")!.content).toContain("minecraft_version=1.21.1");
    const gradleProps = plan.files.find((f) => f.path === "build.gradle")!.content;
    // toVersion() rather than VERSION_<n>: Java 8 is VERSION_1_8 in Gradle, so a bare
    // "VERSION_" + version would emit VERSION_8 and fail on every Java 8 target.
    expect(gradleProps).toContain("JavaVersion.toVersion(21)");
    expect(gradleProps).not.toContain("1.21.1");
  });
});

describe("adapter data hygiene (principle 1: version facts only in adapters)", () => {
  it("no template hard-codes its own MC version outside placeholders", () => {
    for (const a of listAdapters()) {
      for (const [key, body] of Object.entries(a.templates)) {
        expect(body.includes(a.mcVersion), `${a.id}: template "${key}" hard-codes ${a.mcVersion}`).toBe(false);
      }
      // project paths are data too, but they must not embed a concrete version either.
      for (const f of a.projectFiles) {
        expect(f.path.includes(a.mcVersion), `${a.id}: path "${f.path}" hard-codes ${a.mcVersion}`).toBe(false);
      }
    }
  });

  it("every adapter renders cleanly for the example spec (no unrendered placeholders)", () => {
    // This is the strongest check available for adapters that cannot be compile-verified on this
    // machine: a template/vars mismatch shows up as a literal {{placeholder}} in emitted code.
    for (const a of listAdapters()) {
      const p = planFor(a);
      expect(p.files.length).toBeGreaterThan(20);
      for (const f of p.files) {
        const leftover = f.content.match(/\{\{[a-zA-Z_]+\}\}/g);
        expect(leftover, `${a.id}: ${f.path} has unrendered ${leftover?.[0]}`).toBeNull();
      }
    }
  });

  it("generates the UI slice for every adapter that declares it", () => {
    for (const a of listAdapters().filter((x) => declares(x, "screenClass"))) {
      const p = planFor(a);
      const paths = p.files.map((f) => f.path);
      expect(paths, `${a.id} should emit a client bootstrap`).toContain("src/main/java/com/examplemod/client/ModMainClient.java");
      expect(paths, `${a.id} should emit the screen class`).toContain("src/main/java/com/examplemod/client/ModMainGuideScreen.java");
      const boot = p.files.find((f) => f.path.endsWith("ModMainClient.java"))!.content;
      expect(boot).toContain("KEY_GUIDE");
      expect(boot).toContain("ModMainGuideScreen");
      const lang = JSON.parse(p.files.find((f) => f.path.endsWith("lang/en_us.json"))!.content);
      expect(lang["examplemod.screen.guide.title"]).toBe("Example Mod Guide");
      expect(lang["examplemod.key.guide"]).toBe("Open Example Mod Guide");
    }
  });

  it("keeps the renderBackground signature version-correct in screen templates", () => {
    // Verified with javap against the real mapped jars: 1.20.1 takes (GuiGraphics), 1.21.x takes
    // (GuiGraphics, int, int, float). Getting this wrong is a compile error, so pin it here too.
    const byId = new Map(listAdapters().map((a) => [a.id, a]));
    expect(byId.get("forge-1.20.1")!.templates.screenClass).toContain("renderBackground(guiGraphics);");
    expect(byId.get("fabric-1.21.1")!.templates.screenClass).toContain("renderBackground(guiGraphics, mouseX, mouseY, partialTick);");
    expect(byId.get("neoforge-1.21.1")!.templates.screenClass).toContain("renderBackground(guiGraphics, mouseX, mouseY, partialTick);");
  });

  it("writes recipes and advancements in each version's own JSON dialect", () => {
    // Verified against vanilla datapack files inside the real jars: 1.21 renamed the item-stack key
    // from "item" to "id" and flattened item predicates to a plain string; 1.20.1 keeps the object forms.
    const adapters = new Map(listAdapters().map((a) => [a.id, a]));
    const fileOf = (adapterId: string, suffix: string) => {
      const p = planProject(spec, adapters.get(adapterId)!);
      const f = p.files.find((x) => x.path.endsWith(suffix));
      expect(f, adapterId + " should emit " + suffix).toBeDefined();
      return JSON.parse(f!.content);
    };

    const fabShaped = fileOf("fabric-1.21.1", "recipe/charged_ruby.json");
    expect(fabShaped.result).toEqual({ id: "examplemod:charged_ruby", count: 1 });
    expect(fabShaped.key).toEqual({ R: { item: "examplemod:ruby" } });
    expect(fileOf("fabric-1.21.1", "recipe/ruby_from_smelting.json").result).toEqual({ id: "examplemod:ruby" });
    expect(fileOf("fabric-1.21.1", "advancement/root.json").display.icon).toEqual({ id: "examplemod:ruby", count: 1 });
    expect(fileOf("fabric-1.21.1", "advancement/root.json").criteria.has_examplemod_ruby.conditions.items[0]).toBe("examplemod:ruby");

    const forgeShaped = fileOf("forge-1.20.1", "recipes/charged_ruby.json");
    expect(forgeShaped.result).toEqual({ item: "examplemod:charged_ruby", count: 1 });
    expect(fileOf("forge-1.20.1", "recipes/ruby_from_smelting.json").result).toBe("examplemod:ruby");
    expect(fileOf("forge-1.20.1", "advancements/root.json").display.icon).toEqual({ item: "examplemod:ruby" });
    expect(fileOf("forge-1.20.1", "advancements/root.json").criteria.has_examplemod_ruby.conditions.items[0]).toEqual({
      items: ["examplemod:ruby"],
    });
  });

  it("uses the version's own datapack directory names for every data file", () => {
    for (const a of listAdapters().filter((x) => declares(x, "recipeShaped"))) {
      const p = planFor(a);
      const dirs = p.files.map((f) => f.path).filter((x) => x.includes("/data/"));
      const singular = a.mcVersion.startsWith("1.21");
      const expectedRecipes = singular ? "/data/examplemod/recipe/" : "/data/examplemod/recipes/";
      const expectedAdv = singular ? "/data/examplemod/advancement/" : "/data/examplemod/advancements/";
      expect(dirs.some((d) => d.includes(expectedRecipes)), a.id + " recipe dir").toBe(true);
      expect(dirs.some((d) => d.includes(expectedAdv)), a.id + " advancement dir").toBe(true);
      // never mix the two conventions in one plan
      expect(dirs.some((d) => d.includes(singular ? "/recipes/" : "/recipe/")), a.id + " mixed recipe dirs").toBe(false);
    }
  });

  it("emits parseable JSON for every generated data/resource file", () => {
    for (const a of listAdapters()) {
      const p = planFor(a);
      for (const f of p.files) {
        if (!f.path.endsWith(".json")) continue;
        expect(() => JSON.parse(f.content), a.id + ": " + f.path).not.toThrow();
      }
    }
  });

  it("generates the entity slice for every adapter that declares it", () => {
    for (const a of listAdapters().filter((x) => declares(x, "entityClass"))) {
      const p = planFor(a);
      const paths = p.files.map((f) => f.path);
      expect(paths, a.id + " entity class").toContain("src/main/java/com/examplemod/entity/ModMainRubyGolemEntity.java");
      expect(paths, a.id + " renderer").toContain("src/main/java/com/examplemod/client/ModMainRubyGolemRenderer.java");
      expect(paths, a.id + " registry").toContain("src/main/java/com/examplemod/ModMainEntities.java");
      const lootDir = a.mcVersion.startsWith("1.21") ? "/loot_table/entities/" : "/loot_tables/entities/";
      expect(paths.some((x) => x.includes(lootDir + "ruby_golem.json")), a.id + " loot path").toBe(true);

      const main = p.files.find((f) => f.path.endsWith("ModMain.java"))!.content;
      expect(main, a.id + " registry init call").toContain("ModMainEntities.");
      const boot = p.files.find((f) => f.path.endsWith("ModMainClient.java"))!.content;
      expect(boot, a.id + " renderer registration").toContain("ModMainRubyGolemRenderer");
      const loot = JSON.parse(p.files.find((f) => f.path.endsWith("ruby_golem.json"))!.content);
      expect(loot.type).toBe("minecraft:entity");
      expect(loot.pools[0].entries[0].name).toBe("examplemod:ruby");
      expect(loot.pools[0].entries[0].functions[0].count).toEqual({ type: "minecraft:uniform", min: 1, max: 2 });
      const lang = JSON.parse(p.files.find((f) => f.path.endsWith("lang/en_us.json"))!.content);
      expect(lang["entity.examplemod.ruby_golem"]).toBe("Ruby Golem");
    }
  });

  it("keeps entity attributes and the client model inside adapter data (no version branches in the engine)", () => {
    for (const a of listAdapters().filter((x) => declares(x, "entityClass"))) {
      expect(Object.keys(a.entityKinds).length, a.id).toBeGreaterThan(0);
      expect(a.entityKinds.monster.attributeBase).toMatch(/createMonsterAttributes|createMobAttributes/);
      for (const model of Object.values(a.entityModels)) {
        expect(model.modelClass).toMatch(/^net\.minecraft\./);
        expect(model.modelLayer).toMatch(/^net\.minecraft\..*ModelLayers\.[A-Z_]+$/);
      }
      expect(a.templates.mainClass).toContain("{{REGISTRY_INIT_CALLS}}");
      expect(a.templates.clientBootstrap).toContain("{{ENTITY_RENDERER_REGISTRATIONS}}");
    }
  });

  it("emits a data-generation entry point and Gradle wiring when the spec opts in", () => {
    for (const a of listAdapters().filter((x) => declares(x, "dataGenClass"))) {
      const p = planFor(a);
      const paths = p.files.map((f) => f.path);
      expect(paths, a.id + " datagen entry").toContain("src/main/java/com/examplemod/datagen/ModMainDataGen.java");
      expect(paths, a.id + " example provider").toContain("src/main/java/com/examplemod/datagen/ModMainExampleProvider.java");
      const build = p.files.find((f) => f.path === "build.gradle")!.content;
      expect(build, a.id + " data run task").toMatch(a.loader === "fabric" ? /runDatagen/ : /runData/);
      expect(build, a.id + " generated resources dir").toMatch(/generated/);
      const provider = p.files.find((f) => f.path.endsWith("ModMainExampleProvider.java"))!.content;
      expect(provider).toContain("DataProvider.saveStable");
      expect(provider).not.toContain("{{");
      if (a.loader === "fabric") {
        const meta = JSON.parse(p.files.find((f) => f.path.endsWith("fabric.mod.json"))!.content);
        expect(meta.entrypoints["fabric-datagen"]).toEqual(["com.examplemod.datagen.ModMainDataGen"]);
      }
    }
  });

  it("emits no data-generation wiring when the spec leaves datagen off", () => {
    const off = { ...spec, datagen: false };
    for (const a of listAdapters()) {
      const p = planProject({ ...specFor(a), datagen: false }, a);
      expect(p.files.some((f) => f.path.includes("/datagen/")), a.id + " should not emit datagen classes").toBe(false);
      const build = p.files.find((f) => f.path === "build.gradle")!.content;
      expect(build, a.id + " should not wire a data run").not.toMatch(/runDatagen|runData/);
      // Fabric tolerates an empty entrypoint list (same as the client entrypoint), so accept either form.
      const meta = p.files.find((f) => f.path.endsWith("fabric.mod.json"));
      if (meta) expect(JSON.parse(meta.content).entrypoints["fabric-datagen"] ?? []).toEqual([]);
    }
  });

  it("every adapter declares the build facts the generator relies on", () => {
    for (const a of listAdapters()) {
      expect(a.java).toBeGreaterThanOrEqual(8);
      expect(a.gradleWrapperVersion).toMatch(/^\d+\.\d+/);
      expect(a.contentPaths.lang).toContain("assets/");
      expect(a.langKeys.itemGroup).toContain("{{namespace}}");
      expect(Object.keys(a.templates).length).toBeGreaterThan(15);
      expect(a.notes.length, `${a.id} should document its own traps`).toBeGreaterThan(0);
    }
  });
});

describe("partial adapters fail loudly instead of emitting broken Java", () => {
  // The whole point of stripping a slice is that asking for it must be a clear error, not a
  // plausible-looking plan that produces Java the compiler will reject. Verified by compile:
  // a 1.21.1 entity template does not compile on 1.21.4 (MobRenderer gained a type variable).
  it("rejects a slice the adapter does not declare", () => {
    const partial = listAdapters().find((a) => !declares(a, "entityClass"));
    expect(partial, "expected at least one adapter without the entity slice").toBeDefined();
    const full = structuredClone(spec);
    expect(() => planProject(full, partial!)).toThrow(/does not support content\.entities/);
  });

  it("still generates the slices it does declare", () => {
    const partial = listAdapters().find((a) => !declares(a, "entityClass"))!;
    const p = planProject(specFor(partial), partial);
    expect(p.files.length).toBeGreaterThan(20);
    expect(p.files.some((f) => f.path.endsWith("ModMainItems.java"))).toBe(true);
  });
});
