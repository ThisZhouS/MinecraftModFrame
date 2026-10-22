import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exampleSpec } from "@mcmodkit/core";
import { startServer } from "../src/index.js";

let server: Server;
let base = "";

beforeAll(async () => {
  server = await startServer({ port: 0, host: "127.0.0.1" });
  const addr = server.address() as AddressInfo;
  base = "http://127.0.0.1:" + addr.port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("http api", () => {
  it("GET /health returns the envelope", async () => {
    const res = await fetch(base + "/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { name: string } };
    expect(body.ok).toBe(true);
    expect(body.data.name).toBe("mcmodkit-api");
  });

  it("GET /api/versions lists targets", async () => {
    const body = (await (await fetch(base + "/api/versions")).json()) as { ok: boolean; data: { targets: unknown[] } };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data.targets)).toBe(true);
  });

  it("POST /api/validate accepts a valid spec", async () => {
    const res = await fetch(base + "/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: exampleSpec() }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { mod: { modId: string } } };
    expect(body.data.mod.modId).toBe("examplemod");
  });

  it("POST /api/validate maps schema errors to 400 + envelope", async () => {
    const res = await fetch(base + "/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: { schemaVersion: 9 } }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: { code: string; message: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("SPEC_INVALID");
  });

  it("POST /api/generate reports unsupported targets as 404", async () => {
    const spec = { ...exampleSpec(), target: { mcVersion: "1.7.10", loader: "forge" } };
    const res = await fetch(base + "/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec, outDir: process.cwd(), dryRun: true }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.error.code).toBe("ADAPTER_NOT_FOUND");
  });

  it("GET /api/example returns a usable spec", async () => {
    const res = await fetch(base + "/api/example");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { spec: { mod: { modId: string } } } };
    expect(body.ok).toBe(true);
    expect(body.data.spec.mod.modId).toBe("examplemod");
  });

  it("GET /api/adapters/:id returns facts for a known target", async () => {
    const res = await fetch(base + "/api/adapters/fabric-1.21.1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { id: string; notes: string[]; templateKeys: string[] } };
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe("fabric-1.21.1");
    expect(Array.isArray(body.data.notes)).toBe(true);
    expect(body.data.templateKeys).toContain("mainClass");
  });

  it("GET /api/adapters/:id maps unknown ids to 404 + envelope", async () => {
    const res = await fetch(base + "/api/adapters/nope");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.error.code).toBe("ADAPTER_NOT_FOUND");
  });

  it("POST /api/generate accepts a valid spec in dry-run mode", async () => {
    const res = await fetch(base + "/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: exampleSpec(), outDir: process.cwd(), dryRun: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { adapterId: string; modId: string; dryRun: boolean; writtenCount: number } };
    expect(body.ok).toBe(true);
    expect(body.data.adapterId).toBe("fabric-1.21.1");
    expect(body.data.modId).toBe("examplemod");
    expect(body.data.dryRun).toBe(true);
    expect(body.data.writtenCount).toBeGreaterThan(0);
  });

  it("POST /api/generate rejects missing outDir with 400", async () => {
    const res = await fetch(base + "/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: exampleSpec() }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.error.code).toBe("SPEC_INVALID");
  });

  it("POST /api/validate rejects bodies over the size limit with 400", async () => {
    const res = await fetch(base + "/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"spec": "' + "a".repeat(1_000_000) + '"}',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.error.code).toBe("SPEC_INVALID");
  });

  it("POST /api/validate rejects non-JSON bodies with 400", async () => {
    const res = await fetch(base + "/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json at all",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.error.code).toBe("SPEC_INVALID");
  });

  it("unknown routes return a 404 envelope", async () => {
    const res = await fetch(base + "/nope");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("ROUTE_NOT_FOUND");
  });
});
