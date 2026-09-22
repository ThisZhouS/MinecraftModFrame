import fs from "node:fs";

/**
 * Forge 1.19.4: fit the tab templates to that era's API.
 *
 * Evidence (javap on the real forge-1.19.4-45.4.5-universal.jar):
 *  - CreativeModeTabEvent.Register#registerCreativeModeTab(ResourceLocation, Consumer<CreativeModeTab$Builder>)
 *  - CreativeModeTabEvent.BuildContents implements CreativeModeTab.Output (so accept() works)
 *    and exposes getTab() -> CreativeModeTab (not a ResourceKey; the registry form is 1.20+).
 *  - Registries.CREATIVE_MODE_TAB does not exist (zero hits in Mojang's official 1.19.4 mappings),
 *    so the TABS DeferredRegister goes away entirely.
 */
const p = "packages/adapters/data/forge-1.19.4.json";
const a = JSON.parse(fs.readFileSync(p, "utf8"));

let reg = a.templates.itemsRegistryClass;
reg = reg
  .replace("import net.minecraft.core.registries.Registries;\n", "")
  .replace("import net.minecraftforge.event.BuildCreativeModeTabContentsEvent;", "import net.minecraftforge.event.CreativeModeTabEvent;")
  .replace(
    "\tpublic static final DeferredRegister<CreativeModeTab> TABS = DeferredRegister.create(Registries.CREATIVE_MODE_TAB, {{mainClassSimpleName}}.MOD_ID);\n",
    "",
  )
  .replace(
    `		ITEMS.register(modEventBus);
		TABS.register(modEventBus);
		modEventBus.addListener({{mainClassSimpleName}}Items::onBuildTabContents);
{{TAB_BLOCK}}
	}

	private static void onBuildTabContents(BuildCreativeModeTabContentsEvent event) {`,
    `		ITEMS.register(modEventBus);
		modEventBus.addListener({{mainClassSimpleName}}Items::onRegisterTabs);
		modEventBus.addListener({{mainClassSimpleName}}Items::onBuildTabContents);
	}

	private static void onRegisterTabs(CreativeModeTabEvent.Register event) {
{{TAB_BLOCK}}
	}

	private static void onBuildTabContents(CreativeModeTabEvent.BuildContents event) {`,
  );
a.templates.itemsRegistryClass = reg;

a.templates.tabBlock = `		event.registerCreativeModeTab({{mainClassSimpleName}}.id("{{modId}}"), builder -> builder
				.title(Component.translatable("itemGroup.{{namespace}}"))
				.icon(() -> new ItemStack(TAB_ENTRIES.isEmpty() ? Items.STONE : TAB_ENTRIES.get(0)))
				.displayItems((params, output) -> {
					for (Supplier<? extends ItemLike> entry : TAB_ENTRIES) {
						output.accept(entry.get());
					}
				}));`;

// The group hook compares against a CreativeModeTab instance on 1.19.4, not a ResourceKey.
a.templates.itemRegistrationGroup = "\t\tif (event.getTab() == {{GROUP_EXPR}}) event.accept({{mainClassSimpleName}}Items.{{CONST_UPPER}}.get());";

// Block properties need a Material before 1.20.
a.templates.blockSettings = a.templates.blockSettings.replace("BlockBehaviour.Properties.of()", "BlockBehaviour.Properties.of(Material.STONE)");
a.templates.blockSettingsNoTool = a.templates.blockSettingsNoTool.replace("BlockBehaviour.Properties.of()", "BlockBehaviour.Properties.of(Material.STONE)");
a.templates.blocksRegistryClass = a.templates.blocksRegistryClass.replace(
  "import net.minecraft.world.level.block.Block;",
  "import net.minecraft.world.level.block.Block;\nimport net.minecraft.world.level.material.Material;",
);

a.notes = a.notes.filter((n) => !n.startsWith("1.19.4 era:"));
a.notes.push(
  "1.19.4 era: custom tabs are registered through CreativeModeTabEvent.Register#registerCreativeModeTab, " +
    "not a registry (Registries.CREATIVE_MODE_TAB is 1.20+). CreativeModeTabEvent.BuildContents implements " +
    "CreativeModeTab.Output and its getTab() returns a CreativeModeTab instance, so group hooks compare " +
    "against the instance, not a ResourceKey. BlockBehaviour.Properties.of() requires a Material before 1.20.",
);

fs.writeFileSync(p, JSON.stringify(a, null, 2) + "\n");
console.log("TABS gone?", !a.templates.itemsRegistryClass.includes("TABS"));
console.log("onRegisterTabs added?", a.templates.itemsRegistryClass.includes("onRegisterTabs"));
console.log("group hook:", a.templates.itemRegistrationGroup.trim());
