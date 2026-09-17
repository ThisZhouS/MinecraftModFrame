# 需求基线 / Requirements — mcmodkit

> 状态：v1（首个可编译切片）。每条需求都标注了**可执行的验收方式**，验收证据见 docs/acceptance-report.md。

## 1. 用户与场景

| 角色 | 场景 | 入口 |
| --- | --- | --- |
| AI 智能体（主要） | 在对话里拿到「目标版本 + 内容清单」后，生成可编译的 mod 工程，并按用户反馈迭代增删物品/方块/参数 | MCP tools（stdio）或 CLI（`--json`） |
| 人类开发者（次要） | 生成样板工程后自己接着写；或把框架当版本知识库查询 | CLI |
| 上层平台（集成方） | 把生成能力嵌入自己的服务/流水线 | HTTP JSON API |

## 2. 功能需求

| ID | 需求 | 验收方式 | 状态 |
| --- | --- | --- | --- |
| FR-1 | 以 JSON Spec（`schemaVersion: 1`）描述一次生成：mod 元信息、目标 (mcVersion × loader)、物品/方块清单 | `mcmod validate spec.json` 退出 0 | ✅ |
| FR-2 | 校验失败必须给出**可自修复**的字段级错误（路径 + 期望 + 实际） | 退出码 4，错误含字段路径；见 `packages/core/test/unit.test.ts` | ✅ |
| FR-3 | 目标解析：按 (mcVersion, loader) 选择适配器；未支持组合必须明确报「不支持」并列出可用目标 | `mcmod list-versions`；`ADAPTER_NOT_FOUND` 错误文本 | ✅ |
| FR-4 | 生成完整可构建工程骨架：构建脚本、gradle wrapper、mod 元数据、资源目录 | 生成目录含 `gradlew(.bat)`、`gradle/wrapper/gradle-wrapper.jar` | ✅ |
| FR-5 | 生成物品：Java 注册、模型 JSON、语言键、（按需）加入创造模式标签 | 生成文件 + 编译通过 | ✅ |
| FR-6 | 生成方块：方块注册 + 对应 BlockItem、blockstate/block model/item model、掉落表、可挖掘标签 | 同上 | ✅ |
| FR-7 | 语言文件按命名空间与 id 合并生成 | `assets/<ns>/lang/en_us.json` | ✅ |
| FR-8 | 再生成幂等：受管文件无条件覆盖，用户自有文件绝不被触碰 | 二次生成后用户新增文件仍存在（`packages/core/test/pipeline.test.ts`） | ✅ |
| FR-9 | `--dry-run` 输出**将要写入的文件计划**而不落盘 | `mcmod gen ... --dry-run --json` 返回 writtenCount/written | ✅ |
| FR-10 | 三面同源：CLI / MCP / HTTP API 调用同一 planner 与生成器，无逻辑复制 | 三面均调用 `@mcmodkit/adapters#planProject` + `core#emitPlan` | ✅ |
| FR-11 | 生成阶段**零网络**：所有版本事实来自本地适配器数据 | 断网可生成（仅首次 gradle 构建需联网） | ✅ |
| FR-12 | 智能体可查询版本知识：列出目标、读取某适配器的构建事实与陷阱注记 | `mcmod adapter fabric-1.21.1`（`--templates` 可取模板） | ✅ |
| FR-13 | 产物可脱离本框架生存（自带 wrapper、README、构建说明） | 无全局 gradle 环境下 `gradlew.bat build` 通过 | ✅ 已编译验证 |
| FR-14 | UI 生成：按 Spec 生成游戏内 Screen（标题/尺寸/文本行），并按声明生成打开它的按键绑定与客户端入口 | 生成 `client/<Mod><Id>Screen.java` + `client/<Mod>Client.java`，语言键齐全 | ✅ Fabric/Forge 已编译验证 |
| FR-15 | UI 参数化：尺寸、每行文本、按键字母都是 Spec 数据，改 Spec 重生成即改 UI | `ui.screens[].width/height/lines/key`；缺省时取默认值 | ✅ 单测覆盖 |
| FR-16 | 生成配方：有序/无序合成、熔炼、高炉、烟熏、营火、切石；引用本 mod 内容或原版物品；按版本写出正确的 JSON 方言与数据包目录 | 生成 jar 内 `data/<ns>/recipe(s)/*.json`，与原版样本逐字段一致 | ✅ 两版编译验证 + 方言护栏 |
| FR-17 | 生成进度：根/子进度树、图标、判据（解锁配方 / 持有物品）、`rewards.recipes` 配方书解锁、语言键 | 生成 `data/<ns>/advancement(s)/*.json` + lang | ✅ 两版编译验证 |
| FR-18 | 生成实体：实体类（属性/体积）、实体类型与属性注册（三加载器各自的机制）、渲染器（复用原版模型）、掉落表、语言键 | jar 内含实体类/渲染器/注册类/掉落表；两版编译通过 | ✅ 两版编译验证 |
| FR-20 | datagen（可选）：`datagen: true` 时生成加载器对应的数据生成入口 + 最小示例 provider + 构建脚本数据任务接线；关闭时零残留 | 生成 `datagen/<Mod>DataGen.java`、`<Mod>ExampleProvider.java`；Gradle 列出 `runDatagen`/`runData` | ✅ 编译验证 + 任务存在性验证（**未运行 datagen**） |
| FR-19 | 实体的版本/加载器差异（注册方式、属性事件、渲染器事件、模型类与层常量、掉落表目录）全部来自适配器数据 | `entityKinds`/`entityModels`/模板；引擎零分支（有护栏测试） | ✅ |

