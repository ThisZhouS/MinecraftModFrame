# 新增一个 MC 版本 / 加载器

> 目标：把「查不同版本的文档、对着接口试错」这件事，压缩成一份**可复用、可验证**的清单。
> 核心原则（见 `docs/project-brief.md` 原则 1）：**版本差异只允许存在于适配器数据里，引擎代码零版本分支。**

新增一个目标 = **新增一个 JSON 文件**，不改 `packages/core` 一行代码。若你发现必须改引擎，那是引擎的 bug（或适配器契约缺字段），应当先补契约。

## 0. 先确认边界

```bash
node packages/cli/dist/index.js list-versions      # 现有目标
node packages/cli/dist/index.js adapter <id> --templates   # 参考一个已有适配器的模板全貌
```

## 1. 取证：不要凭记忆写版本事实

**先看目标适配器自带的 `references[]`**——每个适配器都记录了该 (版本 × 加载器) 的权威来源（官方文档、映射查询、迁移指南）：

```bash
node packages/cli/dist/index.js adapter forge-1.20.1 --json   # 人 / 脚本
# 智能体走 MCP：get_adapter { mcVersion, loader }
```

`kind: "migration"` 的那些尤其省时间：**「这一版改了什么」几乎总能在那类文档里直接找到答案**，比逐类 `javap` 试错快得多。

本仓库一贯的做法是**先取证再写模板**，三个层次：

| 手段 | 用途 | 本仓库实例 |
| --- | --- | --- |
| `javap` 真实映射 jar | 拿到**类是否存在、方法签名是什么**——这是文档最容易过时、也最容易骗人的地方 | `Screen#renderBackground` 在 1.20.1 收 `(GuiGraphics)`、1.21.x 收 `(GuiGraphics,int,int,float)`，两版分叉进各自模板 |
| 读 **jar 内原版数据** | 拿到**数据包 JSON 的方言**——`gradle build` 完全不校验 JSON 语义，文档也常滞后 | 1.21 把物品栈键从 `item` 改成 `id`、物品谓词拍平成字符串、目录 `recipes/`→`recipe/`；共发现并修复 4 处 |
| 官方示例 / 文档 / 迁移指南 | 拿到**构建事实**（插件版本、Gradle/JDK 约束、仓库地址）与**版本差异** | `fabric-example-mod`（CC0）、各加载器官网、ChampionAsh5357 的逐版本迁移 gist |

映射查询工具（Linkie、Parchment）用来在写模板前核对名字——**映射名是本仓库最容易出错、也最难靠编译发现的一类事实**
（名字写错通常编译报错，但名字"能编译却语义不同"时只有核对来源才发现）。

中文资源索引（含教程、工具、社群）见 `docs/research/2026-09-cn-modding-resources.md`；注意其许可边界，只取链接目标。

**判断标准**：任何「我记得是这样」的版本事实，都必须落到上面某一种证据上，否则写进 `notes` 时标注为未取证。

## 1.5 取构建事实（工具化，不必手查）

```bash
node scripts/version-facts.mjs 1.21.4 fabric --pack-format   # 单个目标
node scripts/version-facts.mjs --all --pack-format            # 全部目标
```

从权威端点读，**不靠记忆**：Fabric meta/maven（loader、loom、fabric-api）、Forge maven、
NeoForge maven（官方不可达时自动走 creeperhost 镜像）、`pack_format` 读**真实游戏 jar 的
`pack.mcmeta`**（比 `version.json` 更直接，也是 1.16.5 及更早唯一可得的来源）。

两个已踩过的坑，脚本里已处理：

- **Forge 版本排序**：元数据是**降序**的，且 `"1.16.5-36.2.42"` 按整串切分会让 `Number("5-36")` = `NaN`，
  排序静默失效、取到**最旧**版。必须只比较 `<mc>-` 之后的部分。
- **Fabric API 后缀**：1.16.5 写作 `0.42.0+1.16` 而非 `+1.16.5`，需要按 major.minor 回落匹配。

## 2. 复制一份现有适配器

机械部分可以直接派生（**但派生只是起点，不是正确性声明**）：

```bash
node scripts/derive-adapter.mjs <源适配器id> <mcVersion> <loader>
# 例：node scripts/derive-adapter.mjs fabric-1.21.1 1.21.4 fabric
```

派生脚本**刻意不自动化语义**（版本间的 API 变更）——那正是适配器要记录、编译器要抓的东西。
它默认**剥离可选切片**（UI/配方/进度/实体/datagen），因为这些模板**不是版本无关的**：
1.21.2 起 `MobRenderer` 多了一个类型变量、`EntityType.Builder#build` 改收 `ResourceKey`，
照抄 1.21.1 的实体模板在 1.21.4 上根本编译不过。保留陈旧模板会产出坏 Java；剥离后生成器会
给出「该适配器不支持 entities」的明确报错。

