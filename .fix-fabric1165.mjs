import fs from "node:fs";

/**
 * Fabric 1.16.5: re-fit the derived templates to that era's API.
 *
 * Every change is evidence-backed. Sources, in order of authority:
 *
 *  - fabric-item-groups-v0 0.3.1+3cc0f0907d (the version the fabric-api 0.42.0+1.16 aggregator POM
 *    resolves to, read from its <dependencies>): `javap` + the published sources jar give
 *    FabricItemGroupBuilder.create(Identifier) / .icon(Supplier<ItemStack>) /
 *    .appendItems(Consumer<List<ItemStack>>) / .build(). There is NO ItemGroupEvents class in that
 *    module (nor in the 0.3.39 line), so 1.16 has no post-registration creative-tab hook at all.
 *  - Mojang official 1.16.5 mappings (client.txt): net.minecraft.core.Registry exists but the
 *    net.minecraft.core.registries package does not; Registry.ITEM / Registry.BLOCK are the
 *    DefaultedRegistry fields; CreativeModeTab is still in net.minecraft.world.item with TAB_*
 *    constants; BlockBehaviour.Properties.of(Material) takes a Material.
 *  - Bytecode (javap -c on the real client jar):
 *      Item$Properties.<init>    sets only maxStackSize=64 and rarity=COMMON, leaving category null
 *                                -> an item with no .tab() lands in NO vanilla tab.
 *      Item.<init>               reads properties.category via the synthetic access$000.
 *      CreativeModeTab.<init>    ends with `TABS[id] = this` (getstatic/iload_1/aload_0/aastore),
 *                                which is what makes FabricItemGroupBuilder.build() self-register
 *                                after fabric_expandArray() grew the array by one slot.
 *  - The real client jar: pack_format 6, and the PLURAL datapack directories
 *    (data/<ns>/loot_tables/, data/minecraft/tags/blocks/) that 1.21 renamed.
 */
const p = "packages/adapters/data/fabric-1.16.5.json";
const a = JSON.parse(fs.readFileSync(p, "utf8"));

// --- logging: org.slf4j is not on the 1.16 loom compile classpath; the game ships log4j. ---
a.templates.mainClass = a.templates.mainClass
  .replace(
    "import org.slf4j.Logger;\nimport org.slf4j.LoggerFactory;",
    "import org.apache.logging.log4j.LogManager;\nimport org.apache.logging.log4j.Logger;",
  )
  .replace("LoggerFactory.getLogger(MOD_ID)", "LogManager.getLogger(MOD_ID)")
  .replace(
    "\t/** Namespaced id helper (1.21+ API: ResourceLocation.fromNamespaceAndPath). */",
    "\t/** Namespaced id helper. */",
  );

// --- registries: no net.minecraft.core.registries package before 1.19.3 ---
a.templates.itemsRegistryClass = a.templates.itemsRegistryClass
  .replace("import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;\n", "")
  .replace("import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;\n", "")
  .replace(
    "import net.minecraft.core.registries.BuiltInRegistries;\nimport net.minecraft.core.registries.Registries;\n",
    "",
  )
  .replace("import net.minecraft.network.chat.Component;\n", "")
  .replace("import net.minecraft.resources.ResourceKey;\n", "")
  .replace("import net.minecraft.world.item.CreativeModeTabs;\n", "")
  .replace(
    "import java.util.ArrayList;",
    "import net.fabricmc.fabric.api.client.itemgroup.FabricItemGroupBuilder;\n\nimport java.util.ArrayList;",
  )
  .replace("Registry.register(BuiltInRegistries.ITEM, ", "Registry.register(Registry.ITEM, ");

a.templates.blocksRegistryClass = a.templates.blocksRegistryClass
  .replace("import net.minecraft.core.registries.BuiltInRegistries;\n", "")
  .replace("Registry.register(BuiltInRegistries.BLOCK, ", "Registry.register(Registry.BLOCK, ")
  .replace("Registry.register(BuiltInRegistries.ITEM, ", "Registry.register(Registry.ITEM, ");

// --- creative tab: FabricItemGroupBuilder, which self-registers through CreativeModeTab.<init> ---
a.templates.tabBlock = `\t\tFabricItemGroupBuilder.create({{mainClassSimpleName}}.id("{{namespace}}"))
\t\t\t.icon(() -> new ItemStack(TAB_ENTRIES.isEmpty() ? Items.STONE : TAB_ENTRIES.get(0)))
\t\t\t.appendItems(stacks -> {
\t\t\t\tfor (ItemLike entry : TAB_ENTRIES) {
\t\t\t\t\tstacks.add(new ItemStack(entry));
\t\t\t\t}
\t\t\t})
\t\t\t.build();`;

// 1.16 has no ItemGroupEvents, so the tab is bound while the item is constructed instead of by a
// post-registration hook. itemGroupSuffix carries the construction-time form; the hook stays empty.
a.templates.itemGroupSuffix = ".tab({{GROUP_EXPR}})";
a.templates.itemRegistrationGroup = "";
a.templates.itemSettings = "new Item.Properties(){{GROUP_SUFFIX}}{{DURABILITY_SUFFIX}}";
a.templates.itemSettingsMaxCount = "new Item.Properties().stacksTo({{MAX_COUNT}}){{GROUP_SUFFIX}}{{DURABILITY_SUFFIX}}";

