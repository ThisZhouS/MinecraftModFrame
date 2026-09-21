import { describe, expect, it } from "vitest";
import { parseModSpec } from "../src/spec.js";
import { planGeneration } from "../src/generators.js";
import { makeFixtureAdapter } from "./fixture-adapter.js";

const BASE = {
  schemaVersion: 1,
  mod: { modId: "examplemod" },
  target: { mcVersion: "1.21.1", loader: "fabric" },
};

function planFor(items: unknown[]) {
  const parsed = parseModSpec({ ...BASE, content: { items, blocks: [] } });
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.formatted);
  return planGeneration(parsed.spec, makeFixtureAdapter());
}

function registryBody(plan: ReturnType<typeof planFor>): string {
  return plan.files.find((f) => f.path.endsWith("ModMainItems.java"))!.content;
}

describe("item behaviour", () => {
  it("defaults to a plain item", () => {
    expect(registryBody(planFor([{ id: "ruby" }]))).toContain("new Item(");
  });

  it("selects a subclass when the spec asks for a behaviour", () => {
    const body = registryBody(planFor([{ id: "mk2", behavior: "fishing_rod" }]));
    expect(body).toContain("new FishingRod(");
    // The class it references must be imported, or the generated project will not compile.
    expect(body).toContain("import com.example.FishingRod;");
  });

  it("only imports what the spec actually uses", () => {
    const body = registryBody(planFor([{ id: "ruby" }]));
    expect(body).not.toContain("import com.example.FishingRod;");
  });

  it("appends durability to the settings expression", () => {
    const body = registryBody(planFor([{ id: "mk2", durability: 128, maxCount: 1 }]));
    expect(body).toContain("maxCount(1).durability(128)");
  });

  it("leaves the settings expression untouched when durability is absent", () => {
    const body = registryBody(planFor([{ id: "ruby" }]));
    expect(body).not.toContain("durability(");
  });

  it("rejects an unknown behaviour with a message listing what the adapter offers", () => {
    const parsed = parseModSpec({ ...BASE, content: { items: [{ id: "ruby", behavior: "wand" }], blocks: [] } });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(() => planGeneration(parsed.spec, makeFixtureAdapter())).toThrow(/behavior "wand" is not offered.*available: plain, fishing_rod/s);
  });

  it("rejects a behaviour that is not a valid identifier at validation time", () => {
    const bad = parseModSpec({ ...BASE, content: { items: [{ id: "ruby", behavior: "Fishing Rod" }], blocks: [] } });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.formatted).toContain("content.items.0.behavior");
  });
});
