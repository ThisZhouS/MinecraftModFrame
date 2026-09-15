# 版本化 Modding API 知识地图（调研 C：版本 × 加载器）

> 调研时间：2026-09（会话内实测）。目的：为「每个 (MC 版本 × 加载器) 一份 adapter」的知识库取证。
> 本文是会话内调研报告的**结构化归档摘要**（保留结论、证据与来源链接），非原文转录。
> 完整原文由调研子智能体直接投递到会话中；如需逐条引用请回到来源链接复核。

## 0. 对既有假设的两处实测修正

1. **“Forge 止于 1.20.1” 是错的**：docs.minecraftforge.net 现覆盖到 1.21.x；Maven 上 Forge 仍在发布（1.21.1 → 52.1.16、1.21.4 → 54.1.18、26.2 → 65.1.3）。真正的分水岭是 NeoForge 在 1.20.2 的 API 断裂，而不是 Forge 停更。
2. **“1.21.4 的 Item.Properties id 变更”应按 1.21.2 理解**：1.21.2 primer 引入 `ITEM_NAME`/`ITEM_MODEL` 数据组件与 `overrideDescription`/`useBlockDescriptionPrefix`；`Item.Properties#setId` 是 1.21.2 期引入（中置信推断）。1.21.4 的实际变化是 **Client Items**（`assets/<ns>/items/<id>.json`）。

## 1. 知识分布地图（按加载器）

| 知识类型 | Forge | NeoForge | Fabric | 程序化入口 |
| --- | --- | --- | --- | --- |
| 注册（item/block/tab） | `DeferredRegister` + `RegistryObject` + `RegisterEvent` | `DeferredRegister` + `DeferredHolder` + `RegisterEvent`；有 `DeferredRegister.Items/Blocks/DataComponents` 助手 | `Registry.register(BuiltInRegistries.ITEM, id, item)` | 文档源仓库 + sitemap |
| 创造模式标签 | 注册方法 + `BuildCreativeModeTabContentsEvent` | 同左 | 1.21.1：`FabricItemGroup.builder()`；新版：`FabricCreativeModeTab.builder()` | 同上 |
| 数据生成 | `GatherDataEvent` + `DataGenerator#addProvider` | 1.20.4 有独立 datagen 章；1.21+ 并入 `resources/*` | `DataGeneratorEntrypoint` + `configureDataGeneration()` | 同上 |
| lang / 模型 | `concepts/internationalization`、`resources/client/models` | `resources/client/i18n`、`resources/client/models` | `text-and-translations`、`items/item-models` | 同上 |
| 逐版本破坏性变更 | 无官方 per-version 笔记 | **Primers**（docs.neoforged.net/primer/docs/） | 官方 porting 文档 + 每版本博客 | primer 原文可整库抓取 |
| 精确类名/签名 | 无托管 javadoc（javadoc jar 404） | 无可达 javadoc | 无托管 javadoc（404） | **映射数据 + userdev 反编译源码** |
| 版本元数据 | maven metadata | maven.neoforged.net | meta.fabricmc.net v2 | piston-meta version_manifest_v2 |

## 2. 映射系统：Mojmap 是唯一长期方向

- **Mojang 已去混淆**（2025-10-31 Fabric 官方博客《Removing Obfuscation from Fabric》）：Fabric 决定不再维护第三方映射，Fabric API 用 Ravel 迁到 Mojmap，Loom 提供 `migrateMappings`。**26.1+ 没有 Yarn**。
- 对生成器的直接后果：**新版本一律以 Mojmap 生成**；只有历史版本才需要维护 Mojmap↔Yarn 双命名表。
- 命名差异速查：`net.minecraft.world.item.Item` vs yarn `net.minecraft.item.Item`；`ResourceLocation` vs `Identifier`；`CreativeModeTab` vs `ItemGroup`；`Item.Properties` vs `Item.Settings`；`BuiltInRegistries` vs `Registries`。
- Parchment（参数名 + javadoc 补丁）在三个生态通用，可用于生成 project 的 IDE 体验。

## 3. 逐版本破坏性变更（对生成器有直接影响）

| 版本 | 变更 | 影响 |
| --- | --- | --- |
| 1.20.5/1.20.6 | **Java 21**；Data Components 取代 ItemStack 内 CompoundTag；Fabric 侧 `FabricItemSettings` 弃用，改用原版 `Item.Settings` | 物品设置/组件生成逻辑 |
| 1.21 | **数据包目录单数化**：`loot_tables → loot_table`（recipes/advancements 同批） | 资源路径（旧名静默失效） |
| 1.21.2 | `ITEM_NAME`/`ITEM_MODEL` 数据组件、`overrideDescription`、`useBlockDescriptionPrefix`、`ResourceLocation.fromNamespaceAndPath`；`Item.Properties#setId`（推断） | 物品命名/模型设置 |
| 1.21.4 | **Client Items**：物品渲染定义迁到 `assets/<ns>/items/<id>.json`；删除 parent-only 的 models/item JSON | 模型文件布局 |

