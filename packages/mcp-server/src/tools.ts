import { z } from "zod/v4";
import { McmodError, emitPlan, exampleSpec, parseModSpec } from "@mcmodkit/core";
import type { AdapterRecordT, ModSpecT } from "@mcmodkit/core";
import { getAdapter, listAdapters, listTargets, planProject, requireAdapter } from "@mcmodkit/adapters";

/**
 * Tool handlers, kept SDK-independent so they can be unit-tested directly and reused by any
 * transport. Every tool is STATELESS: all inputs travel in the arguments (project dir, spec),
 * matching the direction of the MCP 2026-07-28 stateless core.
 */

export interface ToolDef {
  name: string;
  description: string;
  /** Zod object schema — the MCP SDK validates arguments against it before the handler runs. */
  inputSchema: z.ZodObject<z.ZodRawShape>;
  readOnly: boolean;
  /** Never expose a raw shell; writes only into the caller-provided outDir. */
  writeAccess?: boolean;
  /** Re-running with the same inputs converges to the same files. */
  idempotent?: boolean;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

function adapterSummary(a: AdapterRecordT, includeTemplates: boolean): Record<string, unknown> {
  return {
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
    templates: includeTemplates ? a.templates : undefined,
  };
}

export const toolDefs: ToolDef[] = [
  {
    name: "list_versions",
    description:
      "List every supported Minecraft target (mcVersion x loader) with its required Java version, mappings and loader version. " +
      "Call this FIRST when the user names a Minecraft version/loader that you are unsure about.",
    inputSchema: z.object({}),
    readOnly: true,
    idempotent: true,
    handler: async () => ({ targets: listTargets() }),
  },
  {
    name: "get_adapter",
    description:
      "Version-facts lookup for one supported target: required Java, mappings, Gradle wrapper version, resource path conventions, " +
      "lang key patterns and adapter notes. Use it to answer 'what does this version need' instead of guessing from training data.",
    inputSchema: z.object({
      mcVersion: z.string().describe("e.g. 1.21.1"),
      loader: z.enum(["fabric", "neoforge", "forge"]),
      includeTemplates: z.boolean().optional().describe("include full template bodies (large); default false"),
    }),
    readOnly: true,
    handler: async (args) => {
      const mcVersion = String(args.mcVersion);
      const loader = String(args.loader);
      const a = getAdapter(mcVersion, loader);
      if (!a) {
        const known = listTargets().map((t) => t.id).join(", ");
        throw new McmodError("ADAPTER_NOT_FOUND", 'No adapter for (mcVersion=' + mcVersion + ", loader=" + loader + "). Supported: " + (known || "(none)"), { mcVersion, loader });
      }
      return adapterSummary(a, args.includeTemplates === true);
    },
  },
  {
    name: "validate_spec",
    description:
      "Validate a ModSpec object against the schema WITHOUT writing anything. Returns { valid, issues, formatted }. " +
      "Always validate before scaffold_mod; the formatted field is written for direct self-repair.",
    inputSchema: z.object({ spec: z.unknown().describe("the ModSpec object to validate") }),
    readOnly: true,
    handler: async (args) => {
      const r = parseModSpec(args.spec);
      return r.ok
        ? { valid: true, spec: r.spec }
        : { valid: false, issues: r.issues, formatted: r.formatted };
    },
  },
  {
    name: "example_spec",
    description: "Return a known-good example ModSpec to copy and edit (items + blocks, fabric 1.21.1).",
    inputSchema: z.object({}),
    readOnly: true,
    handler: async () => ({ spec: exampleSpec() }),
  },
  {
    name: "scaffold_mod",
    description:
      "Generate a complete, buildable Gradle mod project for the spec's target. Writes files under <outDir>/<modId>/; " +
      "managed files are overwritten on re-run (idempotent iteration) while files outside the plan are never touched. " +
      "Use dryRun=true to get the file plan without writing. Never runs shell commands or builds.",
    inputSchema: z.object({
      spec: z.unknown().describe("ModSpec object (validate_spec it first)"),
      outDir: z.string().min(1).describe("absolute directory that will contain <modId>/"),
      dryRun: z.boolean().optional().describe("report the plan without writing; default false"),
    }),
    readOnly: false,
    writeAccess: true,
    idempotent: true,
    handler: async (args) => {
      const parsed = parseModSpec(args.spec);
      if (!parsed.ok) {
        throw new McmodError("SPEC_INVALID", "ModSpec validation failed:\n" + parsed.formatted, { issues: parsed.issues });
      }
      const spec: ModSpecT = parsed.spec;
      const adapter = requireAdapter(spec.target.mcVersion, spec.target.loader);
      const plan = planProject(spec, adapter);
      const result = await emitPlan(plan, { outDir: String(args.outDir), dryRun: args.dryRun === true });
      return {
        adapterId: adapter.id,
        modId: spec.mod.modId,
        outDir: result.outDir,
        projectDir: result.projectDir,
        dryRun: result.dryRun,
        writtenCount: result.written.length,
        written: result.written,
        warnings: plan.warnings,
      };
    },
  },
];

const byName = new Map(toolDefs.map((t) => [t.name, t]));

export function toolNames(): string[] {
  return toolDefs.map((t) => t.name);
}

/** Dispatch used by both the MCP server and tests. Throws McmodError on failure. */
export async function callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const def = byName.get(name);
  if (!def) {
    throw new McmodError("ADAPTER_NOT_FOUND", 'Unknown tool "' + name + '". Available: ' + toolNames().join(", "), { name });
  }
  return def.handler(args);
}

export { listAdapters };
