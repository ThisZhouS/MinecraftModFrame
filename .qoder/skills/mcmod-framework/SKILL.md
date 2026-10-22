---
name: mcmod-framework
description: 使用 mcmodkit 框架从 ModSpec 生成可编译的 Minecraft mod 工程（多版本 × 多加载器）的操作指南。覆盖三个接入面（CLI / MCP / HTTP API）、标准工作流（list_versions → example_spec → validate_spec → scaffold_mod → gradlew build）、ModSpec 结构要点、适配器数据的权威性（版本事实只信适配器，不信模型记忆）、信封与错误码语义、验证脚本。当用户需要用 mcmodkit 生成/校验/构建 mod 工程、把 MCP 工具接入智能体、新增版本适配器或排查框架报错时使用。
when_to_use: 用户提到 mcmodkit、ModSpec、scaffold、list_versions、get_adapter、适配器、加载器目标（Fabric/Forge/NeoForge）、生成 mod 工程或框架报错时。
---

# mcmodkit 框架使用

mcmodkit（工作名）是面向 AI 智能体的 Minecraft mod 开发框架：把「多版本 × 多加载器」的工程知识沉淀为**版本适配数据层**，从一份 JSON Spec 生成**可编译**的 mod 工程，并按反馈迭代。

```
ModSpec (JSON) ──validate──▶ 适配器数据 (版本×加载器) ──plan──▶ 文件计划 ──emit──▶ 可构建的 mod 工程
```

## 心智模型（先读这个）

1. **Spec 说"要什么"**（内容与参数），**适配器说"这个目标怎么写"**（构建事实、注册代码模板、资源路径约定、陷阱注记）。
2. **引擎代码不含任何版本分支**。所有版本/加载器差异都在 `packages/adapters/data/<loader>-<mcVersion>.json`。
3. **版本事实只信适配器，不信模型记忆**。例如 `forge-1.16.5` 的类名是 MCP 名（`net.minecraft.item.Item`）而非官方名——这不是笔误，判据是 `javap` 真实构件。缺事实时看适配器 `references[]`（该目标的权威来源）与 `notes`。
4. 生成后的工程自带 Gradle wrapper，脱离本框架也能构建。

## 三个接入面（同一 core，零逻辑复制）

| 面 | 入口 | 典型用途 |
| --- | --- | --- |
| CLI | `packages/cli/dist/index.js`：`list-versions` / `adapter` / `example` / `validate` / `gen` | 智能体一次性调用、人类手动使用 |
| MCP | `packages/mcp-server/dist/index.js`（stdio）：`list_versions` / `get_adapter` / `validate_spec` / `example_spec` / `scaffold_mod` | 智能体作为工具集接入 |
| HTTP API | `packages/api/dist/index.js`（默认 127.0.0.1:7420）：`GET /api/versions`、`GET /api/adapters/:id`、`GET /api/example`、`POST /api/validate`、`POST /api/generate` | 平台集成 |

MCP 工具**不执行任何 shell/构建命令**：构建由使用方自行决定，避免把任意命令执行暴露给模型。

## 标准工作流（以 MCP 为例）

```
list_versions  → 选定 (mcVersion, loader)，确认目标存在
get_adapter    → 读该目标的 notes / references / 模板（写引用、写注册时的依据）
example_spec   → 拿到可用的 Spec 骨架
validate_spec  → 按字段级报错修正（不需要翻文档，报错自带修复线索）
scaffold_mod   → dryRun: true 先看文件计划 → dryRun: false 真实生成到指定目录
```

之后由使用方在目标目录执行构建（首次会联网下载依赖）：

```bash
cd <outDir> && ./gradlew build        # Windows: gradlew.bat build
```

CLI 等价序列：

```bash
node packages/cli/dist/index.js list-versions
node packages/cli/dist/index.js example -o my-mod.json
node packages/cli/dist/index.js validate my-mod.json
node packages/cli/dist/index.js gen my-mod.json -o ./out --dry-run --json
node packages/cli/dist/index.js gen my-mod.json -o ./out
```

## ModSpec 要点

```jsonc
{
  "adapter": "neoforge-1.21.1",            // 目标适配器 id（必填）
  "meta": { "modId": "examplemod", "namespace": "examplemod", "name": "Example Mod", "version": "1.0.0" },
  "content": {
    "items":  [ { "id": "ruby", "model": "handheld", "behavior": "fishing_rod", "durability": 128, "maxCount": 1 } ],
    "blocks": [ { "id": "ruby_pillar", "model": "cube_column", "hardness": 3, "resistance": 9 } ],
    "recipes": [ { "id": "charged_ruby", "type": "crafting_shaped", "pattern": ["RR","RR"], "key": { "R": "ruby" }, "result": "charged_ruby" } ],
    "advancements": [ { "id": "root", "title": "Ruby Rush", "hasItems": ["ruby"] } ],
    "entities": [ { "id": "ruby_golem", "kind": "monster", "health": 30, "model": "cow", "loot": [{ "item": "ruby", "min": 1, "max": 2 }] } ],
    "ui": { "screens": [ { "id": "guide", "key": "K", "width": 240, "height": 150, "lines": ["第一行"] } ] }
  },
  "textures": true,                         // 贴图开关，见 mcmod-textures skill
  "datagen": false
}
```

