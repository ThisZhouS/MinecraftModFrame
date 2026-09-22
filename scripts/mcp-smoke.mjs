// Minimal stdio MCP client: drives the server the way an agent host would.
import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["packages/mcp-server/dist/index.js"], { stdio: ["pipe", "pipe", "pipe"] });
let buf = "";
const pending = new Map();
child.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});
child.stderr.on("data", (d) => process.stderr.write("[server] " + d));

let nextId = 1;
function call(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => reject(new Error("timeout on " + method)), 15000);
  });
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

const init = await call("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "smoke", version: "1.0.0" },
});
console.log("initialize ->", init.result?.serverInfo ?? init.error);
notify("notifications/initialized", {});

const tools = await call("tools/list", {});
console.log("tools ->", (tools.result?.tools ?? []).map((t) => t.name).join(", "));

const versions = await call("tools/call", { name: "list_versions", arguments: {} });
const vtext = versions.result?.content?.[0]?.text ?? "";
console.log("list_versions -> ok, " + vtext.length + " chars, adapters:", (vtext.match(/(fabric|forge|neoforge)-[\d.]+/g) ?? []).join(" "));

const spec = {
  schemaVersion: 1,
  mod: { modId: "mcpsmoke" },
  target: { mcVersion: "1.21.1", loader: "fabric" },
  textures: true,
  content: {
    items: [{ id: "ruby", model: "handheld", texture: { style: "ore", palette: ["#6b7280", "#dc2626"] } }],
    blocks: [{ id: "ruby_pillar", model: "cube_column" }],
  },
};

// Version-facts lookup must carry the sources those facts came from, or an agent has to go
// searching the web again — the exact thing the references exist to prevent.
const adapter = await call("tools/call", {
  name: "get_adapter",
  arguments: { mcVersion: "1.20.1", loader: "forge" },
});
const adapterJson = JSON.parse(adapter.result?.content?.[0]?.text ?? "{}");
const refs = adapterJson.data?.references ?? [];
console.log(`get_adapter -> refs=${refs.length} kinds=${[...new Set(refs.map((r) => r.kind))].sort().join(",")}`);
for (const r of refs) console.log(`   [${r.kind}] ${r.label} -> ${r.url}`);
if (refs.length === 0) throw new Error("get_adapter returned no references");

const dry = await call("tools/call", { name: "scaffold_mod", arguments: { spec, outDir: ".mcp-out", dryRun: true } });
const dryText = dry.result?.content?.[0]?.text ?? "";
const dryJson = JSON.parse(dryText);
const pngs = (dryJson.data?.written ?? []).filter((p) => p.endsWith(".png"));
console.log("scaffold_mod dryRun -> ok=" + dryJson.ok + " files=" + dryJson.data?.writtenCount + " pngs=" + pngs.length);
for (const p of pngs) console.log("   " + p);

child.kill();
process.exit(0);
