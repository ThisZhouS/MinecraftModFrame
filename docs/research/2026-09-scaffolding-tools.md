# Minecraft 模组脚手架工具研究报告(2024–2026 现状)

- **调查时点**:2026-09(所有仓库元数据、Maven/发布渠道数据均为本次会话实时抓取的快照)
- **方法**:GitHub REST API、官方发行渠道(files.minecraftforge.net、NeoForgeMDKs、meta.fabricmc.net、maven.quiltmc.org、plugins.gradle.org)、官方文档/README 全文、公开检索
- **标注约定**:✅ = 本次已直接验证(附来源);⚠️ = 基于证据的推断或生态常识,未逐一验证;❗ = 对任务书前提的纠正
- **存档**:本报告同步保存于 `E:\MCMOD\mod-scaffolding-research-2026-09.md`

---

## TL;DR

1. **没有任何主流脚手架提供官方 CLI/API**。对 agent 框架,正确路径是:自持模板(以 CC0 蓝本合法内嵌)+ 组合现成 Gradle 插件 + 运行时查询机器可读的版本元数据(meta.fabricmc.net、promotions_slim.json 等)。
2. 模板层可直接复用的蓝本:**fabric-example-mod(CC0)**、**MultiLoader-Template(CC0)**、**NeoForgeMDKs(GitHub template 仓库矩阵)**;Forge MDK 为 zip 分发,再分发需注意其自定义许可。
3. 构建插件矩阵:Fabric→**Loom**(MIT);NeoForge→**ModDevGradle**(仅支持 NeoForge >21.0.x + Vanilla 模式);Forge→**ForgeGradle**(最新 7.0.40);legacy/长尾 loader→**Unimined**;单项目多版本→**Stonecutter** 或 **ReplayMod preprocessor**。
4. Java 矩阵(官方):≤1.16.5→Java 8;1.17→16(生态惯用 17);1.18–1.20.4→17;1.20.5–1.21.11→21;26.x→25。❗"Forge 止于 1.20.1"**不成立**:Forge 2023 年分叉期短暂停更后已恢复,当前发版至 MC 26.2(promotions 覆盖 116 个 MC 版本);真正分水岭是 **1.20.2 起 NeoForge 引入 breaking changes,两者 API 不再互通**。

---

## 1. MCreator

**定位/解决的问题**:面向零编程/低编程用户的开源可视化 mod 制作器(Blockly 式流程图),通过"生成器(generator)"把可视化元素翻译为 Java 版 mod(按 loader)、Data Packs、Resource Packs 与 Bedrock Add-Ons [S1]。

| 维度 | 结论 |
|---|---|
| License | **GPL-3.0**(LICENSE.txt 为 GPLv3 正文,附带自定义"特别例外"条款,例外范围未逐条核验 ⚠️)[S2] |
| 维护活跃度 | 非常活跃:最新 release **2026.2.33518**(2026-08-14)[S3];repo pushed 2026-09-14,★1196 [S1] |
| 支持矩阵 | 官方 download/all:MCreator 2026.2 → "For **NeoForge 26.1.2/1.21.1**, Data Packs 26.1.x/1.21.1, Resource Packs 26.1.x/1.21.1, and Bedrock Edition 26.x" [S5];每个 MCreator 版本只绑定特定 MC/loader 组合,旧 MC 需用旧版 MCreator [S5] |
| 扩展性 | 官方插件系统:可添加"新 generator 类型、procedure blocks、AI tasks、API 支持";generator 级插件用 Java 编写 [S4] |
| Headless/CLI | **未发现任何官方受支持的 headless/CLI 工作流**(全站检索无 CLI 文档)⚠️;存在社区讨论启动参数的论坛帖(内容被 Cloudflare 拦截,未能核实)[S7];其构建底层确为 Gradle(独立 gradle home `~/.mcreator/gradle`)[S6],理论上可绕过 GUI 手工跑 gradle,但**工作区创建与生成器逻辑封闭在 GUI 应用内** ⚠️ |
| agent 可用性 | **低**。GUI-first、无公开 CLI/API、GPL-3.0 传染、生成代码面向其模板体系难以二次工程化 |
| 集成成本 | 高(需驱动 GUI 或逆向其工作区格式);**可复用代码潜力:≈0** |

## 2. Fabric 模板体系(fabric-example-mod + fabricmc.net 模板生成器)

**定位**:官方最低可用起点——预配置好的 Gradle 项目骨架。

