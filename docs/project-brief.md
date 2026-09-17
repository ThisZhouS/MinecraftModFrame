# 项目简报 / Project Brief — mcmodkit（工作名）

> 依据 project-driver intake 模板整理；调研结论回流后更新。创建：2026-09-15。

## 项目核心 / Project Core

- **临时名称**：mcmodkit（工作名，包作用域 `@mcmodkit/*`）
- **一句话目的**：一个面向 AI 智能体的 Minecraft 模组开发框架：把"多版本 × 多加载器"的 mod 工程知识沉淀为版本适配层与工作流，以 CLI / MCP / HTTP API 供 codex、claude、DeepSeek Harness 等智能体调用，实现 mod 功能、模型、UI、参数的自动化生成与迭代调整。
- **主要用户与使用场景**：
  1. AI 智能体（主要）：通过 MCP tools 或 CLI 在对话中"一句话/一份 JSON Spec"生成可编译的 mod 工程，随后按反馈迭代（加物品/方块/UI/改参数）。
  2. 人类开发者（次要）：直接用 CLI 生成样板工程，或把框架当版本知识库查询（`versions`、`adapter` 查询命令）。
- **要解决的问题**：MC 各版本/加载器 API 差异大且文档分散（Forge/NeoForge/Fabric 注册机制与命名体系各不相同：DeferredRegister+RegistryObject / DeferredRegister+DeferredHolder / Registry.register，且 1.21.x 连续破坏性变更，如 1.20.5 Java 21 + Data Components、1.21 数据包目录单数化、1.21.2 物品名/模型数据组件、1.21.4 Client Items），每次开发都要反复查文档、复制样板代码；AI 直接生成容易写错版本 API 且无校验闭环。
- **必要性**：Agent coding 与 MCP 生态已成熟；MC 1.21.x 活跃期多版本长期并存；把版本差异固化为**可复用数据（适配器）+ 可复用流程（工作流）**的时机成熟。
- **灵感或相关先例**：MCreator（可视化 mod 生成器）、fabric 官方模板生成器、jaredlll08/MultiLoader-Template、Architectury、Stonecutter、MCP 协议。
- **非目标 / Non-goals**：
  - 不做游戏内机器人、自动游玩、服务器管理。
  - 不内嵌 LLM：模型调用由宿主智能体完成，本框架只提供确定性生成/校验工作流。
  - 不承诺覆盖全部版本全部 API：适配器按 (MC版本 × 加载器) 逐个补充，未覆盖的组合明确报"不支持"。
  - 不做 mod 分发市场、不做图形化 IDE。
- **约束后续开发的原则 / Principles**：
  1. **版本差异只进适配层**：生成器、工作流代码禁止出现 `if (mcVersion)` 分支；一切版本相关事实（包名、注册 API、模板变量）来自 adapters 数据。
  2. **Spec 先行，校验闭环**：任何生成必须经过 JSON Schema 校验（validate → plan → generate → verify），失败信息面向"智能体可自修复"输出。
  3. **一核三口**：CLI、MCP、HTTP API 共享同一 core 包，禁止复制业务逻辑。
  4. **产物可独立生存**：生成的 mod 工程必须自带 gradle wrapper 与许可证头，脱离本框架仍可构建；框架不锁定用户。
  5. **复用优先**：优先复用成熟开源模板/组件（记录许可证），再自研。

## 可行性 / Feasibility

- **可复用本地代码**：无（E:\MCMOD 起始为空，见 docs/environment.md）。
- **相近或竞争项目**：MCreator、fabric-example-mod、MultiLoader-Template、Architectury、Stonecutter、Unimined/ModDevGradle、若干 Minecraft MCP server（多为游戏内机器人向）→ 详见 docs/research.md。
- **相关理论/标准**：MCP（tools/resources/prompts，stdio+streamable HTTP）、JSON Schema Draft 2020-12、Gradle toolchains、pnpm workspace。
- **必需集成与外部依赖**：Node 24 + pnpm 11；`@modelcontextprotocol/sdk`（MCP server）；模板内嵌 gradle wrapper；生成目标需要 Java（本机 JDK21）。
- **主要可行性风险**：
  1. 版本 API 漂移快（1.21.x 每个小版本都有破坏性变更）→ 用"适配器数据 + 快照测试"吸收。
  2. 本机仅 JDK21 → 1.20.1 目标只能受限验证（见 environment.md 约束 1）。
  3. gradle 首次构建需联网下载依赖 → 文档明示；验证用最小依赖模板。
  4. MCP 规范演进 → 锁定 SDK 版本，接口层薄封装。
- **许可证约束**：自研代码拟 MIT；复用模板前核查上游许可证（fabric-example-mod 为 CC0，MultiLoader-Template 待查证），在 research.md 记录来源与兼容性。

## 范围 / Scope

- **最小可用切片（本阶段）**：`mcmodkit` monorepo，实现：
  1. `core`：Spec 模型 + JSON Schema 校验 + 生成管线（plan→emit）；
  2. `adapters`：至少 2 个适配器数据（如 MC 1.21.x NeoForge、MC 1.21.x Fabric；1.20.1 视调研补充）；
  3. `generators`：物品（item）、方块（block）、语言文件（lang）、模型 JSON 四个生成器；
  4. `cli`：`mcmod init / gen / validate / list-versions`；
  5. `mcp-server`：tools = list_versions / validate_spec / scaffold_mod / generate；
  6. `api`：HTTP JSON API 同功能子集 + 冒烟测试；
  7. 端到端：CLI 生成一个真实 mod 工程，validate 通过；`pnpm -r build && pnpm -r test` 全绿。