**另有两个由真机编译抓出的坑，务必注意：**

- **loom 要按代际选，不能取「最新」**：loom 1.18.2 要求 **JVM 25**，Java 21 的目标根本装不上；
  loom 1.17.21 又要求 **Gradle 9.5.0**，用 8.8 会因 `org.gradle.plugin.api-version` 不匹配失败。
  所以派生时**继承同代源适配器的 loom**，而不是用「最新稳定版」。
- **Forge 1.20.2+ 取消了 reobfuscation**：`reobfJar` 任务不存在，`finalizedBy 'reobfJar'` 会让构建失败，必须删掉。
- **NeoForge 的仓库顺序要紧**：官方 maven 在被阻断的网络上返回 `Connection reset by peer`，这是**硬失败而非回落**。
  它若排在 `gradlePluginPortal()` 之前，传递依赖（如 `gradle-idea-ext`）就永远解析不到。正确顺序是
  **镜像 → 公共仓库 → 官方 maven 放最后**。

```bash
cp packages/adapters/data/<loader>-<oldVersion>.json packages/adapters/data/<loader>-<newVersion>.json
```

然后逐项改：`id` / `mcVersion` / `java` / `loaderVersion` / `mappings` / `gradle.*` / `gradleWrapperVersion`。

**最容易踩的三个坑**（都已在现有适配器里有对照）：
- **Java 版本**：决定了能否在本机编译验证（本机仅 JDK 21 ⇒ 只有 Java 21 目标可完整验证）。
- **Gradle 版本**：ForgeGradle 6 与 Gradle 9 不兼容，所以 `forge-1.20.1` 必须钉 Gradle 8.8 并自带 8.8 的 wrapper 资产。
- **数据包目录单复数**：1.21+ 是 `recipe/`、`loot_table/`、`tags/block/`；1.20.1 是复数。**写错不会报错，会静默不加载**——这类必须靠「读 jar 内原版数据」发现。

## 2.5 代际边界：派生能走多远（实测结论）

**派生只在同一代际内有效。** 实测记录：

| 目标 | 派生来源 | 结果 |
| --- | --- | --- |
| 1.21.4 fabric/forge | 1.21.1 / 1.20.1 | ✅ 编译通过（少数构建事实差异） |
| 1.20.4 fabric/forge | 1.21.1 / 1.20.1 | ✅ 编译通过（一处 `ResourceLocation` 差异） |
| **1.19.4** | 1.20.4 | ✅ 编译通过（**按年代重写**后，见下） |
| **1.16.5** fabric/forge | 1.19.4 | ✅ 编译通过（**整套模板按年代重写**，见下） |
| **1.12.2** forge | 1.16.5 | ✅ 编译通过（**又一代际，几乎无共同点**；Fabric 无此版本，见下） |

### 1.16.5：不是修几处，是整套重写（两个加载器均已完成）

派生仍然只是起点：编译器列出的差异覆盖主类、两个注册类、物品组 API、包名、日志。

**最反直觉的一条：Forge 1.16.5 编译用的是 MCP 名字，不是 Mojang 官方名。**
`mappings channel: 'official', version: '1.16.5'` 产出的构件名字里带 `_mapped_official_1.16.5`，
但内容不是官方名。对那个构件 `javap` 实测：

```
net.minecraft.item.Item implements net.minecraft.util.IItemProvider   ← 存在
net.minecraft.block.AbstractBlock / net.minecraft.block.material.Material
net.minecraft.item.ItemGroup / net.minecraft.util.ResourceLocation
net.minecraft.world.item.Item                                        ← 不存在
```

所以 forge-1.16.5 的模板全用 MCP 名，适配器的 `mappings` 字段也如实标注——
**不要因为构件名里有 "official" 就假定是官方名，要 javap 它。**

其余由编译器 / 字节码 / 构件实测抓出的点：

- **两个加载器在这个版本都没有「注册后挂钩」**。Fabric 侧：聚合器 `fabric-api-0.42.0+1.16`
  解析到的 `fabric-item-groups-v0` `0.3.1+3cc0f0907d` 里没有 `ItemGroupEvents`（`0.3.39` 线也没有，
  `javap` 实测）。Forge 侧：`BuildCreativeModeTabContentsEvent` 是 1.19.4+。
  两边的创造标签页都只能在**构造物品时**用 `Item.Properties#tab()` 绑定。
