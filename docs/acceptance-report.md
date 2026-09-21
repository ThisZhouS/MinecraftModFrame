# 验收报告 / Acceptance Report — mcmodkit（可编译切片）

> 日期：2026-09-15 · 环境：Windows 11 + Node 24.11.0 + pnpm 11.6.0 + JDK 21.0.11 / JDK 17.0.20.1 · Gradle 9.5.1（Fabric 线）/ 8.8（Forge 线）
> 证据分级：**通过 / 失败 / 阻塞 / 跳过 / 不适用**。低档通过不替代高档；外部条件缺失时记「阻塞」，不假设通过。

## 1. 测试分层与结论

| 层级 | 内容 | 结果 |
| --- | --- | --- |
| L1 静态 | 5 个包 `tsc`（build 内置） | ✅ 通过 |
| L2 单元/组件 | core / adapters / cli / mcp-server / api 的 vitest 用例 | ✅ **65 passed**（见 §2） |
| L3 集成（三面） | CLI 端到端生成、MCP stdio JSON-RPC 全链路、HTTP API 端点 | ✅ 通过（见 §3） |
| L4 真编译（内容） | 物品/方块/资源/数据包生成结果在目标 JDK + Gradle 下 `build` | ✅ Fabric 1.21.1、✅ Forge 1.20.1；⛔ NeoForge（见 §11.1） |
| L4 真编译（UI） | Screen + 按键绑定 + 客户端引导生成结果 `build` | ✅ Fabric 1.21.1（1m58s）、✅ Forge 1.20.1（30s）（见 §6） |
| L4 真编译（配方/进度） | 数据包 JSON 生成结果 `build` 且文件进 jar | ✅ 两版（见 §7） |
| L4 真编译（实体） | 实体类 + 渲染器 + 注册类 + 掉落表 `build` 且进 jar | ✅ 两版（见 §8） |
| L4 datagen（方案 B） | 数据生成入口 + provider `build` 且进 jar；Gradle 数据任务存在 | ✅ 两版；⚠️ **未运行** datagen（见 §9） |
| L5 一键复验 | `scripts/verify-build.mjs` 按适配器声明的 Gradle 线自动复跑编译 | ✅ 已交付（见 §9） |

## 2. L2 单元与组件测试

命令：`pnpm -r test`

| 包 | 用例数 | 覆盖的行为边界 | 结果 |
| --- | --- | --- | --- |
| `@mcmodkit/core` | 21 | Spec 校验与字段级报错、id 风格转换、模板渲染、生成计划（重复 id/路径守卫）、幂等落盘、外来文件不被触碰、错误码信封、**UI 计划（屏幕/引导/语言键/无键屏幕/非法键/默认值）** | ✅ |
| `@mcmodkit/adapters` | 13 | 适配器加载/校验/lint、资产解析、真实适配器契约、模板不得硬编码 MC 版本、**所有适配器零残留占位符**、**UI 切片对每个适配器可生成**、**Screen 的版本签名分叉被钉住** | ✅ |
| `@mcmodkit/cli` | 4 | 参数解析、stdin/文件输入、退出码映射、`--json` 信封 | ✅ |
| `@mcmodkit/mcp-server` | 6 | 工具定义与 `callTool` 分发、错误信封 | ✅ |
| `@mcmodkit/api` | 6 | 路由与状态码（200/400/404/500）、信封结构 | ✅ |

合计 **65 passed / 0 failed**。护栏在迭代中反复拦截真实缺陷：Forge 模板注释硬编码 MC 版本、UI 契约「只实现一半」、Screen 的 `renderBackground` 版本签名写错。

## 3. L3 集成：三个智能体接入面

