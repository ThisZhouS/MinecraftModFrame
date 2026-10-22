# 任务计划 / Task Plan — mcmodkit

> 每阶段以「可验证的产物」结束；验证命令都可直接复制执行。状态：✅ 完成 · 🔄 进行中 · ⬜ 待办

## 阶段总览

| 阶段 | 目标 | 依赖 | 验证命令 | 状态 |
| --- | --- | --- | --- | --- |
| S0 环境测量 | 摸清工具链与约束 | — | `node -v` / `pnpm -v` / `java -version` → docs/environment.md | ✅ |
| S1 调研 | 竞品、模板许可证、MCP 生态、版本 API 知识 | S0 | docs/research*.md | ✅ |
| S2 基线 | 原则、需求、任务计划 | S1 | docs/requirements.md + 本文档 | ✅ |
| S3 核心切片 | core 管线 + 三面接口 + 单元/管线测试 | S2 | `pnpm -r build && pnpm -r test` | ✅ |
| S4 真实适配器 | Fabric 1.21.1（编译级验证） | S3 | `mcmod gen` + `gradlew build` | ✅ |
| S4b 真实适配器 | NeoForge 1.21.1（后扩到 1.20.4 / 1.21.4）：适配器数据与生成；真编译 + 真运行（S18） | S4 | `mcmod gen` + `gradle build` + `verify-runtime.mjs` | ✅ 编译 + 运行验证通过（见 S18） |
| S4c 真实适配器 | Forge 1.20.1（Java 17 + Gradle 8.8 + ForgeGradle 6）：适配器、wrapper 8.8 资产、真编译 | S4b | `mcmod gen` + `gradle build` | ✅ 编译验证通过 |
| S5 端到端验收 | 三面冒烟 + 生成工程真编译 + Tree + 报告 | S4 | docs/acceptance-report.md | 🔄 |
| S6 后续增强 | 配方/UI/模型生成、升级迁移工作流、适配器社区共建 | S5 | 后续方向 | ⬜ |

## S3 交付物（已完成）

- `packages/core`：Spec 模型与校验（zod）、id 风格转换、模板渲染、生成计划、落盘、错误码与信封。
- `packages/adapters`：适配器加载/校验/lint、二进制资产解析、`planProject` 统一规划入口。
- `packages/cli`：`list-versions` / `adapter` / `example` / `validate` / `gen`（`--json`、`--dry-run`、`-o`）。
- `packages/mcp-server`：5 个查询/校验/生成型 tools（MCP SDK v2，stdio）。
- `packages/api`：`node:http` JSON API（`/api/versions`、`/api/validate`、`/api/generate` 等）。
- 测试分布：core 14、adapters 10、cli 4、mcp-server 6、api 6。

## S15 交付物（版本事实的权威来源：adapter references，已完成）

**动机**：结合 `mouse0w0/MinecraftDeveloperGuide`（中文开发者资源索引）完善项目。该仓库是**链接索引**而非 API 手册，
对框架实现几乎无可直接编码的内容；但它精确指出了**「版本事实该去哪里取证」**——正是本项目最含糊的一环。

- 适配器契约新增 `references[]`：`{ label, url, kind, note? }`，`kind` ∈ official-docs / mappings / migration / example-mod / datapack / community。
- 三适配器各填入真实来源（官方文档、Linkie 映射查询、Parchment、ChampionAsh5357 迁移 gist、NeoForge primer 等）。
- 约束由 schema + lint 强制：URL 必须 https；不允许重复 URL；只要声明 references 就必须含官方文档（避免只堆二手教程）。
- **`adapterSummary()` 收敛到 `packages/adapters`**：CLI 与 MCP 此前各自手写字段清单——那正是「字段只到一个面」的典型成因。
  现在 `references` 随事实一起到 `mcmod adapter <id>` 与 MCP `get_adapter`。
