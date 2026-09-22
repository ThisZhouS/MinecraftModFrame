#!/usr/bin/env node
/**
 * Gather the build facts an adapter needs, from authoritative sources.
 *
 *   node scripts/version-facts.mjs 1.21.4 fabric
 *   node scripts/version-facts.mjs --all
 *
 * This exists because "which loader version / Gradle version / pack format does this target need"
 * is exactly the question that sends people back to the web. Every value here is read from a
 * machine-readable authoritative endpoint, never from memory:
 *
 *   loader + api   Fabric meta / Fabric maven, Forge maven metadata, NeoForge maven metadata
 *   pack_format    version.json inside the vanilla client jar (the same "read the real jar"
 *                  method the data-pack dialect work uses)
 *
 * Endpoints that are unreachable from some networks are reported as such rather than guessed.
 */
import { inflateRawSync } from "node:zlib";

const FABRIC_META = "https://meta.fabricmc.net/v2";
const FABRIC_MAVEN = "https://maven.fabricmc.net";
const FORGE_MAVEN = "https://maven.minecraftforge.net";
// maven.neoforged.net is unreachable from some networks; creeperhost mirrors the same artifacts.
const NEOFORGE_MAVENS = [
  "https://maven.neoforged.net/releases",
  "https://maven.creeperhost.net",
];
const MOJANG_MANIFEST = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

const JAVA_BY_MC = (mc) => {
  const [a, b, c = 0] = mc.split(".").map(Number);
  if (a === 1 && b <= 16) return 8;
  if (a === 1 && b <= 17) return 16;
  if (a === 1 && (b < 20 || (b === 20 && c <= 4))) return 17;
  return 21;
};

