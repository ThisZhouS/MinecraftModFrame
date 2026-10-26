#!/usr/bin/env node
/**
 * verify-build.mjs - acceptance harness: for each adapter, generate a real project from the example
 * spec and compile it with a local Gradle distribution.
 *
 * Why not the generated wrapper: on restricted networks the wrapper cannot download its Gradle
 * distribution (see docs/environment.md), so this harness takes a local Gradle installation.
 *
 * Usage:
 *   node scripts/verify-build.mjs                       # all adapters, auto-detected toolchains
 *   node scripts/verify-build.mjs --adapter forge-1.20.1
 *   node scripts/verify-build.mjs --spec docs/examples/ui2-demo.json --adapter fabric-1.21.1
 *   node scripts/verify-build.mjs --gradle "8=C:/tools/gradle-8.8/bin/gradle.bat,9=C:/tools/gradle-9.5.1/bin/gradle.bat" \
 *                                --java-home-17 C:/tools/jdk17 --java-home-21 C:/tools/jdk21
 *   node scripts/verify-build.mjs --adapter forge-1.21.4 \
 *                                --gradle-arg -Porg.gradle.java.installations.paths=C:/tools/jdk-25
 *
 * --spec compiles an arbitrary spec instead of the bundled example; its target and modId are
 * overridden per adapter so one UI/feature spec can be checked on every toolchain.
 *
 * --gradle-arg is passed through verbatim and may repeat (e.g. registering a local JDK 25 for
 * ForgeGradle 7 so the foojay resolver does not download one).
 *
 * --gradle is either one path (used for every adapter) or a "major=path" list keyed by the major
 * version of the adapter's declared gradleWrapperVersion: each plugin family needs its own Gradle
 * line (Loom 1.17 requires Gradle 9; ForgeGradle 6 refuses Gradle 9).
 *
 * Exit code: 0 when every adapter built, 1 otherwise (blocked builds are reported, not hidden).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repoRoot, "packages", "cli", "dist", "index.js");

function parseArgs(argv) {
  const out = { adapters: [], javaHomes: {}, gradleArgs: [], work: join(repoRoot, "Temp", "verify-build") };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--adapter") out.adapters.push(argv[++i]);
    else if (a === "--spec") out.spec = resolve(argv[++i]);
    else if (a === "--gradle") out.gradle = argv[++i];
    else if (a === "--gradle-arg") out.gradleArgs.push(argv[++i]);
    else if (a === "--work") out.work = resolve(argv[++i]);
    else if (a.startsWith("--java-home-")) out.javaHomes[a.slice("--java-home-".length)] = argv[++i];
    else if (a === "--java-home") out.javaHomes.default = argv[++i];
    else if (a === "--help" || a === "-h") { console.log("see header of scripts/verify-build.mjs"); process.exit(0); }
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

/** "--gradle" is either one path or "8=path,9=path" keyed by Gradle major version. */
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
  const specPath = join(dir, "spec.json");
  let specText;
  if (args.spec) {
    specText = JSON.parse(readFileSync(args.spec, "utf8"));
  } else {
    const example = cliJson(["example", "-o", specPath]);
    if (example.code !== 0) { results.push({ id: target.id, status: "FAIL", detail: "example spec failed" }); continue; }
    specText = JSON.parse(readFileSync(specPath, "utf8"));
  }
  // Point the spec at this adapter, then generate a real project from it.
  specText.target = { mcVersion: target.mcVersion, loader: target.loader };
  specText.mod = specText.mod ?? {};
  specText.mod.modId = `verify${target.loader}`;
  writeFileSync(specPath, JSON.stringify(specText, null, 2) + "\n", "utf8");

  const outDir = join(dir, "out");
  const gen = cliJson(["gen", specPath, "-o", outDir]);
  if (gen.json?.ok !== true) { results.push({ id: target.id, status: "FAIL", detail: (gen.json?.error?.message ?? gen.raw).slice(0, 200) }); continue; }

  const projectDir = join(outDir, specText.mod.modId);
  const javaHome = args.javaHomes[String(target.java)] ?? args.javaHomes.default;
  // The Gradle line is an adapter fact (Loom needs Gradle 9; ForgeGradle 6 refuses it).
  const facts = cliJson(["adapter", target.id]);
  const wrapperVersion = facts.json?.data?.adapter?.gradleWrapperVersion ?? facts.json?.data?.gradleWrapperVersion;
  const major = wrapperVersion === undefined ? undefined : String(wrapperVersion).split(".")[0];
  const gradlePath = pickGradle(args.gradle, major);
  if (!gradlePath || !javaHome) {
    results.push({
      id: target.id,
      status: "SKIPPED",
      detail: `need --java-home-${target.java} and a gradle for major ${major ?? "?"} (adapter wrapper ${wrapperVersion ?? "?"})`,
    });
    continue;
  }
  const started = Date.now();
  const env = { ...process.env, JAVA_HOME: javaHome };
  const build = run(gradlePath, ["build", "--console=plain", "--no-daemon", ...args.gradleArgs], { cwd: projectDir, env });
  const logPath = join(dir, "build.log");
  writeFileSync(logPath, build.stdout + build.stderr, "utf8");
  const ok = build.code === 0 && /BUILD SUCCESSFUL/.test(build.stdout + build.stderr);
  results.push({
    id: target.id,
    status: ok ? "PASS" : "FAIL",
    detail: ok ? `${Math.round((Date.now() - started) / 1000)}s, log: ${logPath}` : `log: ${logPath}`,
  });
}

console.log("\nadapter              java  status   detail");
console.log("-------------------- ----- -------- --------------------------------------");
let failed = 0;
for (const r of results) {
  const t = targets.find((x) => x.id === r.id);
  if (r.status === "FAIL") failed += 1;
  console.log(`${r.id.padEnd(20)} ${String(t?.java ?? "?").padEnd(5)} ${r.status.padEnd(8)} ${r.detail}`);
}
process.exit(failed === 0 ? 0 : 1);
