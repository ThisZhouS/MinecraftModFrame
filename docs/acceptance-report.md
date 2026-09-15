# 验收报告 / Acceptance Report — mcmodkit（首个可编译切片）

> 日期：2026-09-15 · 环境：Windows 11 + Node 24.11.0 + pnpm 11.6.0 + JDK 21.0.11 / JDK 17.0.20.1 · Gradle 9.5.1（Fabric 线）/ 8.8（Forge 线）
> 证据分级：**通过 / 失败 / 阻塞 / 跳过 / 不适用**。低档通过不替代高档；外部条件缺失时记「阻塞」，不假设通过。

## 1. 测试分层与结论

| 层级 | 内容 | 结果 |
| --- | --- | --- |
| L1 静态 | 5 个包 `tsc`（build 内置） | ✅ 通过 |
| L2 单元/组件 | core / adapters / cli / mcp-server / api 的 vitest 用例 | ✅ 41 passed（见 §2） |
| L3 集成（三面） | CLI 端到端生成、MCP stdio JSON-RPC 全链路、HTTP API 端点 | ✅ 通过（见 §3） |
| L4 真编译 | 生成工程在目标 JDK + Gradle 下 `build` 并产出 jar | ✅ **Fabric 1.21.1**、✅ **Forge 1.20.1**；⛔ NeoForge 1.21.1（网络阻塞，见 §7.1） |
| L5 一键复验 | `scripts/verify-build.mjs` 按适配器声明的 Gradle/JDK 线自动复跑编译 | ✅ 已交付（见 §8） |

## 2. L2 单元与组件测试

命令：`pnpm -r test`

| 包 | 用例数 | 覆盖的行为边界 | 结果 |
| --- | --- | --- | --- |
| `@mcmodkit/core` | 14 | Spec 校验与字段级报错、id 风格转换、模板渲染、生成计划（重复 id/路径守卫）、幂等落盘、外来文件不被触碰、错误码信封 | ✅ |
| `@mcmodkit/adapters` | 11 | 适配器加载/校验/lint、资产解析、真实适配器契约、模板不得硬编码 MC 版本、**所有适配器生成结果零残留占位符** | ✅ |
| `@mcmodkit/cli` | 4 | 参数解析、stdin/文件输入、退出码映射、`--json` 信封 | ✅ |
| `@mcmodkit/mcp-server` | 6 | 工具定义与 `callTool` 分发、错误信封 | ✅ |
| `@mcmodkit/api` | 6 | 路由与状态码（200/400/404/500）、信封结构 | ✅ |

合计 **41 passed / 0 failed**。适配器 hygiene 测试在本次迭代中**两次拦截真实缺陷**：Forge 模板注释里写死了 `1.20.1`（违反「版本事实只存于数据层」），已改为不含版本字面量的表述。

## 3. L3 集成：三个智能体接入面

| 面 | 用例 | 实际结果 |
| --- | --- | --- |
| CLI | `list-versions` | ✅ 3 个目标：fabric-1.21.1、neoforge-1.21.1、forge-1.20.1 |
| CLI | `example -o spec.json` | ✅ UTF-8 无 BOM |
| CLI | `validate spec.json` | ✅ `valid:true`；非法 Spec → 退出码 4 + 字段路径 |
| CLI | `gen spec.json -o out --dry-run --json` | ✅ 返回 26 文件计划、不落盘 |
| CLI | `gen ... --json` | ✅ 三个适配器各写入 26 个文件 |
| CLI | `adapter forge-1.20.1 --json` | ✅ 返回构建事实（java 17 / Mojmap / wrapper 8.8 / 注记） |
| MCP | `initialize` / `tools/list` | ✅ `mcmodkit 0.1.0`；5 个工具 |
| MCP | `list_versions` / `get_adapter` / `validate_spec`(±) / `scaffold_mod`(dryRun) | ✅ 全部返回信封，26 文件计划 |
| HTTP | `GET /health`、`/api/versions`、`/api/adapters/*` | ✅ 200 |
| HTTP | `POST /api/validate`（±形状）、`POST /api/generate`(dryRun) | ✅ 200 / 400 + 明确提示 |

## 4. L4 真编译（一）：Fabric 1.21.1

```
node packages/cli/dist/index.js gen Temp/e2e/spec.json -o Temp/e2e/out --json   # 26 个文件
cd Temp/e2e/out/examplemod && gradle build --console=plain                     # Gradle 9.5.1 + JDK 21
```

