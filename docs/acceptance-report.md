# 验收报告 / Acceptance Report — mcmodkit（首个可编译切片）

> 日期：2026-09-15 · 环境：Windows 11 + Node 24.11.0 + pnpm 11.6.0 + JDK 21.0.11 + Gradle 9.5.1（本地发行版）
> 证据分级：**通过 / 失败 / 阻塞 / 跳过 / 不适用**。低档通过不替代高档；外部条件缺失时记「阻塞」，不假设通过。

## 1. 测试分层与结论

| 层级 | 内容 | 结果 |
| --- | --- | --- |
| L1 静态 | 5 个包 `tsc --noEmit`（build 内置） | ✅ 通过 |
| L2 单元/组件 | core / adapters / cli / mcp-server / api 的 vitest 用例 | ✅ 通过（见 §2） |
| L3 集成（三面） | CLI 端到端生成、MCP stdio JSON-RPC 全链路、HTTP API 端点 | ✅ 通过（见 §3） |
| L4 真编译（Fabric） | 生成工程在 JDK 21 + Gradle 9.5.1 下 build，产出 jar | ✅ 通过（见 §4） |
| L4 真编译（NeoForge） | 同上，目标 neoforge-1.21.1 | ⛔ **阻塞（环境）**：模板未被证伪，网络不可达导致无法完成（证据链见 §6.1） |
| L5 受限项 | wrapper 自动下载发行版、JDK 17/25 目标、跨平台(Linux/macOS) | ⛔ 阻塞 / 跳过（见 §6） |

## 2. L2 单元与组件测试

命令：`pnpm -r test`（工作区根）

| 包 | 用例数 | 覆盖的行为边界 | 结果 |
| --- | --- | --- | --- |
| `@mcmodkit/core` | 14 | Spec 校验与字段级报错、id 风格转换、模板渲染、生成计划（重复 id/路径守卫）、幂等落盘、外来文件不被触碰、错误码信封 | ✅ |
| `@mcmodkit/adapters` | 11 | 适配器加载/校验/lint、资产解析、真实适配器契约（wrapper 资产、单数数据包目录、Java 源码位置、创造模式标签路由）、模板不得硬编码 MC 版本、**所有适配器生成结果零残留占位符**（无法编译验证的适配器的关键防线） | ✅ |
| `@mcmodkit/cli` | 4 | 参数解析、stdin/文件输入、退出码映射、`--json` 信封 | ✅ |
| `@mcmodkit/mcp-server` | 6 | 工具定义与 `callTool` 分发、错误信封 | ✅ |
| `@mcmodkit/api` | 6 | 路由与状态码（200/400/404/500）、信封结构 | ✅ |

最终回归（清理 `Temp/` 后重跑）：**41 passed / 0 failed**（core 14 · adapters 11 · cli 4 · mcp 6 · api 6），`pnpm -r build`（含 `tsc --noEmit`）无错误。

## 3. L3 集成：三个智能体接入面

### 3.1 CLI

| 用例 | 命令 | 期望 | 实际 |
| --- | --- | --- | --- |
| 列出目标 | `node packages/cli/dist/index.js list-versions --json` | 列出 2 个适配器 | ✅ fabric-1.21.1、neoforge-1.21.1 |
| 导出示例 Spec | `... example -o spec.json` | UTF-8 无 BOM 文件 | ✅ |
| 干跑 | `... gen spec.json -o out --dry-run --json` | 返回文件计划、不落盘 | ✅ 26 个文件 |
| 真实生成 | `... gen spec.json -o out --json` | `ok:true`、写入 26 文件 | ✅ |
| 非法 Spec | 同上（id 含非法字符） | 退出码 4 + 字段路径 | ✅ `content.items.0.id` |

### 3.2 MCP（stdio，真实 JSON-RPC 握手）

脚本：`Temp/mcp-smoke.mjs`（一次性脚本）。

