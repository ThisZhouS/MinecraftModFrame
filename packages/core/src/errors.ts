/** Stable machine-readable error codes — every failure an agent can see and self-repair. */
export type McmodErrorCode =
  | "SPEC_INVALID"
  | "ADAPTER_NOT_FOUND"
  | "ADAPTER_INVALID"
  | "TEMPLATE_ERROR"
  | "PATH_ESCAPE"
  | "PLAN_INVALID"
  | "IO_ERROR"
  /** HTTP surface only: the request matched no route. */
  | "ROUTE_NOT_FOUND";

export class McmodError extends Error {
  constructor(
    public readonly code: McmodErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "McmodError";
  }
}

/** Shape any thrown value into { code, message, details } for JSON outputs. */
export function toAgentError(err: unknown): { code: string; message: string; details?: unknown } {
  if (err instanceof McmodError) {
    return { code: err.code, message: err.message, details: err.details };
  }
  if (err instanceof Error && (err as { code?: string }).code === "TEMPLATE_ERROR") {
    const te = err as Error & { templateName?: string; missing?: string[] };
    return { code: "TEMPLATE_ERROR", message: err.message, details: { templateName: te.templateName, missing: te.missing } };
  }
  return { code: "UNEXPECTED", message: err instanceof Error ? err.message : String(err) };
}