结果：**BUILD SUCCESSFUL in 29s**；`examplemod-1.0.0.jar`（10,917 B）+ sources jar。jar 内：`com/examplemod/{ModMain,ModMainItems,ModMainBlocks}.class`、`assets/examplemod/{blockstates,models,lang}`、`data/examplemod/loot_table/blocks/*.json`（**单数**）、`data/minecraft/tags/block/mineable/pickaxe.json`（**单数**）、`fabric.mod.json`、`pack.mcmeta`。

## 5. L4 真编译（二）：Forge 1.20.1 —— 本轮新增，事实最强证据

工具链：**Temurin JDK 17.0.20.1**（`api.adoptium.net` 下载）+ **Gradle 8.8**（ForgeGradle 6 不兼容 Gradle 9）+ 官方 47.4.10 MDK 事实。

```
node packages/cli/dist/index.js gen Temp/forge/spec.json -o Temp/forge/out --json   # 26 个文件
cd Temp/forge/out/examplemod
$env:JAVA_HOME=<temurin-17>; gradle build --console=plain --no-daemon
```

结果：**BUILD SUCCESSFUL in 49s**（首次构建 9m38s，含整套 MCP 反编译流水线：downloadClient/Server → mergeMappings → rename → decompile → patch → recompile → reobfJar）。

| 证据 | 内容 |
| --- | --- |
| 产物 | `build/libs/examplemod-1.0.0.jar`（11,955 B），零编译告警 |
| 类 | `com/examplemod/{ModMain,ModMainBlocks,ModMainItems}.class`（**经 `reobfJar` 重混淆**后） |
| 元数据 | `META-INF/mods.toml`、`pack.mcmeta`（pack_format 15） |
| 数据包路径 | `data/examplemod/loot_tables/blocks/*.json`、`data/minecraft/tags/blocks/mineable/pickaxe.json`（**复数**，1.20.1 约定） |
| 资源 | `assets/examplemod/{blockstates,models/block,models/item,lang}` |

**同一引擎、同一份 Spec、两个版本线，产出两种目录约定**（1.21.1 单数 vs 1.20.1 复数），两者的 jar 均已由真实编译器验证 —— 这正是「版本差异数据化」这条核心原则的端到端证据。

### 5.1 本轮由真实编译发现并修复的缺陷

| # | 现象 | 根因 | 修复 | 复测 |
| --- | --- | --- | --- | --- |
| 1 | `找不到符号 ItemLike`（循环变量与 TAB_ENTRIES 声明） | Forge 模板 import 写成 `net.minecraft.world.item.ItemLike`；实测该包在 **1.20.1 与 1.21.1 均不存在** | 改为 `net.minecraft.world.level.ItemLike`（与 Fabric/NeoForge 适配器一致），并把「`javap` 双版本取证」写入注记 | ✅ BUILD SUCCESSFUL，0 错误 |
| 2 | 分组物品引用了未导入的 `CreativeModeTabs` | `itemRegistrationGroup` 模板产出 `CreativeModeTabs.*`，注册类模板缺该 import | 补 import（未使用只是告警，不影响编译） | ✅ |
| 3 | `ResourceLocation(String,String)` 弃用告警 | 1.20.1 Mojmap 标记该构造器为 `forRemoval` | 改用 `ResourceLocation.fromNamespaceAndPath(...)`（`javap` 确认 1.20.1 存在），告警归零 | ✅ 无告警 |

取证方法：对**真实映射后的 jar** 跑 `javap`，而不是凭记忆下结论 —— 本轮的 `ItemLike` 结论最初也被我自己误判为「1.20.5 迁移」，是 `javap` 纠正了它。

## 6. 本轮交付的其他能力

- `scripts/verify-build.mjs`：一键复验（见 §8）。
- `packages/adapters/assets/gradle-8.8/`：Forge 线的独立 wrapper 资产（含 PROVENANCE）。
- 新增 hygiene 守卫：所有适配器生成结果**零残留占位符**（对尚不能编译验证的适配器是关键防线）。

## 7. 阻塞 / 跳过 / 不适用

### 7.1 NeoForge 1.21.1 真编译 —— ⛔ 阻塞（环境）

