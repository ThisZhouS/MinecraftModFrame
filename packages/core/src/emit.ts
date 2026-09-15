import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { McmodError } from "./errors.js";
import type { GenerationPlan } from "./generators.js";

export interface EmitOptions {
  /** Directory that will CONTAIN the generated project dir (<outDir>/<modId>/...). */
  outDir: string;
  /** Compute the plan result without touching the disk. */
  dryRun?: boolean;
}

export interface EmitResult {
  outDir: string;
  projectDir: string;
  dryRun: boolean;
  /** Posix-relative paths written (or would be written), relative to outDir. */
  written: string[];
}

function safeTarget(root: string, projectDirName: string, relPath: string, what: string): string {
  if (relPath.includes("\\") || relPath.includes("..") || relPath.startsWith("/")) {
    throw new McmodError("PATH_ESCAPE", `Illegal ${what} path (must be relative posix inside the project): ${relPath}`, { path: relPath });
  }
  const target = resolve(root, projectDirName, ...relPath.split("/"));
  if (target !== root && !target.startsWith(root + sep)) {
    throw new McmodError("PATH_ESCAPE", `Path escapes outDir: ${relPath}`, { path: relPath });
  }
  return target;
}

/**
 * Write the plan. Managed files are overwritten unconditionally (idempotent regeneration is
 * the basis of the iterate/adjust workflow); anything NOT in the plan is never touched, so
 * user-owned files survive re-generation.
 */
export async function emitPlan(plan: GenerationPlan, opts: EmitOptions): Promise<EmitResult> {
  const root = resolve(opts.outDir);
  const projectDir = resolve(root, plan.projectDirName);
  const written: string[] = [];
  for (const f of plan.files) {
    const target = safeTarget(root, plan.projectDirName, f.path, "plan");
    const relPosix = `${plan.projectDirName}/${f.path}`;
    if (opts.dryRun) {
      written.push(relPosix);
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    if (f.copyFrom !== undefined) {
      await copyFile(f.copyFrom, target);
    } else {
      await writeFile(target, f.content, "utf8");
    }
    if (f.executable) {
      try { await chmod(target, 0o755); } catch { /* chmod is advisory on Windows */ }
    }
    written.push(relPosix);
  }
  return { outDir: root, projectDir, dryRun: opts.dryRun === true, written };
}