- **标签页自身能自注册**，两边的证据都在字节码里：
  Fabric 的 `CreativeModeTab.<init>` 末尾是 `TABS[id] = this`（`getstatic`/`iload_1`/`aload_0`/`aastore`），
  这正是 `FabricItemGroupBuilder.build()` 先 `fabric_expandArray()` 再构造的意义；
  Forge 的补丁（`forge-1.16.5-36.2.42-sources.jar` 里 `patches/net/minecraft/item/ItemGroup.java.patch`）
  加了 `ItemGroup(String label)` → `addGroupSafe(-1, this)`，扩容 `TABS` 并写入。
  所以 `build()` / `new ItemGroup(label){}` 之后可以丢弃返回值。
- **翻译键不是自由可选的**：Fabric 的 builder 用 `String.format("%s.%s", namespace, path)`，
  Forge 用 `"itemGroup." + label`。适配器要让 `langKeys.itemGroup` 和它生成键的方式对齐。
- `net.minecraft.core.registries` 包不存在（1.19.3+ 才有）；Fabric 侧注册表是
  `Registry.ITEM` / `Registry.BLOCK`，`CreativeModeTab` 仍是 `net.minecraft.world.item` 下的普通类。
- `RegistryObject` 在 1.16.5 是 **`net.minecraftforge.fml.RegistryObject`**
  （`...registries.RegistryObject` 是 1.17+）。
- `com.mojang.logging.LogUtils` 不在 1.16.5 的 jar 里（1.17+）；`org.slf4j` 也不在 Fabric 侧编译类路径上。
  两边都用 `org.apache.logging.log4j.LogManager`。
- `@Mod` 类用**无参构造** + `FMLJavaModLoadingContext.get()`（构造器注入是后来才有的）。
- `BlockBehaviour.Properties.of()` / `AbstractBlock.Properties.of()` 需要 `Material`（无参重载是 1.20+）。
- 数据包目录是**复数**：`data/<ns>/loot_tables/`、`data/minecraft/tags/blocks/`。
- **Java 8 目标不接受 `var`**：javac 报的是「找不到符号: 类 var」，和语言级别毫无关系，
  而且只有真编译过的目标才会暴露。现在 lint 直接拦（`adapter.java < 10` 时任何模板出现 `var` 即报错）。
- **ForgeGradle 6 能直接构建 1.16.5**（实测 6.0.54 + Gradle 8.8 wrapper），
  不需要退回 ForgeGradle 3 / 老 Gradle。
- **`version-facts.mjs` 的 `+<mc>` 后缀回落是对的**：1.16.5 的 Fabric API 写作 `0.42.0+1.16`，
  按 major.minor 回落即可命中，无需读聚合器 POM。

### 1.12.2：又一代际，几乎无共同点

**先确认上游是否存在**：Fabric 从 1.14 才有，`meta.fabricmc.net/v2/versions/loader/1.12.2` 返回 **400**，
Fabric API 也没有任何 1.12 构建 ⇒ **1.12.2 只有 Forge**。这不是框架缺口，是上游事实。

与 1.13+ 的差异是全面的，逐条取证后重写：

- **注册方式**：`RegistryEvent.Register<T>` + `@Mod.EventBusSubscriber`，不是 `DeferredRegister`。
  `javap` 确认 `Mod$EventBusSubscriber` 只有 `{value, modid}`（没有 bus 选择器），
  而 `GameData` 把 `RegistryEvent` post 到 `MinecraftForge.EVENT_BUS` ⇒ 默认配对就是对的。
- **物品配置**：用 setter（`setMaxStackSize` / `setMaxDamage` / `setCreativeTab`，都返回 `Item` 可链式），
  没有 `Item.Properties`。**但 `Block#setHarvestLevel(String,int)` 返回 void**，不能链式，
  所以它在注册函数里调用，而不是放进 settings。
- **没有数据包标签（1.13+）也没有方块战利品表（1.14+）**。适配器**不声明**这两类文件，
  生成器跳过；采集工具由 `setHarvestLevel` 在代码里表达，普通方块自带掉落、无需数据文件。
  这是契约新增的「可选切片」：`templates` 与 `contentPaths` 必须同进同退（lint 强制）。
- **元数据是 `mcmod.info` 不是 `mods.toml`**（1.13+）。
- **资源在 `assets/<ns>/` 下，不是 `data/<ns>/`**（数据包是 1.13+）；贴图目录是**复数**
  `textures/items/`、`textures/blocks/`（1.13 起变单数）；模型 `parent` **不带 `minecraft:` 前缀**。
  全部读真实 1.12.2 client jar 取证。
- **语言键是 `item.<name>.name` 和 `tile.<name>.name`**：`Item.getUnlocalizedName()` 前缀 `item.`，
  `Block` 的是 `tile.`，`ItemStack` 再补 `.name`。方块的 ItemBlock 继承方块的键，一条覆盖两者。