| 尝试 | 配置 | 结果 | 说明 |
| --- | --- | --- | --- |
| 1 | 官方 maven 在前 | ❌ 插件未找到 | Gradle 访问 `maven.neoforged.net` 得到 SSL reset 后**硬失败**，不回落 |
| 2 | 镜像在前、官方在后 | ❌ 传递依赖失败 | 插件从镜像解析成功；MDG 的 `gradle-idea-ext` 回落官方 maven → 硬失败 |
| 3 | 官方 maven 置于最后 | ❌ `neoFormRuntimeExternalTools` 失败 | `neoform-runtime` 只能从 MDG 自注册仓库（官方）取得 |
| 4 | `PREFER_SETTINGS` 强制设置级仓库 | ❌ `minecraft-dependencies` 缺失 | 插件与 neoform-runtime 均从镜像解析成功；但 `net.neoforged:minecraft-dependencies:1.21.1` 在镜像 **404**（curl 实测），仅有官方 maven 提供 |

结论：**本机无法完成 NeoForge 编译验证**。已确认有效：适配器加载、lint、26 文件生成、零残留占位符、插件 id 与版本号取自官方元数据（ModDevGradle 2.0.147 / NeoForge 21.1.250）。**未验证**：NeoForge Java 模板的 API 正确性（对照：Forge 线同样的模板结构刚被编译器抓出两处 API 错误，说明这类验证不可省略）。因此 `neoforge-1.21.1` 一律标注「已生成，未编译验证」。

### 7.2 其他阻塞 / 跳过

| 项 | 状态 | 原因与影响 |
| --- | --- | --- |
| `gradlew` 自动下载 Gradle 发行版 | ⛔ 阻塞（环境） | 本机 Java 对发行版 CDN 连接超时；且重下 Gradle 9.5.1 时 `curl` 连 `github.com` 失败（`services.gradle.org` 重定向目标）。**不影响产物正确性**：验收使用本地已解压的 Gradle 8.8 / 9.5.1 发行版；wrapper 四件套随工程分发 |
| Fabric 线经 `verify-build.mjs` 复跑 | ⏭ 跳过 | 复验脚本已于本轮对 **Forge 线**端到端跑通；Fabric 线需 Gradle 9 发行版（本机副本已在清理 Temp 时删除，重下受 §7.2 第一条阻塞）。Fabric 的编译结论来自 §4 的直接验证 |
| 浏览器端验证 | ⏭ 跳过 | 本会话无可用浏览器 provider，且本期无 UI |
| MC 26.x（Java 25）目标 | ⏭ 跳过 | 无 JDK 25；未纳入本期适配器 |
| Linux/macOS 生成与构建 | ⏭ 跳过 | 本机为 Windows；已用 posix 相对路径 + `executable` 位降低风险，未实测 |

## 8. 一键复验 / Re-verification

```bash
pnpm -r build && pnpm -r test            # 41 passed
node scripts/verify-build.mjs --adapter forge-1.20.1 \
  --gradle "8=C:/tools/gradle-8.8/bin/gradle.bat" \
  --java-home-17 C:/tools/jdk17
```

脚本按**适配器声明的 `gradleWrapperVersion`** 选择 Gradle 线（Loom 需 Gradle 9、ForgeGradle 6 拒绝 Gradle 9），缺工具链时如实报 `SKIPPED` 而不是假装通过；任一目标失败则退出码 1，并在 `Temp/verify-build/<adapter>/build.log` 留下完整日志。

## 9. 遗留风险与缺口

1. **版本漂移**：适配器钉住的版本号（Fabric loader 0.19.5 / API 0.116.17+1.21.1 / Loom 1.17-SNAPSHOT / NeoForge 21.1.250 / MDG 2.0.147 / Forge 47.4.10 / ForgeGradle 6.0.54）会随上游更新而变旧，需要版本巡检工作流（数据源见 docs/research/2026-09-version-api-knowledge.md §2.4）。
2. **NeoForge 未编译验证**：见 §7.1；在能访问 `maven.neoforged.net` 的机器上跑一次 `verify-build.mjs --adapter neoforge-1.21.1` 即可补齐。
3. **贴图缺失**：生成工程可编译、可加载，但物品/方块贴图需自备（生成工程 README 已明确）。
4. **覆盖子集有限**：配方、进度、实体、附魔、UI(Screen)、datagen 生成器尚未实现 —— 这是下一步的主要工作。
5. **未做负面安全测试**：路径逃逸有实现级守卫与单测，但未做模糊测试；MCP/HTTP 面未做鉴权（默认仅监听 loopback）。
6. **`Temp/` 下的验收产物**（Gradle 8.8 / JDK 17 / 生成的工程）属临时物，不入库；结论已誊录本报告。
