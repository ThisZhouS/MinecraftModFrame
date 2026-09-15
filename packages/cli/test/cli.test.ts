import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSpecJson } from "../src/load-spec.js";
import { exampleSpec } from "@mcmodkit/core";

describe("loadSpecJson", () => {
  it("reads a spec file from disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcmodkit-cli-"));
    try {
      const p = join(dir, "spec.json");
      await writeFile(p, JSON.stringify(exampleSpec()), "utf8");
      const raw = await loadSpecJson(p);
      expect((raw as { mod: { modId: string } }).mod.modId).toBe("examplemod");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reads from stdin when source is '-'", async () => {
    const raw = await loadSpecJson("-", async () => JSON.stringify({ hello: "world" }));
    expect(raw).toEqual({ hello: "world" });
  });

  it("maps missing files to SPEC_INVALID", async () => {
    await expect(loadSpecJson(join(tmpdir(), "definitely-missing-spec.json"))).rejects.toMatchObject({ code: "SPEC_INVALID" });
  });

  it("maps JSON syntax errors to SPEC_INVALID", async () => {
    await expect(loadSpecJson("-", async () => "{ not json")).rejects.toMatchObject({ code: "SPEC_INVALID" });
  });
});
