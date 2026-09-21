import { describe, expect, it } from "vitest";
import { parseModSpec } from "../src/spec.js";
import { planGeneration } from "../src/generators.js";
import { makeFixtureAdapter } from "./fixture-adapter.js";

const BASE = {
  schemaVersion: 1,
  mod: { modId: "examplemod" },
  target: { mcVersion: "1.21.1", loader: "fabric" },
};

function planFor(content: unknown) {
  const parsed = parseModSpec({ ...BASE, content });
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.formatted);
  return planGeneration(parsed.spec, makeFixtureAdapter());
}

function modelBody(plan: ReturnType<typeof planFor>, path: string): string {
  const f = plan.files.find((x) => x.path === path);
  expect(f, `missing ${path}`).toBeDefined();
  return f!.content;
}

describe("model shape selection", () => {
  it("defaults items to the flat generated model and blocks to cube_all", () => {
    const plan = planFor({ items: [{ id: "ruby" }], blocks: [{ id: "ruby_ore" }] });
    expect(modelBody(plan, "src/main/resources/assets/examplemod/models/item/ruby.json")).toContain("minecraft:item/generated");
    expect(modelBody(plan, "src/main/resources/assets/examplemod/models/block/ruby_ore.json")).toContain("minecraft:block/cube_all");
  });

  it("switches an item to the handheld parent without changing its texture path", () => {
    const plan = planFor({ items: [{ id: "ruby_pick" , model: "handheld" }], blocks: [] });
    const body = modelBody(plan, "src/main/resources/assets/examplemod/models/item/ruby_pick.json");
    expect(body).toContain("minecraft:item/handheld");
    // The model shape must not move the texture: the sprite stays at item/<id>.
    expect(body).toContain("examplemod:item/ruby_pick");
  });

  it("switches a block to the column parent, binding both end and side", () => {
    const plan = planFor({ items: [], blocks: [{ id: "ruby_pillar", model: "cube_column" }] });
    const body = modelBody(plan, "src/main/resources/assets/examplemod/models/block/ruby_pillar.json");
    expect(body).toContain("minecraft:block/cube_column");
    expect(body).toContain('"end": "examplemod:block/ruby_pillar"');
    expect(body).toContain('"side": "examplemod:block/ruby_pillar"');
  });

  it("rejects an unknown model shape at validation time", () => {
    const bad = parseModSpec({ ...BASE, content: { items: [{ id: "ruby", model: "sphere" }], blocks: [] } });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.formatted).toContain("content.items.0.model");
  });

  it("fails with a fixable error when the adapter lacks the requested model template", () => {
    const parsed = parseModSpec({ ...BASE, content: { items: [{ id: "ruby", model: "handheld" }], blocks: [] } });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const adapter = makeFixtureAdapter();
    delete adapter.templates.itemModelHandheld;
    expect(() => planGeneration(parsed.spec, adapter)).toThrow(/does not offer item model "handheld"/);
  });
});