- **fabric-example-mod**:License **CC0-1.0**(README 原文 "This template is available under the CC0 license")✅ [S8];**按 MC 版本开分支**(1.14.4、1.15.x…1.21.x、26.x,共数十个分支)✅ [S8];★2350,pushed 2026-09-12 ✅;布局为标准单模块 Gradle 项目(`build.gradle`、`gradle.properties`、`src/main/java`、`src/main/resources` + `fabric.mod.json`)⚠️(常规结构,未逐行核验)。
- **fabricmc.net/develop/template/**:官方 Web 表单生成器("Use this tool to generate a customised template mod project, this is similar to the pre-configured fabric-example-mod")✅ [S9];官方文档 *Creating a Project* 以它为推荐入口 ✅ [S10]。
- **可编程复用**:生成器是**网页表单→zip,无公开 CLI/API** ✅;但产物本身是极小的 Gradle 骨架,且 CC0 允许无署名、无限制地**把模板直接内嵌进 agent 代码库**——用 TS 模板引擎重写成本极低。**复用潜力:最高**;集成成本:低。

## 3. Forge MDK / NeoForge MDK

**定位**:各 loader 官方的"可编译起步工程"。

- **Forge MDK**:经 **files.minecraftforge.net** 每个 MC 版本页面分发 zip(页面含 Installer / Changelog / **Mdk** 按钮)✅ [S11–S13];如 1.20.1 最新 47.4.23 ✅ [S11]。Forge 仓库 License 为自定义(GitHub 标记 **NOASSERTION**,实质为 LGPL-2.1 + 附加例外条款)✅ [S43];MDK zip 内许可条款未直接核验 ⚠️。
- **NeoForge MDK**:GitHub org **NeoForgeMDKs** 按 **(MC 版本 × 构建插件)** 出模板仓库:`MDK-26.2-NeoGradle`、`MDK-26.2-ModDevGradle`、`MDK-26.1.2-*`、`MDK-1.21.11-ModDevGradle`…全部为 **GitHub template 仓库**、由"NeoForge mod generator"生成、声明不接受 PR;pushed 2026-09-13 ✅ [S15];仓库 License 均未标注(NOASSERTION)✅(元数据)。NeoForge 本体 **LGPL-2.1**,pushed 2026-09-14,★2061 ✅ [S16]。
- **可编程复用**:NeoForgeMDKs 是 **git clone/模板即用** 的官方渠道,最接近"可编程复用";Forge MDK 可运行时下载解包(注意许可与再分发 ⚠️)。**复用潜力:高**;集成成本:低-中。

## 4. Architectury(Plugin + API)与 MultiLoader-Template(多 loader)

两条不同哲学的路线:

- **Architectury Plugin**(MIT,pushed 2026-09-14)✅ [S18]:Gradle 插件,建立 `common` + 各 loader 子项目;机制(README 原文):loader 模块依赖"transformed version of common, which is shaded afterwards",并**自动生成 fake mod** 以正确类加载;资产放 common;平台差异用 **`@ExpectPlatform`**(仅静态方法)注解做编译期分派;配有 IntelliJ 插件 ✅ [S18]。
- **Architectury API**(LGPL-3.0,pushed 2026-09-11)✅ [S19]:跨 loader 的统一运行时 API(事件/注册/界面等抽象)。
- **MultiLoader-Template(jaredlll08)**(**CC0-1.0**,★758,pushed 2026-06-16)✅ [S20]:README 原文:"compile Minecraft mods for multiple modloaders using a common project for the sources. **This project does not require any third party libraries or dependencies**"——即**纯构建布局、零运行时依赖**(与 Architectury 的核心差异);当前形态为 **NeoForge + Fabric + Common source set** ✅ [S20];配置集中于 `gradle.properties` ✅;当前(26.x 时代)要求 **Java 25** ✅ [S20]。
- **agent 视角**:MultiLoader 布局对程序化生成更友好(模板即成品,无运行时库耦合);Architectury 适合"一份源码多 loader 运行",但引入学习/依赖/注解处理器成本,且对 agent 是黑盒约定 ⚠️。**复用潜力:两者都高(MultiLoader 可直接内嵌;Architectury 只组合不复制)**。

## 5. 多版本策略:Stonecutter 与 preprocessor 系

- **Stonecutter**(`dev.kikugie.stonecutter`):"Modern Gradle plugin for multi-version development" ✅ [S23];Codeberg 仓库自我描述:"**File preprocessing Gradle plugin allowing developers to support multiple runtime environments from a single source**" ✅ [S21];主仓库已迁 **Codeberg**(GitHub 镜像 stonecutter-versioning/stonecutter,LGPL-3.0,停留在 2025-12-25)✅ [S21][S46];Gradle Plugin Portal 最新 **0.9.8**,Codeberg **0.10 分支**在开发 ✅ [S22];Codeberg updated 2026-09-14,活跃 ✅ [S21]。
  - **机制**(❗纠正任务书表述):**不是 git 分支/cherry-pick 工作流**,而是"**每个 MC 版本 = `versions/<v>` 子项目**"(JetBrains YouTrack issue 原话:"Stonecutter makes each version a subproject of the root build")[S24] + 源码预处理;社区模板展示 `versions/` 目录结构 [S25];常与 **ModStitch** 预处理抽象搭配使用 ⚠️ [S26]。代价:IDE 同步仍有已知问题(YouTrack)[S24]。
- **ReplayMod/preprocessor**(**GPL-3.0**,pushed 2026-07-07,★96)✅ [S27]:JCP 风格注释指令(`//#if MC>=11200`)的 **Java+Kotlin 源码预处理器** ✅ [S27];ReplayMod 以"单源码树 + 预处理"同时支持多个 MC 版本 ✅ [S27]。
- **对比**:preprocessor = 单源码树、侵入源码注释;Stonecutter = 版本化子项目 + 预处理,工程化更好但复杂度更高 ⚠️。**对 agent**:两者都是"单项目多版本"策略,与"按 (MC×loader) 生成完整独立项目"的模型正交;若任务模型就是逐组合生成,自建矩阵更简单;若要单仓库覆盖多版本,可在模板中直接写预处理指令。**复用潜力:中(GPL-3.0 的 preprocessor 不可嵌入闭源工具,只能作为外部 Gradle 插件调用)**。

## 6. 现代 Gradle 构建插件

| 插件 | License | 支持范围(本次核验) | 活跃度(2026-09) |
|---|---|---|---|
| **Fabric Loom** [S28] | **MIT** ✅ | Fabric 工具链事实标准;Fabric meta 覆盖 **526 个 game versions(1.14+ → 26.3-rc)** ✅ [S37] | maven 上 1.x 版本 156 个;tags 至 **v1.18.0-alpha.21** ✅ [S28][S29];pushed 2026-09-05 |
| **ModDevGradle(MDG)** [S30] | **LGPL-2.1** ✅ | **仅 NeoForge**(README:"We currently only support NeoForge versions later than 21.0.x")+ **Vanilla 模式**(NeoForm)✅;portal 无 legacy-Forge 伴生插件(404)✅ [S32] | portal 最新 **2.0.147** ✅ [S31];pushed 2026-09-14,★111 |
| **ForgeGradle** [S34] | **LGPL-2.1** ✅ | Forge 全历史;**FG6** 为 1.20.x/1.21.x 时代主力 ⚠️,portal 最新 **Version 7.0.40**(FG7,26.x 时代)✅ [S33] | pushed 2026-09-11,★574 |
| **Unimined** [S35] | **LGPL-2.1** ✅ | **覆盖面最广**:Fabric、Quilt、Forge、NeoForge、Cleanroom、Flint、Rift、FoxLoader、LiteLoader、CraftBukkit/Spigot/Paper、Risugami's ModLoader、裸 jarmodding,主打 **legacy 环境** ✅(README) | tags 最新 **1.4.1**;明确 **LTS 分支策略**(始终维护上一 minor)✅;pushed 2026-08-14,★121 |

**选型含义** ⚠️:Fabric→Loom;NeoForge(1.21+)→MDG(NeoGradle 仍存在于 MDK 模板 [S15]);Forge(1.20.4–26.x)→ForgeGradle 6/7;legacy/长尾 loader→Unimined;多版本叠加→Stonecutter。这些插件都是**声明式 Gradle DSL,只能作为构建插件组合使用,不能作为库从 Node 调用**——agent 的工作是"写对 build 文件 + 调 gradle 进程"。

## 7. Java 版本要求与 Loader 支持矩阵

**Java 官方最低要求**(minecraft.wiki *Tutorial:Update Java*)✅ [S36]:

| MC 版本区间 | 官方最低 Java | mod 开发 toolchain 惯例 ⚠️ |
|---|---|---|
| 1.12 – 1.16.5(至 21w18a) | **Java 8**(1.16.5 曾锁 8u51,已修复) | 8(11 为部分社区选择) |
| 1.17(21w19a)– 1.17.1(1.18 pre-1) | **Java 16** | 17(生态工具链以 17 为主) |
| 1.18(pre-2)– 1.20.4 | **Java 17** | 17 |
| 1.20.5(24w13a)– 1.21.11 | **Java 21** | 21 |
| 26.x(新版本号方案) | **Java 25**(wiki "Java 25 or newer") | 25(MultiLoader-Template README 要求 Java 25 佐证 [S20]) |

❗与任务书的差异:1.17 官方最低是 **16**(不是 17,但 mod 生态普遍直接用 17);1.16.5 最低是 **8**(11 只是社区常见替代)。

**Loader × MC 版本矩阵**(本次核验):

| Loader | 覆盖范围 | 关键事实 |
|---|---|---|
| **Forge** | **1.1 → 26.2 全线** | promotions_slim.json 含 **116 个 MC 版本**(含 1.20.2/48.1.0、1.20.3、1.20.4/49.2.8、1.20.6、1.21.x 系列、26.1.x、26.2-recommended)✅ [S14];1.20.1 最新 47.4.23 ✅ [S11]。❗"Forge 止于 1.20.1"是过时说法:2023 年 NeoForge 分叉期间 Forge 曾停更于 1.20.1 ⚠️ [S44],随后恢复发版并延续至今 |
| **NeoForge** | **1.20.1 → 26.x 连续** | 1.20.1 = 47.1.x(与 Forge 二进制兼容);**1.20.2 起 API breaking**,二者从此不互通 ⚠️ [S44];当前 "NeoForge 21.11 for Minecraft 1.21.11",26.1 snapshot 已有早期构建 ✅ [S17];MDK 模板覆盖 1.21.10/1.21.11/26.1.x/26.2 ✅ [S15] |
| **Fabric** | **1.14+ → 26.3 snapshot** | meta **526 个 game versions**,最新 26.3-rc-3 ✅ [S37];loader 最新 0.19.5 ✅ [S38] |
| **Quilt** | **1.14.4 → 26.3-pre**(loader 层) | meta 436 个 game versions ✅ [S39];quilt-loader 最新 **0.31.0-beta.4**(共 307 个版本)✅ [S40];官方开发博客停在 2024-07(0.26.0 时代)✅ [S42];QSL/QFAPI 生态滞后 ⚠️;loader 仍在发 beta 但整体处于**低活跃维护**(推断 ⚠️);兼容运行 Fabric mod(QFAPI)✅ [S42] |
| 其他 | 长尾 | Cleanroom/Flint/Rift/FoxLoader/LiteLoader/Bukkit 系等仅 Unimined 一类通用工具覆盖 ✅ [S35] |

---

## (a) 横向对比表

| 工具 | 类型 | 解决的问题 | License | 活跃度(2026-09 快照) | agent 可编程复用(CLI/API) | 集成成本 | 可复用代码潜力 |
|---|---|---|---|---|---|---|---|
| **MCreator** | GUI 生成器 | 可视化做 mod,生成 Java/Bedrock 代码 | GPL-3.0(+例外)✅ | release 2026.2(2026-08)✅ | ❌ 无官方 CLI/headless ⚠️ | 高 | ≈0 |
| **fabric-example-mod** | 模板仓库 | Fabric 起步骨架 | **CC0-1.0** ✅ | pushed 09-12,分支覆盖全 MC ✅ | 模板直接内嵌;无 API | 低 | **高** |
| **fabricmc.net 模板生成器** | Web 表单 | 在线定制生成模板 zip | 未标注(服务)⚠️ | 在线可用 ✅ | ❌ 无 API;产物=example-mod 实例 | 低 | 中(参考其参数矩阵) |
| **Forge MDK** | zip 模板 | Forge 起步工程 | 自定义(NOASSERTION)✅/⚠️ | 随 Forge 持续发版 ✅ | 运行时下载解包可行 ⚠️ | 中(许可注意) | 中 |
| **NeoForgeMDKs** | GitHub 模板矩阵 | 每 (MC×构建插件) 一个模板仓 | 未标注(NOASSERTION)✅ | pushed 09-13,覆盖 1.21.x–26.2 ✅ | clone/template 即用 | 低 | **高** |
| **Architectury Plugin/API** | Gradle 插件 + 运行时 API | 一份源码多 loader(变换+shade+@ExpectPlatform) | MIT / LGPL-3.0 ✅ | pushed 09-14 / 09-11 ✅ | 仅作构建插件组合;无独立 CLI | 中-高(学习+依赖) | 中(组合使用) |
| **MultiLoader-Template** | 模板仓库 | 零依赖多 loader 布局(common + fabric + neoforge) | **CC0-1.0** ✅ | pushed 2026-06,Java 25 时代 ✅ | 模板直接内嵌 | 低 | **高** |
| **Stonecutter** | Gradle 插件 | 单项目多 MC 版本(versions/<v> 子项目+预处理) | LGPL-3.0 ✅(镜像) | Codeberg updated 09-14;portal 0.9.8/0.10 ✅ | 仅 Gradle DSL;无 CLI | 中-高 | 中 |
| **ReplayMod preprocessor** | Gradle 插件 | JCP 式 `//#if MC>=…` 多版本源码预处理 | **GPL-3.0** ✅ | pushed 2026-07 ✅ | 仅 Gradle 插件;不可嵌入闭源 ⚠️ | 中 | 中(外部调用) |
| **ModDevGradle** | Gradle 插件 | NeoForge(+Vanilla)现代开发环境 | LGPL-2.1 ✅ | portal 2.0.147;pushed 09-14 ✅ | 仅 Gradle DSL | 低(单 loader 项目) | 中(作为组合件) |
| **Unimined** | Gradle 插件 | 统一环境,legacy/长尾 loader 全覆盖 | LGPL-2.1 ✅ | tags 1.4.1;pushed 08-14 ✅ | 仅 Gradle DSL | 中(文档在仓库内) | 中 |
| **Fabric Loom** | Gradle 插件 | Fabric 开发环境标准 | **MIT** ✅ | 1.18.0-alpha 线;pushed 09-05 ✅ | 仅 Gradle DSL | 低 | 中 |
| **ForgeGradle** | Gradle 插件 | Forge 开发环境(FG6/FG7) | LGPL-2.1 ✅ | portal 7.0.40;pushed 09-11 ✅ | 仅 Gradle DSL | 低 | 中 |

## (b) 对 TypeScript/Node agent 框架的建议(按 (MC 版本 × loader) 生成完整 Gradle 项目)

**结论:复用模板蓝本 + 组合现成 Gradle 插件;不必"从零造构建逻辑",也不能依赖任何脚手架的 CLI(均不存在或不完整)。**

推荐三层架构:

1. **知识层(版本兼容数据库,TS 维护)**:MC↔Java toolchain↔loader↔Gradle 插件版本↔mappings 的映射表。运行时校准数据源全部机器可读:
   - `meta.fabricmc.net/v2/versions/game|loader`(JSON)✅ [S37][S38]
   - `files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json`(JSON)✅ [S14]
   - `maven.neoforged.net` / `maven.minecraftforge.net` / `maven.quiltmc.org` 的 maven-metadata(XML)✅(quilt 已验证 [S40];neoforge 本次抓取网络失败,未验证 ⚠️)
2. **生成层(TS 模板引擎,EJS/Handlebars 渲染项目树)**:
   - Fabric:以 **fabric-example-mod(CC0)为蓝本直接内嵌** [S8];构建插件用 Loom。
   - NeoForge:以 **NeoForgeMDKs 模板为蓝本**(git clone 为种子或照其结构重生成)[S15];构建插件 ModDevGradle(NeoForge >21.0.x)或 NeoGradle(模板所含)。
   - Forge:运行时下载 Forge MDK zip 解包改写,**或仿其 build.gradle 自行生成**(规避再分发疑虑)⚠️ [S11]。
   - 多 loader:采用 **MultiLoader-Template(CC0)的 common+fabric+neoforge 布局**内嵌为参数化模板 [S20];仅当用户确需运行时统一 API 时才引入 Architectury。
   - 多版本(单仓多 MC):整包引入 **Stonecutter**(`dev.kikugie.stonecutter`)到生成的 settings/build 脚本中,模板里写好 `versions/` 结构;更轻量场景用 ReplayMod preprocessor(注意 GPL 只约束该插件本身,不约束你的生成器,但生成项目将依赖 GPL 工具链 ⚠️)。
3. **构建验证层**:生成后调用 `gradlew build`(进程调用)。JDK 8/16/17/21/25 矩阵用 **Gradle toolchain + foojay resolver** 自动供给,agent 端无需自装多套 JDK ⚠️(Gradle 生态常规做法)。agent 全程只需要 Node + JDK 一个,无任何 Java 侧 SDK 依赖。

**明确不建议**:MCreator(无 CLI、GPL、GUI-first);fabricmc.net 生成器当 API 用(没有 API)。

**复用 vs 从零的量化判断**:模板文件本体极小(每个骨架 <1k 行),**"以 CC0 蓝本 + 自研 TS 参数化模板"优于"运行时抓取/调用任何脚手架"**;真正的工作量在 (MC×loader) 参数矩阵的维护与生成后构建验证,而非模板本身。预估集成成本:数天级;每新增 (MC×loader) 组合主要是知识层参数更新。

## (c) 来源(按主张对应)

**MCreator**:S1 https://github.com/MCreator/MCreator(元数据/活跃度);S2 https://raw.githubusercontent.com/MCreator/MCreator/master/LICENSE.txt(GPLv3+例外);S3 https://api.github.com/repos/MCreator/MCreator/releases/latest(2026.2.33518);S4 https://mcreator.net/plugins(插件能力);S5 https://mcreator.net/download/all(2026.2 支持矩阵);S6 https://mcreator.net/wiki/gradle-setup-errors(~/.mcreator/gradle);S7 https://mcreator.net/forum/100763/command-line-arguments-mcreator(CLI 讨论,CF 拦截)

**Fabric**:S8 https://github.com/FabricMC/fabric-example-mod(CC0/分支/活跃);S9 https://fabricmc.net/develop/template/(生成器);S10 https://docs.fabricmc.net/develop/getting-started/creating-a-project(官方文档)

**Forge/NeoForge MDK**:S11 https://files.minecraftforge.net/net/minecraftforge/forge/index_1.20.1.html;S12 …/index_1.20.2.html(48.1.0);S13 …/index_1.20.4.html(49.2.8);S14 https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json(116 版本);S15 https://github.com/NeoForgeMDKs(模板矩阵);S16 https://github.com/neoforged/NeoForge(LGPL-2.1);S17 https://neoforged.net/(21.11/26.1 snapshot);S43 https://github.com/MinecraftForge/MinecraftForge(NOASSERTION)

**多 loader**:S18 https://github.com/architectury/architectury-plugin(MIT/机制);S19 https://github.com/architectury/architectury-api(LGPL-3.0);S20 https://github.com/jaredlll08/MultiLoader-Template(CC0/README/Java 25)

**多版本**:S21 https://codeberg.org/stonecutter/stonecutter(迁址/描述/活跃);S22 https://plugins.gradle.org/plugin/dev.kikugie.stonecutter(0.9.8);S23 https://stonecutter.kikugie.dev/(文档);S24 https://youtrack.jetbrains.com/projects/IDEA/issues/IDEA-392558(versions 子项目);S25 https://github.com/rotgruengelb/stonecutter-mod-template(目录示例);S26 https://www.youtube.com/watch?v=OSoXOs6vQTM(ModStitch);S27 https://github.com/ReplayMod/preprocessor(GPL-3.0/JCP);S46 https://github.com/stonecutter-versioning/stonecutter(旧镜像)

**Gradle 插件**:S28 https://github.com/fabricmc/fabric-loom(MIT/tags);S29 https://maven.fabricmc.net/net/fabricmc/fabric-loom/(版本数);S30 https://github.com/neoforged/ModDevGradle(LGPL-2.1/支持范围);S31 https://plugins.gradle.org/plugin/net.neoforged.moddev(2.0.147);S32 https://plugins.gradle.org/plugin/net.neoforged.moddev.legacy(404);S33 https://plugins.gradle.org/plugin/net.minecraftforge.gradle(7.0.40);S34 https://github.com/minecraftforge/forgegradle(LGPL-2.1);S35 https://github.com/unimined/unimined(LGPL-2.1/loader 清单/LTS);S45 https://projects.neoforged.net/neoforged/moddevgradle(License 页)

**Java 与矩阵**:S36 https://minecraft.wiki/w/Tutorial:Update_Java(Java 表);S37 https://meta.fabricmc.net/v2/versions/game(526);S38 https://meta.fabricmc.net/v2/versions/loader(0.19.5);S39 https://meta.quiltmc.org/v3/versions/game(436);S40 https://maven.quiltmc.org/repository/release/org/quiltmc/quilt-loader/maven-metadata.xml(0.31.0-beta.4);S41 https://github.com/QuiltMC/quilt-loader(Apache-2.0);S42 https://quiltmc.org/en/blog/2024-07-02-quilt-update/(0.26 时代);S44 https://www.reddit.com/r/feedthebeast/comments/17kitw5/(分叉叙事,佐证性来源)
