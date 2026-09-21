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

本仓库一贯的做法是**先取证再写模板**，三个层次：

| 手段 | 用途 | 本仓库实例 |
| --- | --- | --- |
| `javap` 真实映射 jar | 拿到**类是否存在、方法签名是什么**——这是文档最容易过时、也最容易骗人的地方 | `Screen#renderBackground` 在 1.20.1 收 `(GuiGraphics)`、1.21.x 收 `(GuiGraphics,int,int,float)`，两版分叉进各自模板 |
| 读 **jar 内原版数据** | 拿到**数据包 JSON 的方言**——`gradle build` 完全不校验 JSON 语义，文档也常滞后 | 1.21 把物品栈键从 `item` 改成 `id`、物品谓词拍平成字符串、目录 `recipes/`→`recipe/`；共发现并修复 4 处 |
| 官方示例 / 文档 | 拿到**构建事实**（插件版本、Gradle/JDK 约束、仓库地址） | `fabric-example-mod`（CC0）、各加载器官网 |

**判断标准**：任何「我记得是这样」的版本事实，都必须落到上面某一种证据上，否则写进 `notes` 时标注为未取证。

## 2. 复制一份现有适配器

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
