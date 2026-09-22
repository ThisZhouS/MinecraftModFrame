import { mkdtemp, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lintAdapter, parseAdapterRecord } from "../src/adapter-contract.js";
import { McmodError } from "../src/errors.js";
import { planGeneration } from "../src/generators.js";
import { emitPlan } from "../src/emit.js";
import { parseModSpec } from "../src/spec.js";
import { makeFixtureAdapter } from "./fixture-adapter.js";

const SPEC = {
  schemaVersion: 1,
  mod: { modId: "examplemod", name: "Example Mod", authors: ["Alice"], version: "1.2.3" },
  target: { mcVersion: "1.21.1", loader: "fabric" },
  content: {
    items: [{ id: "ruby" }, { id: "charged_ruby", maxCount: 16, group: "ingredients" }, { id: "weird", group: "nope" }],
    blocks: [{ id: "ruby_ore" }, { id: "deepslate_ruby_ore", hardness: 3, resistance: 9, tool: "none" }],
  },
};

function plan() {
  return planGeneration(parseSpecOrThrow(SPEC), makeFixtureAdapter());
}

function parseSpecOrThrow(input: unknown) {
  const r = parseModSpec(input);
  if (!r.ok) throw new Error("fixture spec invalid: " + r.formatted);
  return r.spec;
}

describe("lintAdapter", () => {
  it("fixture adapter is clean", () => {
    const a = makeFixtureAdapter();
    expect(parseAdapterRecord(a).ok).toBe(true);
    expect(lintAdapter(a)).toEqual([]);
  });
  it("detects missing template and class-name mismatch", () => {
    const a = makeFixtureAdapter();
    delete (a.templates as Record<string, unknown>).blockState;
    a.templates.tabEntryLineItem = "tab.add(WrongItems.{{CONST}});";
    const problems = lintAdapter(a).join("\n");
    expect(problems).toMatch(/missing required template "blockState"/);
    expect(problems).toMatch(/tabEntryLineItem/);
  });
  // Regression: the Forge adapter used to emit `TAB_ENTRIES.add(ModMainItems.RUBY.get())` into
  // register(), which runs from the mod constructor. Compilation is happy; the game dies at load
  // with "Registry Object not present". Lint now refuses that shape outright.
  it("rejects a tab-entry line that resolves a registry entry during mod construction", () => {
    const a = makeFixtureAdapter();
    a.templates.tabEntryLineItem = "TAB_ENTRIES.add(ModMainItems.{{CONST_UPPER}}.get());";
    expect(lintAdapter(a).join("\n")).toMatch(/tabEntryLineItem.*during mod construction/s);

    const b = makeFixtureAdapter();
    b.templates.tabEntryLineBlock = "TAB_ENTRIES.add(ModMainBlocks.{{CONST_UPPER}}.get());";
    expect(lintAdapter(b).join("\n")).toMatch(/tabEntryLineBlock.*during mod construction/s);
  });

  it("accepts a tab-entry line that defers resolution to a supplier", () => {
    const a = makeFixtureAdapter();
    a.templates.tabEntryLineItem = "TAB_ENTRIES.add(ModMainItems.{{CONST_UPPER}});";
    a.templates.tabEntryLineBlock = "TAB_ENTRIES.add(ModMainBlocks.{{CONST_UPPER}});";
    expect(lintAdapter(a)).toEqual([]);
  });

  // Regression: the 1.16.5 adapter inherited `var id = ...` from a Java 17 sibling. javac reports
  // that as "cannot find symbol: class var", which says nothing about language levels, and only for
  // targets someone actually compiles. Java 8 is the last level where it is a plain error.
  it("rejects `var` on a Java 8 target", () => {
    const a = makeFixtureAdapter();
    a.java = 8;
    a.templates.blockRegistration = "var {{REG_NAME}} = new Block({{SETTINGS}});";
    expect(lintAdapter(a).join("\n")).toMatch(/`var`, which needs Java 10\+/);

    const b = makeFixtureAdapter();
    b.java = 17;
    b.templates.blockRegistration = "var {{REG_NAME}} = new Block({{SETTINGS}});";
    expect(lintAdapter(b)).toEqual([]);
  });

  // references are how an agent finds the authoritative source for a version fact it is missing.
  // A malformed or duplicated list is worse than none: it looks authoritative while being wrong.
  it("rejects a duplicate reference url", () => {
    const a = makeFixtureAdapter();
    a.references = [
      { label: "Docs", url: "https://example.invalid/docs", kind: "official-docs" },
      { label: "Docs again", url: "https://example.invalid/docs", kind: "community" },
    ];
    expect(lintAdapter(a).join("\n")).toMatch(/duplicate reference url/);
  });

  it("requires the loader's own documentation once references exist", () => {
    const a = makeFixtureAdapter();
    a.references = [{ label: "A tutorial", url: "https://example.invalid/tut", kind: "community" }];
    expect(lintAdapter(a).join("\n")).toMatch(/official-docs/);
  });

  it("rejects a non-https reference url at parse time", () => {
    const a = makeFixtureAdapter();
    a.references = [{ label: "Insecure", url: "http://example.invalid/docs", kind: "official-docs" }];
    const r = parseAdapterRecord(a);
    expect(r.ok).toBe(false);
    expect(r.issues.join("\n")).toMatch(/https/);
  });

  it("accepts a well-formed reference list", () => {
    expect(lintAdapter(makeFixtureAdapter())).toEqual([]);
  });

  it("rejects half-implemented screen support", () => {
    const a = makeFixtureAdapter();
    delete (a.templates as Record<string, unknown>).keybindRegister;
    expect(lintAdapter(a).join("\n")).toMatch(/missing UI template\(s\): keybindRegister/);

    const b = makeFixtureAdapter();
    delete (b.langKeys as Record<string, unknown>).screenTitle;
    expect(lintAdapter(b).join("\n")).toMatch(/missing langKeys: screenTitle/);

    const c = makeFixtureAdapter();
    c.keyCodePattern = "Key.K";
    expect(lintAdapter(c).join("\n")).toMatch(/keyCodePattern must contain \{\{KEY\}\}/);
  });
  it("adapters that declare no UI templates are still clean (UI is optional)", () => {
    const a = makeFixtureAdapter();
    for (const k of ["screenClass", "screenLineDraw", "clientBootstrap", "keybindField", "keybindRegister", "screenOpenStatement"]) {
      delete (a.templates as Record<string, unknown>)[k];
    }
    expect(lintAdapter(a)).toEqual([]);
  });
});