| 步骤 | 结果 |
| --- | --- |
| initialize | ✅ 返回 `name=mcmodkit, version=0.1.0` |
| tools/list | ✅ 5 个工具：list_versions / get_adapter / validate_spec / example_spec / scaffold_mod |
| tools/call list_versions | ✅ 返回目标列表信封 |
| tools/call get_adapter | ✅ 返回构建事实（java/mappings/wrapper 版本/资源路径约定） |
| tools/call validate_spec（非法） | ✅ 字段级问题 + 自修复文本 |
| tools/call validate_spec（合法） | ✅ `valid:true` |
| tools/call scaffold_mod（dryRun） | ✅ 26 个文件的计划 |

### 3.3 HTTP API

服务：`MCMODKIT_API_PORT=7431 node packages/api/dist/index.js`（默认 127.0.0.1）。

| 用例 | 结果 |
| --- | --- |
| `GET /health` | ✅ 200 `{name, version, uptimeSec}` |
| `GET /api/versions` | ✅ 200 目标列表 |
| `GET /api/adapters/fabric-1.21.1` | ✅ 200 |
| `POST /api/validate`（正确形状 `{spec}`） | ✅ 200 |
| `POST /api/validate`（裸 spec，缺 `spec` 字段） | ✅ 400 + 明确的期望结构提示 |
| `POST /api/generate`（dryRun） | ✅ 200 + 26 文件计划 |

## 4. L4 真编译验证（Fabric 1.21.1）— 本切片最强证据

被测对象**不是**本仓库代码，而是**框架生成的 mod 工程**：

```
node packages/cli/dist/index.js gen Temp/e2e/spec.json -o Temp/e2e/out --json   # 生成 26 个文件
cd Temp/e2e/out/examplemod
gradle build --console=plain                                                   # Gradle 9.5.1 + JDK 21
```

结果：**BUILD SUCCESSFUL in 29s**，产出 `build/libs/examplemod-1.0.0.jar`（10,917 B）与 `examplemod-1.0.0-sources.jar`（8,618 B）。

jar 内容（`jar tf`）证明资源路径经 Loom 重映射后完好：

- `com/examplemod/ModMain.class`、`ModMainItems.class`、`ModMainBlocks.class`（3 个类编译并通过 remapJar）
- `fabric.mod.json`、`pack.mcmeta`
- `assets/examplemod/{blockstates,models/block,models/item,lang}`
- `data/examplemod/loot_table/blocks/*.json`、`data/minecraft/tags/block/mineable/pickaxe.json`（1.21 单数目录）

构建日志：`Temp/e2e/build3.log`（Temp/ 为临时目录，关键结论已誊录本报告）。

## 5. 本轮发现并修复的缺陷

| # | 现象 | 根因 | 修复 | 复测 |
| --- | --- | --- | --- | --- |
| 1 | 生成工程编译失败：找不到符号 BlockBehaviour | 模板用了 `net.minecraft.world.level.block.BlockBehaviour`，1.21.1 Mojmap 实际在 `...block.state` | 修正 import 并写入适配器 notes | ✅ BUILD SUCCESSFUL |
| 2 | 适配器加载失败：读不到 data/ | `import.meta.url` 层级算错（`../../data/` 指向 packages/data） | 改 `../data/`，src/dist 双态正确 | ✅ adapters 测试通过 |
| 3 | 真实适配器被 lint 拒绝 | lint 直接匹配原始模板，未替换 `{{mainClassSimpleName}}` | lint 先做占位符归一化，并加必需占位符守卫 | ✅ |
| 4 | 注册类写到工程根目录 | 生成器用固定 `{{packagePath}}/` 拼路径 | 改为从适配器 mainClass 路径推导同级目录 | ✅ 三个 Java 文件位置正确 |
| 5 | PowerShell 重定向的 Spec 无法解析 | PS 5.1 输出 UTF-16LE | CLI 新增 `example -o`；加载器识别 UTF-8/UTF-16 BOM | ✅ |
| 6 | API 缺 spec 时错误信息含糊 | 直接把 undefined 交给校验器 | 显式检查并说明期望请求体结构 | ✅ |

## 6. 阻塞 / 跳过 / 不适用