- **许可边界**：原指南 CC-BY-SA-4.0 与本仓库 MIT 不兼容 ⇒ **只取链接目标，不复制任何原文表述**；说明文字均自写。
  见 `docs/research/2026-09-cn-modding-resources.md`。
- 验收：core 67 项（+4 项 references 约束）、adapters 22 项（+2 项 adapterSummary）、全套 105 项通过；
  MCP 冒烟脚本实测 `get_adapter` 返回 5 条 references（kinds: mappings,migration,official-docs）。

## S14 交付物（运行期缺陷修复：Forge 创造模式标签页，已完成）

**背景**：把 MK2 钓鱼竿装进真实 Forge 1.20.1 客户端启动，崩溃：

```
java.lang.NullPointerException: Registry Object not present: mk2:mk2
    at com.mk2.ModMainItems.register(ModMainItems.java:38)
```

**根因**：Forge 适配器的 `tabEntryLineItem/Block` 生成 `TAB_ENTRIES.add(...MK2.get())`，而这行落在 `register()` 里——它由 mod 构造器调用，**早于任何 RegisterEvent**。`DeferredRegister` 此时还没填充，`.get()` 必然抛错。**编译完全无法发现**：这正是本仓库一直标注的「运行期行为未验证」缺口。

**为什么只有 Forge 中招**：Fabric 的 `Registry.register` 是立即注册（列表存的是 Item 本身，正确）；NeoForge 的模板早已是 `List<Supplier<? extends ItemLike>>` 且惰性解析（正确）；只有 Forge 写成了即时 `.get()`。三个适配器里唯一写错的那个，恰好是唯一做过真机验证的那个。

**修复**：Forge 改为与 NeoForge 同构——`TAB_ENTRIES` 存 `Supplier<? extends ItemLike>`（`RegistryObject` 本身就是 Supplier），在创造模式标签页的 lambda 里惰性 `.get()`。

**防回归**：lint 新增规则——`tabEntryLineItem/tabEntryLineBlock` 不得含 `.get()`（这类行必然被发射进 `register()`，在那里查注册表**永远是错的**，与加载器无关）。2 项单测钉住正反两例。

**运行期验收**（`gradlew runServer`，无 GUI 也能走完构造+注册）：
- 日志出现 `[co.mk.ModMain/]: mk2 loaded`——该行位于 `ModMainItems.register()` **之后**，证明构造期注册全部走通。
- 全程 `grep -i "error\|exception\|crash\|not present"` 无任何 mk2/ModMain 命中。
- 服务器越过注册阶段并进入世界生成（`Preparing spawn area: 42%`）。
- 同一份 mod、同一台机器：修复前必崩于构造期，修复后正常加载。

## S13 交付物（真实图像模型 + 物品行为，已完成）

**真实图像模型（AI 生图）**：`textureProvider: "image-api"` + 内容级 `texture.prompt` / `texture.size`。
- `packages/core/src/image-ops.ts`：零依赖 PNG 解码（8bit RGB/RGBA、非交错；其余显式报错不猜）、边界泛洪抠背景、**最大连通域去杂点**、保比例缩放（**预乘 alpha** 平均，避免透明像素把颜色拉黑）。
- `packages/core/src/image-provider.ts`：调用图像 API；**凭据只走环境变量**（`MCMODKIT_IMAGE_*`），Spec 永不携带密钥，缺 key 直接报错不降级。
- 网络步骤刻意放在 `planGeneration` **之外**：生成计划仍是同步纯函数，调用方 `prefetchTextures` 后传入字节。`--dry-run` 不联网。
- **物品行为**：`items[].behavior`（适配器 `itemBehaviors` / `itemBehaviorImports`）+ `items[].durability`；模板新增 `{{ITEM_CTOR}}` / `{{DURABILITY_SUFFIX}}` / `{{ITEM_BEHAVIOR_IMPORTS}}` 注入点，lint 强制。
- NeoForge 的 `itemRegistration` 由 `registerSimpleItem` 改为 `ITEMS.register(name, supplier)`（前者无法表达自定义类）——**未编译验证**（本机无法访问 maven.neoforged.net），已写入该适配器 `notes`。
- 验收：**Forge 1.20.1 真编译通过**，产出 `mk2-1.0.0.jar`；`javap` 确认字节码为 `new net/minecraft/world/item/FishingRodItem` + `(Item$Properties)V`；AI 生成的 32×32 贴图（1080 B）在 jar 内。core 61 项测试（含 11 项图像、7 项行为）通过，全套 97 项通过。
- 未做：图像模型出图质量未做系统评估（仅人工看过一例）；未接图像编辑/重绘；实体贴图仍是程序化占位。

