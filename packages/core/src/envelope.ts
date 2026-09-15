import { toAgentError } from "./errors.js";

/**
 * The one JSON envelope every surface (CLI --json, MCP tool results, HTTP API) speaks.
 * Stable shape => agents parse once, reuse everywhere (Project Principle 3).
 */
export interface OkEnvelope { ok: true; data: unknown }
export interface ErrEnvelope { ok: false; error: { code: string; message: string; details?: unknown } }
export type Envelope = OkEnvelope | ErrEnvelope;

/** Exit-code contract (documented in CLI --help; agents use them as control flow). */
export const EXIT_CODES = {
  ok: 0,
  runtime: 1,
  usage: 2,
  notFound: 3,
  specInvalid: 4,
  conflict: 5,
} as const;

export function okEnvelope(data: unknown): OkEnvelope {
  return { ok: true, data };
}

export function errEnvelope(err: unknown): ErrEnvelope {
  return { ok: false, error: toAgentError(err) };
}

export function exitCodeFor(err: unknown): number {
  const { code } = toAgentError(err);
  switch (code) {
    case "ADAPTER_NOT_FOUND":
      return EXIT_CODES.notFound;
    case "SPEC_INVALID":
      return EXIT_CODES.specInvalid;
    default:
      return EXIT_CODES.runtime;
  }
}