| 项 | 状态 | 原因与影响 |
| --- | --- | --- |
| `gradlew` 自动下载 Gradle 发行版 | ⛔ 阻塞（环境） | 本机 Java 对 services.gradle.org 的 CDN 重定向目标连接超时（curl 可达、Java 不可达）。不影响产物正确性：同一 Gradle 9.5.1 发行版已用于验收；wrapper 四件套由 Gradle 自身 wrapper 任务生成并随工程分发 |
| 浏览器端验证 | ⏭ 跳过 | 本会话无可用浏览器 provider，且本期无 UI |
| MC 1.20.1（Java 17）/ 26.x（Java 25）目标 | ⏭ 跳过 | 本机仅 JDK 21；这些目标只能生成、不能本机编译验证，未纳入本期适配器 |
| Linux/macOS 生成与构建 | ⏭ 跳过 | 本机为 Windows；已用 posix 相对路径 + executable 位标注降低风险，但未实测 |
| NeoForge 1.21.1 真编译 | ⛔ 阻塞（环境） | 见 §6.1：官方 maven `maven.neoforged.net` 在本机被网络阻断（Java SSL 握手被终止），而镜像缺少 ModDevGradle 构建 Minecraft 所需的 `net.neoforged:minecraft-dependencies:1.21.1`（curl 实测 404）。**这是环境阻塞，不是模板缺陷**；同一引擎生成的 Fabric 工程已完整编译通过 |

### 6.1 NeoForge 阻塞的完整证据链（4 次构建尝试）

| 尝试 | 配置 | 结果 | 说明 |
| --- | --- | --- | --- |
| 1 | 官方 maven 在前 | ❌ 插件未找到 | Gradle 访问 `maven.neoforged.net` 得到 SSL reset 后**硬失败**，不再尝试后续仓库 |
| 2 | 镜像在前、官方在后 | ❌ 传递依赖失败 | 插件本体从镜像解析成功；MDG 的 `gradle-idea-ext` 回落到官方 maven → 再次硬失败 |
| 3 | 官方 maven 移到列表最后 | ❌ `neoFormRuntimeExternalTools` 失败 | `net.neoforged:neoform-runtime:2.0.31` 只有 MDG 自注册的仓库能拿到（官方 maven）→ 硬失败 |
| 4 | `dependencyResolutionManagement` + `PREFER_SETTINGS` 强制设置级仓库 | ❌ `minecraft-dependencies` 缺失 | 插件与 neoform-runtime 均从镜像解析成功；但 `net.neoforged:minecraft-dependencies:1.21.1` 在镜像返回 **404**（curl 实测），仅有官方 maven 提供 → 无法构建 Minecraft 工件 |

阻塞结论：**本机无法完成 NeoForge 编译验证**。已确认有效的部分：适配器加载、lint 通过、26 文件生成、插件 id 与各版本号取自官方元数据（ModDevGradle 2.0.147、NeoForge 21.1.250）。**未验证**的部分：NeoForge Java 模板的 API 正确性。因此 `neoforge-1.21.1` 一律标注为「已生成，未编译验证」。

## 7. 遗留风险与缺口

1. **版本漂移**：适配器钉住的版本号（Fabric loader 0.19.5 / API 0.116.17+1.21.1 / Loom 1.17-SNAPSHOT / NeoForge 21.1.250 / MDG 2.0.147）会随上游更新而变旧，需要一条版本巡检工作流（数据源见 docs/research/2026-09-version-api-knowledge.md §2.4）。
2. **贴图缺失**：生成工程可编译、可加载，但物品/方块贴图需用户自备（生成工程的 README 已明确说明）。
3. **覆盖子集有限**：配方、进度、实体、附魔、UI(Screen)、datagen 生成器尚未实现。
4. **未做负面安全测试**：路径逃逸有实现级守卫与单测，但未做模糊测试；MCP/HTTP 面未做鉴权（默认仅监听 loopback）。
5. **Temp/ 下的一次性脚本与验收产物**：`Temp/mcp-smoke.mjs`、`Temp/e2e/**`、`Temp/NetTest.java`、`Temp/tools/gradle-9.5.1`（约 140 MB）阶段结束后应清理；结论已回填本文档。