## S12 交付物（模型形态，已完成）

- Spec 新增 `items[].model`（`generated`/`handheld`）与 `blocks[].model`（`cube_all`/`cube_column`）。
- 模型 JSON 本体作为适配器模板（`itemModelHandheld` / `blockModelColumn`，三适配器各 +2），引擎按 Spec 选择；缺模板时报可修复错误而非产出坏文件。
- 生成工程的 README 文本改为**条件化**（`{{TEXTURE_NOTES}}`，lint 强制）：开了贴图就说「已生成，改 Spec 而非改 PNG」，否则提示自备——避免文档与实际产物矛盾。
- 验收：43 项 core 测试（含形态切换、贴图路径不变、未知形态字段级报错、缺模板报错）；三适配器 lint clean；生成级实测 handheld/cube_column 正确。
- 说明：模型形态是**纯资源 JSON**，`gradle build` 不校验其语义（见 S8 方法学），故以生成级 + 单测验证；编译验证由贴图切片承担。

## S11 交付物（贴图生成 / 生图，已完成）

- Spec 新增 `textures`（默认 false，受管文件不可默认覆盖手工美术）与物品/方块/实体级 `texture: { style, palette, seed }`。
- `packages/core/src/png.ts`：零依赖 PNG 编码器（`node:zlib` deflate + 自实现 CRC32，IHDR/IDAT/IEND）。
- `packages/core/src/texture.ts`：7 种风格（solid/noise/speckle/ore/gradient/border/planks）+ seeded mulberry32，**同 Spec 逐字节可复现**；省略 palette 时由 id 哈希出色相。
- 引擎 `genTextures`：物品/方块 16×16、实体 64×32（原版猪/牛/鸡/羊 UV 版式）；`FileEntry.bytes` 支持二进制落盘；三适配器各加 3 条 `contentPaths.*Texture` + lint「全有或全无」。
- 验收：45 文件（关闭时 40，差集恰为 5 个 PNG）；5 个 PNG 全部通过**签名 + IHDR + CRC + IDAT inflate 长度**校验；重生成 byte-identical；模型引用链路实测对应（`item/ruby`、`block/ruby_ore`、`textures/entity/ruby_golem.png`）；core 38 项测试通过。
- 未做：自定义 UV 实体贴图（当前为纯色占位）、真实图像模型接入、贴图在游戏内的实际观感验证。

## S10 交付物（datagen 方案 B，已完成）

- Spec 开关 `datagen`（默认 false）；三适配器各新增 3 个模板（dataGenClass / dataGenProvider / dataGenRunConfig）。
- 产出加载器数据生成入口 + 最小示例 provider + `runDatagen`(Fabric)/`runData`(Forge/NeoForge) 接线与生成资源目录；Fabric 写入 `fabric-datagen` entrypoint。
- 验收：Fabric PASS(117s)/Forge PASS(45s)，datagen 类进 jar；Gradle 任务存在性实测；开关关闭时零残留（单测）。
- 未做：实际运行 datagen（运行时行为未验证）；评估与三选项见 docs/datagen-evaluation.md。

## S9 交付物（实体，已完成）

