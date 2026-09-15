/** Identifier / naming helpers shared by generators. Ids in specs are already snake_case. */
export function toPascalCase(id: string): string {
  return id
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

/** RubyOre -> RUBY_ORE (Java constant style; adapters pick CONST or CONST_UPPER). */
export function toScreamingSnake(pascal: string): string {
  return pascal.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

/** ruby_ore -> "Ruby Ore" */
export function toDisplayName(id: string): string {
  return id
    .split("_")
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}
