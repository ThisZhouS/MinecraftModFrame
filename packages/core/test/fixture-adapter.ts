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
        "package {{packageName}};\npublic class ModMainItems {\n{{ITEM_REGISTRATIONS}}\nstatic void init() {\n{{TAB_BLOCK}}\n{{ITEM_GROUP_HOOKS}}\n}\n}\n",
      blocksRegistryClass:
        "package {{packageName}};\npublic class ModMainBlocks {\n{{BLOCK_REGISTRATIONS}}\n}\n",
      itemRegistration: "register({{REG_NAME}}, new Item({{SETTINGS}}));",
      itemRegistrationGroup: "registerIn({{GROUP_EXPR}}, {{REG_NAME}}, new Item({{SETTINGS}}));",
      itemSettings: "Settings.DEFAULT",
      itemSettingsMaxCount: "Settings.DEFAULT.maxCount({{MAX_COUNT}})",
      blockRegistration: "registerBlock({{REG_NAME}}, new Block({{SETTINGS}}));",
      blockSettings: "Settings.DEFAULT.strength({{HARDNESS}}, {{RESISTANCE}}).requiresTool()",
      blockSettingsNoTool: "Settings.DEFAULT.strength({{HARDNESS}}, {{RESISTANCE}})",
      tabBlock: "static void tab(CreativeInventory tab) {\n{{TAB_ENTRIES}}\n}",
      tabEntryLineItem: "tab.add(ModMainItems.{{CONST}});",
      tabEntryLineBlock: "tab.add(ModMainBlocks.{{CONST}});",
      blockState: '{"variants":{"":{"model":"{{namespace}}:block/{{REG_NAME}}"}}}\n',
      blockModel: '{"parent":"block/cube_all","textures":{"all":"{{namespace}}:block/{{REG_NAME}}"}}\n',
      blockItemModel: '{"parent":"{{namespace}}:block/{{REG_NAME}}"}\n',
      itemModel: '{"parent":"item/generated","textures":{"layer0":"{{namespace}}:item/{{REG_NAME}}"}}\n',
      lootTable: '{"type":"minecraft:block","pools":[]}\n',
      mineableTag: '{"replace": false,"values": [\n    {{VALUES}}\n  ]}\n',
    },
    contentPaths: {
      itemModel: "src/main/resources/assets/{{namespace}}/models/item/{{id}}.json",
      blockState: "src/main/resources/assets/{{namespace}}/blockstates/{{id}}.json",
      blockModel: "src/main/resources/assets/{{namespace}}/models/block/{{id}}.json",
      blockItemModel: "src/main/resources/assets/{{namespace}}/models/item/{{id}}.json",
      lootTable: "src/main/resources/data/{{namespace}}/loot_table/blocks/{{id}}.json",
      mineableTag: "src/main/resources/data/minecraft/tags/block/mineable/{{tool}}.json",
      lang: "src/main/resources/assets/{{namespace}}/lang/en_us.json",
    },
    langKeys: {
      item: "item.{{namespace}}.{{id}}",
      block: "block.{{namespace}}.{{id}}",
      itemGroup: "itemGroup.{{namespace}}",
    },
    notes: ["fixture adapter for core tests"],
  };
}
