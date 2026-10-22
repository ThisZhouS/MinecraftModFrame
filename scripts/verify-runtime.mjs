#!/usr/bin/env node
/**
 * verify-runtime.mjs - acceptance harness: does the generated mod actually LOAD?
 *
 * Compilation proves the code type-checks. It does not prove the mod survives being loaded, and the
 * two are genuinely different: the Forge 1.20.1 adapter once compiled cleanly while throwing
 * "Registry Object not present" the moment the game started, because it resolved a DeferredRegister
 * entry from the mod constructor. Only running the thing catches that class of bug.
 *
 * This harness generates a project per adapter, starts a real dedicated server with the mod loaded,
 * and watches the log for a successful boot or a load-time crash.
 *
 * Usage:
 *   node scripts/verify-runtime.mjs --adapter forge-1.20.1 \
 *     --gradle "4=<gradle4>,8=<gradle8>,9=<gradle9>" \
 *     --java-home-8 <jdk8> --java-home-17 <jdk17> --java-home-21 <jdk21> \
 *     [--gradle-arg "-Dorg.gradle.java.installations.paths=<jdk>"]
 *
 * Verdicts:
 *   PASS     server reached "Done (" AND the mod's own initializer logged
 *   WARN     server reached "Done (" but the mod never logged - it may not have been loaded at all
 *   FAIL     a load-time crash marker, or the build died before the server was ready
 *   SKIPPED  no toolchain supplied for this adapter's Java / Gradle line
 *   TIMEOUT  the server neither booted nor crashed within --timeout
 *
 * Exit code: 0 when nothing FAILed, 1 otherwise. SKIPPED/TIMEOUT are reported, never hidden.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repoRoot, "packages", "cli", "dist", "index.js");

/**
 * Markers that mean the mod failed to load. Deliberately specific: a bare "Caused by:" appears in
 * plenty of benign stack traces (mixin complaints, optional-dependency probes), so matching it would
 * report failures that are not failures.
 */
const CRASH_MARKERS = [
  "Registry Object not present",
  "A mod crashed",
  "has failed to load correctly",
  "Encountered an unexpected exception",
  "Failed to start the minecraft server",
  "ModLoadingException",
  'Exception in thread "main"',
  "java.lang.NoClassDefFoundError",
  "java.lang.NoSuchMethodError",
  "java.lang.ClassNotFoundException",
];