describe("planGeneration", () => {
  it("emits skeleton, per-content assets, registries and lang", () => {
    const p = plan();
    const paths = p.files.map((f) => f.path);
    expect(paths).toContain("settings.gradle");
    expect(paths).toContain("gradle/wrapper/gradle-wrapper.properties");
    expect(paths).toContain("com/examplemod/ModMain.java");
    expect(paths).toContain("com/examplemod/ModMainItems.java");
    expect(paths).toContain("com/examplemod/ModMainBlocks.java");
    expect(paths).toContain("src/main/resources/assets/examplemod/models/item/ruby.json");
    expect(paths).toContain("src/main/resources/assets/examplemod/blockstates/ruby_ore.json");
    expect(paths).toContain("src/main/resources/data/examplemod/loot_table/blocks/ruby_ore.json");
    // tool:none block must NOT appear in the pickaxe tag
    const tag = p.files.find((f) => f.path.endsWith("tags/block/mineable/pickaxe.json"))!;
    expect(tag.content).toContain("examplemod:ruby_ore");
    expect(tag.content).not.toContain("deepslate_ruby_ore");
    // lang merges tab, items, blocks
    const lang = JSON.parse(p.files.find((f) => f.path.endsWith("lang/en_us.json"))!.content);
    expect(lang["itemGroup.examplemod"]).toBe("Example Mod");
    expect(lang["item.examplemod.ruby"]).toBe("Ruby");
    expect(lang["block.examplemod.deepslate_ruby_ore"]).toBe("Deepslate Ruby Ore");
  });

  it("routes vanilla groups and warns on unknown ones", () => {
    const p = plan();
    const regs = p.files.find((f) => f.path.endsWith("ModMainItems.java"))!.content;
    expect(regs).toContain("registerIn(ItemGroups.INGREDIENTS, charged_ruby");
    expect(regs).toContain("tab.add(ModMainItems.Weird);");
    expect(p.warnings.some((w) => w.includes('unknown group "nope"'))).toBe(true);
  });

  // Older versions bind the creative tab while the item is constructed (Item.Properties#tab on
  // 1.16) instead of through a post-registration hook (ItemGroupEvents on 1.19+). The adapter picks
  // which form by shipping itemGroupSuffix, itemRegistrationGroup, or both.
  it("binds the group at construction time when the adapter ships itemGroupSuffix", () => {
    const a = makeFixtureAdapter();
    a.templates.itemGroupSuffix = ".tab({{GROUP_EXPR}})";
    a.templates.itemSettings = "Settings.DEFAULT{{GROUP_SUFFIX}}{{DURABILITY_SUFFIX}}";
    a.templates.itemSettingsMaxCount = "Settings.DEFAULT.maxCount({{MAX_COUNT}}){{GROUP_SUFFIX}}{{DURABILITY_SUFFIX}}";
    // A version with no post-registration hook leaves the hook template empty.
    a.templates.itemRegistrationGroup = "";
    const p = planGeneration(parseSpecOrThrow(SPEC), a);
    const regs = p.files.find((f) => f.path.endsWith("ModMainItems.java"))!.content;

    expect(regs).toContain("new Item(Settings.DEFAULT.maxCount(16).tab(ItemGroups.INGREDIENTS))");
    // An item with no group must not get a dangling .tab().
    expect(regs).toContain("new Item(Settings.DEFAULT)");
    // The empty hook contributes nothing at all, not a stray blank line.
    expect(regs).not.toContain("registerIn(");
  });

  it("uses maxCount settings variant", () => {
    const p = plan();
    const regs = p.files.find((f) => f.path.endsWith("ModMainItems.java"))!.content;
    expect(regs).toContain("Settings.DEFAULT.maxCount(16)");
  });

  it("rejects duplicate ids across items and blocks", () => {
    const spec = parseSpecOrThrow({
      schemaVersion: 1,
      mod: { modId: "examplemod" },
      target: { mcVersion: "1.21.1", loader: "fabric" },
      content: { items: [{ id: "ruby" }], blocks: [{ id: "ruby" }] },
    });
    expect(() => planGeneration(spec, makeFixtureAdapter())).toThrowError(McmodError);
  });
});

