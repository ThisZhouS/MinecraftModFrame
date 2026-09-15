import { lintAdapter } from "@mcmodkit/core";
import type { AdapterRecordT } from "@mcmodkit/core";
import { describe, expect, it } from "vitest";
import { listAdapters, listTargets } from "../src/index.js";

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
