import fs from "node:fs";

// Minimal smoke spec for a target: items + blocks + one fishing rod, no optional slices.
// Used to compile-verify a newly derived adapter without depending on slices it may not carry.
const [out, mc, loader, modId = "examplemod"] = process.argv.slice(2);
const spec = {
  schemaVersion: 1,
  mod: { modId, name: "Example Mod", version: "1.0.0", description: "adapter smoke test", license: "MIT" },
  target: { mcVersion: mc, loader },
  textures: true,
  content: {
    items: [
      { id: "ruby", name: "Ruby", group: "ingredients", texture: { style: "speckle", palette: ["#b91c1c", "#7f1d1d", "#f87171"] } },
      { id: "mk2", name: "MK2", behavior: "fishing_rod", model: "handheld", maxCount: 1, durability: 128 },
    ],
    blocks: [{ id: "ruby_ore", hardness: 3, resistance: 9, tool: "pickaxe", texture: { style: "ore", palette: ["#6b7280", "#dc2626"] } }],
  },
};
fs.writeFileSync(out, JSON.stringify(spec, null, 2) + "\n");
console.log(`wrote ${out} -> ${mc}/${loader}`);