- **后续方向**：实体/附魔/进度/配方表生成器；Blockbench 模型生成与转换；Screen/UI 生成；参数调优工作流（批量改 config/属性）；跨版本迁移工作流（upgrade）；适配器社区共建格式。
- **可观察的验收信号**：`pnpm -r build`、`pnpm -r test` 全绿；CLI 端到端生成样例并通过 validate；MCP `tools/list` + 一次工具调用成功；HTTP API curl 冒烟 200；Tree/ 与仓库一致。
- **明确的开放问题**：
  1. 首发适配器选 NeoForge 1.21.x 还是 Fabric 1.21.x？（待调研：模板许可证与结构清晰度）
  2. Forge 1.20.1 是否进入首发范围（只能生成、不能本机编译验证）？
  3. HTTP API 鉴权：默认 127.0.0.1 无鉴权 + 可选 token？
  4. 生成工程的命名空间默认值（`examplemod` vs 从 Spec 推导）。

## 决策记录 / Decision Log

| 日期 | 决策 | 证据/理由 | 备选方案 | 状态 |
| --- | --- | --- | --- | --- |
| 2026-09-15 | 采用 pnpm + TypeScript monorepo（一核三口） | environment.md：node24/pnpm11 就绪；三类接入共享 core 避免逻辑复制 | 单包 + 目录分层 | 待调研确认 MCP SDK 后定稿 |
| 2026-09-15 | 版本事实数据化（adapters/JSON），生成器不写版本分支 | 用户核心诉求=屏蔽版本差异；数据化才能社区共建 | 代码内模板继承 | 已采纳（原则1） |
| 2026-09-15 | 生成工程内嵌 gradle wrapper | environment.md：本机无全局 gradle；产物须独立可构建 | 依赖全局 gradle | 已采纳（原则4） |
| 2026-09-15 | 修正"Forge 止于 1.20.1"的错误前提 | 调研 C（docs/research/2026-09-version-api-knowledge.md §0）：Forge 仍发布（1.21.1→52.1.16、26.2→65.1.3），分水岭是 NeoForge 1.20.2 的 API 断裂 | 沿用旧前提 | 已修正 |
| 2026-09-15 | adapter 一律以 **Mojang 官方映射（Mojmap）** 生成 | Mojang 已去混淆；Fabric 官方 2025-10-31 宣布停维 Yarn 并迁至 Mojmap（26.1+ 无 Yarn），mojmap 无需按版本钉住映射版本字符串 | Yarn（需按版本维护映射版本号） | 已采纳 |
| 2026-09-15 | 首发适配器 = Fabric 1.21.1 + NeoForge 1.21.1（Java 21） | environment.md：本机仅 JDK21，这两个目标可**编译级验证**；1.20.1（Java 17）降级为"仅生成、受限验证" | 先做 1.20.1 | 已采纳 |
| 2026-09-15 | 追加 Forge 1.20.1 适配器，**并推翻"1.20.1 只能生成"的前提** | 实测：Adoptium 可下载 Temurin JDK 17（api.adoptium.net 可达）、`maven.minecraftforge.net` 本机可达（与 NeoForged 相反），因此 1.20.1 也能做**编译级验证**；官方 47.4.10 MDK 给出权威事实（ForgeGradle `[6.0,6.2)`、Gradle wrapper 8.8、Java 17、`META-INF/mods.toml`、pack_format 15、1.20.1 数据包目录为**复数**） | 维持"仅生成、受限验证"；或不纳入首发 | 已采纳 |
| 2026-09-15 | 新增 UI 切片（Screen + 按键绑定 + 客户端引导） | 理念明确要求「功能/模型/UI/参数的自动化生成」，UI 是其中唯一完全缺失的一块；Screen 本体在各版本几乎一致，只有 `renderBackground` 签名等少数差异 | 只做数据资源、不做 UI | 已采纳 |
| 2026-09-15 | UI 模板在适配器契约中「可选但全有或全无」 | 让最小适配器保持轻量，同时 lint 拦住"只实现一半"——半套 UI 模板必然产出编译不过的 Java | 把 UI 模板列为必需 | 已采纳 |
| 2026-09-15 | 按键输入表达式与客户端子包名放进适配器数据 | 输入 API（如 GLFW 键码）与源码布局属版本/加载器事实，按原则 1 不得进引擎 | 在引擎里写死 GLFW | 已采纳 |
| 2026-09-15 | 每个 Gradle 大版本线各自携带 wrapper 资产 | ForgeGradle 6 **不兼容 Gradle 9**，Forge 适配器必须用 8.x：新增 `assets/gradle-8.8/`（由 Gradle 8.8 自身 wrapper 任务生成，Apache-2.0，附 PROVENANCE） | 强制 9.x（会破坏 Forge 构建） | 已采纳 |
| 2026-09-15 | MCP 侧采用 SDK v2（`@modelcontextprotocol/server` ^2.0.0）+ stdio，工具数控制在 <20 | 调研 B：2026-07-28 规范为无状态；stdio 为智能体首选；工具面过大会稀释选择准确率 | SDK v1 + SSE | 已采纳 |
| 2026-09-15 | 生成产物以"可编译"为验收标准，而非"文件存在" | 单一最强证据：`gradlew build` 通过即证明模板中的版本 API 事实正确 | 快照比对 | 已采纳 |