- Spec 新增 `content.entities[]`：kind/category、生命/速度/攻击/索敌、体积与阴影、复用模型、掉落表。
- 引擎 `genEntities`：实体类 + 渲染器 + 实体注册类 + 掉落表 + 语言键，并向主类注入 `{{REGISTRY_INIT_CALLS}}`、向客户端引导注入 `{{ENTITY_RENDERER_REGISTRATIONS}}`（普通项目文件也能被生成器接线）。
- 适配器新增 8 个实体模板与 `entityKinds`/`entityModels` 数据；掉落表目录按版本分叉。
- 验收：Fabric PASS(122s) / Forge PASS(45s)，实体类/渲染器/注册类/掉落表进 jar；63 项测试通过。
- 未生成（记录在案）：AI 目标、生成蛋、贴图、运行时行为。

## S8 交付物（配方 + 进度，已完成）

- Spec 新增 `content.recipes[]`（7 种配方类型，含 pattern/key/ingredients/ingredient/experience/cookingTime/count/group 与跨字段校验）与 `content.advancements[]`（父子树、icon、unlockRecipes、hasItems、frame/展示开关、根进度背景）。
- 引擎 `genRecipes` / `genAdvancements`：引用解析（本 mod id → `ns:id`，显式资源位置直通，未知 id 报字段级错误）、默认烹饪时间、判据与 `rewards.recipes`、语言键。
- 三个适配器各新增 7 个模板（4 配方 + advancement + 两种物品谓词）与 2 个 langKeys；数据包目录按版本分叉（`recipe/` vs `recipes/`）。
- **方法学补充**：数据包 JSON 的语义不由 `gradle build` 校验，因此以 **jar 内原版数据**为权威源逐字段对照，发现并修复 4 处版本方言（`item`→`id`、烹饪 result 形态、切石形态、物品谓词形态）。
- 验收：Fabric/Forge 真编译通过，jar 内 6 个数据文件路径与内容正确；61 项测试通过。

## S7 交付物（UI 切片，已完成）

- Spec 新增 `ui.screens[]`：id / title / key(A-Z) / width / height / lines。
- 引擎 `genUi`：每个 screen 一个 `client/<Mod><Id>Screen.java`；有声明的键时额外产出 `client/<Mod>Client.java`（注册键 + 打开屏幕），并生成 4 类语言键。
- 三个适配器各新增 6 个 UI 模板（screenClass / screenLineDraw / clientBootstrap / keybindField / keybindRegister / screenOpenStatement）+ 4 个 langKeys；Fabric 额外把 `client` entrypoint 接入 `fabric.mod.json`。
- 契约新增：`keyCodePattern`（键码表达式，默认 GLFW）、`clientSubpackage`；lint 强制「UI 模板全有或全无」且必须配齐语言键。
- 验收：Fabric 1.21.1 与 Forge 1.20.1 生成工程**真编译通过**（见 acceptance-report §6）。

## S4 交付物（Fabric 1.21.1，已完成）

- `packages/adapters/data/fabric-1.21.1.json`：完整适配器（构建事实、文件计划、模板、陷阱注记）。
- `packages/adapters/assets/gradle-9.5.1/`：gradle wrapper 四件套 + 来源与许可说明。
- 版本事实来源：CC0 的 fabric-example-mod（1.21.1 分支）+ 官方文档；**以真实编译作为终极验证**。

## S5 验收清单

| 项 | 命令 | 通过标准 |
| --- | --- | --- |
| 构建 | `pnpm -r build` | 5/5 包成功 |
| 测试 | `pnpm -r test` | 全部通过 |
| CLI 生成 | `node packages/cli/dist/index.js gen spec.json -o out --json` | `ok:true`，26 个文件 |
| 真编译 | 生成工程内 `gradlew.bat build` | BUILD SUCCESSFUL + 产出 jar |
| MCP stdio | `list_versions` / `validate_spec` / `scaffold_mod` | 返回 JSON 信封 |
| HTTP API | `GET /api/versions`、`POST /api/validate` | 200 + 信封 |
| Tree | `python scripts/update_tree.py . --output Tree` | Tree/ 与仓库一致 |