// The builder derives the tab's translation key from the identifier it is handed:
// String.format("%s.%s", namespace, path), prefixed with "itemGroup.". So the key is not free.
a.langKeys.itemGroup = "itemGroup.{{modId}}.{{namespace}}";

// 1.16 tab names, keyed the same as the other adapters so one spec stays portable across versions.
// Tabs that have no 1.16 equivalent are deliberately absent: an unknown group warns and falls back
// to the mod's own tab, which beats silently filing an item under the wrong heading.
a.vanillaGroups = {
  building_blocks: "CreativeModeTab.TAB_BUILDING_BLOCKS",
  redstone_blocks: "CreativeModeTab.TAB_REDSTONE",
  tools: "CreativeModeTab.TAB_TOOLS",
  combat: "CreativeModeTab.TAB_COMBAT",
  food_and_drinks: "CreativeModeTab.TAB_FOOD",
  ingredients: "CreativeModeTab.TAB_MATERIALS",
};

// `var` needs Java 10+; this target is Java 8. Found by the compiler, which reports it as
// "cannot find symbol: class var".
a.templates.blocksRegistryClass = a.templates.blocksRegistryClass
  .replace("\t\tvar id = {{mainClassSimpleName}}.id(name);", "\t\tResourceLocation id = {{mainClassSimpleName}}.id(name);")
  .replace(
    "import net.minecraft.world.item.BlockItem;",
    "import net.minecraft.resources.ResourceLocation;\nimport net.minecraft.world.item.BlockItem;",
  );

// --- plural datapack directories (read from the real 1.16.5 client jar) ---
a.contentPaths.lootTable = "src/main/resources/data/{{namespace}}/loot_tables/blocks/{{id}}.json";
a.contentPaths.mineableTag = "src/main/resources/data/minecraft/tags/blocks/mineable/{{tool}}.json";

// fabric-datagen is a 1.17+ entrypoint; emitting an empty one on 1.16 is noise.
a.templates.fabricModJson = a.templates.fabricModJson.replace(
  '\t\t],\n\t\t"fabric-datagen": [\n\t\t\t{{datagenEntrypointJson}}\n\t\t]\n',
  "\t\t]\n",
);

a.notes = a.notes.filter((n) => !/^1\.(19|20|21)|^Requires Java|^Since 1\.21|^ResourceLocation\./.test(n));
a.notes.push(
  "1.16.5 era: creative tabs come from FabricItemGroupBuilder (net.fabricmc.fabric.api.client.itemgroup), " +
    "whose create(id) -> icon() -> appendItems() -> build() self-registers: build() grows CreativeModeTab.TABS " +
    "via fabric_expandArray() and the constructor finishes with TABS[id] = this. There is no ItemGroupEvents " +
    "in fabric-item-groups-v0 for this version, so a vanilla tab is chosen at construction time with " +
    "Item.Properties#tab() instead of through a post-registration hook.",
  "1.16.5 era: net.minecraft.core.registries does not exist yet (that package is 1.19.3+). Registries are the " +
    "static fields net.minecraft.core.Registry.ITEM / Registry.BLOCK. CreativeModeTab is still " +
    "net.minecraft.world.item.CreativeModeTab with TAB_* constants, and it is not itself a registry.",
  "1.16.5 era: BlockBehaviour.Properties.of() takes a Material; the argument-less overload is 1.20+. " +
    "Item.Properties defaults to no creative tab at all (its constructor sets only maxStackSize and rarity), " +
    "so an item only appears where it is explicitly placed.",
  "org.slf4j is NOT on this version's loom compile classpath; the main class logs through " +
    "org.apache.logging.log4j.LogManager instead.",
  "Datapack directories are PLURAL on 1.16.5 (data/<ns>/loot_tables/, data/minecraft/tags/blocks/), read from " +
    "the real client jar. The singular 1.21 spelling fails silently in game.",
  "Requires Java 8; build facts (loader 0.19.5, fabric-api 0.42.0+1.16, pack_format 6) come from " +
    "scripts/version-facts.mjs reading meta.fabricmc.net, the Fabric maven and the real game jar.",
);

a.references = a.references.map((r) =>
  r.url.includes("fabric-example-mod")
    ? { ...r, note: "各版本分支的构建事实来源（CC0）" }
    : r,
);

fs.writeFileSync(p, JSON.stringify(a, null, 2) + "\n");
console.log("fabricApi:", a.gradle.fabricApiVersion);
console.log("slf4j gone?", !a.templates.mainClass.includes("slf4j"));
console.log("BuiltInRegistries gone?", !JSON.stringify(a.templates).includes("BuiltInRegistries"));
console.log("itemRegistrationGroup:", JSON.stringify(a.templates.itemRegistrationGroup));
console.log("itemSettings:", a.templates.itemSettings);
console.log("langKeys.itemGroup:", a.langKeys.itemGroup);
console.log("lootTable:", a.contentPaths.lootTable);
