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
| S4b 真实适配器 | NeoForge 1.21.1：适配器数据与生成已完成；真编译因网络阻塞未完成 | S4 | 同上 | ⛔ 生成 ✅ / 编译验证阻塞 |
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
| 版本 API 漂移（1.21.x 持续破坏性变更） | 模板过期 | 适配器数据 + 编译级验收；每个适配器带 `notes` 陷阱注记 |
| 本机仅预装 JDK 21 | 1.20.1（Java 17）原本无法本机编译 | 实测可通过 `api.adoptium.net` 取得 Temurin JDK 17 ⇒ **1.20.1 已编译验证**；26.x（Java 25）仍为「仅生成、受限验证」 |
| 首次构建需联网（Gradle/Loom/Minecraft） | 离线环境无法构建 | 生成阶段零网络；README 明示首次构建需联网；wrapper 随工程分发 |
| 本机 Java 对部分 CDN 直连不稳定 | wrapper 自动下载发行版可能失败 | 验收使用本地已解压的 Gradle 发行版；把该环境限制写入 docs/environment.md |
| 适配器 schema 演进 | 旧数据失效 | `schemaVersion` + 加载期校验与可读报错 |
