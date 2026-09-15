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