## 4. 版本元数据的程序化来源（adapter 事实应从这里推导，而非手抄）

- `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json` → 每版本 JSON；`javaVersion.majorVersion` 即该版本要求的 Java（实测 1.20.1 → 17、1.21.4 → 21）。
- `https://meta.fabricmc.net/v2/versions/{loader,yarn,intermediary}[/<mc>]` → Fabric 构件与 stable 标记。
- `https://maven.fabricmc.net/net/fabricmc/fabric-loader/maven-metadata.xml`、`.../fabric-api/maven-metadata.xml` → loader/API 版本。
- Forge：`https://maven.creeperhost.net/net/minecraftforge/forge/maven-metadata.xml`（镜像可达）。
- Parchment：`https://maven.parchmentmc.org/org/parchmentmc/data/`。

## 5. 建议的 adapter 字段增补（后续迭代采纳）

- `naming`：跨映射改名表（id/registry/creativeTab/itemSettings）。
- `resourceLayout`：`dataPackDirs: singular|plural`、`itemModelDefinition: bool`（1.21.4+）。
- `registration`：注册机制矩阵与助手类名。
- `docIndex` / `primerRefs`：该 (版本 × 加载器) 的权威文档实例与迁移笔记链接，供智能体按需取证。

## 6. 事实 vs 推断（诚实边界）

**已验证事实**：piston-meta 可用性与 Java 版本；Mojmap 类名存在于 1.21.4 client.txt；Yarn 路径存在性；Fabric loader/API 版本号；Forge maven 版本号（1.20.1-47.4.23 … 26.2-65.1.3）；三家 javadoc 均 404（应走映射/反编译）；Parchment 构件；Primers 门户与原文（1.20/1.20.5/1.21/1.21.2/1.21.4）；Fabric 博客 1.20.5/1.21.4/去混淆；Fabric porting/mappings 的 Yarn→Mojmap 强制说明；NeoForge 1.20.4 文档已用 DeferredHolder。

**推断/受限**：NeoForge maven 在调研环境不可达（版本号与工件存在性未验证）；`Item.Properties#setId` 引入版本为中置信推断；`RegistryObject` 精确移除版本未验证（介于 NeoForge 20.1–20.4）；1.21.x datagen 签名变化未逐条核对；26.x 细节与 quilt 未覆盖。

## 7. 主要来源

- Forge：[docs.minecraftforge.net/en/1.20.1/](https://docs.minecraftforge.net/en/1.20.1/) · [concepts/registries](https://docs.minecraftforge.net/en/1.20.1/concepts/registries/) · [datagen](https://docs.minecraftforge.net/en/1.20.1/datagen/) · [文档源仓库](https://github.com/MinecraftForge/Documentation)
- NeoForge：[docs.neoforged.net](https://docs.neoforged.net/) · [concepts/registries](https://docs.neoforged.net/docs/concepts/registries) · [items](https://docs.neoforged.net/docs/items/) · [Primers 门户](https://docs.neoforged.net/primer/docs/) · [primers 原文仓库](https://github.com/neoforged/.github)
- Fabric：[docs.fabricmc.net/develop](https://docs.fabricmc.net/develop/) · [1.21.1 first-item](https://docs.fabricmc.net/1.21.1/develop/items/first-item) · [custom-creative-tabs](https://docs.fabricmc.net/develop/items/custom-creative-tabs) · [data-generation/setup](https://docs.fabricmc.net/develop/data-generation/setup) · [porting/mappings](https://docs.fabricmc.net/develop/porting/mappings/)
- 博客：[1.20.5](https://fabricmc.net/2024/04/19/1205.html) · [1.21.4](https://fabricmc.net/2024/12/02/1214.html) · [去混淆声明](https://fabricmc.net/2025/10/31/obfuscation.html)
- 元数据：[version_manifest_v2](https://piston-meta.mojang.com/mc/game/version_manifest_v2.json) · [meta.fabricmc.net](https://meta.fabricmc.net/v2/versions/loader) · [Forge metadata 镜像](https://maven.creeperhost.net/net/minecraftforge/forge/maven-metadata.xml)
