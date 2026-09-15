# 调研记录 / Research Record（2026-09-15）

> 完整子报告归档于 docs/research/：[2026-09-scaffolding-tools.md](research/2026-09-scaffolding-tools.md)（多版本工具链）、[2026-09-mcp-agent-ecosystem.md](research/2026-09-mcp-agent-ecosystem.md)（MCP/agent 生态）、[2026-09-version-api-knowledge.md](research/2026-09-version-api-knowledge.md)（版本 × 加载器 API 知识地图、映射体系、逐版本破坏性变更）。

## 搜索问题 / Search Questions

1. 是否已有项目解决『按 (MC 版本 × 加载器) 生成可编译 mod 工程，并供 agent 通过 CLI/MCP 调用』？
2. 哪些模板/工具链可以合法复用（许可证、活跃度、可编程性）？
3. agent 集成面（MCP 规范/SDK/transport、CLI UX）当前的最佳实践是什么？
4. 版本差异知识（Java 版本、路径约定、API 变更）从哪里机器可读地获取？

## 关键发现（已验证，来源见子报告）

1. **利基成立**：现有 Minecraft MCP 覆盖『文档检索/反编译校验/版本数据』三个切面；scaffold→generate→build→test 端到端工作流无覆盖者；『三面一体（MCP+CLI+HTTP）』有 minecraft-dev-mcp 的 MCP+CLI 双面先例。
2. **脚手架均无 CLI/API**（MCreator GUI-first 且 GPL-3.0；fabricmc.net 生成器是网页表单）。正确路径 = CC0 蓝本内嵌 + 自研参数化模板 + 组合 Gradle 插件：fabric-example-mod（CC0）、MultiLoader-Template（CC0）、NeoForgeMDKs（官方模板矩阵，无标注许可）。
3. **构建插件矩阵**：Fabric→Loom(MIT)；NeoForge>21.0.x→ModDevGradle(LGPL-2.1)；Forge→ForgeGradle 6/7；长尾→Unimined；单仓多版本→Stonecutter。均为声明式 Gradle DSL，只能组合、不能当库调。
4. **Java 矩阵（官方）**：≤1.16.5→8；1.17→16；1.18–1.20.4→17；**1.20.5–1.21.11→21**；26.x→25。
5. **事实纠正**：『Forge 止于 1.20.1』不成立——Forge 已恢复发版至 26.2；真正分水岭是 **1.20.2 起 NeoForge API 破坏性分叉**，两者不再互通。
6. **MCP**：当前规范 2026-07-28（无状态化）；TS SDK v2 = @modelcontextprotocol/server 2.0.0 (MIT)；stdio 优先；客户端配置事实标准 mcpServers{command,args,env} / Codex TOML。
7. **版本元数据机器可读**：meta.fabricmc.net/v2/versions/*（JSON）、files.minecraftforge.net/.../promotions_slim.json（JSON）、maven-metadata.xml。
8. **已知版本陷阱**（对未来 validator 极重要）：1.20.5 NBT→components；1.21 datapack 目录改单数（旧名静默不加载）；1.21.2 属性 ID 去 generic. 前缀；1.21.4 custom_model_data 结构变更；1.21.5 text component 强类型。

## 对比 / Comparison（摘要）

| 维度 | 结论 |
| --- | --- |
| 模板复用 | fabric-example-mod / MultiLoader-Template = CC0 可直接内嵌；Forge MDK 自定义许可（运行时下载解包，勿再分发） |
| MCreator | GPL-3.0 + 无 CLI → 排除 |
| 生成技术 | 模板 <1k 行/项目 → 『CC0 蓝本 + 自研 TS 参数化模板』优于运行时抓取任何脚手架 |
| 构建验证 | 进程调用 gradlew + Gradle toolchain（foojay resolver 自动供给多 JDK）；本机 JDK21 → 1.20.5–1.21.x 可完整验证，17/25 目标受限验证 |
| MCP SDK | v2 (@modelcontextprotocol/server)，stdio 优先，工具 <20、无状态 |

## 实测回填 / Verified against real builds（2026-09-15）

调研结论在真实构建中被逐条检验，结果如下（详见 docs/acceptance-report.md）：

| 调研结论 | 实测结果 |
| --- | --- |
| Fabric 用 Loom 插件 | ✅ 官方示例当前插件 id 为 `net.fabricmc.fabric-loom-remap`，实测解析为 **Loom 1.17.21**；`loom.officialMojangMappings()`（Mojmap）可用于 1.21.1 |
| Java 矩阵 1.20.5–1.21.11 → 21 | ✅ JDK 21 + `options.release = 21` 编译通过 |
| 1.21 数据包目录单数化 | ✅ 生成的 `data/<ns>/loot_table/`、`data/minecraft/tags/block/` 经 Loom remapJar 后原样进入 jar |
| 「版本陷阱」清单 | ✅ 新增一条由编译器发现的陷阱：Mojmap 下 `BlockBehaviour` 在 `net.minecraft.world.level.block.state`，不在 `...level.block` |
| Forge 生态可经 maven.creeperhost.net 镜像获取 | ✅ 镜像提供 Forge/NeoForge/ModDevGradle 全量工件；本机 `maven.neoforged.net` 被网络阻断（SSL 握手被终止），故适配器把镜像置于仓库首位 |
| NeoForge 注册机制 = DeferredRegister + DeferredHolder | 🔄 适配器已按该机制生成；真编译因本机无法访问 maven.neoforged.net 而阻塞（证据链见 acceptance-report §6.1） |

## 结论 / Conclusion

- **复用**：模板蓝本（CC0）+ Gradle 插件组合 + 官方 MCP SDK。
- **自研**：版本适配数据层（adapters）、Spec 校验、生成管线、三面接入。
- **改变决策的证据**：若 fabricmc.net/NeoForgeMDKs 未来提供官方 CLI/API，可评估替换生成层；若 MCP 规范再破坏性变更，依赖官方 SDK 跟随。
- 对简报的修正：动机中『Forge 止于 1.20.1』需更正为『1.20.2 起 Forge/NeoForge API 分叉』（已同步 project-brief.md）。
