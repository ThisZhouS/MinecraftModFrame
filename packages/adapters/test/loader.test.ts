import { lintAdapter } from "@mcmodkit/core";
import type { AdapterRecordT } from "@mcmodkit/core";
import { describe, expect, it } from "vitest";
import { adapterSummary, listAdapters, listTargets } from "../src/index.js";

describe("adapter loader", () => {
  it("loads and validates whatever adapter data ships with the package", () => {
    const adapters = listAdapters();
    expect(Array.isArray(adapters)).toBe(true);
    for (const a of adapters) {
      expect(a.id).toMatch(/^(fabric|neoforge|forge)-/);
      expect(lintAdapter(a)).toEqual([]);
    }
  });

  it("targets are sorted newest-first", () => {
    const targets = listTargets();
    for (let i = 1; i < targets.length; i++) {
      const cmp = targets[i]!.mcVersion.localeCompare(targets[i - 1]!.mcVersion, undefined, { numeric: true });
      expect(cmp).toBeLessThanOrEqual(0);
    }
  });

  it("every adapter id is unique", () => {
    const ids = listAdapters().map((a: AdapterRecordT) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("adapterSummary", () => {
  // The CLI and the MCP server both render adapters through this function. It used to be duplicated
  // in each surface, which is how a field ends up reaching one agent and not another.
  it("carries the authoritative references, not just the version facts", () => {
    for (const a of listAdapters()) {
      const summary = adapterSummary(a);
      expect(summary.id).toBe(a.id);
      expect(summary.references).toEqual(a.references);
      // Facts without sources leave an agent to re-derive them from the web.
      expect((summary.references as unknown[]).length).toBeGreaterThan(0);
    }
  });

  it("omits template bodies unless asked, and includes them when asked", () => {
    const a = listAdapters()[0]!;
    expect(adapterSummary(a).templates).toBeUndefined();
    expect(adapterSummary(a, true).templates).toEqual(a.templates);
  });
});
