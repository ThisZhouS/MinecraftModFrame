#!/usr/bin/env node
/**
 * mcmod - agent-facing CLI over the same core workflow as the MCP server and HTTP API.
 *
 * Exit codes (control flow for agents):
 *   0 ok | 1 runtime error | 2 usage error | 3 target/adapter not found | 4 spec invalid | 5 conflict
 * stdout carries the JSON envelope (with --json) or human lines; stderr carries warnings/logs.
 */
import { Command } from "commander";
import {
  EXIT_CODES,
  exampleSpec,
  emitPlan,
  McmodError,
  parseModSpec,
  prefetchTextures,
} from "@mcmodkit/core";
import type { ModSpecT } from "@mcmodkit/core";
import { listAdapters, listTargets, planProject, requireAdapter } from "@mcmodkit/adapters";
import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";
import { loadSpecJson } from "./load-spec.js";
import { failAndCode, logWarn, printOk } from "./output.js";

const VERSION = "0.1.0";

const program = new Command();
program
  .name("mcmod")
  .description("Scaffold & generate Minecraft mods for any supported (mcVersion x loader) target.\n\nExit codes: 0 ok, 1 runtime, 2 usage, 3 not found, 4 spec invalid, 5 conflict.")
  .version(VERSION);

program
  .command("list-versions")
  .description("List every supported (mcVersion x loader) target from installed adapters")
  .option("--json", "output the JSON envelope instead of human lines")
  .action(async (opts: { json?: boolean }) => {
    printOk({ targets: listTargets() }, opts.json === true);
  });

program
  .command("adapter <id>")
  .description("Show one adapter's version facts (java, mappings, path conventions, notes)")
  .option("--templates", "include full template bodies (large)")
  .option("--json", "output the JSON envelope instead of human lines")
  .action(async (id: string, opts: { templates?: boolean; json?: boolean }) => {
    const a = listAdapters().find((x) => x.id === id);
    if (!a) {
      const known = listTargets().map((t) => t.id).join(", ");
      throw new McmodError("ADAPTER_NOT_FOUND", 'Unknown adapter id "' + id + '". Installed: ' + (known || "(none)"), { id });
    }
    const data = {
      id: a.id,
      mcVersion: a.mcVersion,
      loader: a.loader,
      loaderVersion: a.loaderVersion,
      java: a.java,
      mappings: a.mappings,
      gradleWrapperVersion: a.gradleWrapperVersion,
      contentPaths: a.contentPaths,
      langKeys: a.langKeys,
      notes: a.notes,
      templateKeys: Object.keys(a.templates),
      templates: opts.templates === true ? a.templates : undefined,
    };
    printOk(data, opts.json === true);
  });

program
  .command("example")
  .description("Print a valid example ModSpec (use it as your starting point)")
  .option("--json", "output the JSON envelope instead of the raw spec JSON")
  .option("-o, --out <file>", "write the spec to a file (UTF-8, no BOM) instead of stdout")
  .action(async (opts: { json?: boolean; out?: string }) => {
    if (opts.out !== undefined) {
      // Written through the fs API: shell redirection on Windows would emit UTF-16 and break JSON.parse.
      await writeFile(opts.out, JSON.stringify(exampleSpec(), null, 2) + "\n", "utf8");
      printOk({ written: opts.out }, opts.json === true);
      return;
    }
    if (opts.json === true) {
      printOk({ spec: exampleSpec() }, true);
    } else {
      process.stdout.write(JSON.stringify(exampleSpec(), null, 2) + "\n");
    }
  });

program
  .command("validate <spec>")
  .description("Validate a ModSpec file (or '-' for stdin). Exit 4 with issues when invalid.")
  .option("--json", "output the JSON envelope instead of human lines")
  .action(async (spec: string, opts: { json?: boolean }) => {
    const raw = await loadSpecJson(spec);
    const parsed = parseModSpec(raw);
    if (!parsed.ok) {
      throw new McmodError("SPEC_INVALID", "ModSpec validation failed:\n" + parsed.formatted, { issues: parsed.issues });
    }
    const s: ModSpecT = parsed.spec;
    printOk(
      {
        valid: true,
        modId: s.mod.modId,
        target: s.target.mcVersion + "/" + s.target.loader,
        items: s.content.items.length,
        blocks: s.content.blocks.length,
      },
      opts.json === true,
    );
  });

program
  .command("gen <spec>")
  .description("Generate a complete gradle mod project from a ModSpec file (or '-' for stdin)")
  .requiredOption("-o, --out <dir>", "output directory that will contain <modId>/")
  .option("--dry-run", "compute and report the file plan without writing anything")
  .option("--json", "output the JSON envelope instead of human lines")
  .action(async (spec: string, opts: { out: string; dryRun?: boolean; json?: boolean }) => {
    const raw = await loadSpecJson(spec);
    const parsed = parseModSpec(raw);
    if (!parsed.ok) {
      throw new McmodError("SPEC_INVALID", "ModSpec validation failed:\n" + parsed.formatted, { issues: parsed.issues });
    }
    const adapter = requireAdapter(parsed.spec.target.mcVersion, parsed.spec.target.loader);
    // Image-model textures are fetched before planning so the generator itself stays I/O-free.
    // A dry run skips this: it must not spend money or need a network just to list files.
    let images: Map<string, Uint8Array> | undefined;
    if (opts.dryRun !== true && parsed.spec.textureProvider === "image-api") {
      const prefetched = await prefetchTextures(parsed.spec, {
        onProgress: (m) => process.stderr.write(m + "\n"),
      });
      images = new Map([...prefetched].map(([k, v]) => [k, v.texture]));
    }
    const plan = planProject(parsed.spec, adapter, { images });
    for (const w of plan.warnings) logWarn(w);
    const result = await emitPlan(plan, { outDir: opts.out, dryRun: opts.dryRun === true });
    printOk(
      {
        adapterId: adapter.id,
        modId: parsed.spec.mod.modId,
        outDir: result.outDir,
        projectDir: result.projectDir,
        dryRun: result.dryRun,
        writtenCount: result.written.length,
        written: result.written,
        warnings: plan.warnings,
      },
      opts.json === true,
    );
  });

export async function main(argv: string[] = process.argv): Promise<number> {
  try {
    await program.parseAsync(argv);
    return EXIT_CODES.ok;
  } catch (err) {
    if (err instanceof McmodError) {
      return failAndCode(err);
    }
    const code = (err as { code?: string }).code;
    if (code === "commander.helpDisplayed" || code === "commander.version") return EXIT_CODES.ok;
    if (code === "commander.unknownOption" || code === "commander.missingArgument" || code === "commander.missingMandatoryOptionValue") {
      process.stderr.write("usage error: " + (err instanceof Error ? err.message : String(err)) + "\n");
      return EXIT_CODES.usage;
    }
    return failAndCode(err);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((c) => process.exit(c));
}
