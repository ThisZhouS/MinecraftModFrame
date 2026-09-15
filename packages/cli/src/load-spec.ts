import { readFile } from "node:fs/promises";
import { McmodError } from "@mcmodkit/core";

export type StdinReader = () => Promise<string>;

/** Read the whole of stdin as UTF-8 (for `mcmod ... -`). */
export const stdinReader: StdinReader = () =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (c: Buffer) => chunks.push(c));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });

/**
 * Load a ModSpec input from a JSON file path, or "-" for stdin.
 * JSON syntax errors surface as SPEC_INVALID (distinct from schema errors).
 */
export async function loadSpecJson(source: string, readStdin: StdinReader = stdinReader): Promise<unknown> {
  let text: string;
  try {
    if (source === "-") {
      text = await readStdin();
    } else {
      text = decodeText(await readFile(source));
    }
  } catch (err) {
    throw new McmodError("SPEC_INVALID", `Cannot read spec source: ${source} (${err instanceof Error ? err.message : String(err)})`, { source });
  }
  try {
    return JSON.parse(stripBom(text));
  } catch (err) {
    throw new McmodError("SPEC_INVALID", `Spec source is not valid JSON: ${err instanceof Error ? err.message : String(err)}`, { source });
  }
}

/** Windows editors and PowerShell redirects emit BOMs; a spec must not fail because of one. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Decode a spec file, honouring the UTF-8 / UTF-16LE BOMs Windows tooling writes. */
export function decodeText(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le");
  return stripBom(buf.toString("utf8"));
}