## 3. 非功能需求

| ID | 需求 | 说明 |
| --- | --- | --- |
| NFR-1 | 确定性：同一 Spec + 同一适配器 ⇒ 完全相同的文件内容 | 生成器为纯函数；无时间戳/随机数 |
| NFR-2 | 安全：路径逃逸防护；MCP **不暴露任意 shell/构建执行** | 生成路径经 PATH_ESCAPE 校验；MCP 工具集只做查询/校验/生成 |
| NFR-3 | 智能体友好：stdout=数据、stderr=日志；`--json` 统一信封；退出码语义固定（0/1/2/3/4/5） | 见 CLI 头部注释与 `envelope.ts` |
| NFR-4 | 可扩展：新增 (版本 × 加载器) 只需新增一个 JSON 数据文件，不改引擎代码 | 适配器契约 + `lintAdapter` 守卫 |
| NFR-5 | 原则守卫：引擎代码不得出现版本分支，模板不得硬编码 MC 版本 | `packages/adapters/test/real-adapter.test.ts` 的 hygiene 测试 |
| NFR-6 | 跨平台：Windows 优先，路径一律 posix 相对路径 + Node path 转换 | 在 Windows 11 + Node 24 实测 |
| NFR-7 | 许可证合规：自研代码 MIT；仅复用可再分发资产并记录来源 | `packages/adapters/assets/gradle-9.5.1/PROVENANCE.md`、`packages/adapters/assets/gradle-8.8/PROVENANCE.md`（Forge 线因 ForgeGradle 6 不兼容 Gradle 9 而独立携带 8.8 wrapper） |

## 4. 明确不做（本期）

- 不内嵌 LLM（生成由宿主智能体驱动）。
- 不做实体/附魔/进度/配方/UI(Screen) 生成，不做 Blockbench 模型导入（列入后续方向）。
- 不生成贴图 PNG（在生成工程 README 中明确提示需自备 16×16 贴图）。
- 不做 mod 发布/分发，不做游戏内机器人。
- 不承诺覆盖全部版本：未覆盖组合明确报「不支持」。

## 5. 待定问题（需用户决策）

1. ~~首发是否同时提供 NeoForge 1.21.1 适配器？Forge 1.20.1 是否作为「仅生成」目标进入？~~ **已决**：三个适配器全部提供（fabric-1.21.1 / neoforge-1.21.1 / forge-1.20.1）；其中 Fabric 与 Forge 已真编译验证，Forge 1.20.1 **不是**「仅生成」（经 Adoptium JDK 17 实测可编译），NeoForge 因网络阻塞暂为「未编译验证」。
2. HTTP API 是否需要 token 鉴权（当前默认 127.0.0.1、无鉴权）？
3. 默认命名空间与包名推导规则（当前：`modId` 即命名空间，包名默认 `com.<modId>`）。
