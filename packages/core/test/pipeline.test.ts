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

  // Regression: 1.12.2 has no datapack tags (1.13+) and no block loot tables (1.14+). Dropping both
  // the template and the path is how an adapter says "this version has no such file", and the
  // generator must then emit nothing rather than writing to an undefined path.
  it("skips the loot-table and mineable-tag slices when the adapter does not declare them", () => {
    const a = makeFixtureAdapter();
    delete (a.templates as Record<string, unknown>).lootTable;
    delete (a.contentPaths as Record<string, unknown>).lootTable;
    delete (a.templates as Record<string, unknown>).mineableTag;
    delete (a.contentPaths as Record<string, unknown>).mineableTag;
    expect(lintAdapter(a)).toEqual([]);

    const p = planGeneration(parseSpecOrThrow(SPEC), a);
    const paths = p.files.map((f) => f.path);
    expect(paths.some((x) => x.includes("loot_table"))).toBe(false);
    expect(paths.some((x) => x.includes("mineable"))).toBe(false);
    // The blocks themselves are still emitted.
    expect(paths.some((x) => x.endsWith("ModMainBlocks.java"))).toBe(true);
  });

  it("rejects declaring only half of a data-file slice", () => {
    const a = makeFixtureAdapter();
    delete (a.contentPaths as Record<string, unknown>).mineableTag;
    expect(lintAdapter(a).join("\n")).toMatch(/templates\.mineableTag and contentPaths\.mineableTag together/);
  });

  // Durability's setter name is version-specific (Item.Properties#durability from 1.13,
  // Item#setMaxDamage before that), so the engine asks the adapter rather than assuming one.
  it("asks the adapter how to express durability instead of hard-coding a setter", () => {
    const a = makeFixtureAdapter();
    a.templates.itemDurabilitySuffix = ".setMaxDamage({{DURABILITY}})";
    a.templates.itemSettings = "Settings.DEFAULT{{DURABILITY_SUFFIX}}";
    const p = planGeneration(parseSpecOrThrow({ ...SPEC, content: { items: [{ id: "mk2", durability: 128 }], blocks: [] } }), a);
    expect(p.files.find((f) => f.path.endsWith("ModMainItems.java"))!.content).toContain("Settings.DEFAULT.setMaxDamage(128)");
  });

  it("fails loudly when the spec wants durability the adapter cannot express", () => {
    const a = makeFixtureAdapter();
    delete (a.templates as Record<string, unknown>).itemDurabilitySuffix;
    const spec = parseSpecOrThrow({ ...SPEC, content: { items: [{ id: "mk2", durability: 128 }], blocks: [] } });
    expect(() => planGeneration(spec, a)).toThrow(/does not offer item durability/);
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
    for (const k of ["screenClass", "clientBootstrap", "keybindField", "keybindRegister", "screenOpenStatement"]) {
      delete (a.templates as Record<string, unknown>)[k];
    }
    expect(lintAdapter(a)).toEqual([]);
  });
  // Regression: NeoForge declared gradle.fmlLoaderVersionRange but the modsToml template hardcoded
  // the range instead of consuming it - the two drifted apart ([4,) vs the real FML 2.0). Any gradle
  // fact that nothing consumes is dead data and drifts.
  it("rejects a gradle fact no template or projectFile path consumes", () => {
    const a = makeFixtureAdapter();
    a.gradle = { ...a.gradle, forgeVersion: "47.4.10" };
    expect(lintAdapter(a).join("\n")).toMatch(/gradle\.forgeVersion is never consumed/);
  });
  it("accepts a gradle fact consumed by a projectFile path", () => {
    const a = makeFixtureAdapter();
    a.gradle = { ...a.gradle, layoutRoot: "base" };
    a.projectFiles.push({ path: "{{gradle_layoutRoot}}/extra.txt", template: "settingsGradle", managed: true, executable: false });
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

  // Regression: an image-api/file spec planned without prepared textures silently painted
  // procedural textures. Every surface (CLI/MCP/HTTP) must hear about the downgrade instead.
  it("warns when an image-api spec is planned without prepared images", () => {
    const spec = parseSpecOrThrow({
      schemaVersion: 1,
      mod: { modId: "examplemod" },
      target: { mcVersion: "1.21.1", loader: "fabric" },
      textures: true,
      textureProvider: "image-api",
      content: { items: [{ id: "ruby", texture: { prompt: "a red gem" } }], blocks: [] },
    });
    const p = planGeneration(spec, makeFixtureAdapter());
    expect(p.warnings.some((w) => w.includes('textureProvider is "image-api" but no textures were prepared'))).toBe(true);
  });

  it("warns when a file spec is planned without prepared images", () => {
    const spec = parseSpecOrThrow({
      schemaVersion: 1,
      mod: { modId: "examplemod" },
      target: { mcVersion: "1.21.1", loader: "fabric" },
      textures: true,
      textureProvider: "file",
      content: { items: [{ id: "ruby", texture: { file: "art/ruby.png" } }], blocks: [] },
    });
    const p = planGeneration(spec, makeFixtureAdapter());
    expect(p.warnings.some((w) => w.includes('textureProvider is "file" but no textures were prepared'))).toBe(true);
  });

  it("warns when a texture source is missing from the prepared set", () => {
    const spec = parseSpecOrThrow({
      schemaVersion: 1,
      mod: { modId: "examplemod" },
      target: { mcVersion: "1.21.1", loader: "fabric" },
      textures: true,
      textureProvider: "image-api",
      content: {
        items: [{ id: "ruby", texture: { prompt: "a red gem" } }, { id: "plain" }],
        blocks: [],
      },
    });
    const p = planGeneration(spec, makeFixtureAdapter(), { images: new Map() });
    expect(p.warnings.some((w) => w.includes('item "ruby": declares a texture source but no prepared image'))).toBe(true);
    expect(p.warnings.some((w) => w.includes('item "plain"'))).toBe(false);
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
    expect(screen).toContain('static final String[] KEYS = { "screen.examplemod.guide.line.1", "screen.examplemod.guide.line.2" };');
    expect(screen).toContain('Component.translatable("gui.done")');
    expect(screen).toContain("this.onClose()");
    // UI 27.0: key mappings are skipped while a screen is open, so the screen owns its spec key.
    expect(screen).toContain("static final int TOGGLE = Key.K;");
    // UI 35.0: every screen carries its own find-bar lang key (both placeholder and hint).
    expect(screen).toContain('static final String SEARCH = "screen.examplemod.guide.search";');
    // UI 37.0: the counter tooltip gets its own key so the cycle hint stays translatable.
    expect(screen).toContain('static final String SEARCH_CYCLE = "screen.examplemod.guide.search_cycle";');
    const credits = p.files.find((f) => f.path.endsWith("ModMainCreditsScreen.java"))!.content;
    expect(credits).toContain("static final int TOGGLE = -1;");
    expect(credits).toContain('static final String SEARCH = "screen.examplemod.credits.search";');
    expect(credits).toContain('static final String SEARCH_CYCLE = "screen.examplemod.credits.search_cycle";');
    expect(screen).not.toContain("{{");
    expect(credits).not.toContain("{{");

    // Only the screen that declared a key is bound and opened.
    const bootstrap = p.files.find((f) => f.path.endsWith("ModMainClient.java"))!.content;
    expect(bootstrap).toContain("register(KEY_GUIDE);");
    expect(bootstrap).toContain("open(KEY_GUIDE, ModMainGuideScreen);");
    expect(bootstrap).not.toContain("Credits");

    const lang = JSON.parse(p.files.find((f) => f.path.endsWith("lang/en_us.json"))!.content);
    expect(lang["screen.examplemod.guide.title"]).toBe("Guide");
    expect(lang["screen.examplemod.guide.line.2"]).toBe("second");
    expect(lang["screen.examplemod.credits.title"]).toBe("Credits");
    expect(lang["screen.examplemod.guide.search"]).toBe("Search...");
    expect(lang["screen.examplemod.credits.search"]).toBe("Search...");
    expect(lang["screen.examplemod.guide.search_cycle"]).toBe("Enter: next, Shift+Enter: previous");
    expect(lang["screen.examplemod.credits.search_cycle"]).toBe("Enter: next, Shift+Enter: previous");
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
    for (const k of ["screenClass", "clientBootstrap", "keybindField", "keybindRegister", "screenOpenStatement"]) {
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
      expect(r.spec.ui.screens[0]!.theme).toBe("vanilla");
      expect(r.spec.ui.screens[0]!.align).toBe("left");
      expect(r.spec.ui.screens[0]!.animation).toBe("slide");
      expect(r.spec.ui.screens[0]!.buttons).toEqual([]);
    }
  });

  it("renders theme, accent, alignment and animation as Java constants", () => {
    const spec = parseSpecOrThrow({
      ...UI_SPEC,
      ui: {
        screens: [
          {
            id: "guide",
            lines: ["x"],
            theme: "dark",
            accent: "#123456",
            align: "center",
            animation: "none",
          },
        ],
      },
    });
    const screen = planGeneration(spec, makeFixtureAdapter()).files.find((f) => f.path.endsWith("ModMainGuideScreen.java"))!.content;
    expect(screen).toContain("static final int PANEL = 0xF0121418;");
    expect(screen).toContain("static final int ACCENT = 0xFF123456;");
    expect(screen).toContain("static final int BODY = 0xFFB8C0CC;");
    expect(screen).toContain("static final boolean CENTER = true;");
    expect(screen).toContain("static final int ANIM = 0;");
  });

  it("offers a high-contrast palette and a stronger pressed-link tone", () => {
    // UI 26.0: "contrast" is an accessibility palette - fully opaque near-black panel, bright
    // accent, near-white body and a still-readable muted note colour. Press feedback deepens the
    // hover wash (alpha 0x66 vs 0x33) instead of introducing a second hue.
    const spec = parseSpecOrThrow({
      ...UI_SPEC,
      ui: {
        screens: [
          {
            id: "guide",
            theme: "contrast",
            lines: [{ text: "Read more", target: "credits" }, { text: "Caveat", style: "note" }],
          },
          { id: "credits" },
        ],
      },
    });
    const screen = planGeneration(spec, makeFixtureAdapter()).files.find((f) =>
      f.path.endsWith("ModMainGuideScreen.java"),
    )!.content;
    expect(screen).toContain("static final int PANEL = 0xFF08090B;");
    expect(screen).toContain("static final int ACCENT = 0xFFFFD400;");
    expect(screen).toContain("static final int BODY = 0xFFF0F0F0;");
    expect(screen).toContain("static final int NOTE = 0xFFC9CED6;");
    expect(screen).toContain("static final int HOVER = 0x33FFD400;");
    expect(screen).toContain("static final int PRESSED = 0x66FFD400;");
  });

  it("maps per-line styles to Java codes while lang entries keep the plain text", () => {
    const spec = parseSpecOrThrow({
      ...UI_SPEC,
      ui: {
        screens: [
          {
            id: "guide",
            lines: [
              "Legacy plain line",
              { text: "Getting started", style: "heading" },
              { text: "Mine ruby ore", style: "bullet" },
              { text: "Default style" },
            ],
          },
        ],
      },
    });
    const p = planGeneration(spec, makeFixtureAdapter());
    const screen = p.files.find((f) => f.path.endsWith("ModMainGuideScreen.java"))!.content;
    expect(screen).toContain("static final int[] STYLES = { 0, 1, 2, 0 };");
    expect(screen).toContain(
      'static final String[] KEYS = { "screen.examplemod.guide.line.1", "screen.examplemod.guide.line.2", "screen.examplemod.guide.line.3", "screen.examplemod.guide.line.4" };',
    );
    const lang = JSON.parse(p.files.find((f) => f.path.endsWith("lang/en_us.json"))!.content);
    expect(lang["screen.examplemod.guide.line.1"]).toBe("Legacy plain line");
    expect(lang["screen.examplemod.guide.line.2"]).toBe("Getting started");
    expect(lang["screen.examplemod.guide.line.3"]).toBe("Mine ruby ore");
    expect(lang["screen.examplemod.guide.line.4"]).toBe("Default style");
  });

  it("paints note lines in the theme's muted colour while keeping links accent-coloured", () => {
    // UI 15.0: "note" is style code 3. It is secondary text - caveats, tips - so the engine derives
    // a per-theme muted colour instead of reusing the body tone, and the template draws a quote rule.
    const spec = parseSpecOrThrow({
      ...UI_SPEC,
      ui: {
        screens: [
          {
            id: "guide",
            theme: "dark",
            lines: ["Body", { text: "Back up your world first", style: "note" }, { text: "Read more", style: "note", target: "credits" }],
          },
          { id: "credits" },
        ],
      },
    });
    const p = planGeneration(spec, makeFixtureAdapter());
    const screen = p.files.find((f) => f.path.endsWith("ModMainGuideScreen.java"))!.content;
    expect(screen).toContain("static final int[] STYLES = { 0, 3, 3 };");
    expect(screen).toContain("static final int NOTE = 0xFF8A94A6;");
    const vanilla = parseSpecOrThrow({
      ...UI_SPEC,
      ui: { screens: [{ id: "guide", lines: [{ text: "Hint", style: "note" }] }] },
    });
    const vanillaScreen = planGeneration(vanilla, makeFixtureAdapter()).files.find((f) =>
      f.path.endsWith("ModMainGuideScreen.java"),
    )!.content;
    expect(vanillaScreen).toContain("static final int NOTE = 0xFF8C8C8C;");
  });

  it("paints warn lines in the theme's warm colour as style code 4", () => {
    // UI 33.0: "warn" is style code 4. It keeps the note indentation but gets its own warm colour
    // and a thicker rule, so a caution never reads as a plain note in any theme.
    const spec = parseSpecOrThrow({
      ...UI_SPEC,
      ui: { screens: [{ id: "guide", theme: "dark", lines: ["Body", { text: "Regenerating overwrites files", style: "warn" }] }] },
    });
    const screen = planGeneration(spec, makeFixtureAdapter()).files.find((f) =>
      f.path.endsWith("ModMainGuideScreen.java"),
    )!.content;
    expect(screen).toContain("static final int[] STYLES = { 0, 4 };");
    expect(screen).toContain("static final int WARN = 0xFFFF8A65;");
    const contrast = parseSpecOrThrow({
      ...UI_SPEC,
      ui: { screens: [{ id: "guide", theme: "contrast", lines: [{ text: "Careful", style: "warn" }] }] },
    });
    const contrastScreen = planGeneration(contrast, makeFixtureAdapter()).files.find((f) =>
      f.path.endsWith("ModMainGuideScreen.java"),
    )!.content;
    expect(contrastScreen).toContain("static final int WARN = 0xFFFF9100;");
  });

  it("numbers step lines per section as style code 5", () => {
    // UI 34.0: "step" is style code 5. The ordinal is a document fact, so the engine precomputes
    // the "1." / "2." labels per logical line and restarts the count at every heading; the template
    // only right-aligns the label in the marker gutter. Non-step lines carry an empty label so the
    // array stays index-aligned with LINE_STYLES for the template's per-line lookup.
    const spec = parseSpecOrThrow({
      ...UI_SPEC,
      ui: {
        screens: [
          {
            id: "guide",
            lines: [
              { text: "Steps", style: "heading" },
              { text: "Mine ruby ore", style: "step" },
              { text: "Craft a pickaxe", style: "step" },
              "Between steps",
              { text: "More steps", style: "heading" },
              { text: "Smelt the gem", style: "step" },
            ],
          },
        ],
      },
    });
    const p = planGeneration(spec, makeFixtureAdapter());
    const screen = p.files.find((f) => f.path.endsWith("ModMainGuideScreen.java"))!.content;
    expect(screen).toContain("static final int[] STYLES = { 1, 5, 5, 0, 1, 5 };");
    expect(screen).toContain('static final String[] STEPS = { "", "1.", "2.", "", "", "1." };');
  });

  it("rejects an unknown line style with a field-level error and keeps empty text invalid", () => {
    const badStyle = parseModSpec({
      ...UI_SPEC,
      ui: { screens: [{ id: "guide", lines: ["ok", { text: "nope", style: "quote" }] }] },
    });
    expect(badStyle.ok).toBe(false);
    if (!badStyle.ok) expect(badStyle.formatted).toMatch(/ui\.screens\.0\.lines\.1\.style/);

    const emptyText = parseModSpec({ ...UI_SPEC, ui: { screens: [{ id: "guide", lines: [{ text: "" }] }] } });
    expect(emptyText.ok).toBe(false);
    if (!emptyText.ok) expect(emptyText.formatted).toMatch(/ui\.screens\.0\.lines\.0/);
  });

  it("turns a targeted line into an in-body link with a generated open action", () => {
    const spec = parseSpecOrThrow({
      ...UI_SPEC,
      ui: {
        screens: [
          {
            id: "guide",
            lines: ["Intro", { text: "Open the settings", target: "settings" }, { text: "A bullet", style: "bullet", target: "credits" }],
          },
          { id: "settings", title: "Settings", lines: ["s"] },
          { id: "credits", title: "Credits", lines: ["c"] },
        ],
      },
    });
    const p = planGeneration(spec, makeFixtureAdapter());
    const screen = p.files.find((f) => f.path.endsWith("ModMainGuideScreen.java"))!.content;
    expect(screen).toContain("static final int[] LINKS = { -1, 1, 2 };");
    expect(screen).toContain('static final String[] TARGETS = { "", "screen.examplemod.settings.title", "screen.examplemod.credits.title" };');
    expect(screen).toContain("static final int HOVER = 0x33FFAA00;");
    expect(screen).toContain("case 1: this.minecraft.setScreen(new ModMainSettingsScreen(this)); break;");
    expect(screen).toContain("case 2: this.minecraft.setScreen(new ModMainCreditsScreen(this)); break;");
    expect(screen).toContain("switch (line) {");
    const lang = JSON.parse(p.files.find((f) => f.path.endsWith("lang/en_us.json"))!.content);
    expect(lang["screen.examplemod.guide.line.2"]).toBe("Open the settings");
    expect(lang["screen.examplemod.guide.line.3"]).toBe("A bullet");
  });

  it("rejects an unknown line link and turns a self link into back-to-top", () => {
    const unknown = parseSpecOrThrow({
      ...UI_SPEC,
      ui: { screens: [{ id: "guide", lines: [{ text: "Missing", target: "nope" }] }] },
    });
    expect(() => planGeneration(unknown, makeFixtureAdapter())).toThrowError(
      /ui\.screens\.0\.lines\.0\.target "nope" is not a declared screen id; available: guide/,
    );

    // UI 6.0: targeting the owning screen is the long-document "back to top" action - it scrolls
    // the current body instead of opening a duplicate screen, and shows no screen-title tooltip.
    const self = parseSpecOrThrow({ ...UI_SPEC, ui: { screens: [{ id: "guide", lines: ["Intro", { text: "Top", target: "guide" }] }] } });
    const screen = planGeneration(self, makeFixtureAdapter()).files.find((f) =>
      f.path.endsWith("ModMainGuideScreen.java"),
    )!.content;
    expect(screen).toContain("static final int[] LINKS = { -1, 1 };");
    expect(screen).toContain('static final String[] TARGETS = { "", "" };');
    expect(screen).toContain("case 1: this.scrollTo(0, true, this.scrollDurationFor(0)); break;");
    expect(screen).not.toContain("new ModMainGuideScreen(this)");
  });

  it("jumps to an in-screen anchor and validates anchor declarations", () => {
    const spec = parseSpecOrThrow({
      ...UI_SPEC,
      ui: {
        screens: [
          {
            id: "guide",
            lines: [
              { text: "Intro", style: "heading", anchor: "intro" },
              "Body",
              { text: "Jump", target: "#intro" },
            ],
          },
        ],
      },
    });
    const screen = planGeneration(spec, makeFixtureAdapter()).files.find((f) =>
      f.path.endsWith("ModMainGuideScreen.java"),
    )!.content;
    expect(screen).toContain("case 2: this.scrollToLine(0); break;");
    expect(screen).toContain('static final String[] TARGETS = { "", "", "" };');

    const missing = parseModSpec({
      ...UI_SPEC,
      ui: { screens: [{ id: "guide", lines: [{ text: "Jump", target: "#nope" }] }] },
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.formatted).toMatch(/ui\.screens\.0\.lines\.0\.target.*#nope is not a declared anchor/);

    const duplicate = parseModSpec({
      ...UI_SPEC,
      ui: { screens: [{ id: "guide", lines: [{ text: "A", anchor: "x" }, { text: "B", anchor: "x" }] }] },
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.formatted).toMatch(/ui\.screens\.0\.lines\.1\.anchor.*duplicate anchor "x"/);
  });

  it("deep-links to an anchor on another screen", () => {
    const spec = parseSpecOrThrow({
      ...UI_SPEC,
      ui: {
        screens: [
          { id: "guide", lines: ["Intro", { text: "Open advanced", target: "settings#advanced" }] },
          {
            id: "settings",
            lines: ["Intro", "More", { text: "Advanced", style: "heading", anchor: "advanced" }, "Body"],
          },
        ],
      },
    });
    const guide = planGeneration(spec, makeFixtureAdapter()).files.find((f) =>
      f.path.endsWith("ModMainGuideScreen.java"),
    )!.content;
    expect(guide).toContain("static final int[] LINKS = { -1, 1 };");
    expect(guide).toContain('static final String[] TARGETS = { "", "screen.examplemod.settings.title" };');
    // UI 32.0: the hover tooltip names the landing section too, reusing the anchored line's key.
    expect(guide).toContain('static final String[] SECTIONS = { "", "screen.examplemod.settings.line.3" };');
    // The target screen's constructor receives the anchor's logical line (line 2), not a row guess.
    expect(guide).toContain("case 1: this.minecraft.setScreen(new ModMainSettingsScreen(this, 2)); break;");

    // A self deep link is the same in-screen jump as "#anchor"; it must never open a duplicate screen.
    const self = parseSpecOrThrow({
      ...UI_SPEC,
      ui: {
        screens: [{ id: "guide", lines: [{ text: "Intro", anchor: "intro" }, { text: "Jump", target: "guide#intro" }] }],
      },
    });
    const selfScreen = planGeneration(self, makeFixtureAdapter()).files.find((f) =>
      f.path.endsWith("ModMainGuideScreen.java"),
    )!.content;
    expect(selfScreen).toContain("case 1: this.scrollToLine(0); break;");
    expect(selfScreen).not.toContain("new ModMainGuideScreen(this, ");

    const missing = parseModSpec({
      ...UI_SPEC,
      ui: {
        screens: [
          { id: "guide", lines: ["Intro", { text: "Open", target: "settings#nope" }] },
          { id: "settings", lines: [{ text: "Advanced", anchor: "advanced" }] },
        ],
      },
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.formatted).toMatch(
        /ui\.screens\.0\.lines\.1\.target.*undeclared anchor "nope" in screen "settings".*available: advanced/,
      );
    }
  });

  it("lists another screen's headings as deep links for an auto-contents screen (UI 29.0)", () => {
    const spec = parseSpecOrThrow({
      ...UI_SPEC,
      ui: {
        screens: [
          {
            id: "guide",
            lines: [
              { text: "Welcome", style: "heading", anchor: "welcome" },
              "Body",
              { text: "Setup", style: "heading" },
              "More",
              { text: "Usage", style: "heading" },
            ],
          },
          { id: "contents", lines: ["Pick a section"], contentsFor: "guide" },
        ],
      },
    });
    const p = planGeneration(spec, makeFixtureAdapter());
    const contents = p.files.find((f) => f.path.endsWith("ModMainContentsScreen.java"))!.content;
    // One bullet per heading, prepended ahead of the authored line. The explicit anchor is reused;
    // headings without one get a synthetic anchor resolved to their own logical line.
    expect(contents).toContain("static final int[] STYLES = { 2, 2, 2, 0 };");
    expect(contents).toContain("static final int[] LINKS = { 0, 1, 2, -1 };");
    expect(contents).toContain(
      'static final String[] TARGETS = { "screen.examplemod.guide.title", "screen.examplemod.guide.title", "screen.examplemod.guide.title", "" };',
    );
    expect(contents).toContain("case 0: this.minecraft.setScreen(new ModMainGuideScreen(this, 0)); break;");
    expect(contents).toContain("case 1: this.minecraft.setScreen(new ModMainGuideScreen(this, 2)); break;");
    expect(contents).toContain("case 2: this.minecraft.setScreen(new ModMainGuideScreen(this, 4)); break;");
    // Deep-link tooltips name the section: each entry maps to its heading's own line key.
    expect(contents).toContain(
      'static final String[] SECTIONS = { "screen.examplemod.guide.line.1", "screen.examplemod.guide.line.3", "screen.examplemod.guide.line.5", "" };',
    );
    // UI 31.0: entries carry the target heading's own language key, so translating or editing a
    // title updates the index with it; the contents screen only owns keys for its authored lines.
    expect(contents).toContain(
      'static final String[] KEYS = { "screen.examplemod.guide.line.1", "screen.examplemod.guide.line.3", "screen.examplemod.guide.line.5", "screen.examplemod.contents.line.4" };',
    );
    const lang = JSON.parse(p.files.find((f) => f.path.endsWith("lang/en_us.json"))!.content);
    expect(lang["screen.examplemod.guide.line.1"]).toBe("Welcome");
    expect(lang["screen.examplemod.guide.line.3"]).toBe("Setup");
    expect(lang["screen.examplemod.guide.line.5"]).toBe("Usage");
    expect(lang["screen.examplemod.contents.line.4"]).toBe("Pick a section");
    expect(lang["screen.examplemod.contents.line.1"]).toBeUndefined();

    // Synthetic names step around declared anchors: an explicit "section_1" elsewhere must not
    // capture the first generated entry.
    const collision = parseSpecOrThrow({
      ...UI_SPEC,
      ui: {
        screens: [
          {
            id: "guide",
            lines: [
              { text: "Scratch", anchor: "section_1" },
              { text: "Alpha", style: "heading" },
              "Body",
              { text: "Beta", style: "heading" },
            ],
          },
          { id: "contents", contentsFor: "guide" },
        ],
      },
    });
    const collisionScreen = planGeneration(collision, makeFixtureAdapter()).files.find((f) =>
      f.path.endsWith("ModMainContentsScreen.java"),
    )!.content;
    expect(collisionScreen).toContain("case 0: this.minecraft.setScreen(new ModMainGuideScreen(this, 1)); break;");
    expect(collisionScreen).toContain('"screen.examplemod.guide.line.2", "screen.examplemod.guide.line.4" }');
    expect(collisionScreen).toContain("case 1: this.minecraft.setScreen(new ModMainGuideScreen(this, 3)); break;");
  });

  it("rejects broken auto-contents declarations (agent-fixable errors)", () => {
    const missing = parseModSpec({
      ...UI_SPEC,
      ui: {
        screens: [
          { id: "guide", lines: [{ text: "Welcome", style: "heading" }] },
          { id: "contents", contentsFor: "nope" },
        ],
      },
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.formatted).toMatch(
        /ui\.screens\.1\.contentsFor: contentsFor "nope" is not a declared screen id; available: guide, contents/,
      );
    }

    const self = parseModSpec({
      ...UI_SPEC,
      ui: { screens: [{ id: "guide", lines: [{ text: "Welcome", style: "heading" }], contentsFor: "guide" }] },
    });
    expect(self.ok).toBe(false);
    if (!self.ok) expect(self.formatted).toMatch(/ui\.screens\.0\.contentsFor.*a screen cannot list its own contents/);

    const noHeadings = parseModSpec({
      ...UI_SPEC,
      ui: {
        screens: [
          { id: "guide", lines: ["Just body text"] },
          { id: "contents", contentsFor: "guide" },
        ],
      },
    });
    expect(noHeadings.ok).toBe(false);
    if (!noHeadings.ok) {
      expect(noHeadings.formatted).toMatch(/ui\.screens\.1\.contentsFor.*screen "guide" has no heading lines to list/);
    }

    const chained = parseModSpec({
      ...UI_SPEC,
      ui: {
        screens: [
          { id: "guide", lines: [{ text: "Welcome", style: "heading" }] },
          { id: "toc", contentsFor: "guide" },
          { id: "index", contentsFor: "toc" },
        ],
      },
    });
    expect(chained.ok).toBe(false);
    if (!chained.ok) {
      expect(chained.formatted).toMatch(/ui\.screens\.2\.contentsFor.*"toc" is itself an auto-contents screen/);
    }
  });

  it("emits a no-op link action for screens without line links", () => {
    const p = planGeneration(parseSpecOrThrow(UI_SPEC), makeFixtureAdapter());
    const screen = p.files.find((f) => f.path.endsWith("ModMainGuideScreen.java"))!.content;
    expect(screen).toContain("static final int[] LINKS = { -1, -1 };");
    expect(screen).toContain('static final String[] TARGETS = { "", "" };');
    expect(screen).toContain("// This screen has no in-body links.");
  });

  it("lays out footer buttons and links navigation to the generated screen class", () => {
    const spec = parseSpecOrThrow({
      ...UI_SPEC,
      ui: {
        screens: [
          {
            id: "guide",
            title: "Guide",
            lines: ["x"],
            buttons: [
              { action: "open", target: "help" },
              { action: "close", label: "Back to game" },
            ],
          },
          { id: "help", title: "Help", lines: ["y"] },
        ],
      },
    });
    const p = planGeneration(spec, makeFixtureAdapter());
    const screen = p.files.find((f) => f.path.endsWith("ModMainGuideScreen.java"))!.content;
    // 2 buttons earn a taller panel: the footer is centred on the live panel width and anchored to
    // its bottom edge, so a panel clamped to a small window still keeps its buttons inside.
    expect(screen).toContain('Component.translatable("screen.examplemod.guide.button.1")');
    expect(screen).toContain("this.minecraft.setScreen(new ModMainHelpScreen(this))");
    expect(screen).toContain("int footerButtonWidth0 = Math.max(1, Math.min(100, (this.panelWidth - 16 - 8 * (2 - 1)) / 2));");
    expect(screen).toContain("int footerRowWidth0 = 2 * footerButtonWidth0 + 8 * (2 - 1);");
    expect(screen).toContain(
      ".bounds(left + (this.panelWidth - footerRowWidth0) / 2, top + this.panelHeight - 36 + 6, footerButtonWidth0, 20)",
    );
    expect(screen).toContain(
      ".bounds(left + (this.panelWidth - footerRowWidth0) / 2 + footerButtonWidth0 + 8, top + this.panelHeight - 36 + 6, footerButtonWidth0, 20)",
    );
    expect(screen).toContain("this.onClose()");
    const lang = JSON.parse(p.files.find((f) => f.path.endsWith("lang/en_us.json"))!.content);
    expect(lang["screen.examplemod.guide.button.1"]).toBe("Open Help");
    expect(lang["screen.examplemod.guide.button.2"]).toBe("Back to game");
  });

  it("grows the panel to fit four buttons in two rows", () => {
    const spec = parseSpecOrThrow({
      ...UI_SPEC,
      ui: {
        screens: [
          {
            id: "guide",
            width: 100,
            height: 60,
            lines: [],
            buttons: [
              { action: "close", label: "A" },
              { action: "close", label: "B" },
              { action: "close", label: "C" },
              { action: "close", label: "D" },
            ],
          },
        ],
      },
    });
    const screen = planGeneration(spec, makeFixtureAdapter()).files.find((f) => f.path.endsWith("ModMainGuideScreen.java"))!.content;
    expect(screen).toContain("static final int W = 240;");
    expect(screen).toContain("static final int H = 114;");
    expect(screen).toContain("static final int FOOTER = 60;");
    expect(screen.match(/addRenderableWidget/g)).toHaveLength(4);
    // Both rows size from the same live panel width; the second row only has one button.
    expect(screen).toContain("int footerButtonWidth0 = Math.max(1, Math.min(100, (this.panelWidth - 16 - 8 * (2 - 1)) / 2));");
    expect(screen).toContain("int footerRowWidth0 = 2 * footerButtonWidth0 + 8 * (2 - 1);");
    expect(screen).toContain("int footerButtonWidth1 = Math.max(1, Math.min(100, (this.panelWidth - 16 - 8 * (2 - 1)) / 2));");
    expect(screen).toContain("int footerRowWidth1 = 2 * footerButtonWidth1 + 8 * (2 - 1);");
    expect(screen).toContain(
      ".bounds(left + (this.panelWidth - footerRowWidth0) / 2, top + this.panelHeight - 60 + 6, footerButtonWidth0, 20)",
    );
    expect(screen).toContain(
      ".bounds(left + (this.panelWidth - footerRowWidth0) / 2 + footerButtonWidth0 + 8, top + this.panelHeight - 60 + 6, footerButtonWidth0, 20)",
    );
    expect(screen).toContain(
      ".bounds(left + (this.panelWidth - footerRowWidth1) / 2, top + this.panelHeight - 60 + 30, footerButtonWidth1, 20)",
    );
    expect(screen).toContain(
      ".bounds(left + (this.panelWidth - footerRowWidth1) / 2 + footerButtonWidth1 + 8, top + this.panelHeight - 60 + 30, footerButtonWidth1, 20)",
    );
  });

  it("rejects an open button without a target or with a self target (agent-fixable error)", () => {
    const noTarget = parseModSpec({ ...UI_SPEC, ui: { screens: [{ id: "guide", buttons: [{ action: "open" }] }] } });
    expect(noTarget.ok).toBe(false);
    if (!noTarget.ok) expect(noTarget.formatted).toMatch(/ui\.screens\.0\.buttons\.0\.target/);

    const self = parseModSpec({ ...UI_SPEC, ui: { screens: [{ id: "guide", buttons: [{ action: "open", target: "guide" }] }] } });
    expect(self.ok).toBe(false);
    if (!self.ok) expect(self.formatted).toMatch(/cannot open itself/);

    const closeWithTarget = parseModSpec({
      ...UI_SPEC,
      ui: { screens: [{ id: "guide", buttons: [{ action: "close", target: "help" }] }] },
    });
    expect(closeWithTarget.ok).toBe(false);
  });

  it("rejects duplicate screen ids and duplicate shortcut keys (agent-fixable error)", () => {
    const dupId = parseModSpec({ ...UI_SPEC, ui: { screens: [{ id: "guide" }, { id: "guide" }] } });
    expect(dupId.ok).toBe(false);
    if (!dupId.ok) expect(dupId.formatted).toMatch(/ui\.screens\.1\.id.*duplicate screen id "guide"/);

    const dupKey = parseModSpec({
      ...UI_SPEC,
      ui: { screens: [{ id: "guide", key: "K" }, { id: "credits", key: "K" }] },
    });
    expect(dupKey.ok).toBe(false);
    if (!dupKey.ok) expect(dupKey.formatted).toMatch(/ui\.screens\.1\.key.*already bound to screen "guide"/);
  });

  it("rejects an open target that is not a declared screen, listing the available ids", () => {
    const spec = parseSpecOrThrow({
      ...UI_SPEC,
      ui: { screens: [{ id: "guide", buttons: [{ action: "open", target: "missing" }] }] },
    });
    expect(() => planGeneration(spec, makeFixtureAdapter())).toThrowError(
      /target "missing" is not a declared screen id; available: guide/,
    );
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
