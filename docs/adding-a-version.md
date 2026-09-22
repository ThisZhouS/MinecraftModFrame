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
