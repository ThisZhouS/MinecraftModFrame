import { describe, expect, it } from "vitest";
import { exampleSpec } from "@mcmodkit/core";
import { callTool, toolNames } from "../src/tools.js";

describe("mcp tools", () => {
  it("exposes a small, stateless tool surface", () => {
    expect(toolNames()).toEqual(["list_versions", "get_adapter", "validate_spec", "example_spec", "scaffold_mod"]);
    expect(toolNames().length).toBeLessThan(20);
  });

  it("list_versions returns the installed target list", async () => {
    const r = (await callTool("list_versions")) as { targets: unknown[] };
    expect(Array.isArray(r.targets)).toBe(true);
  });

  it("example_spec returns a schema-valid spec", async () => {
    const r = (await callTool("example_spec")) as { spec: unknown };
    const check = (await callTool("validate_spec", { spec: r.spec })) as { valid: boolean };
    expect(check.valid).toBe(true);
  });

  it("validate_spec reports agent-fixable issues instead of throwing", async () => {
    const bad = { schemaVersion: 1, mod: { modId: "Bad Id!" }, target: { mcVersion: "nope", loader: "fabric" } };
    const r = (await callTool("validate_spec", { spec: bad })) as { valid: boolean; formatted: string };
    expect(r.valid).toBe(false);
    expect(r.formatted).toMatch(/mod\.modId/);
  });

  it("scaffold_mod refuses unsupported targets with the supported list", async () => {
    const spec = { ...exampleSpec(), target: { mcVersion: "1.7.10", loader: "forge" } };
    await expect(callTool("scaffold_mod", { spec, outDir: process.cwd(), dryRun: true })).rejects.toMatchObject({ code: "ADAPTER_NOT_FOUND" });
  });

  it("rejects unknown tool names", async () => {
    await expect(callTool("nope")).rejects.toMatchObject({ code: "ADAPTER_NOT_FOUND" });
  });
});
