import { describe, expect, it } from "vitest";
import { toPascalCase, toDisplayName } from "../src/ids.js";
import { renderTemplate, TemplateError } from "../src/render.js";
import { parseModSpec } from "../src/spec.js";

describe("ids", () => {
  it("converts ids to Java class names", () => {
    expect(toPascalCase("ruby_ore")).toBe("RubyOre");
    expect(toPascalCase("deep-slate")).toBe("DeepSlate");
    expect(toDisplayName("ruby_ore")).toBe("Ruby Ore");
  });
});

describe("renderTemplate", () => {
  it("substitutes vars and tolerates $ in content", () => {
    const out = renderTemplate("a {{x}} $& {{y}}", { x: "1", y: "$2" });
    expect(out).toBe("a 1 $& $2");
  });
  it("reports every missing variable", () => {
    try {
      renderTemplate("{{a}} {{b}}", { a: "1" }, "tpl");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(TemplateError);
      expect((e as TemplateError).missing).toEqual(["b"]);
    }
  });
});

describe("parseModSpec", () => {
  it("applies defaults", () => {
    const r = parseModSpec({
      schemaVersion: 1,
      mod: { modId: "examplemod" },
      target: { mcVersion: "1.21.1", loader: "fabric" },
      content: { blocks: [{ id: "ruby_ore" }] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.spec.mod.version).toBe("1.0.0");
      expect(r.spec.content.items).toEqual([]);
      expect(r.spec.content.blocks[0]).toMatchObject({ hardness: 1.5, resistance: 6, tool: "pickaxe" });
    }
  });
  it("rejects bad modId and unknown keys with agent-fixable messages", () => {
    const r = parseModSpec({
      schemaVersion: 1,
      mod: { modId: "9bad", extra: 1 },
      target: { mcVersion: "1.21.1", loader: "fabric" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.formatted).toMatch(/mod\.modId/);
      expect(r.formatted).toMatch(/Unrecognized key/);
      expect(r.formatted).toMatch(/extra/);
    }
  });
});
