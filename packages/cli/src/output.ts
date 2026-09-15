import { errEnvelope, okEnvelope } from "@mcmodkit/core";
import type { Envelope } from "@mcmodkit/core";

/** stdout carries data (the JSON envelope) in both success and failure; stderr carries logs. */
export function printEnvelope(envelope: Envelope): void {
  process.stdout.write(JSON.stringify(envelope, null, 2) + "\n");
}

export function printOk(data: unknown, asJson: boolean): void {
  if (asJson) {
    printEnvelope(okEnvelope(data));
    return;
  }
  printHuman(data);
}

export function printHuman(data: unknown): void {
  process.stdout.write(humanize(data) + "\n");
}

export function logWarn(message: string): void {
  process.stderr.write(`warn: ${message}\n`);
}

function humanize(data: unknown): string {
  if (Array.isArray(data)) {
    return data.map((d) => humanize(d)).join("\n");
  }
  if (data != null && typeof data === "object") {
    const rec = data as Record<string, unknown>;
    return Object.entries(rec)
      .map(([k, v]) => `${k}=${typeof v === "object" && v != null ? JSON.stringify(v) : String(v)}`)
      .join(" ");
  }
  return String(data);
}

/** Print a failure envelope to stdout and return the process exit code. */
export function failAndCode(err: unknown): number {
  printEnvelope(errEnvelope(err));
  return exitCodeFor(err);
}

import { exitCodeFor } from "@mcmodkit/core";
