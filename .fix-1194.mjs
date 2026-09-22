import fs from "node:fs";

/**
 * 1.19.4 fabric: fit the templates to that era's API.
 *
 * Every change below is evidence-backed, not guessed:
 *  - FabricItemGroup.builder takes a ResourceLocation on 1.19.4 (javap on the real
 *    fabric-item-group-api-v1-0.87.2 jar: `builder(net.minecraft.class_2960)`), and its
 *    build() registers the tab itself, so the explicit Registry.register goes away.
 *  - Registries.CREATIVE_MODE_TAB does not exist: Mojang's official 1.19.4 mappings contain
 *    zero occurrences of that field (1.20.4 has two). The whole ResourceKey<TAB> goes away.
 *  - BlockBehaviour.Properties.of() is argument-less only from 1.20; 1.19.4 needs a Material.
 */
const p = "packages/adapters/data/fabric-1.19.4.json";
const a = JSON.parse(fs.readFileSync(p, "utf8"));

// 1) custom tab: builder(ResourceLocation), and build() does the registration
a.templates.tabBlock = `{{TAB_ENTRIES}}
		FabricItemGroup.builder({{mainClassSimpleName}}.id("{{modId}}"))
			.title(Component.translatable("itemGroup.{{namespace}}"))
			.icon(() -> new ItemStack(TAB_ENTRIES.isEmpty() ? Items.STONE : TAB_ENTRIES.get(0)))
			.displayItems((params, output) -> {
				for (ItemLike entry : TAB_ENTRIES) {
					output.accept(entry);
				}
			})
			.build();`;

// 2) drop the creative-tab registry (it does not exist on 1.19.4)
a.templates.itemsRegistryClass = a.templates.itemsRegistryClass
  .split("\n")
  .filter((l) => !l.includes("TAB_KEY") && !l.includes("ResourceKey<CreativeModeTab>") && !l.includes("ResourceKey.create(Registries.CREATIVE_MODE_TAB"))
  .filter((l) => !(l.includes("import net.minecraft.resources.ResourceKey;") && !a.templates.itemsRegistryClass.includes("ResourceKey<")))
  .join("\n");

// 3) Material argument for block properties, plus the import it needs
a.templates.blockSettings = a.templates.blockSettings.replace("BlockBehaviour.Properties.of()", "BlockBehaviour.Properties.of(Material.STONE)");
a.templates.blockSettingsNoTool = a.templates.blockSettingsNoTool.replace("BlockBehaviour.Properties.of()", "BlockBehaviour.Properties.of(Material.STONE)");
a.templates.blocksRegistryClass = a.templates.blocksRegistryClass.replace(
  "import net.minecraft.world.level.block.Block;",
  "import net.minecraft.world.level.block.Block;\nimport net.minecraft.world.level.material.Material;",
);

a.notes = a.notes.filter((n) => !n.startsWith("1.19.4 era:"));
a.notes.push(
  "1.19.4 era: creative tabs are NOT a registry (Registries.CREATIVE_MODE_TAB does not exist — " +
    "zero hits in Mojang's official 1.19.4 mappings, two in 1.20.4). Fabric API's " +
    "FabricItemGroup.builder takes a ResourceLocation and its build() registers the tab. " +
    "BlockBehaviour.Properties.of() requires a Material before 1.20.",
);

fs.writeFileSync(p, JSON.stringify(a, null, 2) + "\n");
console.log("tabBlock:\n" + a.templates.tabBlock.split("\n").slice(0, 3).join("\n"));
console.log("blockSettings:", a.templates.blockSettings);
console.log("TAB_KEY gone?", !a.templates.itemsRegistryClass.includes("TAB_KEY"));