- 物品模型形态：`generated`（默认平铺图标）/ `handheld`（工具握持）。方块：`cube_all`（默认）/ `cube_column`（顶底与侧面分开）。模型形态只影响模型 JSON，不改变贴图路径。
- 物品行为 `behavior`：适配器 `itemBehaviors` 里的键（如 `fishing_rod`）；未知键报错并列出可用取值。
- 配方引用可写本 mod 内容 id（`"ruby"` → `examplemod:ruby`）、资源位置（`"minecraft:stick"`）或标签（`"#minecraft:coals"`）；写错的 id 得到字段级报错。
- 版本方言（1.21 的 `item`→`id`、单数数据包目录等）全部写在适配器数据里，引擎零版本分支；方言以 jar 内原版数据为准。
- **贴图相关字段见 `mcmod-textures` skill**，不要在 Spec 里带任何凭据。

## 错误处理

信封契约（CLI `--json` 与 HTTP 通用）：`{ ok: true, data }` / `{ ok: false, error: { code, message, details } }`。

错误码（稳定、机器可读，智能体可按 code 自修复）：

| code | 含义 |
| --- | --- |
| `SPEC_INVALID` | Spec 不合法；details 通常是字段级错误列表 |
| `ADAPTER_NOT_FOUND` | adapter id 不存在；用 `list-versions` 查可用 id |
| `ADAPTER_INVALID` | 适配器数据自身不合法（含 gradle 死键检查） |
| `TEMPLATE_ERROR` | 模板缺失变量/文件；details 带 templateName 与 missing |
| `PATH_ESCAPE` | 生成路径越界 |
| `PLAN_INVALID` | 生成计划内部不一致 |
| `IO_ERROR` | 文件读写失败 |
| `ROUTE_NOT_FOUND` | 仅 HTTP：请求未匹配任何路由（404） |

CLI 退出码：`0` 成功、`1` 运行时错误、`2` 用法错误、`3` 未找到（适配器等）、`4` Spec 非法、`5` 冲突。

## 常用操作细节

- **受管文件**：生成器写入的文件可被重复生成覆盖；框架只碰自己管的那批路径，你自己的文件不会被误删。
- **dry-run**：`gen --dry-run` / `scaffold_mod(dryRun: true)` 不写盘、不联网、不读贴图文件，返回完整文件计划。
- **查看适配器**：`node packages/cli/dist/index.js adapter <id>`（含 `--templates` 导出模板）；MCP 用 `get_adapter`。
- **接入 MCP**：让客户端启动 `node <repo>/packages/mcp-server/dist/index.js`（stdio），任何 stdio MCP 客户端均可；自检 `node scripts/mcp-smoke.mjs`。
- **HTTP**：`MCMODKIT_API_PORT=7431 node packages/api/dist/index.js`，仅监听 loopback。

## 验证

```bash
pnpm install && pnpm -r build && pnpm -r test        # 全仓构建 + 测试
node scripts/verify-build.mjs --adapter forge-1.20.1 \
  --gradle "8=<gradle-8.8>/bin/gradle.bat" --java-home-17 <jdk17>     # 真编译验收
node scripts/verify-runtime.mjs --adapter neoforge-1.21.1 \
  --gradle "9=<gradle-9.5.1>/bin/gradle.bat" --java-home-21 <jdk21>   # 真运行验收
```

14 个目标（Fabric 5 / Forge 6 / NeoForge 3）全部通过真实编译验证；NeoForge 三个目标与 Forge 1.20.1 通过真实运行验证。验证状态以目标行内标注为准（编译级/运行级分开），未验证的明确标注，绝不谎称。

## 新增版本/加载器

新增一个目标 = 新增 `packages/adapters/data/<loader>-<mcVersion>.json`，无需改动引擎。取证清单（javap 签名 / jar 内原版数据 / 官方示例）、lint 自查与编译验收流程见 `docs/adding-a-version.md`。经验：1.12.2 没有 Fabric（上游事实）；1.16.5 用 MCP 名；NeoForge 用 ModDevGradle 而非 ForgeGradle。

## 陷阱清单

- 别凭训练数据猜版本事实——`get_adapter` 的 `notes` / `references` 才是权威。
- MCP 面不执行 shell：让用户/宿主自行 `gradlew build`。
- 贴图缺凭据或路径错误时会**报错或警告并回退程序化绘制**，注意读 warnings 而不是只看 ok。
- 输出目录选择：生成工程自带 wrapper，别把生成目录放进仓库受管区域再手工改（受管文件会被覆盖）。
