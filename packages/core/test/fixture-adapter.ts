import type { AdapterRecordT } from "../src/adapter-contract.js";

/**
 * Minimal but structurally complete fabric-flavored fixture adapter.
 * Template bodies are intentionally fake (no real Java) — they exercise the
 * pipeline's plumbing, not Minecraft facts. Real adapters live in @mcmodkit/adapters.
 */
export function makeFixtureAdapter(): AdapterRecordT {
  return {
    id: "fabric-1.21.1",
    mcVersion: "1.21.1",
    loader: "fabric",
    loaderVersion: "0.116.0+1.21.1",
    java: 21,
    mappings: "yarn",
    basePackagePattern: "com.{{modId}}",
    mainClassSimpleName: "ModMain",
    gradleWrapperVersion: "8.10.2",
    keyCodePattern: "Key.{{KEY}}",
    clientSubpackage: "client",
    gradle: { loomVersion: "1.7-SNAPSHOT" },
    vanillaGroups: { ingredients: "ItemGroups.INGREDIENTS" },
    assetFiles: [],
    projectFiles: [
      { path: "settings.gradle", template: "settingsGradle", managed: true, executable: false },
      { path: "gradle.properties", template: "gradleProps", managed: true, executable: false },
      { path: "gradle/wrapper/gradle-wrapper.properties", template: "wrapperProps", managed: true, executable: false },
      { path: "{{packagePath}}/ModMain.java", template: "mainClass", managed: true, executable: false },
    ],
    templates: {
      settingsGradle: "rootProject.name = '{{modId}}'\n",
      gradleProps: "org.gradle.jvmargs=-Xmx1G\nmc_version={{mcVersion}}\n",
      wrapperProps: "distributionUrl=gradle-{{gradleWrapperVersion}}-bin.zip\n",
      mainClass: "package {{packageName}};\n// entrypoint {{mainClassFq}} for {{modId}}\n",
      itemsRegistryClass:
        "package {{packageName}};\n{{ITEM_BEHAVIOR_IMPORTS}}\npublic class ModMainItems {\n{{ITEM_REGISTRATIONS}}\nstatic void init() {\n{{TAB_BLOCK}}\n{{ITEM_GROUP_HOOKS}}\n}\n}\n",
      blocksRegistryClass:
        "package {{packageName}};\npublic class ModMainBlocks {\n{{BLOCK_REGISTRATIONS}}\n}\n",
      itemRegistration: "register({{REG_NAME}}, {{ITEM_CTOR}});",
      itemRegistrationGroup: "registerIn({{GROUP_EXPR}}, {{REG_NAME}}, {{ITEM_CTOR}});",
      itemSettings: "Settings.DEFAULT{{DURABILITY_SUFFIX}}",
      itemSettingsMaxCount: "Settings.DEFAULT.maxCount({{MAX_COUNT}}){{DURABILITY_SUFFIX}}",
      blockRegistration: "registerBlock({{REG_NAME}}, new Block({{SETTINGS}}));",
      blockSettings: "Settings.DEFAULT.strength({{HARDNESS}}, {{RESISTANCE}}).requiresTool()",
      blockSettingsNoTool: "Settings.DEFAULT.strength({{HARDNESS}}, {{RESISTANCE}})",
      tabBlock: "static void tab(CreativeInventory tab) {\n{{TAB_ENTRIES}}\n}",
      tabEntryLineItem: "tab.add(ModMainItems.{{CONST}});",
      tabEntryLineBlock: "tab.add(ModMainBlocks.{{CONST}});",
      blockState: '{"variants":{"":{"model":"{{namespace}}:block/{{REG_NAME}}"}}}\n',
      blockModel: '{"parent":"minecraft:block/cube_all","textures":{"all":"{{namespace}}:block/{{REG_NAME}}"}}\n',
      blockItemModel: '{"parent":"{{namespace}}:block/{{REG_NAME}}"}\n',
      itemModel: '{"parent":"minecraft:item/generated","textures":{"layer0":"{{namespace}}:item/{{REG_NAME}}"}}\n',
      lootTable: '{"type":"minecraft:block","pools":[]}\n',
      mineableTag: '{"replace": false,"values": [\n    {{VALUES}}\n  ]}\n',
      // UI templates: fake bodies, but they must consume every placeholder the engine supplies.
      screenClass: "package {{clientPackageName}};\nclass {{SCREEN_CLASS}} {\n\tstatic final int W = {{SCREEN_WIDTH}};\n\tstatic final int H = {{SCREEN_HEIGHT}};\n\t// {{SCREEN_ID}} -> {{SCREEN_TITLE_KEY}}\n{{SCREEN_LINE_DRAWS}}\n}\n",
      screenLineDraw: "\tdraw({{LINE_KEY}}, line {{LINE_N}});",
      clientBootstrap: "package {{clientPackageName}};\nclass ModMainClient {\n{{KEYBIND_FIELDS}}\n\tvoid init() {\n{{KEYBIND_REGISTRATIONS}}\n\t}\n\tvoid tick() {\n{{SCREEN_OPEN_BODY}}\n\t}\n}\n",
      keybindField: "\tstatic final Key KEY = key({{KEY_CODE}}, {{KEYBIND_LANG_KEY}}, {{KEYBIND_CATEGORY_KEY}}); // {{KEYBIND_CONST}}",
      keybindRegister: "\t\tregister({{KEYBIND_CONST}});",
      screenOpenStatement: "\t\topen({{KEYBIND_CONST}}, {{SCREEN_CLASS}});",
      // Recipe/advancement templates: fake JSON, but each must consume the placeholders the engine supplies.
      recipeShaped: '{"type":"minecraft:crafting_shaped","pattern":{{PATTERN_JSON}},"key":{{KEY_JSON}},"result":{"item":"{{RESULT_ITEM}}","count":{{COUNT}}}}\n',
      recipeShapeless: '{"type":"minecraft:crafting_shapeless","ingredients":{{INGREDIENTS_JSON}},"result":{"item":"{{RESULT_ITEM}}","count":{{COUNT}}}}\n',
      recipeCooking: '{"type":"{{RECIPE_TYPE}}","ingredient":{{INGREDIENT_JSON}},"result":"{{RESULT_ITEM}}","experience":{{EXPERIENCE}},"cookingtime":{{COOKING_TIME}}}\n',
      recipeStonecutting: '{"type":"minecraft:stonecutting","ingredient":{{INGREDIENT_JSON}},"result":"{{RESULT_ITEM}}","count":{{COUNT}}}\n',
      advancement:
        '{{{ADV_PARENT_LINE}}{{ADV_BACKGROUND_LINE}}"display":{"icon":{"item":"{{ADV_ICON_ITEM}}"},"title":{{ADV_TITLE_JSON}},"description":{{ADV_DESCRIPTION_JSON}},"frame":"{{ADV_FRAME}}","show_toast":{{ADV_SHOW_TOAST}},"announce_to_chat":{{ADV_ANNOUNCE_TO_CHAT}},"hidden":{{ADV_HIDDEN}}},"criteria":{{ADV_CRITERIA_JSON}},{{ADV_REWARDS_LINE}}"requirements":{{ADV_REQUIREMENTS_JSON}}}\n',
      advancementItemPredicate: '{"items":{"item":"{{ITEM_ID}}"},"tag":"{{TAG_ID}}"}',
      advancementTagPredicate: '{"tag":"{{TAG_ID}}","item":"{{ITEM_ID}}"}',
      itemModelHandheld: '{"parent":"minecraft:item/handheld","textures":{"layer0":"{{namespace}}:item/{{REG_NAME}}"},"id":"{{REG_NAME}}"}',
      blockModelColumn: '{"parent":"minecraft:block/cube_column","textures":{"end": "{{namespace}}:block/{{REG_NAME}}","side": "{{namespace}}:block/{{REG_NAME}}"},"id":"{{REG_NAME}}"}',
    },
    contentPaths: {
      itemModel: "src/main/resources/assets/{{namespace}}/models/item/{{id}}.json",
      blockState: "src/main/resources/assets/{{namespace}}/blockstates/{{id}}.json",
      blockModel: "src/main/resources/assets/{{namespace}}/models/block/{{id}}.json",
      blockItemModel: "src/main/resources/assets/{{namespace}}/models/item/{{id}}.json",
      lootTable: "src/main/resources/data/{{namespace}}/loot_table/blocks/{{id}}.json",
      mineableTag: "src/main/resources/data/minecraft/tags/block/mineable/{{tool}}.json",
      lang: "src/main/resources/assets/{{namespace}}/lang/en_us.json",
      recipe: "src/main/resources/data/{{namespace}}/recipe/{{id}}.json",
      advancement: "src/main/resources/data/{{namespace}}/advancement/{{id}}.json",
      itemTexture: "src/main/resources/assets/{{namespace}}/textures/item/{{id}}.png",
      blockTexture: "src/main/resources/assets/{{namespace}}/textures/block/{{id}}.png",
      entityTexture: "src/main/resources/assets/{{namespace}}/textures/entity/{{id}}.png",
    },
    langKeys: {
      item: "item.{{namespace}}.{{id}}",
      block: "block.{{namespace}}.{{id}}",
      itemGroup: "itemGroup.{{namespace}}",
      screenTitle: "screen.{{namespace}}.{{id}}.title",
      screenLine: "screen.{{namespace}}.{{id}}.line.{{n}}",
      keybind: "key.{{namespace}}.{{id}}",
      keybindCategory: "key.categories.{{namespace}}",
      advancementTitle: "advancements.{{namespace}}.{{id}}.title",
      advancementDescription: "advancements.{{namespace}}.{{id}}.description",
    },
    // Adapter-level (not template) data: how an item is constructed, and what to import for it.
    itemBehaviors: { plain: "new Item({{SETTINGS}})", fishing_rod: "new FishingRod({{SETTINGS}})" },
    itemBehaviorImports: { fishing_rod: "com.example.FishingRod" },
    references: [
      { label: "Fixture loader docs", url: "https://example.invalid/docs", kind: "official-docs", note: "stand-in for a real official doc" },
      { label: "Fixture mappings lookup", url: "https://example.invalid/mappings", kind: "mappings" },
    ],
    notes: ["fixture adapter for core tests"],
  };
}