async function fetchText(url, timeoutMs = 30000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function tryFetch(url) {
  try {
    return { ok: true, body: await fetchText(url) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const versionsIn = (xml) => [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);

/** Fabric loader + API for a game version. */
async function fabricFacts(mc) {
  const out = {};
  const loader = await tryFetch(`${FABRIC_META}/versions/loader/${mc}`);
  if (loader.ok) {
    const arr = JSON.parse(loader.body);
    out.loaderVersion = arr[0]?.loader?.version;
  } else out.loaderVersionError = loader.error;

  const loom = await tryFetch(`${FABRIC_MAVEN}/net/fabricmc/fabric-loom/maven-metadata.xml`);
  if (loom.ok) {
    const stable = versionsIn(loom.body).filter((v) => !v.includes("-"));
    out.loomVersion = stable[stable.length - 1];
  } else out.loomVersionError = loom.error;

  const api = await tryFetch(`${FABRIC_MAVEN}/net/fabricmc/fabric-api/fabric-api/maven-metadata.xml`);
  if (api.ok) {
    // Fabric API is published as "<modver>+<mcversion>". Older lines drop the patch version
    // (1.16.5 -> "+1.16"), so fall back to major.minor before giving up.
    const all = versionsIn(api.body);
    const minor = mc.split(".").slice(0, 2).join(".");
    const exact = all.filter((v) => v.endsWith(`+${mc}`));
    const relaxed = all.filter((v) => v.endsWith(`+${minor}`));
    const mine = exact.length > 0 ? exact : relaxed;
    out.fabricApiVersion = mine[mine.length - 1];
    if (out.fabricApiVersion === undefined) out.fabricApiVersionError = `no Fabric API build for ${mc} (or ${minor})`;
  } else out.fabricApiVersionError = api.error;
  return out;
}

/** Newest Forge build for a game version (versions are "<mc>-<forge>"). */
async function forgeFacts(mc) {
  const r = await tryFetch(`${FORGE_MAVEN}/net/minecraftforge/forge/maven-metadata.xml`);
  if (!r.ok) return { forgeVersionError: r.error };
  const mine = versionsIn(r.body).filter((v) => v.startsWith(`${mc}-`));
  if (mine.length === 0) return { forgeVersionError: `no Forge build published for ${mc}` };
  // Compare the Forge part only. Comparing the whole string breaks on the "<mc>-" prefix, whose
  // last segment ("5-36") is not a number — the sort silently no-ops and yields the OLDEST build,
  // because this metadata is ordered newest-first.
  const forgePart = (v) => v.slice(mc.length + 1);
  const cmp = (a, b) => {
    const pa = forgePart(a).split(".").map(Number);
    const pb = forgePart(b).split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] ?? 0) - (pb[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  };
  mine.sort(cmp);
  return { forgeVersion: forgePart(mine[mine.length - 1]) };
}

/**
 * Newest NeoForge build. NeoForge versions encode the MC minor: MC 1.21.4 -> 21.4.x.
 * (NeoForge starts at MC 1.20.1, so anything older has none.)
 */
async function neoforgeFacts(mc) {
  const [a, b] = mc.split(".").map(Number);
  if (a !== 1 || b < 20) return { neoforgeVersionError: `NeoForge does not support ${mc}` };
  const prefix = `${b}.${mc.split(".")[2] ?? "0"}.`;
  for (const base of NEOFORGE_MAVENS) {
    const r = await tryFetch(`${base}/net/neoforged/neoforge/maven-metadata.xml`);
    if (!r.ok) continue;
    const mine = versionsIn(r.body).filter((v) => v.startsWith(prefix) && !v.includes("-"));
    if (mine.length === 0) return { neoforgeVersionError: `no NeoForge build for ${mc}` };
    mine.sort((x, y) => Number(x.split(".").pop()) - Number(y.split(".").pop()));
    return { neoforgeVersion: mine[mine.length - 1], neoforgeSource: base };
  }
  return { neoforgeVersionError: "all NeoForge mavens unreachable" };
}

/**
 * pack_format from the vanilla client jar's version.json.
 * A mod jar is both a resource pack and a data pack; the existing adapters use the resource
 * pack number, so that is what we report.
 */
async function packFormatFacts(mc) {
  const manifest = await tryFetch(MOJANG_MANIFEST);
  if (!manifest.ok) return { packFormatError: manifest.error };
  const entry = JSON.parse(manifest.body).versions.find((v) => v.id === mc);
  if (entry === undefined) return { packFormatError: `${mc} not in the version manifest` };
  const meta = await tryFetch(entry.url);
  if (!meta.ok) return { packFormatError: meta.error };
  const clientUrl = JSON.parse(meta.body).downloads?.client?.url;
  if (clientUrl === undefined) return { packFormatError: "no client download in version metadata" };
  try {
    const res = await fetch(clientUrl);
    const jar = Buffer.from(await res.arrayBuffer());
    // pack.mcmeta is the game's own declaration of the format — the most direct evidence, and the
    // only one available before version.json grew a pack_version field (i.e. on 1.16.5 and older).
    const mcmeta = readZipEntry(jar, "pack.mcmeta");
    if (mcmeta !== null) {
      const parsed = JSON.parse(mcmeta.toString("utf8")).pack;
      return { packFormat: parsed?.pack_format, packFormatSource: "client jar pack.mcmeta" };
    }
    const versionJson = readZipEntry(jar, "version.json");
    if (versionJson !== null) {
      const pv = JSON.parse(versionJson.toString("utf8")).pack_version;
      if (pv !== undefined) {
        return { packFormat: pv.resource, dataPackFormat: pv.data, packFormatSource: "client jar version.json" };
      }
    }
    return { packFormatError: "client jar has neither pack.mcmeta nor version.json pack_version" };
  } catch (err) {
    return { packFormatError: err instanceof Error ? err.message : String(err) };
  }
}

/** Minimal ZIP central-directory reader — enough to pull one small text entry out of a jar. */
function readZipEntry(buf, name) {
  // Locate the End Of Central Directory record.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const entryName = buf.toString("utf8", off + 46, off + 46 + nameLen);
    if (entryName === name) {
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(start, start + compSize);
      return method === 0 ? raw : inflateRawSync(raw);
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const TARGETS = [
  ["1.21.4", ["fabric", "forge", "neoforge"]],
  ["1.20.4", ["fabric", "forge", "neoforge"]],
  ["1.19.4", ["fabric", "forge"]],
  ["1.16.5", ["fabric", "forge"]],
  ["1.12.2", ["forge"]],
];

async function factsFor(mc, loader, withPackFormat) {
  const out = { mcVersion: mc, loader, java: JAVA_BY_MC(mc) };
  if (loader === "fabric") Object.assign(out, await fabricFacts(mc));
  if (loader === "forge") Object.assign(out, await forgeFacts(mc));
  if (loader === "neoforge") Object.assign(out, await neoforgeFacts(mc));
  if (withPackFormat) Object.assign(out, await packFormatFacts(mc));
  return out;
}

const args = process.argv.slice(2);
const withPackFormat = args.includes("--pack-format");
const rest = args.filter((a) => !a.startsWith("--"));

if (rest[0] === "all" || args.includes("--all")) {
  const results = [];
  for (const [mc, loaders] of TARGETS) {
    for (const loader of loaders) results.push(await factsFor(mc, loader, withPackFormat));
  }
  console.log(JSON.stringify(results, null, 2));
} else if (rest.length >= 2) {
  console.log(JSON.stringify(await factsFor(rest[0], rest[1], withPackFormat), null, 2));
} else {
  console.error("usage: node scripts/version-facts.mjs <mcVersion> <loader> [--pack-format]");
  console.error("       node scripts/version-facts.mjs --all [--pack-format]");
  process.exit(2);
}