const UI_SPEC = {
  schemaVersion: 1,
  mod: { modId: "examplemod", name: "Example Mod" },
  target: { mcVersion: "1.21.1", loader: "fabric" },
  content: { items: [], blocks: [] },
  ui: {
    screens: [
      { id: "guide", title: "Guide", key: "K", width: 200, height: 120, lines: ["first", "second"] },
      { id: "credits", lines: ["no key bound here"] },
    ],
  },
};

describe("ui.screens", () => {
  it("emits one screen class per screen plus a client bootstrap and lang keys", () => {
    const p = planGeneration(parseSpecOrThrow(UI_SPEC), makeFixtureAdapter());
    const paths = p.files.map((f) => f.path);
    expect(paths).toContain("com/examplemod/client/ModMainGuideScreen.java");
    expect(paths).toContain("com/examplemod/client/ModMainCreditsScreen.java");
    expect(paths).toContain("com/examplemod/client/ModMainClient.java");

    const screen = p.files.find((f) => f.path.endsWith("ModMainGuideScreen.java"))!.content;
    expect(screen).toContain("class ModMainGuideScreen");
    expect(screen).toContain("static final int W = 200;");
    expect(screen).toContain("draw(screen.examplemod.guide.line.1, line 1);");
    expect(screen).not.toContain("{{");

    // Only the screen that declared a key is bound and opened.
    const bootstrap = p.files.find((f) => f.path.endsWith("ModMainClient.java"))!.content;
    expect(bootstrap).toContain("register(KEY_GUIDE);");
    expect(bootstrap).toContain("open(KEY_GUIDE, ModMainGuideScreen);");
    expect(bootstrap).not.toContain("Credits");

    const lang = JSON.parse(p.files.find((f) => f.path.endsWith("lang/en_us.json"))!.content);
    expect(lang["screen.examplemod.guide.title"]).toBe("Guide");
    expect(lang["screen.examplemod.guide.line.2"]).toBe("second");
    expect(lang["screen.examplemod.credits.title"]).toBe("Credits");
    expect(lang["key.examplemod.guide"]).toBe("Open Guide");
    expect(lang["key.categories.examplemod"]).toBe("Example Mod");
  });

  it("omits the client bootstrap when no screen binds a key", () => {
    const spec = parseSpecOrThrow({ ...UI_SPEC, ui: { screens: [{ id: "readme", lines: ["x"] }] } });
    const p = planGeneration(spec, makeFixtureAdapter());
    expect(p.files.some((f) => f.path.endsWith("ModMainClient.java"))).toBe(false);
    expect(p.files.some((f) => f.path.endsWith("ModMainReadmeScreen.java"))).toBe(true);
  });

  it("fails loudly on an adapter without screen support", () => {
    const a = makeFixtureAdapter();
    for (const k of ["screenClass", "screenLineDraw", "clientBootstrap", "keybindField", "keybindRegister", "screenOpenStatement"]) {
      delete (a.templates as Record<string, unknown>)[k];
    }
    expect(() => planGeneration(parseSpecOrThrow(UI_SPEC), a)).toThrowError(McmodError);
  });

  it("rejects a malformed key in the spec (agent-fixable error)", () => {
    const r = parseModSpec({ ...UI_SPEC, ui: { screens: [{ id: "guide", key: "kk" }] } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.formatted).toMatch(/ui\.screens\.0\.key/);
  });

  it("applies UI defaults (width/height/lines) so agents can omit them", () => {
    const r = parseModSpec({ ...UI_SPEC, ui: { screens: [{ id: "mini" }] } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.spec.ui.screens[0]!.width).toBe(220);
      expect(r.spec.ui.screens[0]!.height).toBe(140);
      expect(r.spec.ui.screens[0]!.lines).toEqual([]);
    }
  });
});

const CRAFT_SPEC = {
  schemaVersion: 1,
  mod: { modId: "examplemod", name: "Example Mod" },
  target: { mcVersion: "1.21.1", loader: "fabric" },
  content: {
    items: [{ id: "ruby" }, { id: "charged_ruby" }],
    blocks: [{ id: "ruby_ore" }],
    recipes: [
      { id: "charged_ruby", type: "crafting_shaped", pattern: ["RR", "RR"], key: { R: "ruby" }, result: "charged_ruby" },
      { id: "ruby_from_smelting", type: "smelting", ingredient: "ruby_ore", result: "ruby", experience: 0.7 },
      { id: "ruby_from_shapeless", type: "crafting_shapeless", ingredients: ["charged_ruby", "#minecraft:coals"], result: "ruby", count: 2 },
      { id: "ruby_from_stonecutting", type: "stonecutting", ingredient: "ruby_ore", result: "ruby", count: 3 },
    ],
    advancements: [
      { id: "root", hasItems: ["ruby"], icon: "ruby" },
      { id: "charged", parent: "root", unlockRecipes: ["charged_ruby"], hasItems: ["charged_ruby"] },
    ],
  },
};

describe("content.recipes + content.advancements", () => {
  const planFor = (spec: unknown) => planGeneration(parseSpecOrThrow(spec), makeFixtureAdapter());

  it("emits one file per recipe and advancement, resolved through the adapter's paths", () => {
    const p = planFor(CRAFT_SPEC);
    const paths = p.files.map((f) => f.path);
    expect(paths).toContain("src/main/resources/data/examplemod/recipe/charged_ruby.json");
    expect(paths).toContain("src/main/resources/data/examplemod/recipe/ruby_from_smelting.json");
    expect(paths).toContain("src/main/resources/data/examplemod/advancement/root.json");
    expect(paths).toContain("src/main/resources/data/examplemod/advancement/charged.json");
    for (const f of p.files.filter((x) => x.path.endsWith(".json"))) {
      expect(() => JSON.parse(f.content), f.path).not.toThrow();
    }
  });

  it("resolves declared ids to namespaced refs and passes resource locations through", () => {
    const p = planFor(CRAFT_SPEC);
    const shaped = JSON.parse(p.files.find((f) => f.path.endsWith("recipe/charged_ruby.json"))!.content);
    expect(shaped.key.R).toEqual({ item: "examplemod:ruby" });
    expect(shaped.pattern).toEqual(["RR", "RR"]);
    const shapeless = JSON.parse(p.files.find((f) => f.path.endsWith("recipe/ruby_from_shapeless.json"))!.content);
    expect(shapeless.ingredients).toEqual([{ item: "examplemod:charged_ruby" }, { tag: "minecraft:coals" }]);
    expect(shapeless.result).toEqual({ item: "examplemod:ruby", count: 2 });
  });

  it("defaults cooking time per cooking type", () => {
    const p = planFor(CRAFT_SPEC);
    const smelt = JSON.parse(p.files.find((f) => f.path.endsWith("recipe/ruby_from_smelting.json"))!.content);
    expect(smelt.cookingtime).toBe(200);
    expect(smelt.experience).toBe(0.7);
    expect(smelt.type).toBe("minecraft:smelting");
  });

  it("builds advancement criteria from unlocked recipes and watched items, plus rewards", () => {
    const p = planFor(CRAFT_SPEC);
    const charged = JSON.parse(p.files.find((f) => f.path.endsWith("advancement/charged.json"))!.content);
    expect(Object.keys(charged.criteria).sort()).toEqual(["has_examplemod_charged_ruby", "unlock_charged_ruby"]);
    expect(charged.criteria.unlock_charged_ruby.conditions.recipe).toBe("examplemod:charged_ruby");
    expect(charged.rewards).toEqual({ recipes: ["examplemod:charged_ruby"] });
    expect(charged.requirements).toEqual([["unlock_charged_ruby", "has_examplemod_charged_ruby"]]);
    const lang = JSON.parse(p.files.find((f) => f.path.endsWith("lang/en_us.json"))!.content);
    expect(lang["advancements.examplemod.charged.title"]).toBe("Charged");
  });

  it("derives a parent reference and rejects unknown parents", () => {
    const ok = planFor(CRAFT_SPEC);
    const charged = JSON.parse(ok.files.find((f) => f.path.endsWith("advancement/charged.json"))!.content);
    expect(charged.parent).toBe("examplemod:root");
    const bad = {
      ...CRAFT_SPEC,
      content: { ...CRAFT_SPEC.content, advancements: [{ id: "x", parent: "nope", hasItems: ["ruby"] }] },
    };
    expect(() => planFor(bad)).toThrowError(McmodError);
  });

  it("rejects unknown item references with an agent-fixable message", () => {
    const bad = {
      ...CRAFT_SPEC,
      content: { ...CRAFT_SPEC.content, recipes: [{ id: "x", type: "smelting", ingredient: "not_declared", result: "ruby" }] },
    };
    expect(() => planFor(bad)).toThrowError(/not declared in this spec|is neither declared/);
  });

  it("rejects recipe shapes the schema cannot satisfy", () => {
    const noKey = { ...CRAFT_SPEC, content: { ...CRAFT_SPEC.content, recipes: [{ id: "x", type: "crafting_shaped", pattern: ["RR"], result: "ruby" }] } };
    const r = parseModSpec(noKey);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.formatted).toMatch(/content\.recipes\.0\.key/);

    const strayKey = { ...CRAFT_SPEC, content: { ...CRAFT_SPEC.content, recipes: [{ id: "y", type: "smelting", ingredient: "ruby", result: "ruby", key: { R: "ruby" } }] } };
    const r2 = parseModSpec(strayKey);
    expect(r2.ok).toBe(false);
  });

  it("fails loudly on an adapter without recipe support", () => {
    const a = makeFixtureAdapter();
    for (const k of ["recipeShaped", "recipeShapeless", "recipeCooking", "recipeStonecutting", "advancement", "advancementItemPredicate", "advancementTagPredicate"]) {
      delete (a.templates as Record<string, unknown>)[k];
    }
    expect(() => planGeneration(parseSpecOrThrow(CRAFT_SPEC), a)).toThrowError(McmodError);
  });
});

