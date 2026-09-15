import { describe, expect, it } from "vitest";
import { exampleSpec } from "@mcmodkit/core";
import { listAdapters, planProject, requireAdapter } from "../src/index.js";

const spec = exampleSpec();
const adapter = requireAdapter("1.21.1", "fabric");
const plan = planProject(spec, adapter);
const paths = plan.files.map((f) => f.path);

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
    expect(gradleProps).toContain("JavaVersion.VERSION_21");
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
      const p = a.id === adapter.id ? plan : planProject(spec, a);
      expect(p.files.length).toBeGreaterThan(20);
      for (const f of p.files) {
        const leftover = f.content.match(/\{\{[a-zA-Z_]+\}\}/g);
        expect(leftover, `${a.id}: ${f.path} has unrendered ${leftover?.[0]}`).toBeNull();
      }
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
