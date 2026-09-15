#!/usr/bin/env node
/**
 * mcmodkit MCP server (stdio). Same core workflow as the CLI and HTTP API - one engine, three surfaces.
 * Tools are stateless; every input travels in the arguments. No tool ever runs a shell command.
 */
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { toAgentError } from "@mcmodkit/core";
import { toolDefs } from "./tools.js";

const VERSION = "0.1.0";

const INSTRUCTIONS =
  "mcmodkit scaffolds Minecraft mod projects for specific (mcVersion x loader) targets. " +
  "Workflow: list_versions -> validate_spec -> scaffold_mod -> (user builds with the generated gradlew). " +
  "Version facts (required Java, mappings, resource path conventions) come from get_adapter - trust it over model memory. " +
  "scaffold_mod writes only under the outDir you pass, and never executes builds or shell commands.";

type ToolContent = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function jsonContent(data: unknown, isError = false): ToolContent {
  const out: ToolContent = { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  if (isError) out.isError = true;
  return out;
}

export function buildServer(): McpServer {
  const server = new McpServer(
    { name: "mcmodkit", version: VERSION },
    { instructions: INSTRUCTIONS },
  );
  for (const def of toolDefs) {
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: def.inputSchema,
        annotations: {
          readOnlyHint: def.readOnly,
          idempotentHint: def.idempotent === true,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async (args: unknown) => {
        try {
          const data = await def.handler((args ?? {}) as Record<string, unknown>);
          return jsonContent({ ok: true, data });
        } catch (err) {
          return jsonContent({ ok: false, error: toAgentError(err) }, true);
        }
      },
    );
  }
  return server;
}

serveStdio(buildServer);