describe("emitPlan", () => {
  it("dryRun writes nothing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcmodkit-dry-"));
    try {
      const r = await emitPlan(plan(), { outDir: dir, dryRun: true });
      expect(r.dryRun).toBe(true);
      expect(r.written.length).toBeGreaterThan(0);
      const entries = await readdir(dir);
      expect(entries).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes managed files idempotently and preserves foreign files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcmodkit-emit-"));
    try {
      const r1 = await emitPlan(plan(), { outDir: dir });
      const props = join(dir, "examplemod", "gradle.properties");
      expect(await readFile(props, "utf8")).toContain("mc_version=1.21.1");
      // user file + user edit to a managed file
      const foreign = join(dir, "examplemod", "my-notes.txt");
      await writeFile(foreign, "mine");
      await writeFile(props, "hacked");
      const r2 = await emitPlan(plan(), { outDir: dir });
      expect(await readFile(props, "utf8")).toContain("mc_version=1.21.1"); // restored
      expect(await readFile(foreign, "utf8")).toBe("mine"); // untouched
      expect(r2.written.length).toBe(r1.written.length);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects path escape", async () => {
    const a = makeFixtureAdapter();
    a.projectFiles.push({ path: "../evil.txt", template: "gradleProps", managed: true, executable: false });
    const spec = parseSpecOrThrow(SPEC);
    const p = planGeneration(spec, a);
    const dir = await mkdtemp(join(tmpdir(), "mcmodkit-evil-"));
    try {
      await expect(emitPlan(p, { outDir: dir })).rejects.toMatchObject({ code: "PATH_ESCAPE" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