## 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| UI 模板只实现一半（三个加载器各有自己的客户端引导方式） | 产出无法编译的 Java | 契约把 UI 模板定为「全有或全无」，lint 直接拦截；Screen 本体按 `javap` 取证的两版签名分叉 |
| 版本 API 漂移（1.21.x 持续破坏性变更） | 模板过期 | 适配器数据 + 编译级验收；每个适配器带 `notes` 陷阱注记 |
| 本机仅预装 JDK 21 | 1.20.1（Java 17）原本无法本机编译 | 实测可通过 `api.adoptium.net` 取得 Temurin JDK 17 ⇒ **1.20.1 已编译验证**；26.x（Java 25）仍为「仅生成、受限验证」 |
| 首次构建需联网（Gradle/Loom/Minecraft） | 离线环境无法构建 | 生成阶段零网络；README 明示首次构建需联网；wrapper 随工程分发 |
| 本机 Java 对部分 CDN 直连不稳定 | wrapper 自动下载发行版可能失败 | 验收使用本地已解压的 Gradle 发行版；把该环境限制写入 docs/environment.md |
| 适配器 schema 演进 | 旧数据失效 | `schemaVersion` + 加载期校验与可读报错 |

## S16 交付物（多版本推进：13 个目标 / 10 个编译验证，已完成）

**动机**：把框架从「一个能跑的版本」推进到「覆盖跨代际的版本」，并且**每一代都用真编译而不是记忆来定版**。

- 新增目标：`1.19.4`、`1.20.4`、`1.21.4`（fabric+forge）、`1.21.1` fabric、`1.16.5`（fabric+forge），
  加上原有 `fabric-1.21.1` / `forge-1.20.1` / 三个 neoforge ⇒ 共 13 个适配器，**10 个真编译通过**。
- `scripts/version-facts.mjs`：从权威端点取构建事实（Fabric meta/maven、Forge maven、NeoForge maven 带镜像回落、
  `pack_format` 读真实游戏 jar 的 `pack.mcmeta`）。已修两个静默错误：Forge 元数据降序导致取到最旧版、
  Fabric API `+1.16` 需要 major.minor 回落。
- `scripts/derive-adapter.mjs`：同代派生。**刻意不自动化语义差异**（那正是适配器要记录的），默认剥离可选切片。
- **代际边界**（实测）：同代派生 + 少量修正可通过；跨代（1.19.4→1.16.5）必须整套模板重写。
- 1.16.5 是本轮最重的一块，两个加载器的差异都已逐条取证并写进 `notes` 与 `docs/adding-a-version.md` §2.5：
  两边都没有「注册后挂钩」、标签页靠构造期自注册、Forge 侧**该版本编译用 MCP 名而非官方名**。
- 契约新增 `itemGroupSuffix`（可选）：旧版在构造物品时绑定标签页（`Item.Properties#tab`），
  新版在注册后挂钩（`ItemGroupEvents`）。哪一种是适配器数据，引擎不做版本分支。
- lint 新增 `var` 检查：Java 10 以下目标出现 `var` 直接报错——javac 把它报成「找不到符号: 类 var」。
- 验收：109 项测试通过；`fabric-1.16.5` 与 `forge-1.16.5` 生成工程均 **BUILD SUCCESSFUL** 并产出 jar。

## S17 交付物（1.12.2，已完成）

- **先确认上游**：Fabric 无 1.12.2（loader API 返回 400、无 Fabric API 构建）⇒ 该版本只有 Forge 目标。
- `packages/adapters/assets/gradle-4.10.3/`：新增 wrapper 资产（本仓库唯一一个 Gradle 4 目标，
  也是唯一需要 Java 8 守护进程的）。附 `PROVENANCE.md` 说明来源与为何需要。
- `packages/adapters/data/forge-1.12.2.json`：按 1.12 年代重写——`RegistryEvent.Register` 注册、
  setter 式物品配置、`mcmod.info`、`assets/` 下的复数贴图目录、`item.<n>.name` / `tile.<n>.name` 语言键。
