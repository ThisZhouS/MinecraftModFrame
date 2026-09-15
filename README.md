# mcmodkit（工作名）

面向 AI 智能体的 Minecraft 模组开发框架：把「多版本 × 多加载器」的工程知识沉淀为**版本适配数据层**，以 **CLI / MCP / HTTP API** 三个面供 codex、claude、DeepSeek Harness 等智能体调用，从一份 JSON Spec 生成**可编译**的 mod 工程，并按反馈迭代调整。

```
ModSpec (JSON)  ──validate──▶  适配器数据 (版本×加载器)  ──plan──▶  文件计划  ──emit──▶  可构建的 mod 工程
                                        ▲                                              │
                                        └──────── 编译验证（gradlew build）◀───────────┘
```

## 快速开始（CLI）

```bash
pnpm install && pnpm -r build

# 1) 看看支持哪些目标
node packages/cli/dist/index.js list-versions

# 2) 导出一份示例 Spec，然后按需修改
node packages/cli/dist/index.js example -o my-mod.json

# 3) 干跑：先看将要写入哪些文件
node packages/cli/dist/index.js gen my-mod.json -o ./out --dry-run --json

# 4) 真正生成（受管文件可重复覆盖，你自己的文件不会被碰）
node packages/cli/dist/index.js gen my-mod.json -o ./out

# 5) 构建生成的 mod（需要 JDK，首次会联网下载依赖）
cd out/my-mod && ./gradlew build      # Windows: gradlew.bat build
```

## 三个接入面（同一 core，零逻辑复制）

| 面 | 入口 | 典型用途 |
| --- | --- | --- |
| CLI | `packages/cli`（`list-versions` / `adapter` / `example` / `validate` / `gen`） | 智能体一次性调用、人类手动使用；`--json` 统一信封，退出码 0/1/2/3/4/5 语义化 |
| MCP | `packages/mcp-server`（stdio，MCP SDK v2） | 智能体把它作为工具集接入：`list_versions`、`get_adapter`、`validate_spec`、`example_spec`、`scaffold_mod` |
| HTTP API | `packages/api`（`node:http`，默认 127.0.0.1:7420） | 平台集成：`GET /api/versions`、`POST /api/validate`、`POST /api/generate` 等 |

MCP 工具**不执行任何 shell/构建命令**：构建由使用方自行决定，避免把任意命令执行暴露给模型。

## 适配器（版本事实的唯一存放处）

适配器 = 一个 (MC 版本 × 加载器) 的 JSON 数据文件：构建事实（Java/映射/Gradle/插件版本）、文件骨架、注册代码模板、资源路径约定、陷阱注记。**引擎代码不含任何版本分支**。

| 适配器 | MC | 加载器 | Java | 状态 |
| --- | --- | --- | --- | --- |
| `fabric-1.21.1` | 1.21.1 | Fabric (loader 0.19.5) | 21 | ✅ **真编译通过**（产出 jar） |
| `neoforge-1.21.1` | 1.21.1 | NeoForge (21.1.250, ModDevGradle 2.0.147) | 21 | ⚠️ 已生成，**未编译验证**（本机网络无法访问 maven.neoforged.net；证据见验收报告 §6.1） |

新增一个目标 = 新增 `packages/adapters/data/<loader>-<mcVersion>.json`（可用 `mcmod adapter <id> --templates` 参考现有适配器），无需改动引擎。

## 生成的工程长什么样

```
out/my-mod/
├── gradlew / gradlew.bat / gradle/wrapper/…      # 自带 wrapper，脱离本框架也能构建
├── settings.gradle / build.gradle / gradle.properties
├── README.md                                     # 构建/贴图/迭代说明
└── src/main/
    ├── java/com/examplemod/ModMain*.java         # 主类 + 物品/方块注册类
    └── resources/
        ├── fabric.mod.json | META-INF/neoforge.mods.toml, pack.mcmeta
        ├── assets/<ns>/{lang,models,blockstates}
        └── data/<ns>/loot_table/…, data/minecraft/tags/block/…   # 1.21+ 单数目录
```

贴图（16×16 PNG）不生成，生成工程的 README 会明确列出需要自备的文件。

## 仓库结构

| 路径 | 作用 |
| --- | --- |
| `packages/core` | Spec 模型与校验、id 转换、模板渲染、生成计划、落盘、错误码与信封 |
| `packages/adapters` | 适配器数据（`data/`）、二进制资产（`assets/`）、`planProject` 统一规划入口 |
| `packages/cli` · `packages/mcp-server` · `packages/api` | 三个接入面（薄封装，只做 I/O 与协议） |
| `docs/` | 简报、环境、调研、需求、任务、验收报告 |
| `Tree/` | 目录索引文档（`python scripts/update_tree.py . --output Tree` 生成） |

## 文档

- 项目简报与决策记录：`docs/project-brief.md`
- 环境与约束：`docs/environment.md`
- 调研（含版本 × 加载器 API 知识地图）：`docs/research.md` + `docs/research/`
- 需求基线：`docs/requirements.md` · 任务计划：`docs/tasks.md`
- 验收证据（命令、结果、阻塞项、遗留风险）：`docs/acceptance-report.md`

## 状态与边界

- 当前切片：物品 + 方块生成（Java 注册、模型、语言、掉落表、可挖掘标签、创造模式标签）+ 完整工程骨架；Fabric 1.21.1 已通过真实编译验证。
- 尚未实现：配方/进度/实体/附魔/UI(Screen)/datagen 生成、跨版本升级工作流、贴图生成。
- 本机仅 JDK 21 ⇒ 只有 Java 21 目标可本机编译验证；其他版本目标会被明确标注为「仅生成、受限验证」，绝不谎称已验证。

## 许可证

- 本仓库自研代码：MIT。
- 随附的 Gradle wrapper 资产：Apache-2.0（来源与生成方式见 `packages/adapters/assets/gradle-9.5.1/PROVENANCE.md`）。
- 版本事实的取证来源为 CC0 的 `fabric-example-mod` 与各加载器官方文档（见调研文档），模板文本为本项目自写。
