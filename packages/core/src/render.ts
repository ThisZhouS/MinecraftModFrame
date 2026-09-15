/**
 * Minimal {{var}} template renderer. Deliberately dependency-free:
 * - only simple {{name}} placeholders (no control flow) — loops/conditionals are
 *   handled in TypeScript generators so templates stay declarative data;
 * - replacement uses function callbacks so `$` in templates is never re-interpreted.
 */
export type Vars = Record<string, string | number | boolean | null | undefined>;

export class TemplateError extends Error {
  readonly code = "TEMPLATE_ERROR";
  constructor(
    public readonly templateName: string,
    public readonly missing: string[],
  ) {
    super(
      `Template "${templateName}" is missing variable(s): ${missing.join(", ")}. ` +
        `Fix the adapter template or supply the variable.`,
    );
    this.name = "TemplateError";
  }
}

function render(tpl: string, vars: Vars, name: string): string {
  const missing: string[] = [];
  const out = tpl.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (whole: string, key: string) => {
    if (!(key in vars)) {
      missing.push(key);
      return whole;
    }
    const v = vars[key];
    return v == null ? "" : String(v);
  });
  if (missing.length > 0) throw new TemplateError(name, missing);
  return out;
}

/** Render a file body template. */
export function renderTemplate(template: string, vars: Vars, name = "<inline>"): string {
  return render(template, vars, name);
}

/** Render a relative path template (same syntax as body templates). */
export function renderPath(template: string, vars: Vars, name = "<path>"): string {
  return render(template, vars, name);
}