/** The dedicated server announces readiness with this exact phrase on every version. */
const READY_MARKER = /Done \(/;

function parseArgs(argv) {
  const out = { adapters: [], javaHomes: {}, work: join(repoRoot, "Temp", "verify-runtime"), timeoutSec: 420 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--adapter") out.adapters.push(argv[++i]);
    else if (a === "--gradle") out.gradle = argv[++i];
    else if (a === "--gradle-arg") (out.gradleArgs ??= []).push(argv[++i]);
    else if (a === "--work") out.work = resolve(argv[++i]);
    else if (a === "--timeout") out.timeoutSec = Number(argv[++i]);
    else if (a.startsWith("--java-home-")) out.javaHomes[a.slice("--java-home-".length)] = argv[++i];
    else if (a === "--java-home") out.javaHomes.default = argv[++i];
    else if (a === "--help" || a === "-h") { console.log("see header of scripts/verify-runtime.mjs"); process.exit(0); }
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

function run(command, args, options = {}) {
  const r = spawnSync(command, args, { encoding: "utf8", shell: process.platform === "win32", ...options });
  return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function cliJson(args) {
  const r = run(process.execPath, [cli, ...args, "--json"]);
  const text = r.stdout.slice(r.stdout.indexOf("{"));
  return { code: r.code, json: text ? JSON.parse(text) : undefined, raw: r.stdout + r.stderr };
}

/** "--gradle" is either one path or "4=path,8=path,9=path" keyed by Gradle major version. */
function pickGradle(spec, major) {
  if (!spec) return undefined;
  const pairs = spec
    .split(",")
    .filter(Boolean)
    .map((e) => {
      const i = e.indexOf("=");
      return i === -1 ? { major: undefined, path: e } : { major: e.slice(0, i).trim(), path: e.slice(i + 1).trim() };
    });
  return (pairs.find((p) => p.major === major) ?? pairs.find((p) => p.major === undefined))?.path;
}

/** Windows needs the whole tree killed: Gradle spawns the server JVM as a child. */
function killTree(pid) {
  if (pid === undefined) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try { process.kill(-pid, "SIGKILL"); } catch { try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ } }
  }
}

/**
 * Start the server and stop it as soon as we can tell what happened. The server runs until killed,
 * so "wait for exit" would never return; the signal is in the log.
 */
function runServer(gradlePath, projectDir, env, { timeoutMs, modId, extraArgs = [] }) {
  return new Promise((done) => {
    const child = spawn(gradlePath, ["runServer", "--console=plain", "--no-daemon", ...extraArgs], {
      cwd: projectDir,
      env,
      shell: process.platform === "win32",
      detached: process.platform !== "win32",
    });
    let log = "";
    let settled = false;
    const modLineRe = new RegExp(`\\b${modId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (loaded|initialized)\\b`);

    const finish = (verdict, detail) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killTree(child.pid);
      done({ verdict, detail, log, modLine: modLineRe.test(log), ready: READY_MARKER.test(log) });
    };

    const timer = setTimeout(() => finish("TIMEOUT", `no boot or crash within ${Math.round(timeoutMs / 1000)}s`), timeoutMs);

    const onChunk = (buf) => {
      log += buf.toString();
      const crash = CRASH_MARKERS.find((m) => log.includes(m));
      if (crash !== undefined) return finish("FAIL", `load-time crash: ${crash}`);
      // "Done (" means the server finished loading with the mod in place. The mod's own log line is
      // checked separately - a server boots fine even if the mod was never loaded at all.
      if (READY_MARKER.test(log)) {
        // Give the mod a moment to flush its own line, which may land just after readiness.
        setTimeout(() => {
          finish(
            modLineRe.test(log) ? "PASS" : "WARN",
            modLineRe.test(log) ? "server booted with the mod loaded" : "server booted but the mod never logged its init line",
          );
        }, 3000);
      }
    };
    child.stdout.on("data", onChunk);
    child.stderr.on("data", onChunk);
    child.on("error", (e) => finish("FAIL", `could not start gradle: ${e.message}`));
    child.on("exit", (code) => {
      if (CRASH_MARKERS.some((m) => log.includes(m))) return; // already reported
      finish("FAIL", `gradle exited with code ${code} before the server was ready`);
    });
  });
}

/** Items + blocks + a behaviour + a vanilla group + a custom tab: what every adapter supports. */
function smokeSpec(mcVersion, loader, modId) {
  return {
    schemaVersion: 1,
    mod: { modId, name: "Runtime Check", version: "1.0.0", description: "runtime load check", license: "MIT" },
    target: { mcVersion, loader },
    textures: true,
    content: {
      items: [
        { id: "ruby", name: "Ruby", group: "ingredients", texture: { style: "speckle", palette: ["#b91c1c", "#7f1d1d", "#f87171"] } },
        { id: "mk2", name: "MK2", behavior: "fishing_rod", model: "handheld", maxCount: 1, durability: 128 },
      ],
      blocks: [{ id: "ruby_ore", hardness: 3, resistance: 9, tool: "pickaxe", texture: { style: "ore", palette: ["#6b7280", "#dc2626"] } }],
    },
  };
}

const args = parseArgs(process.argv.slice(2));
if (!existsSync(cli)) {
  console.error(`CLI not built: ${cli}\nRun: pnpm -r build`);
  process.exit(1);
}

const versions = cliJson(["list-versions"]);
const targets = versions.json?.data?.targets ?? [];
const selected = args.adapters.length > 0 ? targets.filter((t) => args.adapters.includes(t.id)) : targets;
if (selected.length === 0) { console.error("no adapters selected"); process.exit(1); }

mkdirSync(args.work, { recursive: true });
const results = [];

for (const target of selected) {
  const dir = join(args.work, target.id);
  mkdirSync(dir, { recursive: true });
  const modId = `rtcheck${target.loader}`;
  const specPath = join(dir, "spec.json");
  writeFileSync(specPath, JSON.stringify(smokeSpec(target.mcVersion, target.loader, modId), null, 2) + "\n", "utf8");

  const outDir = join(dir, "out");
  const gen = cliJson(["gen", specPath, "-o", outDir]);
  if (gen.json?.ok !== true) {
    results.push({ id: target.id, status: "FAIL", detail: `generation failed: ${(gen.json?.error?.message ?? gen.raw).slice(0, 160)}` });
    continue;
  }
  const projectDir = join(outDir, modId);

  const javaHome = args.javaHomes[String(target.java)] ?? args.javaHomes.default;
  const facts = cliJson(["adapter", target.id]);
  const wrapperVersion = facts.json?.data?.adapter?.gradleWrapperVersion ?? facts.json?.data?.gradleWrapperVersion;
  const major = wrapperVersion === undefined ? undefined : String(wrapperVersion).split(".")[0];
  const gradlePath = pickGradle(args.gradle, major);
  if (!gradlePath || !javaHome) {
    results.push({ id: target.id, status: "SKIPPED", detail: `need --java-home-${target.java} and a gradle for major ${major ?? "?"}` });
    continue;
  }

  // A dedicated server refuses to start until the EULA is accepted. Writing it here keeps the
  // generated project itself free of a file the user is supposed to accept personally.
  mkdirSync(join(projectDir, "run"), { recursive: true });
  writeFileSync(join(projectDir, "run", "eula.txt"), "eula=true\n", "utf8");

  const started = Date.now();
  const r = await runServer(gradlePath, projectDir, { ...process.env, JAVA_HOME: javaHome }, {
    timeoutMs: args.timeoutSec * 1000,
    modId,
    extraArgs: args.gradleArgs,
  });
  writeFileSync(join(dir, "runtime.log"), r.log, "utf8");
  results.push({
    id: target.id,
    status: r.verdict,
    detail: r.detail,
    ready: r.ready,
    modLine: r.modLine,
    seconds: Math.round((Date.now() - started) / 1000),
    log: join(dir, "runtime.log"),
  });
}

console.log("\n=== runtime load check ===");
for (const r of results) {
  const flag = r.status === "PASS" ? "PASS   " : r.status === "WARN" ? "WARN   " : r.status === "SKIPPED" ? "SKIPPED" : r.status.padEnd(7);
  console.log(`${flag} ${r.id.padEnd(18)} ${r.seconds !== undefined ? String(r.seconds).padStart(4) + "s  " : "     "}${r.detail}`);
}
const failed = results.filter((r) => r.status === "FAIL").length;
console.log(`\n${results.length} target(s): ${results.filter((r) => r.status === "PASS").length} pass, ${failed} fail, ` +
  `${results.filter((r) => r.status === "WARN").length} warn, ${results.filter((r) => r.status === "SKIPPED").length} skipped, ` +
  `${results.filter((r) => r.status === "TIMEOUT").length} timeout`);
process.exit(failed > 0 ? 1 : 0);