- **`Items.STONE` 不存在**：1.12.2 的物品/方块注册表还没合并（1.13 才合并），石头是 `Blocks.STONE`。
  编译器抓到的。
- 创造模式标签页是 `CreativeTabs`，`getTranslatedTabLabel()` 是 `"itemGroup." + label`（字节码确认），
  与 `langKeys.itemGroup` 一致。

**工具链是这个版本最大的坑**，三条路试了才知道哪条能走：

| 路线 | 结果 |
| --- | --- |
| ForgeGradle 6 + Gradle 8.8 | ❌ FG6 在自己的工具链处理里挂掉（`Project services has been closed`） |
| ForgeGradle 2.3 + Gradle 4.10.3 | ❌ Forge 已不再为 1.12.2 发布 `-userdev.jar`（全站 404） |
| **ForgeGradle 3 + Gradle 4.10.3 + JDK 8** | ✅ **官方 1.12.x MDK 用的就是这条**，实测通过 |

要点：**官方 MDK 写的是 `ForgeGradle:3.+`，不是很多人以为的 2.3**；Gradle 4.10.3 跑不了 Java 9+，
必须用 Java 8 守护进程；`minecraft { }` 块用 `runs { client {...} }` 而不是 FG2.3 的 `runDir`。

**1.12.2 的 jar 里没有 `pack.mcmeta`**，所以 `version-facts.mjs` 取不到 pack_format——
这个值来自官方 MDK 的 `mdk/src/main/resources/pack.mcmeta`（= 3）。工具在这种情况下如实报错而不是猜。

1.19.4 的实测差异（由编译器抓出，逐条已核对）：

- **`Registries.CREATIVE_MODE_TAB` 不存在**。查 Mojang 官方映射表取证：1.19.4 命中 **0** 次，1.20.4 命中 2 次
  ⇒ **创造模式标签页成为注册表是 1.20 才有的**（我原先以为 1.19.3，是错的——编译器是对的）。
  这两个版本要各写一套该年代的自定义标签页代码。
- **`BlockBehaviour.Properties.of()` 在 1.19.4 需要 `Material` 参数**，1.20+ 才是无参。
- **`FabricItemGroup.builder()` 在 1.19.4 签名不同**。

**处理方式：不发布。** 编译不过的适配器会产出**看起来对、实际是坏的**代码——这正是本项目要避免的失败模式，
比「没有这个版本」更糟。所以编译不过的一律移除，而不是标注为「未验证」保留。
（NeoForge 是例外：它生成正确、只是本机无法验证，性质不同。）
1.16.5 一度就是这样被移除的，直到整套模板按年代重写、真编译通过才重新发布。

**下次要做的顺序**：先按该年代的官方文档/示例写 `tabBlock` 与 `blockSettings`，**逐条用 `javap` 或官方映射表核对**，
再编译。不要指望派生脚本能跨代。

## 3. 用 lint 自查

```js
const { parseAdapterRecord, lintAdapter } = require("./packages/core/dist/index.js");
const a = parseAdapterRecord(JSON.parse(fs.readFileSync("packages/adapters/data/<id>.json", "utf8")));
console.log(a.ok ? lintAdapter(a.adapter) : a.issues);
```

lint 会拦住这些**会产出坏文件**的错误：模板键缺失、UI/配方/实体/贴图模板「只实现一半」、路径不含 `{{id}}`/`{{namespace}}`、主类缺 `{{REGISTRY_INIT_CALLS}}` 注入点等。

## 4. 记录陷阱

把第 1 步取证到的反直觉事实写进适配器的 `notes[]`。这些注记会随 `get_adapter` 暴露给智能体——**它们就是「不用再翻文档」的载体**。

## 5. 编译是唯一的终极验证

```bash
node packages/cli/dist/index.js gen <spec.json> -o ./out
cd out/<modId> && ./gradlew build      # 或 scripts/verify-build.mjs
```

**没跑过 `gradlew build` 的目标，一律标注为「仅生成、受限验证」，不得声称已验证。** 本仓库对 NeoForge 1.21.1 就是这么标的（本机网络无法访问 `maven.neoforged.net`）——诚实标注比虚假的绿勾有价值。

编译抓不到的东西（JSON 语义、资源路径、运行期行为）要另外验证：
- 资源路径 → 解 jar 比对（见 `docs/acceptance-report.md` §9b）
- JSON 语义 → 与 jar 内原版数据逐字段对照
- 运行期 → **目前没有任何目标做过**，标注为未验证

## 6. 收尾

- 更新 `README.md` 的适配器表与 `docs/tasks.md`。
- 跑 `python scripts/update_tree.py . --output Tree`。
- 在 `docs/acceptance-report.md` 记录：命令、结果、**以及没做到的部分**。
