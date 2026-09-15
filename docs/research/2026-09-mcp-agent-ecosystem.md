# 调研报告：将 Agent 工作流集成为 CLI + MCP + HTTP API，以及 AI 生成 Minecraft 模组的现状（2026-09）

> 由调研子代理生成并归档；要点摘录见 docs/research.md。

## 1. MCP 规范与 SDK 选型（已验证）

- 规范自 2024-11 起共 5 版，当前为 2026-07-28：核心协议无状态化；tasks 成为官方扩展 io.modelcontextprotocol/tasks；MRTR 模式；移除 SSE 续传。changelog：https://modelcontextprotocol.io/specification/2026-07-28/changelog
- Node.js TypeScript 选型：官方 TS SDK v2（npm @modelcontextprotocol/server 2.0.0 + @modelcontextprotocol/client，MIT）；v1 @modelcontextprotocol/sdk 1.30.0 在 v2 发布后仍维护至少 6 个月。Python 官方 SDK mcp 2.2.0 / FastMCP 4.0.3 仅作对照。
- 最小服务器（v2 官方文档）：serveStdio(() => { const s = new McpServer(...); s.registerTool(name, { description, inputSchema: z.object(...) }, handler); return s; })。
- Transport：stdio 优先（本地 agent 唯一从未变更的 transport）；Streamable HTTP 第二；SSE 弃用不做。
- 客户端配置事实标准：mcpServers: { name: { command, args, env } }（Claude Desktop / Claude Code）；Codex 用 ~/.codex/config.toml 的 [mcp_servers.*]。Claude Code: claude mcp add --transport stdio <name> -- <cmd>；注意『只有 url 没写 type 的条目会被当作 stdio 报错』。

## 2. Minecraft MCP 生态盘点（利基确认）

- 游戏内 bot 类（Mineflayer 系）较多且拥挤：yuniko-software/minecraft-mcp-server（Apache-2.0，740★）、haksndot/haksnbot-tools（MIT）、InventivetalentDev/minecraft-mcp（MIT）、gerred/mcpmc（MIT）等。
- 模组开发工作流侧只有三个切面被占住：文档 RAG（OGMatrix/mcmodding-mcp，MIT）、源码反编译/静态校验（MCDxAI/minecraft-dev-mcp，MIT，MCP+CLI 双面先例）、版本数据/命令校验（AnCarsenat/minecode-mcp，GPL-3.0，复用需防传染）。
- 结论：scaffold → generate → build → in-game test 的端到端模组开发工作流尚无覆盖者；本项目定位成立。

## 3. AI 生成 mod/datapack 的已知教训

- vibecraft（MIT）：生成不难、验证难；游戏内自动回归（RPA + 日志监控）是唯一可信 E2E。
- minecode-mcp（GPL-3.0）记录的版本漂移陷阱：1.20.5 NBT→components；1.21 数据包目录改单数且旧名静默不加载；1.21.2 属性 ID 去 generic. 前缀；1.21.4 custom_model_data int→object；1.21.5 text component 强类型。minecraft.wiki 只记录最新版本——工具必须按版本供数并诚实声明覆盖范围。
- 社区风险：玩家社区对 AI 模组存在反弹（r/feedthebeast 高热度反对帖）；发布需过 Mojang EULA/品牌规范。

## 4. Agent-first CLI UX 规范（clig.dev 等已验证要点）

1. stdout=数据（API），stderr=进度/日志；--json 必备，流式用 JSON Lines。
2. exit code 即控制流：0 成功 / 1 一般错误 / 2 用法 / 3 不存在 / 4 权限 / 5 冲突；绝不『失败也返回 0』。
3. 幂等命令（ensure/apply 语义）或可判别的冲突 exit code；agent 会重试。
4. --dry-run 必须输出结构化『将改动什么』（JSON），不是一句话；--yes/--force 绕过交互确认；非 TTY 跳过交互。
5. --help = 描述+参数 spec+示例；noun-verb 层级语法让探索成为确定性树搜索。
6. 错误可行动：错误码字符串 + suggestion + 区分瞬态/永久。
7. MCP token 卫生：工具 <20、长输出截断+过滤参数、server 内编排只回摘要。『人会用 CLI 的地方 agent 也该用 CLI』。

## 5. 对本项目的落地决策

- SDK：@modelcontextprotocol/server ^2.0.0（stdio 优先）；工具与 CLI 子命令一一镜像、全部无状态（跨调用状态进显式参数），对齐 2026-07-28 无状态化方向。
- 首发工具面（5 个，低于 20 上限）：list_versions / get_adapter / validate_spec / example_spec / scaffold_mod。build_run 等异步 job 类工具留待二期（需沙箱对策：gradle build = 供应链+任意代码执行面，MCP 面永不暴露裸 shell）。
- HTTP API：默认绑定 127.0.0.1 回环，JSON envelope 与 CLI 一致；保留 DNS-rebinding 防护意识，不暴露 shell。