- **契约新增两个可选切片**：`lootTable`（1.14+）与 `mineableTag`（1.13+）。
  不声明即跳过，声明则必须成对（lint 强制）。1.12.2 用 `Block#setHarvestLevel` 在代码里表达采集工具。
- **契约修正**：`itemDurabilitySuffix` 模板取代引擎里硬编码的 `.durability(n)`——
  那是 Mojang 1.13+ 的 API 名，1.12.2 是 `.setMaxDamage(n)`。引擎现在不认识任何 MC API 名。
- 工具链取证结论：**ForgeGradle 3（官方 1.12.x MDK 用的就是它，不是 2.3）+ Gradle 4.10.3 + JDK 8**；
  FG6 在该版本挂掉，FG2.3 因 Forge 不再发布 `-userdev.jar` 而无法使用。
- 验收：生成工程 **BUILD SUCCESSFUL** 并产出 jar；全套 113 项测试通过；
  fabric-1.16.5 / forge-1.16.5 复验仍通过（引擎改动无回归）。

## S18 交付物（NeoForge 三目标编译 + 运行验证，已完成）

**动机**：三个 NeoForge 目标长期挂着「已生成，未编译验证」——本机无法访问官方 maven，且事后证明
**编译级验证也不够**：两处缺陷（mods.toml 文件名、loaderVersion 范围）只有真实运行才暴露
（服务器正常启动、mod 从未加载）。本轮把「阻塞」拆成四个可解的子问题逐一消除。

- **环境阻塞解除**（全部写入适配器 `notes` 与 acceptance-report §11.1/§16）：
  - 插件解析只走 ForgeCDN 镜像（`neoforged.forgecdn.net/releases`），官方主机刻意不列入（Gradle 对不可达仓库硬失败）。
  - `net.neoforged:minecraft-dependencies:<mc>` 镜像 404 ⇒ settings.gradle 从 Mojang 版本清单合成等价 POM 到本地仓库，按版本缓存。
  - NFRT 钉版库被 Gradle 升级导致清单缺条目 ⇒ build.gradle `addArtifactsToManifest` 显式补 7 个坐标（`transitive=false`）。
  - 1.20.4：MDG 1.x 硬编码 `--release 21` ⇒ 换 **MDG 2.0.147**；NFRT 要 Java 21 工具链 ⇒ Gradle 守护进程跑 JDK 21、JDK 17 靠注册表探测。
- **运行级验收**：新增 `scripts/verify-runtime.mjs`——生成工程 → 起专用服务器 → 判据为 mod 初始化行 + `Done (`；
  判出 WARN（服务器启动但 mod 未加载）/ FAIL（加载期崩溃）/ SKIPPED（缺工具链）/ TIMEOUT，失败退出码 1。
- **真运行抓出的三处模板缺陷**（编译看不见）：
  - 1.20.4：FML 2.0.17 只扫 `META-INF/mods.toml`（`neoforge.mods.toml` 是 1.21+ 的名字）→ 路径改回 + 回归测试。
  - 1.20.4：`loaderVersion = "[4,)"` 被拒（javafml 语言版本是 2.0，日志 `Missing language javafml ... found 2.0`）→ 改 `"[2,)"` + 回归测试。
  - 1.21.4：1.21.2+ 物品/方块必须带 registry id（运行 NPE `Item id not set`）→ settings 模板补 `.setId(ResourceKey.create(...))` + 回归测试。
- **真编译抓出的缺陷**：1.20.4 数据包目录应为复数 `loot_tables`/`tags/blocks`（单数是 1.21 改动）→ contentPaths 改复数。
- 验收：**3/3 真编译通过 + 3/3 真运行 PASS**（1.20.4 77s / 1.21.1 205s / 1.21.4 43s）；全套 **119 项测试通过**；
  README 目标表、acceptance-report（§1/§11.1/§12/§13/§16）、environment.md 已同步。
