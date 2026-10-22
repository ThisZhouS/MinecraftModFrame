#!/usr/bin/env node
/**
 * mcmodkit HTTP API - JSON endpoints over the same core workflow as the CLI and MCP server.
 * Binds to loopback by default (no auth). Every response body is the shared envelope:
 *   { ok: true, data } | { ok: false, error: { code, message, details? } }
 */
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  McmodError,
  emitPlan,
  errEnvelope,
  exampleSpec,
  okEnvelope,
  parseModSpec,
  prepareTextures,
} from "@mcmodkit/core";
import type { ModSpecT } from "@mcmodkit/core";
import { getAdapter, listTargets, planProject } from "@mcmodkit/adapters";

/** Read from the package manifest so the version can never drift from what gets published. */
const VERSION: string = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
).version;
const MAX_BODY_BYTES = 1_000_000;
const STARTED_AT = Date.now();

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(text) });
  res.end(text);
}

function statusForError(err: unknown): number {
  const code = (err as { code?: string }).code;
  if (code === "ADAPTER_NOT_FOUND") return 404;
  if (code === "ROUTE_NOT_FOUND") return 404;
  if (code === "SPEC_INVALID") return 400;
  return 500;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) {
      throw new McmodError("SPEC_INVALID", "Request body exceeds " + MAX_BODY_BYTES + " bytes", { size });
    }
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (text === "") return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new McmodError("SPEC_INVALID", "Request body is not valid JSON: " + (err instanceof Error ? err.message : String(err)), {});
  }
}

function requireSpec(raw: unknown): ModSpecT {
  if (raw === undefined) {
    // Agents hit this constantly when they post the bare spec; say exactly what shape is wanted.
    throw new McmodError(
      "SPEC_INVALID",
      'Request body must be JSON of the form {"spec": <ModSpec>} (optionally "outDir": string, "dryRun": boolean). The "spec" field is missing.',
      {},
    );
  }
  const parsed = parseModSpec(raw);
  if (!parsed.ok) {
    throw new McmodError("SPEC_INVALID", "ModSpec validation failed:\n" + parsed.formatted, { issues: parsed.issues });
  }
  return parsed.spec;
}

/** Request handler - exported so tests can drive it via a real server on port 0. */
export function createHandler() {
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = (req.method ?? "GET").toUpperCase();
    try {
      if (method === "GET" && path === "/health") {
        send(res, 200, okEnvelope({ name: "mcmodkit-api", version: VERSION, uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000) }));
        return;
      }
      if (method === "GET" && path === "/api/versions") {
        send(res, 200, okEnvelope({ targets: listTargets() }));
        return;
      }
      if (method === "GET" && path === "/api/example") {
        send(res, 200, okEnvelope({ spec: exampleSpec() }));
        return;
      }
      const adapterMatch = /^\/api\/adapters\/([^/]+)$/.exec(path);
      if (method === "GET" && adapterMatch) {
        const id = decodeURIComponent(adapterMatch[1]!);
        const target = listTargets().find((t) => t.id === id);
        if (!target) {
          throw new McmodError("ADAPTER_NOT_FOUND", 'Unknown adapter id "' + id + '". Installed: ' + (listTargets().map((t) => t.id).join(", ") || "(none)"), { id });
        }
        const a = getAdapter(target.mcVersion, target.loader)!;
        send(res, 200, okEnvelope({ id: a.id, mcVersion: a.mcVersion, loader: a.loader, loaderVersion: a.loaderVersion, java: a.java, mappings: a.mappings, contentPaths: a.contentPaths, langKeys: a.langKeys, notes: a.notes, templateKeys: Object.keys(a.templates) }));
        return;
      }
      if (method === "POST" && path === "/api/validate") {
        const body = (await readJsonBody(req)) as { spec?: unknown };
        send(res, 200, okEnvelope(requireSpec(body.spec)));
        return;
      }
      if (method === "POST" && path === "/api/generate") {
        const body = (await readJsonBody(req)) as { spec?: unknown; outDir?: unknown; dryRun?: unknown };
        const spec = requireSpec(body.spec);
        if (typeof body.outDir !== "string" || body.outDir.length === 0) {
          throw new McmodError("SPEC_INVALID", "outDir (absolute directory string) is required", {});
        }
        const adapter = getAdapter(spec.target.mcVersion, spec.target.loader);
        if (!adapter) {
          throw new McmodError("ADAPTER_NOT_FOUND", "No adapter for " + spec.target.mcVersion + "/" + spec.target.loader, { target: spec.target });
        }
        // Same texture behaviour as the CLI: dry runs stay offline, real runs prepare before
        // planning. texture.file paths must be absolute here (no spec-file location to resolve from).
        let images: Map<string, Uint8Array> | undefined;
        if (body.dryRun !== true && spec.textures) {
          images = await prepareTextures(spec, {
            onProgress: (m) => process.stderr.write(m + "\n"),
          });
        }
        const plan = planProject(spec, adapter, { images });
        const result = await emitPlan(plan, { outDir: body.outDir, dryRun: body.dryRun === true });
        send(res, 200, okEnvelope({ adapterId: adapter.id, modId: spec.mod.modId, outDir: result.outDir, projectDir: result.projectDir, dryRun: result.dryRun, writtenCount: result.written.length, written: result.written, warnings: plan.warnings }));
        return;
      }
      send(res, 404, errEnvelope(new McmodError("ROUTE_NOT_FOUND", "No route: " + method + " " + path, { method, path })));
    } catch (err) {
      send(res, statusForError(err), errEnvelope(err));
    }
  };
}

export function startServer(opts: { port: number; host: string }): Promise<Server> {
  const server = createServer(createHandler());
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, opts.host, () => resolve(server));
  });
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.MCMODKIT_API_PORT ?? 7420);
  const host = process.env.MCMODKIT_API_HOST ?? "127.0.0.1";
  startServer({ port, host })
    .then((server) => {
      process.stderr.write("mcmodkit-api listening on http://" + host + ":" + port + "\n");
      const stop = () => server.close(() => process.exit(0));
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
    })
    .catch((err: unknown) => {
      process.stderr.write("mcmodkit-api failed to start: " + (err instanceof Error ? err.message : String(err)) + "\n");
      process.exit(1);
    });
}