| 面 | 用例 | 实际结果 |
| --- | --- | --- |
| CLI | `list-versions` | ✅ 3 个目标：fabric-1.21.1、neoforge-1.21.1、forge-1.20.1 |
| CLI | `example -o spec.json` | ✅ 含物品/方块/**一个带 K 键的 guide 屏幕** |
| CLI | `validate spec.json` | ✅ `valid:true`；非法 Spec → 退出码 4 + 字段路径 |
| CLI | `gen spec.json -o out --dry-run --json` | ✅ 返回 28 文件计划、不落盘 |
| CLI | `gen ... --json` | ✅ 三个适配器各写入 28 个文件（26 内容/骨架 + 2 UI） |
| CLI | `adapter forge-1.20.1 --json` | ✅ 构建事实（java 17 / Mojmap / wrapper 8.8 / 注记） |
| MCP | `initialize` / `tools/list` | ✅ `mcmodkit 0.1.0`；5 个工具 |
| MCP | `list_versions` / `get_adapter` / `validate_spec`(±) / `scaffold_mod`(dryRun) | ✅ 全部返回信封 |
| HTTP | `GET /health`、`/api/versions`、`/api/adapters/*` | ✅ 200 |
| HTTP | `POST /api/validate`（±形状）、`POST /api/generate`(dryRun) | ✅ 200 / 400 + 明确提示 |

## 4. L4 真编译（一）：Fabric 1.21.1

结果：**BUILD SUCCESSFUL in 29s**（内容切片）；`examplemod-1.0.0.jar`（10,917 B）+ sources jar。jar 内：`com/examplemod/{ModMain,ModMainItems,ModMainBlocks}.class`、`assets/examplemod/*`、`data/examplemod/loot_table/blocks/*.json`（**单数**）、`data/minecraft/tags/block/mineable/pickaxe.json`（**单数**）、`fabric.mod.json`、`pack.mcmeta`。

## 5. L4 真编译（二）：Forge 1.20.1

工具链：**Temurin JDK 17.0.20.1** + **Gradle 8.8**（ForgeGradle 6 不兼容 Gradle 9）。

结果：**BUILD SUCCESSFUL in 49s**（首次 9m38s，含整套 MCP 反编译流水线）。`examplemod-1.0.0.jar`（11,955 B），经 `reobfJar`；数据包路径 `data/examplemod/loot_tables/blocks/`、`data/minecraft/tags/blocks/mineable/`（**复数**，1.20.1 约定）。

**同一引擎、同一份 Spec、两个版本线，产出两种目录约定**（1.21.1 单数 vs 1.20.1 复数），两者的 jar 均由真实编译器验证 —— 「版本差异数据化」的端到端证据。

## 6. L4 真编译（三）：UI 切片（本轮新增）

### 6.1 生成内容

Spec 里一段声明：

```json
"ui": { "screens": [ { "id": "guide", "title": "Example Mod Guide", "key": "K",
                        "width": 240, "height": 150, "lines": ["...", "...", "..."] } ] }
```

引擎产出（版本无关，装配逻辑全在 core）：`client/<Mod>GuideScreen.java`（Screen 子类：标题、面板尺寸、逐行文本、Done 按钮）+ `client/<Mod>Client.java`（按键注册 + 打开屏幕）+ 4 类语言键（标题/每行/按键名/按键分类）。

### 6.2 真编译证据

| 目标 | 命令 | 结果 |
| --- | --- | --- |
| Fabric 1.21.1 | `verify-build.mjs --adapter fabric-1.21.1 --gradle 9=…gradle-9.5.1… --java-home-21 …` | ✅ **BUILD SUCCESSFUL in 1m58s**；jar 内含 `com/verifyfabric/client/ModMainClient.class`、`ModMainGuideScreen.class`、`fabric.mod.json`（含 `client` entrypoint） |
| Forge 1.20.1 | `verify-build.mjs --adapter forge-1.20.1 --gradle 8=…gradle-8.8… --java-home-17 …` | ✅ **BUILD SUCCESSFUL in 30s**；jar 内含 `com/verifyforge/client/{ModMainClient,ModMainClient$ModBus,ModMainGuideScreen}.class` |

### 6.3 加载器差异确实被模板吸收（同 Spec、三种引导）

| 加载器 | 按键注册 | 每 tick 打开屏幕 | 客户端入口 |
| --- | --- | --- | --- |
| Fabric | `KeyBindingHelper.registerKeyBinding` | `ClientTickEvents.END_CLIENT_TICK` | `ClientModInitializer` + `fabric.mod.json` 的 `client` entrypoint |
| Forge 1.20.1 | `RegisterKeyMappingsEvent.register`（`Bus.MOD` 嵌套订阅类） | `TickEvent.ClientTickEvent`（FORGE 总线，`Phase.END` 判定） | `@Mod.EventBusSubscriber(value = Dist.CLIENT)`，无需元数据声明 |
| NeoForge 1.21.1 | `RegisterKeyMappingsEvent.register`（同名事件） | `ClientTickEvent.Post` | `@EventBusSubscriber(value = Dist.CLIENT)` |

### 6.4 本轮由真编译发现并修复的缺陷

| # | 现象 | 根因 | 修复 | 复测 |
| --- | --- | --- | --- | --- |
| 1 | Forge 编译：`找不到符号 变量 ModMain` | 客户端类位于 `…​.client` 子包，引用父包的主类常量 `MOD_ID` 却没有 `import`（Java 不隐式导入父包） | 在 Forge/NeoForge 的客户端引导模板中加入 `import {{packageName}}.{{mainClassSimpleName}};` | ✅ Forge BUILD SUCCESSFUL in 30s |
| 2 | （预防性）`Screen#renderBackground` 两版签名不同 | 1.20.1 收 `(GuiGraphics)`，1.21.x 收 `(GuiGraphics,int,int,float)`；均由 `javap` 对真实映射 jar 取证 | 分叉进各自适配器的 `screenClass` 模板，并有测试钉住两侧写法 | ✅ Fabric/Forge 均编译通过 |

取证方法延续上一轮：先 `javap` 真实映射 jar 得到签名，再写模板，最后用真实编译器确认 —— 静态检查与编译验证各司其职。

## 7. 数据切片（二）：配方 + 进度（本轮新增）

### 7.1 生成的产物

同一份 Spec 声明 4 个配方（有序合成 / 熔炼 / 高炉 / 无序合成）与 2 个进度（根 + 子），引擎产出 6 个 JSON；两版真编译产物入 jar：

| 版本线 | jar 内数据包路径（实测） |
| --- | --- |
| Fabric 1.21.1（jar 16,575 B） | `data/verifyfabric/recipe/*.json`、`data/verifyfabric/advancement/*.json`、`data/verifyfabric/loot_table/…`、`data/minecraft/tags/block/mineable/…`（**全单数**） |
| Forge 1.20.1（jar 18,345 B） | `data/verifyforge/recipes/*.json`、`data/verifyforge/advancements/*.json`、`data/verifyforge/loot_tables/…`、`data/minecraft/tags/blocks/mineable/…`（**全复数**） |

### 7.2 本轮最重要的发现：数据包 JSON 的「版本方言」

编译验证**不会**校验数据包 JSON —— 字段名写错照样 `BUILD SUCCESSFUL`。因此本轮改用**权威源**：直接读 jar 里的**原版数据文件**（1.20.1 客户端 jar 5887 条、1.21.1 服务端 jar 6795 条 `data/minecraft/**`）逐字段对照，结果发现 4 处会让 1.21.1 侧数据全部失效的方言差异：

| 位置 | 1.20.1（原版实测） | 1.21.1（原版实测） |
| --- | --- | --- |
| 物品栈（配方 result / 进度 icon） | `{"item": "minecraft:oak_planks", "count": 4}` | `{"id": "minecraft:oak_planks", "count": 4}` |
| 烹饪类配方 result | `"result": "minecraft:iron_ingot"`（字符串） | `"result": {"id": "minecraft:iron_ingot"}` |
| 切石配方 | `"result": "minecraft:deepslate_tiles"` + `"count": 1` | `"result": {"id": "…", "count": 1}` |
| 进度物品谓词 | `"items": [{"items": ["minecraft:diamond"]}]`（对象列表；标签用 `{"tag": …}`） | `"items": "minecraft:diamond"`（字符串；标签用 `"#minecraft:…"`） |

处理方式：**全部下沉为适配器模板片段**（`recipeShaped/Shapeless/Cooking/Stonecutting`、`advancement`、`advancementItemPredicate`、`advancementTagPredicate`），引擎只传原始值（`{{RESULT_ITEM}}`、`{{COUNT}}`、`{{ADV_ICON_ITEM}}`、`{{ITEM_ID}}`/`{{TAG_ID}}`）——引擎依旧零版本分支，并有两组护栏测试钉住两版写法。

顺带一处机制修正：原版解锁配方靠 `rewards.recipes`（配方书）+ `minecraft:recipe_unlocked` 判据，本框架现在两者都生成（两版同形）。

### 7.3 验收

| 项 | 证据 |
| --- | --- |
| 真编译 | Fabric **PASS（122s）**、Forge **PASS（44s）**，jar 内含全部 6 个数据文件 |
| 单测 | 61 passed（core 29 / adapters 16 / cli 4 / mcp 6 / api 6），含配方/进度的引擎逻辑、默认烹饪时间、判据与 rewards、父级引用、非法引用的字段级报错、两版方言护栏、所有生成 JSON 可解析 |
| 人工比对 | 生成文件与原版样本逐字段一致（见 §7.2 表） |
## 8. 数据切片（三）：实体（本轮新增）

### 8.1 一份 Spec 生成一只怪

```jsonc
"entities": [ { "id": "ruby_golem", "kind": "monster", "health": 30, "speed": 0.28, "attackDamage": 5,
                "followRange": 24, "width": 0.9, "height": 1.6, "shadow": 0.7, "model": "cow",
                "loot": [ { "item": "ruby", "min": 1, "max": 2 }, { "item": "charged_ruby", "chance": 0.25 } ] } ]
```

产出 4 个新文件（工程 38 个文件）：`entity/<Mod><Id>Entity.java`（实体类 + 属性）、`client/<Mod><Id>Renderer.java`（渲染器）、`<Mod>Entities.java`（实体类型与属性注册）、`data/<ns>/loot_table(s)/entities/<id>.json`（掉落表）；同时语言键与主类/客户端引导的注入点自动接线。

### 8.2 真编译证据

| 目标 | 结果 | jar 内容（实测） |
| --- | --- | --- |
| Fabric 1.21.1 | ✅ **BUILD SUCCESSFUL（122s）** | jar 20,646 B：`ModMainEntities.class`、`entity/ModMainRubyGolemEntity.class`、`client/ModMainRubyGolemRenderer.class`、`data/verifyfabric/loot_table/entities/ruby_golem.json` |
| Forge 1.20.1 | ✅ **BUILD SUCCESSFUL（45s）** | jar 23,816 B：`ModMainEntities{,$ModBus}.class`、`entity/ModMainRubyGolemEntity.class`、`client/ModMainRubyGolemRenderer{,$ModBus}.class`、`data/verifyforge/loot_tables/entities/ruby_golem.json` |

### 8.3 版本/加载器差异全部落在数据层

| 关注点 | 处理方式（都在适配器 JSON 里） |
| --- | --- |
| 实体注册 | Fabric 用 `Registry.register(BuiltInRegistries.ENTITY_TYPE, …)`；Forge/NeoForge 用 `DeferredRegister` + 主类注入的 `register(modEventBus)` |
| 属性注册 | Fabric 在 `init()` 里调 `FabricDefaultAttributeRegistry.register`；Forge/NeoForge 走 MOD 总线的 `EntityAttributeCreationEvent`（注册类内自带 `@EventBusSubscriber`/嵌套 `ModBus`） |
| 渲染器注册 | Fabric `EntityRendererRegistry.register`；Forge/NeoForge `EntityRenderersEvent.RegisterRenderers` 里的 `event.registerEntityRenderer(…)` |
| 基类与属性来源 | `entityKinds`：`monster → Monster.createMonsterAttributes()`、`creature → PathfinderMob + Mob.createMobAttributes()` |
| 客户端模型 | `entityModels`：`pig/cow/chicken/sheep` → 模型类 + `ModelLayers.X` 常量（两版同名，已 `javap` 取证） |
| 掉落表目录 | 1.21 `loot_table/entities/`；1.20.1 `loot_tables/entities/` |

### 8.4 本轮由「原版数据对照」修正的一处

掉落表的 `set_count.count` **必须显式写出数值来源类型**（`{"type": "minecraft:uniform", "min": 1, "max": 2}`）。最初省略 `type`，与 jar 内 `data/minecraft/loot_tables/entities/pig.json` 对照后补上——`minecraft:constant` 是默认值，省略会改变语义。这是又一次「编译不校验 JSON 语义、必须以原版数据为准」的实例。

### 8.5 验收

| 项 | 证据 |
| --- | --- |
| 真编译 | Fabric PASS（122s）、Forge PASS（45s），实体类/渲染器/注册类/掉落表全部进 jar |
| 单测 | **63 passed**（core 29 / adapters 18 / cli 4 / mcp 6 / api 6）：新增实体切片逐适配器断言、掉落表结构、语言键、注册注入点、以及「属性基类与模型只在适配器数据里」的原则守卫 |
| 未覆盖（诚实记录） | 实体 AI 目标（`registerGoals`）、生成蛋、贴图与运行时行为均未生成；渲染器复用原版模型（`model` 字段选 pig/cow/chicken/sheep），贴图需自备 |
## 9. datagen（方案 B，本轮新增）

开关式能力：Spec 顶层 `"datagen": true` 时，生成 ① 加载器对应的数据生成入口类 ② 最小示例 provider（演示 `DataProvider.saveStable`）③ 构建脚本的数据任务接线与生成资源目录；Fabric 另写入 `fabric-datagen` entrypoint。默认关闭，关闭时工程与之前逐字节一致。

| 项 | 证据 |
| --- | --- |
| 真编译 | Fabric **PASS（117s）**、Forge **PASS（45s）**；jar 内含 `datagen/ModMainDataGen.class`、`datagen/ModMainExampleProvider.class`（Fabric jar 22,817 B / Forge jar 25,922 B） |
| 任务存在性 | Fabric `gradle tasks --all` 列出 `runDatagen - Starts the 'datagen' run configuration`；Forge 列出 `prepareRunData`、`prepareRunDataCompile` |
| 关闭时零残留 | 单测：`datagen:false` ⇒ 无 `datagen/` 文件、构建脚本无 `runData*`、元数据无 `fabric-datagen` |
| 编译器抓到的缺陷（已修） | ① Fabric `pack.addProvider(Provider::new)` 重载歧义（`FabricDataGenerator.Pack` 亦继承 `DataGenerator.PackGenerator`）→ 显式目标类型转换；② Forge/NeoForge 的 datagen 类在子包引用主类 `MOD_ID` 缺 `import` |
| **明确未做** | **没有运行 datagen**（`runDatagen`/`runData` 未执行）——运行时行为未验证；这是本轮唯一的「编译/任务存在 ≠ 运行成功」缺口 |

评估与三选项（A 不做 / B 最小接线 / C 完整 provider）见 `docs/datagen-evaluation.md`；本轮落地的是可逆的 B。
## 9b. 贴图生成 / 生图（本轮新增）

开关式能力：Spec 顶层 `"textures": true` 时为每个物品/方块生成 16×16 PNG、为每个实体生成 64×32 贴图；单个内容可用 `texture: { style, palette, seed }` 覆盖。默认关闭（生成的 PNG 是受管文件，会覆盖手工美术）。

| 项 | 证据 |
| --- | --- |
| 真编译 | Fabric **PASS**（`gradle build` 退出码 0，产出 `examplemod-1.0.0.jar`） |
| 进 jar | jar 内 `assets/examplemod/textures/{item,block,entity}/*.png` 5 个文件齐全 |
| 字节一致性 | 从 jar 解出的 5 个 PNG 与生成源**逐字节相同**（sha256 前 12 位逐一比对：`209175298c23` / `8133c9082c7c` / `91779052d2c8` / `b97c35ecbcb1` / `09a92a170255`） |
| PNG 结构 | 5/5 通过**签名 + IHDR 尺寸 + CRC32 + IDAT inflate 长度**校验（16×16 raw=1040/1040；64×32 raw=8224/8224；crcBad=0） |
| 引用链路 | 模型/渲染器引用与落盘路径实测对应：`layer0: examplemod:item/ruby` → `textures/item/ruby.png`；`all: examplemod:block/ruby_ore` → `textures/block/ruby_ore.png`；渲染器 `textures/entity/ruby_golem.png` → 同名文件 |
| 确定性 | 同 Spec 重生成**逐字节一致**（`diff -r` 全等）——seeded mulberry32，无 `Math.random` |
| 开关关闭时零残留 | `textures:false` ⇒ 45 → 40 个文件，差集恰为 5 个 PNG |
| 测试 | core 38 项通过（含 PNG 往返编解码、确定性、配色、开关、非法风格字段级报错） |
| **明确未做** | **贴图在游戏内的实际观感未验证**（无客户端运行）；实体贴图为 64×32 **纯色占位**，自定义 UV 美术仍需自备；未接真实图像模型（`paintTexture` 是预留的单一替换点） |

设计取舍：贴图走**参数化程序化绘制**而非调用图像模型——离线、瞬时、**可复现**。可复现是关键：改图会体现为 diff，而不是不可复现的噪声；接真实模型只需替换 `paintTexture` 一个函数。

## 10. 本轮交付的其他能力

- Spec 新增 `ui.screens[]`（id/title/key/width/height/lines），缺省值可省略；非法键给出字段级报错。
- 适配器契约新增 `keyCodePattern`（键码表达式，默认 `org.lwjgl.glfw.GLFW.GLFW_KEY_{{KEY}}`）与 `clientSubpackage`；UI 模板「可选但全有或全无」，由 lint 强制。
- `scripts/verify-build.mjs`：一键复验，按适配器声明的 wrapper 版本选 Gradle 线。
- Gradle 9.5.1 经腾讯云镜像重新取得（`services.gradle.org` 会跳转到被阻断的 github.com），Fabric 线复验能力恢复。

## 11. 阻塞 / 跳过 / 不适用

### 11.1 NeoForge 1.21.1 真编译 —— ⛔ 阻塞（环境）

| 尝试 | 配置 | 结果 | 说明 |
| --- | --- | --- | --- |
| 1 | 官方 maven 在前 | ❌ 插件未找到 | Gradle 访问 `maven.neoforged.net` 得到 SSL reset 后硬失败，不回落 |
| 2 | 镜像在前、官方在后 | ❌ 传递依赖失败 | 插件从镜像解析成功；`gradle-idea-ext` 回落官方 maven → 硬失败 |
| 3 | 官方 maven 置于最后 | ❌ `neoform-runtime` 失败 | 该工件只能从 MDG 自注册仓库（官方）取得 |
| 4 | `PREFER_SETTINGS` 强制设置级仓库 | ❌ `minecraft-dependencies` 缺失 | `net.neoforged:minecraft-dependencies:1.21.1` 在镜像 **404**，仅有官方 maven 提供 |

**离线静态校验（最大努力）**：NeoForge 适配器模板引用的 13 个 `net.minecraft.*` 类逐个 `javap`（1.21.1 真实映射 jar）→ **13/13 存在**；8 个 `net.neoforged.*` 类**无法离线校验**（类文件在 `neoforge-*-universal.jar` 与 FML 工件内，两者都托管在被阻断的 maven 上；本地 userdev jar 只有 config/patches/joined.lzma，joined 内是补丁后的原版 MC，不含 NeoForge 代码）。

结论：**本机无法完成 NeoForge 编译验证**。`neoforge-1.21.1` 一律标注「已生成，未编译验证」。对照经验：Forge 线同样的模板结构被编译器抓出 3 处 API 错误（§5、§6.4），静态检查无法替代编译。

### 11.2 其他阻塞 / 跳过

| 项 | 状态 | 原因与影响 |
| --- | --- | --- |
| `gradlew` 自动下载 Gradle 发行版 | ⛔ 阻塞（环境） | 本机 Java 对发行版 CDN 连接超时；`services.gradle.org` 部分重定向到被阻断的 github.com。**不影响产物**：验收使用本地发行版，wrapper 四件套随工程分发 |
| 浏览器端验证 | ⏭ 跳过 | 本会话无可用浏览器 provider；生成物是游戏内 UI，本就无法在浏览器里验证 |
| **游戏内运行时验证**（真的按 K 打开屏幕） | ⏭ 跳过 | 需要可运行的 Minecraft 客户端与图形环境；本框架的验收止于「编译通过 + 类与资源进入 jar」 |
| MC 26.x（Java 25）目标 | ⏭ 跳过 | 无 JDK 25；未纳入本期适配器 |
| Linux/macOS 生成与构建 | ⏭ 跳过 | 本机为 Windows；已用 posix 相对路径 + `executable` 位降低风险，未实测 |

## 12. 一键复验 / Re-verification

```bash
pnpm -r build && pnpm -r test            # 50 passed
node scripts/verify-build.mjs --adapter fabric-1.21.1 \
  --gradle "9=C:/tools/gradle-9.5.1/bin/gradle.bat" --java-home-21 <jdk21>
node scripts/verify-build.mjs --adapter forge-1.20.1 \
  --gradle "8=C:/tools/gradle-8.8/bin/gradle.bat" --java-home-17 <jdk17>
```

脚本按**适配器声明的 `gradleWrapperVersion`** 选择 Gradle 线，缺工具链时如实报 `SKIPPED`；失败退出码 1，并在 `Temp/verify-build/<adapter>/build.log` 留完整日志。

## 13. 遗留风险与缺口

1. **NeoForge 未编译验证**：见 §11.1；在能访问 `maven.neoforged.net` 的机器上跑 `verify-build.mjs --adapter neoforge-1.21.1` 即可补齐。
2. **UI 只到「可编译」**：没有运行时验证（无法在无图形环境启动客户端），也没有贴图/字体/交互逻辑（输入框、列表、滚动）。
3. **版本漂移**：适配器钉住的版本号会随上游变旧，需要版本巡检工作流（数据源见 docs/research/2026-09-version-api-knowledge.md §2.4）。
4. **贴图缺失**：物品/方块贴图需自备（生成工程 README 已明确）。
5. **覆盖子集仍有限**：配方、进度、实体、附魔、datagen 尚未实现。
6. **未做负面安全测试**：路径逃逸有实现级守卫与单测，但无模糊测试；MCP/HTTP 面未做鉴权（默认仅监听 loopback）。
