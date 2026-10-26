# 验收报告 / Acceptance Report — mcmodkit（可编译切片）

> 日期：2026-09-15 · 环境：Windows 11 + Node 24.11.0 + pnpm 11.6.0 + JDK 21.0.11 / JDK 17.0.20.1 / JDK 25.0.4.1（FG7 Mavenizer） · Gradle 9.5.1（Fabric / NeoForge / forge-1.21.4）/ 8.8（其余 Forge 线）
> 证据分级：**通过 / 失败 / 阻塞 / 跳过 / 不适用**。低档通过不替代高档；外部条件缺失时记「阻塞」，不假设通过。

## 1. 测试分层与结论

| 层级 | 内容 | 结果 |
| --- | --- | --- |
| L1 静态 | 5 个包 `tsc`（build 内置） | ✅ 通过 |
| L2 单元/组件 | core / adapters / cli / mcp-server / api 的 vitest 用例 | ✅ **204 passed**（见 §2） |
| L3 集成（三面） | CLI 端到端生成、MCP stdio JSON-RPC 全链路、HTTP API 端点 | ✅ 通过（见 §3） |
| L4 真编译（内容） | 物品/方块/资源/数据包生成结果在目标 JDK + Gradle 下 `build` | ✅ **14/14 目标**（Fabric 5 / Forge 6 / NeoForge 3；见 §4、§5、§14、§15、§16） |
| L4 真运行（加载） | `scripts/verify-runtime.mjs`：专用服务器带 mod 启动，日志须出现 mod 初始化行 + `Done (` | ✅ Forge 1.20.1 / 1.21.4；✅ NeoForge 1.20.4 / 1.21.1 / 1.21.4（见 §16、§18） |
| L4 真编译（UI 2.0–42.0） | 含自动目录的四屏 Spec + 主题/动画/换行滚动（含滚动条抓取偏移、文字级链接命中、缩放/重开按逻辑行记忆阅读位置、手动滚动退出键盘链接焦点、键盘焦点滚动上下留一行上下文、链接松开提交与按住反馈、滚动条章节刻度、刻度悬停/点击导航、Ctrl+↑/↓ 章节跳转、长距离滚动自适应时长、翻页保留一行重叠、轨道点击滑行、屏幕内按键开关（TOGGLE_KEY；原版在屏幕打开时不派发按键映射）、高对比主题、页脚按钮随窄面板收缩）+ 自动目录（`contentsFor` 把目标屏 heading 生成为深链，条目复用目标标题语言键）+ heading/bullet/note/warn/step 行样式与区块留白 + 屏内搜索（Ctrl+F 开查找条，输入即查；Enter 循环命中并闪烁落点行，右侧 n/m 计数；Esc 先关条；获焦独占键盘——输入开关按键不误关屏，点按不穿透到被遮挡的链接）与命中行高亮（全部命中弱染主题 accent，Enter 落点行即时强化，随输入/循环/关闭同步更新）+ 查找条循环增强（Shift+Enter 反向循环同规回绕、点击 n/m 计数区等价 Enter 前进、悬停计数区 tooltip 说明两键，语言键 `screenSearchCycle`）+ 查找条会话记忆（Ctrl+F 重开恢复上次查询并立即重查；新查询的初始命中从当前阅读行起算、无命中则回卷到顶部）+ 命中分布刻度（搜索激活时滚动条轨道外缘为每个命中行画刻度、当前命中全亮加宽，左侧章节刻度与右侧命中刻度互为镜像）+ 命中刻度交互化（悬停刻度加宽全亮并弹出该命中行文本，点击直接跳到该命中并同步循环序号，锚点固定不随轨道加宽位移） + 查找态正文内边距（查找条打开时正文整体下移一个条带高度：绘制偏移/首行回扫/点击换算（含涂绘区间守卫）/滚动范围共用 bodyPad，开条补偿、关条还原，文档头部第 0 行与 Home 在查找时也完整落在条带下，跳转落点回归视口顶并自然落在条带之下） + 行内链接（动画期命中/逐帧悬停/高亮/tooltip/组件缓存/返回顶部/点击音/本屏 anchor 跳转与落点淡出/跨屏 `screen#anchor` 深链（悬停/焦点 tooltip 显示「目标屏 › 落点章节」）/键盘焦点导航与焦点 tooltip）+ 滚动边缘渐隐 + 关闭淡出过渡（slide 下移/输入锁定）+ 面板投影/页脚分隔线/截断标题 tooltip + 按键/客户端引导的生成工程 `build` | ✅ **9/9 个 UI 适配器**（Fabric 1.20.4/1.21.1/1.21.4、Forge 1.20.1/1.20.4/1.21.4、NeoForge 1.20.4/1.21.1/1.21.4；见 §6.5） |
| L4 真编译（配方/进度） | 数据包 JSON 生成结果 `build` 且文件进 jar | ✅ 两版（见 §7） |
| L4 真编译（实体） | 实体类 + 渲染器 + 注册类 + 掉落表 `build` 且进 jar | ✅ 两版（见 §8） |
| L4 datagen（方案 B） | 数据生成入口 + provider `build` 且进 jar；Gradle 数据任务存在 | ✅ 两版；⚠️ **未运行** datagen（见 §9） |
| L5 一键复验 | `scripts/verify-build.mjs` 按适配器声明的 Gradle 线自动复跑编译 | ✅ 已交付（见 §9） |

## 2. L2 单元与组件测试

命令：`pnpm -r test`

| 包 | 用例数 | 覆盖的行为边界 | 结果 |
| --- | --- | --- | --- |
| `@mcmodkit/core` | 112 | Spec 校验与字段级报错、id 风格转换、模板渲染、生成计划（重复 id/路径守卫）、幂等落盘、外来文件不被篡改、错误码信封、**UI 2.0 计划（主题/主色/对齐/动画/按钮布局/多屏导航/非法 target/默认值/自动增高）**、**跨屏重复 screen id/快捷键拒绝**、**UI 2.2 按钮锚定实时面板尺寸**、**UI 3.0 行样式归一化与样式码输出**、**UI 4.0 行内链接（LINE_LINKS/打开动作/未声明 target 拒绝/无链接注释），UI 5.0 目标标题键与悬停色，UI 6.0 自身链接返回顶部，UI 8.0 anchor 跳转与重复/未声明报错，UI 11.0 跨屏深链（screen#anchor 生成构造参数、目标屏 anchor 校验、自指等价本屏跳转），UI 15.0 note 样式码 3 与按主题取色、UI 26.0 contrast 调色板与按下色 alpha 派生、UI 27.0 SCREEN_KEY_CODE/TOGGLE_KEY 替换（有键与无键屏幕）、UI 28.0 页脚每行按钮宽度/行宽公式与两行独立计算、UI 29.0 `contentsFor` 展开（目标缺失/自指/无 heading/链式目录报错，显式锚点复用、`section_N` 合成与冲突避让）、UI 31.0 目录条目复用标题语言键（目录屏不再生成条目键，冲突场景键映射）、UI 32.0 深链落点章节键（跨屏行输出落点标题的行键，本屏/自链接为空）、UI 33.0 warn 样式码 4 与四主题暖色警告调色板、UI 34.0 step 样式码 5 与按 heading 重置的步号序列、UI 35.0 查找语言键（`screenSearch` 进 `UI_LANG_KEYS`/`{{SCREEN_SEARCH_KEY}}` 契约，生成 SEARCH 常量与 `Search...` 语言条目）** | ✅ |
| `@mcmodkit/adapters` | 69 | 适配器加载/校验/lint、资产解析、真实适配器契约、模板不得硬编码 MC 版本、**所有适配器零残留占位符**、**UI 2.0/2.1/2.2/2.3/3.0/3.1/4.0/4.1/5.0/5.1/6.0/7.0/8.0/9.0/10.0/10.1/11.0/12.0/13.0/14.0/15.0/16.0/17.0/18.0/18.1/19.0/20.0/21.0/22.0/23.0/24.0/25.0/26.0/27.0/28.0/29.0/30.0/32.0/33.0/34.0/35.0/36.0/37.0/38.0/39.0/40.0 切片对每个适配器可生成**、**Screen 的版本签名、渲染顺序、滚动交互（平滑滚动/滚动条抓取偏移/几何复用/逻辑行阅读锚定/章节刻度/刻度悬停与点击/章节跳转/自适应滚动时长/翻页重叠/轨道点击滑行）、屏幕内按键开关（TOGGLE_KEY 顺序/无 active 残留/client.screen 打开守卫）、按下反馈（pressed 条件/加深底色/加粗下划线/高对比调色板穿透）、响应式面板（页脚每行按钮按 panelWidth 收缩）、自动目录（contentsFor 展开为普通 LINE_* 深链，复用既有链接切片；条目 LINE_KEYS 引用目标屏行键）、重建稳定性（动画不重播/缩放与重开保持阅读行/长标题省略）、行样式（heading 竖线/bullet 标记/note 弱化色与引用竖线/warn 暖色 2px 竖线/step 步号右对齐且仅首行/续行缩进/区块留白）、屏内搜索（Ctrl+F 分支先于 TOGGLE_KEY/Esc 先关条/EditBox 链路（hint/maxLength/responder/focus）/输入即查的 Locale.ROOT 小写比较/取模循环命中/计数串/悬停与点按在查找条上不穿透/重建丢弃查找状态）、搜索命中行高亮（`searchHits` 可视行序号映射（0 无命中）/按 `lineStarts` 逻辑行区间构建/落点行 alpha 0x40 其余 0x1C 双档染色/绘制先于落点闪烁与链接悬停/关闭、重建、重查三处置空（测试断言恰好三处））、查找条循环增强（Shift+Enter 反向分支先于 `nextSearchMatch`/计数区点击位于条带分支内且先于文本域委派/反向取模 `prevSearchMatch` 恰一处调用/计数区命中矩形镜像绘制几何/悬停 tooltip 链把计数区分支放到链接之前/语言键模板含 `search_cycle`）、查找条会话记忆（静态字段恰好四处引用/恢复分支位于 `setResponder` 与 `addRenderableWidget` 之间/存值先于清空/起始行取自 `lineForScroll(scrollTarget)` 的扫描与回卷/`closeSearch` 不清字段）、命中分布刻度（轨道外缘每命中一刻度/位置取自 `lineStarts` 行的同一比例公式/固定锚点不随轨道 hover 加宽位移/当前命中或悬停命中全亮 5px 与其余 50% 透明 3px 双档/越界行跳过守卫/绘制在章节刻度之后滑块之前）、命中刻度交互化（`hoveredSearchMark` 逐帧重算且关闭期清空/悬停 tooltip 取 `LINE_KEYS[searchMatches.get(hoveredSearchMark)]`、链序在计数区之后链接之前/标题 tooltip 让位/命中盒守卫与刻度同款竖向 slack/共用跳转助手先写 `searchIndex` 再 `scrollToLine`/助手恰一处定义两处调用：条带分支（覆盖行刻度仍可点、先于文本域委派）与主链（先于轨道滑行））、行内链接（rowLinks 对齐/文字级命中/动画期命中/逐帧悬停/高亮与 tooltip（三分支缓存：未链接/单标题/深链「标题 › 章节」）/生成 switch/按下记录与松开提交）、anchor 行号缓存与落点淡出、键盘链接焦点（focusLink/ensureLineVisible 上下留白与长链接保首行/Enter 门槛/Tab 交还/鼠标退出/手动滚动退出/焦点 tooltip）、跨屏深链的 initialLine 构造与一次性消费、滚动边缘渐隐（仅溢出侧绘制/主题取色/视口过小收敛）、关闭淡出过渡（onClose 延迟切换/输入锁定/slide 下移/完成帧只切一次）、面板投影与页脚分隔线、截断标题 tooltip（含滑动偏移命中）、与 NeoForge tick 事件被钉住** | ✅ |
| `@mcmodkit/cli` | 4 | 参数解析、stdin/文件输入、退出码映射、`--json` 信封 | ✅ |
| `@mcmodkit/mcp-server` | 6 | 工具定义与 `callTool` 分发、错误信封 | ✅ |
| `@mcmodkit/api` | 13 | 路由与状态码（200/400/404/500）、信封结构 | ✅ |

合计 **204 passed / 0 failed**。护栏在迭代中反复拦截真实缺陷：Forge 模板注释硬编码 MC 版本、UI 契约「只实现一半」、Screen 的 `renderBackground` 版本签名写错、1.21 的 `super.render` 覆盖面板、NeoForge 1.20.4 误用 1.21 的 tick 事件、跨屏重复快捷键、按钮沿用编译期面板尺寸导致小窗口溢出、重建时动画重播/滚动跳变/标题溢出、行样式把 union 错误压成行级索引（改为 preprocess 后恢复 `lines.<i>.style` 字段级报错）。

## 3. L3 集成：三个智能体接入面

| 面 | 用例 | 实际结果 |
| --- | --- | --- |
| CLI | `list-versions` | ✅ 3 个目标：fabric-1.21.1、neoforge-1.21.1、forge-1.20.1 |
| CLI | `example -o spec.json` | ✅ 含物品/方块/**一个带 K 键的 guide 屏幕** |
| CLI | `validate spec.json` | ✅ `valid:true`；非法 Spec → 退出码 4 + 字段路径 |
| CLI | `gen spec.json -o out --dry-run --json` | ✅ 返回 28 文件计划、不落盘 |
| CLI | `gen ... --json` | ✅ 三个适配器各写入 28 个文件（26 内容/骨架 + 2 UI） |
| CLI | `adapter forge-1.20.1 --json` | ✅ 构建事实（java 17 / Mojmap / wrapper 8.8 / 注记） |
| MCP | `initialize` / `tools/list` | ✅ `mcmodkit 0.1.0`；5 个工具 |
| MCP | `list_versions` / `get_adapter` / `validate_spec`(±) / `scaffold_mod`(dryRun) | ✅ 全部返回信封 |
| HTTP | `GET /health`、`/api/versions`、`/api/adapters/*` | ✅ 200 |
| HTTP | `POST /api/validate`（±形状）、`POST /api/generate`(dryRun) | ✅ 200 / 400 + 明确提示 |

## 4. L4 真编译（一）：Fabric 1.21.1

结果：**BUILD SUCCESSFUL in 29s**（内容切片）；`examplemod-1.0.0.jar`（10,917 B）+ sources jar。jar 内：`com/examplemod/{ModMain,ModMainItems,ModMainBlocks}.class`、`assets/examplemod/*`、`data/examplemod/loot_table/blocks/*.json`（**单数**）、`data/minecraft/tags/block/mineable/pickaxe.json`（**单数**）、`fabric.mod.json`、`pack.mcmeta`。

## 5. L4 真编译（二）：Forge 1.20.1

工具链：**Temurin JDK 17.0.20.1** + **Gradle 8.8**（ForgeGradle 6 不兼容 Gradle 9）。

结果：**BUILD SUCCESSFUL in 49s**（首次 9m38s，含整套 MCP 反编译流水线）。`examplemod-1.0.0.jar`（11,955 B），经 `reobfJar`；数据包路径 `data/examplemod/loot_tables/blocks/`、`data/minecraft/tags/blocks/mineable/`（**复数**，1.20.1 约定）。

**同一引擎、同一份 Spec、两个版本线，产出两种目录约定**（1.21.1 单数 vs 1.20.1 复数），两者的 jar 均由真实编译器验证 —— 「版本差异数据化」的端到端证据。

## 6. L4 真编译（三）：UI 切片（本轮新增）

### 6.1 生成内容

Spec 里一段声明：

```json
"ui": { "screens": [ { "id": "guide", "title": "Example Mod Guide", "key": "K",
                        "width": 240, "height": 150, "lines": ["...", "...", "..."] } ] }
```

引擎产出（版本无关，装配逻辑全在 core）：`client/<Mod>GuideScreen.java`（Screen 子类：标题、面板尺寸、逐行文本、Done 按钮）+ `client/<Mod>Client.java`（按键注册 + 打开屏幕）+ 4 类语言键（标题/每行/按键名/按键分类）。

### 6.2 真编译证据

| 目标 | 命令 | 结果 |
| --- | --- | --- |
| Fabric 1.21.1 | `verify-build.mjs --adapter fabric-1.21.1 --gradle 9=…gradle-9.5.1… --java-home-21 …` | ✅ **BUILD SUCCESSFUL in 1m58s**；jar 内含 `com/verifyfabric/client/ModMainClient.class`、`ModMainGuideScreen.class`、`fabric.mod.json`（含 `client` entrypoint） |
| Forge 1.20.1 | `verify-build.mjs --adapter forge-1.20.1 --gradle 8=…gradle-8.8… --java-home-17 …` | ✅ **BUILD SUCCESSFUL in 30s**；jar 内含 `com/verifyforge/client/{ModMainClient,ModMainClient$ModBus,ModMainGuideScreen}.class` |

### 6.3 加载器差异确实被模板吸收（同 Spec、三种引导）

| 加载器 | 按键注册 | 每 tick 打开屏幕 | 客户端入口 |
| --- | --- | --- | --- |
| Fabric | `KeyBindingHelper.registerKeyBinding` | `ClientTickEvents.END_CLIENT_TICK` | `ClientModInitializer` + `fabric.mod.json` 的 `client` entrypoint |
| Forge 1.20.1 | `RegisterKeyMappingsEvent.register`（`Bus.MOD` 嵌套订阅类） | `TickEvent.ClientTickEvent`（FORGE 总线，`Phase.END` 判定） | `@Mod.EventBusSubscriber(value = Dist.CLIENT)`，无需元数据声明 |
| NeoForge 1.21.1 | `RegisterKeyMappingsEvent.register`（同名事件） | `ClientTickEvent.Post` | `@EventBusSubscriber(value = Dist.CLIENT)` |
| NeoForge 1.20.4 | `RegisterKeyMappingsEvent.register`（同名事件） | `TickEvent.ClientTickEvent`（融合事件，`Phase.END` 判定） | `@Mod.EventBusSubscriber(value = Dist.CLIENT)`（嵌套注解） |

### 6.4 本轮由真编译发现并修复的缺陷

| # | 现象 | 根因 | 修复 | 复测 |
| --- | --- | --- | --- | --- |
| 1 | Forge 编译：`找不到符号 变量 ModMain` | 客户端类位于 `…​.client` 子包，引用父包的主类常量 `MOD_ID` 却没有 `import`（Java 不隐式导入父包） | 在 Forge/NeoForge 的客户端引导模板中加入 `import {{packageName}}.{{mainClassSimpleName}};` | ✅ Forge BUILD SUCCESSFUL in 30s |
| 2 | （预防性）`Screen#renderBackground` 两版签名不同 | 1.20.1 收 `(GuiGraphics)`，1.21.x 收 `(GuiGraphics,int,int,float)`；均由 `javap` 对真实映射 jar 取证 | 分叉进各自适配器的 `screenClass` 模板，并有测试钉住两侧写法 | ✅ Fabric/Forge 均编译通过 |
| 3 | NeoForge 1.20.4 编译：`找不到符号 EventBusSubscriber / ClientTickEvent` | 1.20.4 的客户端 tick 是融合事件 `net.neoforged.neoforge.event.TickEvent.ClientTickEvent`（判 `Phase.END`），事件注解是嵌套的 `Mod.EventBusSubscriber`；首次移植照抄了 1.21.1 的 `ClientTickEvent.Post` + 顶层 `EventBusSubscriber` | 为 1.20.4 单独写 bootstrap（包名与事件形态按 javap 取证），并加测试钉住两种写法 | ✅ NeoForge 1.20.4 BUILD SUCCESSFUL in 19s |

取证方法延续上一轮：先 `javap` 真实映射 jar 得到签名，再写模板，最后用真实编译器确认 —— 静态检查与编译验证各司其职。

### 6.5 UI 2.0–42.0：交互、主题、动画、性能、响应式、重建稳定性、行样式、行内链接、本屏跳转、跨屏深链、键盘焦点、滚动提示、关闭过渡、面板层级、提示行、滚动条手感、命中一致性、阅读位置记忆、手动滚动焦点退出、链接释放语义、滚动条章节刻度、Ctrl 章节跳转、长距离滚动自适应时长、刻度悬停/点击导航、翻页重叠/轨道点击滑行、屏幕级按键开关、按下反馈/高对比主题、页脚按钮窄面板收缩、自动目录、键盘焦点滚动留白、自动目录语言键复用、深链 tooltip 落点章节、warn 警告行、step 有序步骤行、屏内搜索、搜索命中行高亮、查找条循环增强、查找条会话记忆、命中分布刻度、命中刻度交互化、查找态正文内边距（本轮新增 UI 30.0/31.0/32.0/33.0/34.0/35.0/36.0/37.0/38.0/39.0/40.0/41.0/42.0）

旧 UI 切片只生成静态文本 + Done 按钮：没有换行/滚动/导航，且 1.21 模板在 `render` 里调用 `super.render`，会把面板盖住。本轮把 Screen 模板升级为 UI 2.0，版本事实仍全部留在适配器模板。

**Spec 能力**（`packages/core/src/spec.ts`）：

| 字段 | 取值 | 默认 | 行为 |
| --- | --- | --- | --- |
| `theme` | vanilla / dark / light / contrast | vanilla | 引擎侧 ARGB 调色板（颜色不是版本事实） |
| `accent` | `#RRGGBB` | 主题色 | 分隔条/滚动条强调色 |
| `align` | left / center | left | 正文对齐（居中用 `Font.width` 逐行计算） |
| `animation` | none / fade / slide | slide | 180ms ease-out；结束后不再产生额外绘制 |
| `width` / `height` | 数字 | 220 / 140 | 最小尺寸；页脚按钮与一行正文放不下时自动增高/加宽 |
| `lines` | 字符串或 `{text, style: body/heading/bullet/note/warn/step, target}` | 空数组 | heading = accent 色 + 左侧竖线；bullet = 缩进 8px + 首行方块标记；note = 同缩进 + 弱化色 + 1px 引用竖线；warn = 同缩进 + 主题暖色警告色 + 2px 竖线；step = 同缩进 + 首行 accent 色右对齐自动编号（按 heading 重置计数）；`target` = 行内链接；字符串归一化为 body |
| `buttons` | ≤4 个 `{label,action,target}` | 单个 Done | `open` 的 target 必须是已声明屏幕；`close` 不允许 target；禁止自跳转 |

**交互**：多屏通过构造函数携带父屏，关闭/ESC 返回父屏（无父屏返回游戏），父屏滚动位置保留（重新 `init()` 只钳制、不归零）；按钮是 `Button.builder` + `addRenderableWidget` 的原版控件，悬停、键盘导航与旁白可用；正文超过视口时滚轮、`PageUp`/`PageDown`/`Home`/`End` 平滑滚动（140ms ease-out），拖动滚动条时即时跟手、不加缓动，滚动条悬停/拖动时加宽（`mouseClicked/mouseDragged/mouseReleased/keyPressed` 在 1.20.1 与 1.21.1 签名一致，已由 `javap` 核对）。

**性能**：`Font.split` 的换行结果与每行宽度在 `init()` 缓存；每帧只绘制视口内的行（首末行由动画插值后的滚动位置计算），滚动位置另有 140ms 时间插值、静止时不产生额外绘制；背景每帧只画一次；入场动画 180ms 后 progress 恒为 1。

**UI 2.1（交互与动效打磨）**：

- 平滑滚动：滚轮与 Page/Home/End 走 140ms ease-out；拖动滚动条走 `scrollTo(..., false)`，滑块严格跟随指针；快速连续滚轮从当前插值位置续算，不跳变。
- 位置保留：从子屏返回或窗口缩放都会重新 `init()`，现在只把滚动位置钳制到新的 `maxScroll()`，不再归零；正文重新换行后仍停在原位置附近。
- 解析期护栏：跨屏重复 `screen.id` 或重复快捷键此前只在生成阶段以文件冲突/失效按键暴露，现在在 `parseModSpec` 阶段给出字段级 `SPEC_INVALID`。
- 版本 API 护栏：NeoForge 1.20.4 用融合 tick 事件 + 嵌套注解，1.20.5+ 才拆成 `ClientTickEvent.Post` + 顶层注解；测试分别钉住，避免「在 1.21 能编译、在 1.20.4 编译失败」的模板复制错误。

**UI 2.2（响应式面板）**：

- `width`/`height` 从「固定尺寸」改为「偏好尺寸」：`init()` 把面板钳制到 `this.width - 16` / `this.height - 16`，再用实际面板尺寸重算换行宽度、视口高度、滚动条与边框；窗口放大后恢复偏好尺寸，缩小后自动收缩，Spec 不用改。
- 生成的按钮 `bounds` 不再写编译期坐标，而是以 `left + (this.panelWidth - rowWidth) / 2`、`top + this.panelHeight - FOOTER_HEIGHT + …` 表达，页脚始终居中并贴在面板底边；`PANEL_WIDTH/HEIGHT` 只剩声明、字段初值与钳制输入三处裸引用（测试钉住），防止新绘制路径绕过实时尺寸。
- 场景：高 GUI scale 或小窗口（如 320×240 逻辑分辨率）下，1200×1200 的偏好面板不会跑出屏幕，正文按实际宽度重新换行；这属于布局正确性验证，实际像素效果仍受「无图形客户端」限制。

**UI 2.3（窗口重建与长标题韧性）**：

- 重建语义：`javap` 证实 1.20.1 与 1.21.1 的 `Screen.resize → repositionElements → rebuildWidgets → clearWidgets → init()` 路径会在窗口缩放时重建控件，因此 `init()` 必须幂等。`openedAt` 改为 `-1L` 哨兵，只在首次 `init()` 取时，缩放或从子屏返回不再重播 fade/slide（也不会多建按钮）。
- 滚动位置：重建时先把**当前插值位置** `currentScroll()` 钳制进新 `maxScroll()`，再清动画状态；旧写法读 `scrollOffset` 字段，在缓动进行中缩放会跳回上一次动画起点。
- 长标题：`init()` 缓存 `displayTitle`，标题超过 `panelWidth - 2*BODY_SIDE` 时用 `Font.plainSubstrByWidth` 截断并加 `...`，不再溢出面板；`Font#width(String)` / `plainSubstrByWidth(String,int)` / `drawCenteredString(Font,String,...)` 已在 1.20.1 与 1.21.1 映射 jar 上用 `javap` 核对一致。

**UI 3.0（显式行样式与排版层级）**：

- `lines` 的每一项从纯字符串扩展为 `string | {text, style}`，`style` 取 `body/heading/bullet`；字符串在 zod `preprocess` 阶段归一化成 `{text, style: "body"}`，因此生成器与模板只面对一种形状。选 `preprocess` 而非 `union` 是因为 union 会把非法样式压成 `ui.screens.0.lines.1: Invalid input`，归一化后错误仍是字段级 `ui.screens.0.lines.1.style`。
- 引擎把样式映射成整数码交给模板（`LINE_STYLES = { 0, 1, 2, … }`），语言键只存纯文本；颜色仍由主题调色板决定，模板只负责标记像素：heading 在首行左侧画 2px accent 竖线并用 accent 色绘制文字，bullet 缩进 8px 并在首行画 2×2 方块标记。
- 模板额外缓存 `rowStyles/rowIndents/rowStarts` 三个逻辑行级列表：`Font.split` 出的续行继承样式与缩进，但 `rowStarts` 为 false，所以长 bullet 换行后不会每行都出现方块。九份模板逐条断言这些字段与两种标记的绘制调用，防止移植时只抄样式码却漏掉渲染。
- 场景：说明页/指南页可以用 heading 分出章节、用 bullet 列步骤，不需要为排版写 Java；居中模式下正文仍按面板中心对齐，bullet 的缩进只影响换行宽度与标记位置。

**UI 3.1（区块留白与空行跳过）**：

- 只在 `heading` 之前插入一个空白逻辑行，且仅当它前面已有内容、前一行不是 heading：页首标题不缩进，连续 heading 不产生双倍空隙。空白行以 `FormattedCharSequence.EMPTY` 进入同一套行缓存，行高、滚动、滚动条与视口计算完全不变，不需要额外的布局代码。
- 绘制循环遇到宽度为 0 的行直接 `continue`，空白行不产生 `drawString` 调用；`rowWidths` 同时承担「是否为空行」的判断，不新增字段。
- 视觉结果：章节标题与上一段之间有稳定的 12px 间隔，长页面滚动时不会把标题紧贴在上一段末尾；`align: center` 下空白行仍是整行空白，不破坏居中。
- 9 个模板新增的 7 处断言（`previousStyle`、空行条件、五个缓存列表的同步 add、`continue`）由 `real-adapter.test.ts` 逐模板钉住，防止移植时只复制样式码而漏掉留白逻辑。

**UI 4.0（行内链接导航）**：

- 行项新增可选 `target`（同 Spec 中已声明的屏幕 id）。带 target 的行由引擎排成 `LINE_LINKS`（未链接为 `-1`），并生成 `openLineLink(int)` 的 switch：`case i: this.minecraft.setScreen(new <Target>Screen(this))`，把当前屏作为父屏，返回时沿用既有的父屏/滚动位置语义。未声明 target 在生成期报 `ui.screens.<n>.lines.<i>.target` 的 `SPEC_INVALID`，指向自身在解析期就拒绝。
- 模板按逻辑行缓存 `rowLinks`，绘制时链接行使用 accent 色，悬停行在文字下方画 1px accent 下划线；`mouseMoved` 更新 `hoveredLink`，`linkAt` 用 `currentScroll()`、正文起点与固定行高把鼠标坐标换算成逻辑行，因此自动换行出的续行、滚动后的行都能正确命中。`mouseClicked` 先判滚动条、再判链接，避免拖动滚动条时误触。
- **回归缺陷（已修复）**：UI 3.1 的空白 heading 行也必须向 `rowLinks` 追加 `-1`，否则第一次 heading 之后所有 `rowLinks` 与 `rows` 索引错位，点击会打开错误的屏幕或漏点。该不变量已加入九个模板的逐条断言（`this.rowLinks.add(-1);`）。
- 交互边界（UI 4.0 时）：链接只响应鼠标点击，键盘焦点与旁白由页脚的原版按钮承担；正文行不是 widget，为每行建控件会破坏「只画视口行」的性能模型。UI 10.0 用 `focusedLink` 整数焦点扩展了键盘可达性，仍未为行创建 widget。
- 场景：说明页正文里直接写「打开设置」「查看致谢」，读者不必先把视线移到页脚找按钮；链接与 bullet/heading 可组合（demo 的两条 bullet 就是链接），长文档里可以做成目录式跳转。

**UI 4.1（动画期命中与逐帧悬停）**：

- 链接命中此前只在 `mouseMoved` 时更新：鼠标不动、内容平滑滚动或 slide 入场时，下划线与可点击行会和实际文字错位。现在 `currentSlide()` 统一 slide 位移，`linkAt`、`scrollbarContains`、`scrollToMouse` 都计入它；`render` 每帧以真实鼠标坐标刷新 `hoveredLink`，悬停下划线随文字移动，入场动画期间的点击也落在玩家看到的位置。
- 删除 `mouseMoved` 覆盖后每帧只多一次整数比较（行号换算），不分配对象、不做字符串查找；绘制循环仍只遍历视口行，性能模型不变。
- 该不变量已加入九个模板的逐条断言（`currentSlide`、`int slide = this.currentSlide();`、三处 `+ this.currentSlide()`、不再出现 `mouseMoved`），9 个适配器重编译通过。

**UI 5.0（链接悬停反馈与目标提示）**：

- 悬停链接时，行背景叠一层低透明度 accent（引擎按当前屏幕 accent 生成 `LINK_HOVER_COLOR = accent | 0x33000000`，颜色仍不进入模板），文字下方保留 1px accent 下划线；背景只画在文字行矩形外扩 2px 的范围，自动换行的每一行都会高亮。
- 鼠标悬停时在指针处弹出 tooltip，内容是该链接目标屏的**标题语言键**（`Component.translatable(LINE_TARGET_KEYS[hoveredLink])`），因此标题随 `en_us.json` 本地化，不需要在 Java 模板里复制一份标题。`LINE_TARGET_KEYS` 由引擎从 screen id 映射到已生成的标题键，未链接的行为空串，模板用 `isEmpty()` 跳过。
- `GuiGraphics.renderTooltip(Font, Component, int, int)` 在 1.20.1 / 1.20.4 / 1.21.1 / 1.21.4 的映射 jar 上用 `javap` 核对一致，因此九个模板共用同一行调用；tooltip 在 fade 遮罩之后绘制，避免入场时被压暗。
- 性能：高亮是两次 `fill`，tooltip 仅在 `hoveredLink >= 0` 时调用；没有新增每帧分配，也没有为行创建 widget。

**UI 5.1（悬停路径零分配）**：

- tooltip 此前在悬停帧里 `Component.translatable(...)`，视线停在链接上时每帧都会新建一个组件。现在 `init()` 在构建行缓存时顺带生成 `lineTooltips`（未链接行存 `null`），`render` 只做一次列表读取与判空；语言键在每次打开屏幕时重新解析，切换语言后重新打开即生效。
- `init()` 同时算出 `hasLinks`，没有链接的屏幕在 `render` 中直接令 `hoveredLink = -1`，跳过 `linkAt` 的行号换算；有链接的屏幕行为不变。
- 缓存与 `rows`/`rowLinks` 一样在 `init()` 开头清空，窗口缩放或从子屏返回触发的重建不会重复追加。
- 9 个适配器重编译通过（见下表）。

**UI 6.0（长文档返回顶部）**：

- 行内链接的 `target` 指向自身屏幕时，解析器不再拒绝。生成器把该行排进 `LINE_LINKS`（仍是可点击/高亮的链接），但动作是 `this.scrollTo(0, true)`——复用滚轮与 PageUp/Home 的 140ms ease-out 平滑滚动，不创建重复屏幕，也不改变父屏链。
- 该行的 `LINE_TARGET_KEYS` 为空，因此 `lineTooltips` 缓存为 `null`：悬停仍有背景高亮与下划线，但不会弹出「本屏标题」这种无意义的 tooltip。目标屏幕存在性校验、按钮自跳转拒绝均保持不变。
- 场景：长说明页末尾放一条「返回顶部」，读者不必滚回右上角去抓滚动条；demo 的 guide 末尾即用一条指向自身的 bullet 演示。引擎只改动作，不改模板——九个模板已有的 `scrollTo(int, boolean)` 就是契约的一部分，测试逐模板钉住其签名。
- 9 个适配器重编译通过（见下表）。

**UI 7.0（链接点击音）**：

- `openLineLink` 在分发动作前播放原版 `SoundEvents.UI_BUTTON_CLICK`：`this.minecraft.getSoundManager().play(SimpleSoundInstance.forUI(SoundEvents.UI_BUTTON_CLICK, 1.0F))`。换屏链接与页脚按钮的声音一致；「返回顶部」这类不换屏的动作也有可听见的确认，不再只靠视觉滚动暗示点击已生效。
- `SoundEvents.UI_BUTTON_CLICK` 在 1.20.1+ 是 `Holder<SoundEvent>`（不是 1.20 之前的 `SoundEvent` 字段），`SimpleSoundInstance.forUI` 在 1.20.1/1.20.4/1.21.1/1.21.4 的映射 jar 上都有 Holder 重载，`Minecraft.getSoundManager()` 也存在——因此九个模板共用同一行，无需按版本分叉。
- 音效是模板契约：测试要求每个 screen 模板导入 `SimpleSoundInstance`/`SoundEvents`，且播放语句必须位于 `openLineLink` 的第一行、在动作 switch 之前。
- 9 个适配器重编译通过（见下表）。

**UI 8.0（本屏 anchor 跳转）**：

- 长文档此前只有「打开子屏」与「返回顶部」两种链接动作，目录无法直接跳到某一节。现在行对象可声明 `anchor`，链接的 `target` 写成 `#name` 即在本屏内跳转：解析期先为每个屏幕登记 anchor，重复命名与未声明的 `#anchor` 都在 `ui.screens.<n>.lines.<i>.anchor|target` 给出字段级错误；跨屏 target 的「已声明屏幕」校验不受影响。
- 生成器把 `#anchor` 行输出为 `case i: this.scrollToLine(n); break;`，`LINE_TARGET_KEYS` 留空，因此悬停有高亮与下划线、但不弹无意义的 tooltip；跨屏链接仍是 `new …Screen(this)`，自身链接仍是 `scrollTo(0, true)`。
- 模板在 `init()` 里、heading 空白行插入之后记录 `lineStarts.add(rows.size())`，把**逻辑行**映射到 `rows` 的首行索引；`scrollToLine(int)` 做一次列表读取，把「行号 × 行高」交给既有的 `scrollTo(int, boolean)`，复用 140ms ease-out，滚动目标不会因为自动换行或区块空白而偏移。重建时 `lineStarts` 与 `rows` 一起清空重建，锚点始终对应当前排版。
- 场景：guide 顶部目录直接跳到「What is generated」「Try it」，中段可直接跳到结尾的返回顶部；demo 的 guide 已有 `welcome/generated/try` 三个 anchor 与两条 `#` 链接。引擎只改变动作与校验，模板新增一个缓存列表和一个 helper，没有引入版本 API。
- 9 个适配器重编译通过（见下表；其中三个 1.20.x 目标在修正验证脚本的旧 spec 后二次编译）。

**UI 9.0（落点淡出高亮）**：

- 平滑滚动解决的是「怎么过去」，但没有回答「到哪了」：长文档跳转后，目标行可能落在面板中部，与周围正文难以区分。现在 `scrollToLine` 在启动滚动的同一刻记录 `flashLine` 与 `flashStartedAt`，`drawBody` 在绘制文字和悬停高亮之前，用 600ms 线性淡出的 accent 背景标出该逻辑行的全部可见行；跳转完成后会残留约 460ms 的可见高亮，读者能立即确认落点。
- `flashColor(int row)` 用 `lineStarts` 算出目标逻辑行的可见行区间 `[start, end)`，把自动换行出的每一行都覆盖到，未命中、已过期或 `flashLine < 0` 时返回 0，`drawBody` 因此不需要额外分支；过期时把 `flashLine` 置回 `-1`，静止页面每帧只付一次负数判断。整个特性只增加两个字段、一个 helper 与一次 `fill`，不分配对象、不加计时器、不调用新的版本 API。
- 重建语义与既有缓存一致：`init()` 清空 `flashLine`，窗口缩放或从子屏返回不会闪到旧行；重复点击同一 anchor 会重新计时，落点仍然明确。因为绘制发生在 scissor 内，高亮只出现在正文视口，不会越过面板边框或页脚。
- 这是纯模板特性，引擎与 Spec 不变；测试逐模板钉住 `FLASH_MS`、字段、`init()` 清空、`scrollToLine` 中的赋值顺序、`flashColor` 与 `drawBody` 的绘制调用，避免某个适配器只实现「跳转」而漏掉落点反馈。
- 9 个适配器重编译通过（见下表）。

**UI 10.0（键盘链接焦点）**：

- 正文链接此前只响应鼠标（UI 4.0 的交互边界）。现在 `↑`/`↓` 在链接行之间循环移动焦点，焦点行左侧画 3px accent 竖线、行底画 1px accent 下划线；`ensureLineVisible` 只在目标行超出视口时滚动最小距离，长文档里焦点不会跑出屏幕。
- 焦点只用 `focusedLink` 这个 int 表示，不创建 widget：方向键在 `LINE_LINKS` 上跳过未链接行并循环；`focusLink` 先 `setFocused(null)` 让页脚按钮失焦，避免方向键被按钮的导航逻辑抢走；`Enter`（含小键盘）仅在 `getFocused() == null` 时处理，因此页脚按钮聚焦时 Enter 仍激活按钮，`Tab` 则清除链接焦点、把焦点交还原版控件的焦点链。
- `AbstractContainerEventHandler.getFocused()`/`setFocused(GuiEventListener)` 已在 1.20.1/1.20.4/1.21.1/1.21.4 映射 jar 上用 `javap` 核对，允许 `setFocused(null)`，因此九个模板共用同一段按键逻辑，不需要版本分叉。`openLineLink` 仍是「先播放点击音、再记录焦点、最后分发动作」，换屏/返回顶部/anchor 跳转复用同一条路径，键盘与鼠标的反馈一致。
- 焦点标记是两次 `fill`，`focusLink` 只在按键事件里执行；静止帧不新增分配或计时。重建时 `init()` 清空 `focusedLink`，窗口缩放不会留下指向旧行号的焦点。
- 场景：键盘玩家不必在正文里摸鼠标——Tab 到页脚后按 ↑/↓ 直接进入链接，滚轮/PageUp/PageDown 仍负责长距离阅读，`Esc` 仍返回父屏。这是纯模板特性，Spec 与引擎不变。
- 测试逐模板钉住字段、焦点标记绘制、`focusLink`/`ensureLineVisible`、按键分支与 `openLineLink` 中的焦点赋值顺序。9 个适配器重编译通过（见下表）。

**UI 10.1（鼠标退出键盘焦点）**：

- `mouseClicked` 的第一条语句清空 `focusedLink`：点击滚动条、页脚按钮或空白区域都会退出键盘链接导航，焦点环不会在鼠标操作后残留。按在链接上时，`openLineLink` 在播放点击音后把焦点设回该行，因此「鼠标点过的链接」仍保留可见标记，两种输入状态不会互相矛盾。
- 这是一行模板改动，不新增绘制或状态；测试逐模板钉住清空语句必须位于 `scrollbarContains` 判断之前。

**UI 11.0（跨屏深链）**：

- 目录此前只能在单屏内跳转：跨屏 `target` 一律打开目标屏顶部。现在 `target` 支持 `screen#anchor`，解析正则从「屏幕 id 或 `#anchor`」扩展为三选一；`UiSpec.superRefine` 在全部屏幕可见后校验目标屏的 anchor，错误定位到 `ui.screens.<n>.lines.<i>.target` 并列出该屏可用 anchor，生成器再做一层同样的存在性守卫。
- 生成器把 `new TargetScreen(this, <逻辑行>)` 写入 switch，行号来自目标屏的 anchor 声明（不是运行时字符串查找），tooltip 仍显示目标屏标题；`screen` 与当前屏同名时等价于 `#anchor`，只调用 `scrollToLine`，不会打开当前屏的第二份副本。
- 模板新增 `initialLine` 字段与 `(Screen parent, int initialLine)` 构造重载（无参与单参构造都委托给它）。`init()` 在 `lineStarts` 构建、滚动钳制与 `openedAt` 初始化之后消费一次 `initialLine`：先取局部变量、立即清回 `-1`，再 `scrollToLine(line)`。因此首次打开会平滑落到章节并触发既有的 600ms 落点高亮，而窗口缩放或从子屏返回触发的重建不会再次跳动。
- 场景：guide 正文的「Open Settings…」直接落到 settings 的 accent 说明，读者不必打开后再自己找；多屏手册可以把目录做在首页，每一节放在独立屏幕。这是 Spec/引擎/模板协作的新能力：解析期校验、生成期行号、模板期一次性消费各司其职。
- 测试覆盖深链生成（目标行号、目标屏标题键、构造重载）、目标屏 anchor 缺失的字段级报错、自指深链的等价跳转，以及九个模板的 `initialLine` 字段/构造/init 顺序。9 个适配器重编译通过（见下表）。

**UI 12.0（焦点 tooltip 与滚动边缘渐隐）**：

- 键盘导航此前只有 accent 竖条：能看出「选中哪一行」，却看不出「这一行会去哪里」——鼠标悬停有目标标题 tooltip，键盘焦点没有。现在 `render` 在鼠标悬停分支之外增加 `focusedLink >= 0` 分支：从 `lineTooltips` 取同一份缓存组件，用 `lineStarts` 的行首索引加当前 slide 与滚动偏移算出焦点行底部锚点，再调用与悬停相同的 `renderTooltip` 重载。两种输入共享缓存与文案，焦点帧不分配新对象、不做字符串查找。
- 正文视口上下边缘各加 4px 渐隐：上方还有未显示内容时，顶部以 `PANEL_COLOR` 从 0xC0 渐隐到 0x30；下方还有内容时镜像。渐隐绘制在 scissor 内、正文文字之前，颜色从主题面板色派生（保留 RGB、只改 alpha），dark/light/vanilla 三套主题自动匹配，不新增 Spec 字段。无溢出的一侧完全跳过；视口小于 8px 时 `fadeHeight` 收敛到 `viewport / 2`，不会画出反向渐变。每侧最多 4 次 `fill`，静止帧不测量、不分配。
- 场景：长文档用滚轮翻到章节中段时，边缘渐隐提示「上面还有内容」；纯键盘操作（`↑`/`↓`/`Enter`）时，焦点 tooltip 与鼠标悬停给出同样的目标信息，无障碍与手感不再分叉。
- 测试逐模板钉住焦点分支、`lineStarts` 锚点、`EDGE_FADE_HEIGHT`、上下两侧的 scroll 条件与 `(PANEL_COLOR & 0x00FFFFFF) | (alpha << 24)` 取色；9 个适配器真编译通过（见下表）。

**UI 13.0（关闭淡出过渡）**：

- 此前 ESC 与页脚「Close」瞬间切屏，与入场 fade/slide 不对称。现在 `onClose()` 在 `fade`/`slide` 主题下不再立即切换，而是记录 `closingAt` 启动 120ms 关闭动画：`render` 末尾按 `closeProgress()`（ease-in `t²`）叠加全屏淡出，`slide` 主题同时把面板与正文整体下移最多 12px；淡出满帧的那一次 `render` 才调用 `setScreen(parent)`，`closeSwitched` 保证只切一次。`none` 主题保持立即关闭，常量折叠后连关闭动画分支都不会执行。
- 关闭期间输入必须失效：`mouseScrolled`/`mouseClicked`/`mouseDragged`/`mouseReleased`/`keyPressed` 都在第一行吞掉事件，滚动条命中与链接悬停也在 `render` 中被短路，避免等待切换时又打开一个屏幕、随后被挂起的 `setScreen` 覆盖；`onClose` 重入直接返回，`mouseReleased` 会清掉拖动状态。键盘焦点行在启动关闭时清空，焦点 tooltip 不会压在淡出层上。
- 场景：ESC、页脚「Close」、子屏返回共用同一收尾节奏；返回父屏仍保留原滚动位置与已完成的入场状态（父屏 `openedAt` 未重置），不会重播动画。
- 测试覆盖九个模板的常量/字段/两个 helper/满帧切换/5 个输入守卫/`onClose` 重入与 `none` 短路；9 个适配器真编译，`javap` 验证 `onClose` 的关闭分支与页脚关闭按钮对 `onClose` 的委派。

**UI 14.0（面板层级与标题可发现性）**：

- 面板此前与压暗的世界之间只有 1px 边框，视觉上像贴在背景上。`drawPanel` 先画两层半透明黑投影（外圈 3px `0x18000000`、内圈 1px `0x30000000`）再画面板，两档 alpha 形成柔和落影；只用 `fill`、无纹理、无新版本 API，投影随 pose 与滑动/关闭位移一起移动。
- 有按钮时在页脚上方画一条与标题下分隔线同色的 `BORDER_COLOR` 细线（`FOOTER_HEIGHT > 12` 才画，无按钮的屏幕常量折叠后不产生绘制），正文与操作区的层次更清楚。
- 长标题被 `plainSubstrByWidth` 截成 `...` 后原先无从查看完整文本。`trimmedTitle()` 现在记录 `titleTruncated`；鼠标落在标题带（命中计入入场/关闭滑动偏移）且没有悬停/焦点链接时，用 `renderTooltip` 显示完整标题组件。tooltip 复用原版绘制与换行，不新增语言键；关闭过渡期间不显示，避免压在淡出层上。
- 性能：投影 2 次 `fill`、分隔线 1 次 `fill`（仅按钮屏）、标题命中只在截断且鼠标位于标题带时执行，静止帧不分配。
- 测试覆盖九个模板的字段/投影色/分隔线条件/标题命中/tooltip 调用；9 个适配器真编译，`javap` 在该目标看到 `titleTruncated` 字段、`titleContains` 方法与 3 个 `renderTooltip` 调用点（悬停/焦点/标题）。

**UI 15.0（note 提示行）**：

- 正文此前只有 body/heading/bullet：提示、注意事项只能当普通正文写，读者分不出主次。新增 `note` 样式（引擎样式码 3）：缩进 8px，用各主题的弱化色 `NOTE_COLOR`（vanilla `0xFF8C8C8C`、dark `0xFF8A94A6`、light `0xFF6B6B6B`），并在文字左侧画 1px 引用竖线；竖线对每条换行行都绘制，长提示读起来像引用块，而 heading/bullet 仍只在首行画标记。
- 颜色选择统一收进 `rowColor(style, link)`：链接行与 heading 优先 accent，因此带 `target` 的 note 仍是可点击的高亮行，不会因弱化色失去语义；普通 note 才落到 `NOTE_COLOR`，body 保持原色。
- 颜色仍在引擎侧按主题生成（颜色不是版本事实），模板只消费 `{{NOTE_COLOR}}` 与样式码；换主题不需要改模板，新增适配器只要保留占位符与 `rowColor` 分支。
- 测试覆盖：core 断言 note → 样式码 3 与 dark/vanilla 的 `NOTE_COLOR` 取色；adapters 逐模板断言占位符、`rowColor` 分支、缩进条件、`style == 3` 竖线与 `x - 6 … x - 5` 的 1px 宽度；9 个适配器真编译。

**UI 16.0（滚动条抓取偏移）**：

- 此前按下滚动条任意位置都会先把滑块中心吸到指针：点轨道会跳一段，抓滑块再拖也会先跳，读者很难做精细定位。现在 `mouseClicked` 先判断指针是否落在滑块内：命中滑块时记录 `scrollbarGrabOffset`（指针相对滑块顶部的像素），拖动只重算滚动目标而不改偏移，滑块始终跟手；未命中滑块（轨道）才以 `thumbHeight / 2` 居中，保留原来「点哪滚到哪」的快速定位。
- 滑块高度与顶部位置收进 `scrollbarThumbHeight()`/`scrollbarThumbTop(int)`：`drawBody` 画拇指、`scrollbarContains` 命中、`scrollToMouse` 拖动换算共用同一几何，避免命中区与可见滑块随平滑滚动漂移。偏移在 `init()`（窗口重建）与 `mouseReleased` 的两条分支（正常释放、关闭过渡中释放）都清回 `-1`，不会把上一次拖动的相对位置带进下一次。
- 性能不变：只是把既有整数运算移进 helper，拖动帧仍只做 O(1) 运算并调用既有的即时 `scrollTo`。
- 测试覆盖九个模板的字段、两个几何 helper、滑块命中条件、轨道居中回退、`scrollToMouse` 的 grab 表达式与三处清理；9 个适配器真编译，`javap` 看到 `mouseClicked` 先调 `scrollbarThumbTop()` 再进入偏移分支。

**UI 17.0（链接命中区与文字一致）**：

- 悬停背景、下划线与键盘焦点环一直只覆盖文字，但 `linkAt` 按面板内宽判定：短链接右侧的空白也会被当成链接，点击后直接切屏，视觉与行为不一致。现在命中判定在拿到 `rowLinks` 后继续读取该行的 `rowWidths` 与 `rowIndents`，按绘制时的同一左缘（居中屏按面板宽度重算）与宽度判定，并保留 2px 容差；换行后的每个片段各按自己的宽度命中，行尾空白不再可点。
- 键盘路径不变：焦点仍在逻辑行之间移动，`Enter` 打开整条逻辑链接；`rowWidths == 0` 的空白 heading 行在读取宽度前已被 `link < 0` 挡掉。
- 视觉与行为统一后，`hoveredLink` 与点击判定共用同一函数，悬停高亮出现的区域就是可点击区域；没有新增绘制或分配。
- 测试覆盖九个模板的 `link < 0` 早退、行宽/缩进左缘、居中分支、2px 容差与禁止旧整行返回；9 个适配器真编译。

**UI 18.0（阅读位置按逻辑行记忆）**：

- 此前重建只保留原始像素偏移：窗口或 GUI scale 变化会重新换行，同一像素在新布局里落在别的段落，父屏返回/缩放后读者需要重新找位置；关闭书再打开则完全回到顶部。现在 `init()` 在清空行缓存前，把旧布局顶部所在的**逻辑行**、行内行偏移（该行第几个换行行）与该行内的像素偏移记下来，重建后按新的 `lineStarts` 恢复同一逻辑行；布局未变时行偏移与像素偏移原样还原，因此从子屏返回不会产生跳动。
- 每个屏幕类新增 `private static int rememberedLine = -1` 与实例标记 `laidOut`：`scrollTo` 每次改变目标时用 `lineForScroll(clamped)` 记录目标逻辑行，新实例首次 `init()`（且没有跨屏深链 `initialLine`）直接恢复到该行行首；本次游戏会话内关闭再打开同一本书会回到上次阅读处，切换世界/重启游戏自然回到顶部，按 `Home` 也会把记忆重置到第 0 行。深链的 `initialLine` 在恢复之后消费，仍优先落到目标 anchor。
- 新增 `lineForScroll(int)` 用 `lineStarts` 做行区间查找（空布局返回 `-1`），缩放锚定与重开记忆共用，不新增绘制与分配；`scrollTo` 的缓动、拖动即时化与滚轮步长均未改变。
- 测试覆盖九个模板的静态记忆字段/`laidOut`、锚点采集、重建恢复表达式、深链优先级、`lineForScroll` 区间循环与 `scrollTo` 写入；9 个适配器真编译。

**UI 18.1（手动滚动退出键盘链接焦点）**：

- 键盘链接焦点是跨帧状态：用 ↑/↓ 选中一条链接后，玩家还可以用滚轮或 PageUp/PageDown/Home/End 把这一行滚出视口。此前焦点、焦点行高亮与 tooltip 都还在，`Enter` 会打开一个屏幕上看不见的链接，像是无缘无故跳屏。现在滚轮分支与四个翻页/首尾键分支都先把 `focusedLink` 清回 `-1`，再调用 `scrollTo`：焦点环、焦点 tooltip 与 Enter 目标随手动滚动一起消失，`Tab` 回到页脚按钮的正常顺序。
- 清除只写在输入处理器里，不动 `scrollTo` 本身：`focusLink` 为把焦点行带入视口而调用的 `ensureLineVisible` 滚动不会误清刚选中的链接，↑/↓ 连按仍是连续导航。
- 无新增绘制或分配，滚动路径只多一次字段写入，滚轮手感不变。
- 测试覆盖九个模板的滚轮清除（兼容 3/4 参数签名）、四个按键分支的清除顺序、`ensureLineVisible` 签名与焦点赋值，并要求清除出现在 `scrollTo` 之前；9 个适配器真编译。

**UI 19.0（行内链接按下/释放语义）**：

- 此前链接在 `mouseClicked` 里立即执行：按下的瞬间就切屏或跳章节，想反悔已来不及；在链接文字上起手拖动（例如误把正文当滚动条）也会先触发跳转。
- 现在按下只把命中行记进 `pressedLink`，不播放声音、不执行动作；`mouseReleased` 用同一个 `linkAt` 文字级命中重测，仍落在同一行才播放按钮音并执行打开/本屏跳转/深链/返回顶部。拖走、松在行内空白或别的链接上都算取消，与页脚原版按钮的「按下—松开」语义一致。
- 待打开行在 `init()`（缩放/返回重建）、滚轮、任意按键、滚动条释放与关闭过渡分支里清空：滚动或切屏后松手不会隔帧补开旧链接。没有新增绘制或分配，只是把一次动作从按下挪到释放。
- 测试覆盖九个模板的字段/重置、按下只记录、释放命中条件与顺序、两处早退清空、滚轮与按键清空；9 个适配器真编译。

**UI 20.0（滚动条章节刻度）**：

- 滚动条此前只回答「读到哪」（滑块位置），不回答「书里有什么」：长 guide 滚到中段后，标题全部在视口之外，玩家无法从滚动条判断章节分布，也不知道当前段落属于哪一章。
- `init()` 重建行缓存时顺带缓存每个 heading 的首个视觉行（`headingRows`，续行不重复记），绘制滚动条时在轨道左侧按 `row * trackHeight / rowCount` 画出 1px 刻度，轨道、刻度、滑块依次绘制，滑块仍在最上层；页面不溢出（无滚动条）时既不缓存绘制也不占宽。
- 视口顶部所在章节的刻度用全亮 `ACCENT_COLOR` 并加宽到 5px，其余刻度用 50% 透明同色（`(ACCENT_COLOR & 0x00FFFFFF) | 0x80000000`）3px；`currentHeading(scroll)` 取「已滚到视口顶部及以上」的最后一个 heading，题头/前言阶段（尚未滚过任何 heading）没有亮刻度。
- 不在绘制期扫描全部行：`headingRows` 通常只有个位数，每帧循环只遍历标题而非全文；无新增绘制层级外的状态，滚动、悬停、拖动与命中逻辑均未改变。
- 测试覆盖九个模板的字段/清空、只在 heading 首行记录、当前章节判定、轨道→刻度→滑块的绘制顺序、无滚动条时提前返回；9 个适配器真编译。

**UI 21.0（Ctrl+↑/↓ 章节跳转）**：

- 有了章节刻度后，玩家能看到章节却仍只能用滚轮/翻页一屏屏挪过去；长 guide 想从第 1 章到第 4 章要反复滚动，键盘用户也没有「下一节」这种量级的移动。
- `keyPressed` 在手动滚动分支内先拦截 `Ctrl+↑`/`Ctrl+↓`：用 `headingStep(forward)` 沿 `headingRows` 找当前章节之前/之后的标题行（`currentHeading(scrollTarget)` 为基准，到达首/尾时返回 `-1`），命中后调用既有的 `scrollToLine(lineForScroll(row * LINE_HEIGHT))` 平滑滚动并复用 anchor 落点 600ms 高亮；没有标题时该组合键不消费，行为与之前一致。
- 组合键在 `hasLinks` 的 `↑`/`↓` 链接焦点之前处理并总是 `return true`：按住 Ctrl 不会误移动链接焦点，也不会在首/尾章节把按键漏给默认处理；跳转前的 `focusedLink`/`pressedLink` 清空沿用输入路径的既有规则。
- 不新增绘制、不新增缓存：`headingStep` 只遍历个位数的 `headingRows`，落点复用 anchor 的 flash 与滚动路径，滚动目标按 `scrollTarget` 计算，连续按键可跨多章。
- 测试覆盖九个模板的 `headingStep` 字段/循环、Ctrl 组合键的拦截位置（在 `maxScroll` 分支内、`hasLinks` 之前）、落点调用与清焦点顺序；9 个适配器真编译。

**UI 22.0（长距离滚动自适应时长）**：

- 锚点/深链/Ctrl 章节跳转/Home/End 与「返回顶部」此前和滚轮一样固定 140ms：短距离轻快，但从文档开头跳到末尾时整段文字在几帧内掠过，读不出移动方向，落点像是瞬移。
- `scrollTo` 拆成两个入口：滚轮、PageUp/PageDown 与键盘链接自动滚动仍走 `scrollTo(target, animate)`（固定基础时长），长距离跳转调用新的三参重载并传入 `scrollDurationFor(target)` —— 以 `|目标 - 当前目标| / 12` 在 140ms 基础上加时，封顶 280ms；时长在动画真正启动时写入 `scrollDurationMs`，被滚轮打断后立即回到基础节奏。
- 复用了同一套缓动与中断逻辑：只把 `currentScroll()` 的两处常量换成实例字段，不新增绘制/缓存/状态机；`scrollToLine`（anchor、跨屏深链、Ctrl 章节跳转共用）、Home/End 与生成器里的自链接「返回顶部」都改走自适应入口。
- 测试覆盖九个模板的常量/字段、`currentScroll` 读取实例时长、两参委托与锚点、距离公式与封顶、仅在 animate 分支写入时长、`scrollToLine`/Home/End 的自适应调用，以及滚轮/翻页仍为基础时长；9 个适配器真编译。

**UI 23.0（章节刻度悬停与点击）**：

- 刻度此前只回答「章节在哪」，不能作为入口：看到目标章节后仍要 Ctrl 逐节或拖滚动条。现在悬停刻度会全亮加宽并显示章节标题，点击直接跳到该章节，落点闪一次 anchor 高亮，并沿用 UI 22.0 的远跳时长。
- `init()` 在缓存 `headingRows` 的同时并行缓存 `headingLines`（逻辑行）与 `headingTooltips`（`Component`，每 init 一次），`render` 逐帧用 `headingAt(mouseX, mouseY)` 求悬停刻度；tooltip 链在悬停链接/键盘焦点之后，标题 tooltip 条件加入 `hoveredHeading < 0`，三者不会叠加。
- 命中区是轨道左侧 7px 的 gutter、纵向 1px 刻度加 ±2px 容差，`maxScroll <= 0` 时直接返回 -1；`mouseClicked` 在 `scrollbarContains` 之前先处理刻度，因此点中刻度不会启动拖动，点其余轨道仍是拖动/居中语义。
- 不新增每帧分配：悬停只写一个 int，章节标题在 init 缓存；刻度绘制仍按轨道→刻度→滑块的顺序，悬停/当前章节用全亮，其余半透明，悬停宽度 7px、当前 5px、其余 3px。
- 测试覆盖九个模板的双缓存与清空、悬停逐帧计算与关闭清空、悬停加宽/全亮、tooltip 分支与标题让位、`headingAt` 的 x/y 命中与无滚动早退、点击先于滚动条且走 `scrollToLine`；9 个适配器真编译。

**UI 24.0（翻页重叠与轨道滑行）**：

- `PageUp`/`PageDown` 原先整屏步进：新页第一行紧接上一页最后一行的下一行，跨页时容易丢句。`pageStep()` 返回 `max(LINE_HEIGHT, viewportHeight() - LINE_HEIGHT)`，相邻两页重叠一行，翻页仍走基础 140ms。
- 滚动条点轨道原先 `scrollTo(..., false)` 瞬移，和 UI 22.0 之后的长跳手感不一致。现在 `mouseClicked` 先算出 `onThumb`：命中滑块（或按下滑块）仍即时跟手；点轨道则把 `scrollbarScrollAt(mouseY, grabOffset)` 的结果交给三参 `scrollTo`，按距离自适应时长滑行过去。
- 目标换算抽成 `scrollbarScrollAt(mouseY, grabOffset)`，绘制/命中/拖动/点击共用同一套轨迹几何；`scrollToMouse` 只负责用当前抓取偏移即时调用它。拖动期间不再受滑行动画影响，松手位置就是指针位置。
- 测试覆盖九个模板的 `pageStep` 公式与两个翻页调用、`onThumb` 分支顺序、轨道点击的三参 `scrollTo`、helper 的存在与 `scrollToMouse` 的即时委托；9 个适配器真编译。

**UI 25.0（按键开关，初版已由 UI 27.0 修正）**：

- 绑定按键此前每次都 `setScreen(new ...)`：指南已打开时再按 K 会在其上叠一层新屏幕，父屏、阅读位置和关闭动画全部丢失。初版让屏幕类持有静态 `active` 实例，tick 侧按键分支先问 `isActive()`，已打开就 `closeActive()`。
- 后续对 Forge 1.20.1 `KeyboardHandler.keyPress` 的字节码取证发现：Screen 未消费按键后直接跳到 `ForgeHooksClient.onKeyInput` 返回，`KeyMapping.set/click` 只在 `Minecraft.screen == null` 时执行，因此 tick 侧分支永远走不到 `closeActive()`。UI 27.0 改为屏幕自身处理该键并删除这套静态状态，见下节。

**UI 26.0（按下反馈与高对比主题）**：

- 链接从 UI 19.0 起「松开才提交」，但按住期间没有任何视觉变化：玩家按下后不知道这次点击是否已被记录，也看不出拖走会取消。现在悬停且 `pressedLink` 命中该行时，行底色从 `LINK_HOVER_COLOR`（accent alpha `0x33`）换成更深的 `LINK_PRESSED_COLOR`（alpha `0x66`），下划线从 1px 加粗到 2px；拖走后 `hovered` 变假，立即恢复普通悬停态，与「拖走即取消」的语义一致。
- 不新增字段、不新增每帧分配：`pressed` 由既有逐帧 `hoveredLink` 与 `pressedLink` 现算，仍只在绘制循环里读一次；松开后的打开/取消逻辑完全复用 UI 19.0。
- 新增 `contrast` 主题：全不透明近黑面板（`0xFF08090B`）、亮黄 accent（`0xFFFFD400`）、近白正文（`0xFFF0F0F0`）与仍可读的弱化色（`0xFFC9CED6`），适合明亮或花哨场景；面板不透明也避免了世界画面透过面板降低对比。调色板继续只在引擎侧（颜色不是版本事实），模板只消费 `PANEL_COLOR`/`ACCENT_COLOR`/`NOTE_COLOR`/`LINK_HOVER_COLOR`/`LINK_PRESSED_COLOR` 占位符，新增主题不需要改适配器。
- 测试覆盖九个模板的 `LINK_PRESSED_COLOR` 占位符、`pressed` 条件顺序、按下色/悬停色三元与下划线厚度三元；core 覆盖 contrast 调色板常量与 `0x66` 按下色派生、demo 使用 contrast 的三屏 Spec 在 9 个适配器真编译，Fabric 1.21.1 与 Forge 1.20.1 的 `javap` 确认按下色常量与 `getfield pressedLink` 比较分支仍在字节码中。

**UI 27.0（屏幕内按键开关）**：

- 根因：Forge 1.20.1 的 `KeyboardHandler.keyPress` 在 Screen 未消费按键后重新读取 `Minecraft.screen`，非空就跳到 `ForgeHooksClient.onKeyInput` 并 return；`KeyMapping.set`/`KeyMapping.click` 只存在于 screen 为空的路径。也就是说任何 Screen 打开时原版按键映射都不会产生 click，UI 25.0 在客户端 tick 里的 `consumeClick` 分支不可能关闭已打开的指南。
- 修复：引擎在生成屏幕类时把 Spec 键渲染成 `SCREEN_KEY_CODE`（沿用适配器的 `keyCodePattern`，未绑定按键为 `-1`）；屏幕模板声明 `private static final int TOGGLE_KEY`，并在 `keyPressed` 的关闭锁检查之后、所有其他按键处理之前判断 `TOGGLE_KEY >= 0 && keyCode == TOGGLE_KEY`，命中就调用既有的 `onClose()`（120ms 淡出与输入锁定）并消费该键。按键映射仍负责在无屏幕时打开指南。
- 删除 UI 25.0 的静态 `active`/`isActive()`/`closeActive()` 与 `removed()` 覆盖：它们已无调用方，保留只会误导后续适配器维护者。tick 侧打开语句改为 `consumeClick() && client.screen == null`，既挡住快速连按排队的一次 click，也不会在我们的屏幕已打开时重建界面。
- 局限：屏幕内识别的是 Spec 键对应的 GLFW 键码；玩家若在「控制」里把该按键改绑到别的键，打开仍走新绑定，但屏幕内的关闭仍认 Spec 原键。这是屏幕层拿不到映射状态的取舍，已列入运行时验证清单。
- 测试覆盖九个模板的 `TOGGLE_KEY` 占位符、拦截顺序（先于 `pressedLink` 清空）、无 `active`/`removed` 残留与打开守卫；core 覆盖有键屏幕 `TOGGLE_KEY = Key.K` 与无键屏幕 `-1`。192 个用例通过，9 个适配器真编译，Fabric 1.21.1 与 Forge 1.20.1 的 `javap` 确认常量与 `keyPressed` 分支。

**UI 28.0（页脚按钮随窄面板收缩）**：

- 旧生成器把每个按钮固定为 100px：2 个按钮的整行需要 208px，居中后要求面板至少 208px；但 `panelWidth` 会被窗口钳制（`min(PANEL_WIDTH, this.width - 16)`），高 GUI scale 或窄窗口下可能低于 240px，按钮便左右越出面板边框。旧注释声称「钳到小窗口仍保证按钮在边框内」，只在面板足够宽时成立。
- 生成器现在为页脚的每一行声明 `footerButtonWidthN = Math.max(1, Math.min(100, (panelWidth - 16 - 8 * (rowCount - 1)) / rowCount))` 与 `footerRowWidthN`，`.bounds` 的 x 与宽度都引用它们；同一行第二个按钮偏移 `footerButtonWidthN + 8`。4 个按钮的两行各自独立计算（末行可能只有 1 个按钮）。面板足够宽时仍是 100px 与原布局，只有窄面板才收缩；`width` 继续是偏好尺寸，不是按钮可用宽度的硬保证。
- 只改引擎生成器，模板与九个适配器无需变更。测试覆盖 2 按钮与 4 按钮两行的公式、行内偏移与宽度；192 个用例通过，9 个适配器真编译。

**UI 29.0（自动目录屏 `contentsFor`）**：

- 场景：长指南的章节链接此前要手写，并随 heading 增删同步维护，漏改即断链。新增 `ScreenSpec.contentsFor`；声明后，生成器在构建类名/锚点映射之前把它展开：目标屏的每个 `heading` 生成一条 `bullet` 深链（文本取标题，target 为 `screen#anchor`），排在本屏作者自己的 `lines` 之前。
- 锚点：标题已有 `anchor` 直接复用；没有的写入 `section_N` 合成锚点，并跳过目标屏已用名字（`section_1` 已被占用时退到 `section_1_2`）；多个目录屏引用同一目标时复用同一批合成锚点。合成锚点只存在于生成计划内，作者无需维护。
- 复用既有路径：展开产物就是普通行，`LINE_STYLES`/`LINE_LINKS`/`LINE_TARGET_KEYS`/动作 switch、跨屏构造参数（标题逻辑行）、目标屏 `init()` 的滚动与 600ms 落点高亮、返回阅读位置、目标屏标题 tooltip 全部沿用；模板与九个适配器零改动。
- 校验：`UiSpec` 拒绝未声明的 `contentsFor`、自指、目标是另一个自动目录屏（禁止链式）以及目标没有任何 heading；引擎对未声明目标另有 `SPEC_INVALID` 兜底。错误均带字段路径。
- 只改引擎（spec + generator）；测试覆盖展开顺序/样式码/链接/目标标题键、显式锚点复用与 `section_1` 冲突避让、四类校验错误；194 个用例通过。

**UI 30.0（键盘焦点滚动留一行上下文）**：

- 旧 `ensureLineVisible` 只做最小滚动：焦点链接正好贴住视口上/下边缘，前后文只剩半行，键盘读者看不出这一行属于哪一段。现在上下各留 `LINE_HEIGHT` 一行余量（`start - margin` / `end + margin - viewportHeight()`），`scrollTo` 仍负责钳到 `[0, maxScroll]`，首尾章节自然贴边。
- 长链接边界：向下聚焦时用 `Math.min(start, end + margin - viewportHeight())`，当链接比视口还高时目标仍是 `start`，优先保住首行，不会为了底部留白把焦点行开头推到上边缘之外；向上聚焦的 `Math.max(0, ...)` 同时挡住负目标。
- 只改九个适配器的 `ensureLineVisible`，无新增字段/分配，鼠标滚动、章节跳转与翻页路径不变。测试钉住四个表达式；194 个用例通过，9 个适配器真编译，Fabric 1.21.1 与 Forge 1.20.1 的 `javap` 确认 `Math.max`/`Math.min` 与 `scrollTo(IZ)`。

**UI 31.0（自动目录复用标题语言键）**：

- 场景：UI 29.0 的目录条目把标题文本复制进目录屏自己的 `line.N` 语言键——改标题或补翻译要改两处，漏改即「目录与正文不一致」，语言文件里同一句出现两次。生成器展开时按标题在目标屏的逻辑行索引算出标题自己的语言键，记入 `lineKeyByLine`（行对象 → 键）；主循环取键优先用该记录，未命中的行仍按 `screenLine` 模板现算。
- 结果：目录屏 `LINE_KEYS` 三条条目直接是 `guide.line.1/line.5/line.10`，只有作者手写的行生成 `contents.line.N`；同一份 Spec 生成的语言文件 34 条行键零重复值，翻译者只改一处。
- 纯引擎（generator）改动，模板零改动；测试覆盖键复用、目录屏不再产生条目键与 `section_1` 冲突场景的键映射。194 个用例通过，9 个适配器真编译；Fabric 1.21.1 与 Forge 1.20.1 的 `javap` 在目录屏静态初始化看到前三条 `ldc` 引用目标屏行键。

**UI 32.0（深链 tooltip 显示落点章节）**：

- 场景：跨屏深链的悬停/焦点 tooltip 此前只有目标屏标题——同一目标屏被多个条目引用时（目录与正文都指向 settings），tooltip 全是「Settings」，看不出会落到哪一节。现在引擎为每个链接行多输出一条 `LINE_SECTION_KEYS`：跨屏深链取落点 anchor 行自己的语言键（与标题键同源，改标题/补翻译只改一处），本屏 `#anchor` 跳转与自链接输出空串。
- 模板侧按三态缓存 `Component`：未链接行 `null`、本屏/自链接单标题、跨屏深链 `标题 + " › " + 章节`（`MutableComponent.append(String)`/`append(Component)` 链）；三个分支全部在 `init()` 一次构建进既有 `lineTooltips`，悬停帧零分配。引擎新增 `{{LINE_SECTION_KEYS_JAVA}}` 占位符并纳入 `screenClass` 契约（模板缺占位符即 lint 报错），九个模板同步消费。
- 测试：core 在 fixture 模板断言跨屏行 `SECTIONS = { "", "screen.examplemod.settings.line.3" }` 与目录屏全引用标题行键；adapters 逐模板钉住 `LINE_SECTION_KEYS` 声明与三分支 tooltip 缓存；194 个用例通过。九个适配器真编译，Fabric 1.21.1 与 Forge 1.20.1 的 `javap` 在 `init` 看到 `append` 两次重载（偏移 401/413）与落点键常量 `settings.line.3`（偏移 487）。

**UI 33.0（warn 警告行）**：

- 场景：note（UI 15.0）把补充说明降级为弱化色，但「会覆盖文件」「会丢数据」这类告诫与普通备注共享同一形态——长指南里两者都是 8px 缩进 + 左侧竖线 + 弱化色，扫读时分不出哪条更要紧。新增 `warn` 样式（样式码 4）：沿用 note 的缩进与竖线几何，但换成各主题的暖色警告色、竖线加粗到 2px——颜色与粗细双通道编码，色觉障碍下 2px 也比 note 的 1px 更抓眼。
- 引擎：`SCREEN_PALETTES` 每主题新增 `warn`（vanilla `0xFFFF7043` / dark `0xFFFF8A65` / light `0xFFE64A19` / contrast `0xFFFF9100`），`{{WARN_COLOR}}` 与 `{{NOTE_COLOR}}` 一并进 `screenClass` 契约（模板漏占位符即 lint 报错，防止把 warn 画成 note 色）；`rowColor` 链变为 `style == 3 ? NOTE_COLOR : style == 4 ? WARN_COLOR : BODY_COLOR`，warn 行在 `indent` 判断里与 bullet/note 同取 8px，语言键只存纯文本。
- 模板：绘制块在 note 的 1px 竖线后追加 `if (style == 4)` 分支，用 `guiGraphics.fill(x - 6, y, x - 4, y + LINE_HEIGHT, WARN_COLOR)` 画 2px；续行与 note 一样继承缩进与竖线，整段警告在视觉上连成一条。九个模板同步。
- 测试：core 断言 dark 主题 `STYLES = { 0, 4 }` 与 `WARN = 0xFFFF8A65`、contrast `WARN = 0xFFFF9100`；adapters 逐模板钉住 `WARN_COLOR` 声明、`style == 4` 分支与 2px fill 几何，并更新既有 rowColor/缩进断言；196 个用例通过。九个适配器真编译，Fabric 1.21.1 与 Forge 1.20.1 的 `javap` 看到 `WARN_COLOR` 字段、`rowColor` 的 `iconst_4` 分支（dark 取 `sipush -30107` 即 `0xFFFF8A65`）与 2px 竖线的 `x-6→x-4` 几何。

**UI 34.0（step 有序步骤行）**：

- 场景：教程类指南常写「1. 挖矿 2. 合镐」这类操作步骤，此前只能用 bullet 逐条列出——读者得自己数到第几步，增删一步后全文序号还得手改，改漏就错位。新增 `step` 样式（样式码 5）：沿用 bullet 的 8px 缩进，但首行不画方块标记，改为在标记槽内右对齐绘制自动编号（「1.」「2.」…），编号在每个 `heading` 处重置——每节各自读作一份有序清单，插入/删除步骤只改 Spec 行、序号自动重排。
- 引擎：渲染时预计算 `STEP_TEXT` 数组（按行输出 `"1."`、`"2."`…，非 step 行与 heading 前的重置位为空串），经新占位符 `{{STEP_TEXT_JAVA}}` 注入模板并纳入 `screenClass` 契约（模板漏占位符即 lint 报错，防止把编号写死或把 step 退化成 bullet）；正文颜色链不变（step 文本仍用正文色），编号取 accent 色。
- 模板：新增与各行索引严格对齐的 `rowStepTexts` 列表（`clear()`、heading 前 spacer 行填 `""`、换行时只有首行 `first ? STEP_TEXT[line] : ""` 携带编号），绘制块在 bullet 的方块分支后追加 `else if (style == 5)`：`drawString(this.font, step, Math.max(left + 1, x - 3 - this.font.width(step)), y, ACCENT_COLOR, false)`——右对齐贴住正文左缘、两位数不压正文，`Math.max(left + 1, …)` 兜住极窄面板。九个模板同步。
- 测试：core 断言按 heading 重置的步号序列（`STYLES = { 1, 5, 5, 0, 1, 5 }` 配 `STEPS = { "", "1.", "2.", "", "", "1." }`）与样式枚举接受 `step`；adapters 逐模板钉住 `STEP_TEXT` 声明、`rowStepTexts` 的字段/清空/spacer/换行四处维护与 `style == 5` 的 drawString 分支，并更新既有缩进断言；198 个用例通过。九个适配器真编译，Fabric 1.21.1 与 Forge 1.20.1 的 `javap` 看到 `STEP_TEXT` 静态初始化的 `"1."`/`"2."` 常量、`rowStepTexts` 字段与 `style == 5` 分支的 `drawString(Font, String, int, int, int, boolean)` 调用。

**UI 35.0（屏内搜索）**：

- 场景：长指南（本 Spec 的 guide 已有 21 行、3 个章节）想找「某个词在哪一节」此前只能通读或用章节刻度猜位置。新增屏内搜索：Ctrl+F 在标题分隔线下弹出查找条，边输入边匹配（大小写不敏感）；首个命中自动滚入视口并闪烁落点行；Enter/小键盘 Enter 在命中间取模回卷循环，右侧实时显示 `n/m` 计数（无命中为 `0/0` 并转为弱化色）；Esc 先关查找条、再按才关屏幕，Ctrl+F 在查找条已开时等价「关闭」。
- 引擎：`langKeys.screenSearch` 进 `UI_LANG_KEYS`（无键由既有「有 screens 即要求语言键」守卫拦截）与 `screenClass` 契约 `{{SCREEN_SEARCH_KEY}}`（模板硬编码英文提示即 lint 报错）；占位与提示共用一条语言键，生成的 `en_us.json` 增补 `Search...` 条目。
- 模板：新增 `SEARCH_LANG_KEY` 常量与 `searchBox`/`searchTexts`/`searchMatches`/`searchIndex` 字段；`keyPressed` 的查找分支位于关闭锁之后、`TOGGLE_KEY` 判断之前——查找条获焦时按键先交给 EditBox（输入开关按键的字面值不会误关屏幕），未获焦时 Esc 仍先关条；命中文本惰性缓存为 `Locale.ROOT` 小写；查找条绘制在正文顶部的不透明条带上（条带先于刻度/滑块，滚动条地图仍居最上层）；点按条带区域整体路由 `super.mouseClicked`（EditBox 自收，被遮挡的链接/滚动条不可点），悬停时抑制链接高亮；`init()` 丢弃查找状态（缩放/重建不保留半开状态）；九个模板同步。
- 测试：core 断言 `SEARCH` 常量与两条屏幕的 `Search...` 语言条目；adapters 逐模板钉住 `keyPressed` 分支顺序、EditBox 构造/`setHint`/`setResponder`/`setFocused` 链、取模循环、计数串、悬停与点按不穿透、重建丢弃；199 个用例通过。九个适配器真编译，Fabric 1.21.1 与 Forge 1.20.1 的 `javap` 看到 `keyPressed` 的 `hasControlDown`+70→`toggleSearch`、256→`closeSearch`、257/335→`nextSearchMatch`（否则 `super`）、75→`onClose` 次序与 EditBox 方法链。

**UI 36.0（搜索命中行高亮）**：

- 场景：UI 35.0 的查找只把首个命中滚入视口并短暂闪烁——输入后视口之外还有多少命中、当前 `n/m` 对应哪一行，都要靠 Enter 逐条翻。新增命中行染色：命中行的整行背景铺一层主题 accent 的弱透明色（12% 左右），Enter/输入会落到的那一条用更强的 25% 染色即时标出——「全部命中在哪」与「现在停在哪」一眼可分，且染色把折行后的所有可视行都覆盖（一行内多处命中合并为同一档，不逐字拆分）。
- 引擎：本轮为纯模板迭代——不新增占位符/语言键/Spec 字段，Engine 零改动，`searchHits` 由模板从既有 `lineStarts` 与查找结果自行推导。
- 模板：新增 `private int[] searchHits;` 可视行序号映射（0 无命中、1 起为第 n 个命中；元素只覆盖 `rows.size()` 长度，绘制时带 `i < length` 守卫防旧数组越界）；`refreshSearch` 在收集到命中后按 `lineStarts` 的逻辑行区间（`start = lineStarts.get(line)`、`end = line + 1 < lineStarts.size() ? lineStarts.get(line + 1) : rows.size()`，与 `flashColor` 同款区间）为每个可视行写命中序号；绘制块里的染色 fill 位于 `flashColor` 落点闪烁与链接悬停底色之前——落点闪烁与悬停高亮照旧压在最上层读得清；`alpha = searchHits[i] - 1 == searchIndex ? 0x40 : 0x1C`，同用 `(ACCENT_COLOR & 0x00FFFFFF) | (alpha << 24)` 几何与闪烁/悬停一致（`x - 2, y - 1, x + rowWidths + 2, y + LINE_HEIGHT - 1`）；关闭查找、`init()` 重建、每次重查三处将数组置空/重建，`searchHits` 不残留旧命中。九个模板同步。
- 测试：adapters 逐模板钉住 `searchHits` 字段声明、`refreshSearch` 的区间构建循环（`new int[rows.size()]`/`lineStarts` 三元 end/`searchHits[row] = i + 1`）、双档 alpha 三元与完整 fill 行、染色先于 `flashColor` 的绘制次序、以及 `this.searchHits = null;` 恰好出现在三处（关闭/重建/重查）；200 个用例通过。九个适配器真编译，Fabric 1.21.1 与 Forge 1.20.1 的 `javap` 看到 `searchHits` 字段与三处 `putfield null`（关闭/init/重查）、`refreshSearch` 内 `newarray int` + 双层循环（`lineStarts.get`/三元 `end`/`i + 1` 存值）、绘制块 alpha 的 `bipush 64`（0x40）/`bipush 28`（0x1C）选择路径与染色 `fill` 的 `ishl 24`/`ior` 位序（Fabric 1.21.1 与 Forge 1.20.1 的偏移逐条一致，见下表）。

**UI 37.0（查找条循环增强）**：

- 场景：UI 35.0/36.0 的查找条只会单向前进——错过一个命中要按 Enter 绕一整圈；右角的 `n/m` 计数对鼠标用户只是一串数字，既不能点，也没有任何提示说明 Enter 能一条条走。本轮把循环双向化并把计数区变成指针控件：`Shift+Enter` 反向走（同样回绕），点击计数区等价 Enter 前进，悬停计数区弹出一条说明两键的 tooltip——键盘与鼠标两条路径都补齐，且提示文本走语言键可翻译。
- 引擎：新增语言键 `screenSearchCycle`（进 `UI_LANG_KEYS`，与 `screenSearch` 同为屏幕适配器必填）与 `screenClass` 契约占位符 `{{SCREEN_SEARCH_CYCLE_KEY}}`（模板硬编码提示即 lint 报错）；引擎按 `langKeys.screenSearchCycle` 渲染每屏键、`en_us.json` 兜底文案 "Enter: next, Shift+Enter: previous"。
- 模板：新增 `SEARCH_CYCLE_LANG_KEY` 常量（每屏取自身 id）与 `private boolean hoveredSearchCounter;`；`render` 逐帧 `this.hoveredSearchCounter = this.closingAt < 0L && this.searchBox != null && this.searchCounterContains(mouseX, mouseY);`；tooltip 链把计数区分支放在最前（计数区叠在首行链接之上，链序即优先级）；`mouseClicked` 的查找条条带分支内先判 `if (button == 0 && !this.searchMatches.isEmpty() && this.searchCounterContains(mouseX, mouseY))` → `nextSearchMatch()`（条带其余部分仍整体委派文本框）；`keyPressed` 的 Enter 分支按 `Screen.hasShiftDown()` 分流 `prevSearchMatch()`/`nextSearchMatch()`；`prevSearchMatch` 用 `(this.searchIndex + this.searchMatches.size() - 1) % this.searchMatches.size()` 保持非负回绕；`searchCounterContains` 命中矩形镜像绘制几何（右锚 `left + this.panelWidth - 6 - this.font.width(count)`、横向 ±2px、纵向同条带 `top .. top + 24`）。九个模板同步。
- 测试：core 断言 `SEARCH_CYCLE` 常量与两条屏幕的说明语言条目；adapters 逐模板钉住常量声明、悬停字段与逐帧赋值、tooltip 链顺序（计数区先于链接）、条带内的计数区点击分支与委派次序、Enter 的 Shift 分流与 `prevSearchMatch` 恰一处调用、反向取模与计数区命中矩形；201 个用例通过。九个适配器真编译，`javap` 取证见下表与证据段。

**UI 38.0（查找条会话记忆）**：

- 场景：UI 35.0–37.0 的查找条每次打开都是全新的——关掉再开，上次的查询没了；在文档中段按 Ctrl+F 输入一个词，视口总是先跳到文档第一条命中，再按 Enter 才走回来。本轮把查找条变成会话工具：重开时恢复上次查询并立即重查（浏览器查找框的直觉），新查询的初始命中改为「当前阅读行起的第一个命中」，没有才回卷到顶部——在长指南里从「我读到这里」继续找，而不是每次都从开头。
- 引擎：本轮为纯模板迭代——不新增占位符/语言键/Spec 字段，Engine 零改动。
- 模板：新增 `private static String lastSearchQuery = "";`（静态字段随类留存，`closeSearch` 与 `init()` 都不清它）；`toggleSearch` 在 `setResponder` 之后、`addRenderableWidget` 之前 `if (!lastSearchQuery.isEmpty()) { this.searchBox.setValue(lastSearchQuery); }`，`setValue` 触发响应器使命中集即时重建；`refreshSearch` 第一行存值 `lastSearchQuery = query;`（空串也会存，清空查询后重开不再回填）；初始命中块从 `this.searchIndex = 0; this.scrollToLine(this.searchMatches.get(0));` 改为先 `int topLine = this.lineForScroll(this.scrollTarget);`，再线性扫描取首个 `this.searchMatches.get(i) >= topLine` 的索引（默认 0 天然回卷顶部），最后 `this.scrollToLine(this.searchMatches.get(this.searchIndex));`。九个模板同步。
- 测试：adapters 逐模板钉住静态字段声明与恰好四处引用（`closeSearch` 不触碰）、恢复分支位于 `setResponder` 与 `addRenderableWidget` 之间、`refreshSearch` 存值先于清空、起始行扫描与回卷的次序，以及 UI 35.0 切片里初始落点断言同步改为 `get(this.searchIndex)`；202 个用例通过。九个适配器真编译，`javap` 取证见下表与证据段。

**UI 39.0（搜索命中分布刻度）**：

- 场景：UI 36.0 的染色只覆盖视口内的命中行，UI 38.0 让重开接着上次查——但「这个词在整篇文档里有多少处、分布在哪」仍要顺着 Enter 一条条翻才知道。滚动条左侧已有章节刻度当文档地图，本轮把命中分布也画上去：搜索激活时在轨道外缘（与左侧章节刻度相对的另一侧）为每个命中行画一道短刻度，当前循环落点全亮且加宽——不用滚动就能看出命中集中在前半还是散落全篇。
- 引擎：本轮为纯模板迭代——不新增占位符/语言键/Spec 字段，Engine 零改动。
- 模板：绘制块在章节刻度循环之后、滑块之前插入命中循环：`int markLeft = x + trackWidth;` 锚定轨道外缘（章节刻度从左缘向左伸出，命中刻度从右缘向右伸出，互不遮挡），逐项以 `this.lineStarts.get(line) * trackHeight / rowCount`（与章节刻度同一比例公式）定位，`boolean target = i == this.searchIndex;` 决定档位——当前命中 `ACCENT_COLOR` 全亮 5px、其余主题 accent 50% 透明 3px（与章节刻度的当前/其余档一致，仅所在边不同）；陈旧索引（`line >= this.lineStarts.size()`）直接跳过；纯视觉层，导航仍走 Enter/Shift+Enter/点击。九个模板同步。
- 测试：adapters 逐模板钉住注释、`markLeft` 取轨道外缘、`lineStarts` 比例定位、`target` 条件与 5/3 宽度、全亮/半透明双档 fill、越界守卫，以及绘制次序（章节刻度之后、滑块之前）；203 个用例通过。九个适配器真编译，`javap` 取证见下表与证据段。

**UI 40.0（命中刻度交互化）**：

- 场景：UI 39.0 把命中分布画上了轨道，但它只是地图——看见「这里有个命中」却点不动，想知道命中在哪一行只能按住 Enter 一条条转。本轮把刻度变成控件：悬停的刻度加宽全亮并弹出该命中行的文本（和章节刻度悬停弹章节名同款），点击直接跳到该命中——鼠标用户不再需要键盘循环；顺带修正 39.0 的锚点：`markLeft` 原取 `x + trackWidth`，悬停加宽轨道时全部刻度右移 2px、5px 目标刻度还会越过面板右缘。
- 引擎：本轮为纯模板迭代——不新增占位符/语言键/Spec 字段，Engine 零改动。
- 模板：`markLeft` 改为固定 `x + 2`（悬停不再位移）；新增 `private int hoveredSearchMark = -1;` 与 `render` 逐帧赋值（`this.hoveredSearchMark = this.closingAt < 0L ? this.searchMarkAt(mouseX, mouseY) : -1;`）；命中循环内 `boolean hovered = i == this.hoveredSearchMark;` 与 `target || hovered ? 5 : 3` 双档（悬停刻度升到与目标同宽同亮）；tooltip 链在计数区之后、链接之前插入命中分支，取 `Component.translatable(LINE_KEYS[this.searchMatches.get(this.hoveredSearchMark)])`（`searchTexts` 由 `LINE_KEYS` 逐行构建，索引空间一致），标题 tooltip 条件加入 `this.hoveredSearchMark < 0` 让位；新 `searchMarkAt(double, double)` 镜像 `headingAt`（守卫 `searchBox == null || searchMatches.isEmpty() || maxScroll() <= 0`，x 界 `x + 2`..`x + 7`，纵向 ±2px，定位公式与绘制同款）；新 `jumpToSearchMark(double, double)` 共用跳转（先 `this.searchIndex = mark;` 再 `this.scrollToLine(this.searchMatches.get(mark));`，Enter 接着从该命中走）；`mouseClicked` 两处调用：条带分支内先判计数区、再判命中（查找条覆盖的首行刻度仍可点击），主链在章节刻度之后、轨道滑行之前。九个模板同步。
- 测试：adapters 逐模板钉住字段与逐帧赋值、双档宽度与 fill、固定锚点（旧锚点断言 not.toContain）/tooltip 链序与取值/标题让位/命中盒守卫与 x 界/跳转助手次序与恰一处定义两处调用/两处点击的相对次序（条带内先于委派、主链先于轨道滑行），并同步更新 UI 14.0 标题条件、37.0 链序与 39.0 刻度切片至新形态；204 个用例通过。九个适配器真编译，`javap` 取证见下表与证据段。

**UI 41.0（查找态落点避让查找条）**：

- 场景：UI 35.0–40.0 把屏内搜索做成了完整的导航工具（命中循环、会话记忆、命中分布刻度、刻度单击跳转），但所有跳转都统一落到正文视口顶部——而查找条打开时条带恰好盖住顶部 24px，刚落到的命中行/章节/链接目标就藏在条带之下，用户必须再手动滚一行才能读。本轮让查找条的开关决定落点：条带打开时所有 `scrollToLine` 跳转整体下移一个条带高度，关条后恢复原有顶对齐。
- 引擎：本轮为纯模板迭代——不新增占位符/语言键/Spec 字段，Engine 零改动。
- 模板：新增 `private static final int SEARCH_BAR_CLEARANCE = 24;`（与条带几何 `bodyTop - 8 .. bodyTop + 16` 的 24px 高对齐），`scrollToLine` 在 `int target = this.lineStarts.get(line) * LINE_HEIGHT;` 与三参 `scrollTo(target, true, this.scrollDurationFor(target));` 之间插入 `if (this.searchBox != null) { target = Math.max(0, target - SEARCH_BAR_CLEARANCE); }`——查找条打开时落点行顶落在条带底下方 8px，`Math.max` 让文档头部以 0 钳制、不产生负滚动，`scrollDurationFor` 消费钳制后的目标所以自适应时长仍按真实位移计算；Enter/Shift+Enter 循环、命中刻度点击、Ctrl 章节、锚点/深链/返回顶部都经 `scrollToLine` 而自然继承。九个模板同步。
- 测试：adapters 逐模板钉住常量声明、完整守卫切片（落点计算 → 条带守卫 → 钳制 → 三参 `scrollTo` 的原文断言）、`SEARCH_BAR_CLEARANCE` 恰好两处引用（声明与钳制）、`scrollToLine` 内的次序链（flash 记录先于条带守卫、守卫先于落点调用），并同步把「Ctrl 章节跳转」「跳转自适应时长」「行内链接」三处既有测试中的四处 `scrollToLine` 切片更新为新的守卫形态；205 个用例通过。九个适配器真编译，`javap` 取证见下表与证据段。

**UI 42.0（查找态正文视口内边距）**：

- 场景：UI 41.0 试图用「落点下移」让跳转避开查找条，但 `Math.max(0, target - 24)` 的 0 钳制把文档头部的避让吃掉——查找时滚到顶部，第 0/1 行依旧藏在条带（`bodyTop - 8`..`bodyTop + 16`）之下，手动滚到顶也读不到正文第一行；而且避让只覆盖跳转路径，「正文顶部被条带遮住」这个根因还在。本轮把 41.0 的落点补丁升级为视口内边距：查找条打开时正文整体下移一个条带高度、滚动范围同步扩展，第 0 行与 Home 都完整落在条带下方，关条再原样收回——阅读位置在开关瞬间不跳。
- 引擎：本轮为纯模板迭代——不新增占位符/语言键/Spec 字段，Engine 零改动。
- 模板：保留 `private static final int SEARCH_BAR_CLEARANCE = 24;` 并新增单点判定 `private int bodyPad() { return this.searchBox != null ? SEARCH_BAR_CLEARANCE : 0; }`，五处消费——`maxScroll()` 改为 `Math.max(0, this.contentHeight() + this.bodyPad() - this.viewportHeight())`（滚动条轨道/滑块/命中刻度经它自动同步）；绘制块首行回扫 `int first = Math.max(0, (scroll - this.bodyPad()) / LINE_HEIGHT);`；逐行 y `int y = bodyTop + this.bodyPad() + i * LINE_HEIGHT - scroll;`；`linkAt` 行换算 `int row = (this.currentScroll() + (int) mouseY - top - this.bodyPad()) / LINE_HEIGHT;` 并紧跟涂绘区间守卫 `if (mouseY < top + this.bodyPad() + row * LINE_HEIGHT - this.currentScroll()) { return -1; }`（向零截断会把正文上缘空带的点击归到第 0 行，行顶未达即拒绝）；`toggleSearch` 在 `setResponder` 之后 `this.scrollTo(this.scrollOffset + this.bodyPad(), false);` 补偿（先于会话回填）、`closeSearch` 在 `this.searchBox = null;` 之后 `this.scrollTo(this.scrollOffset - SEARCH_BAR_CLEARANCE, false);` 还原。41.0 在 `scrollToLine` 内的落点钳制整体移除（回归朴素两行 `int target = …; this.scrollTo(target, true, this.scrollDurationFor(target));`），`SEARCH_BAR_CLEARANCE` 全文件恰好三处引用（声明、helper、关条补偿）。九个模板同步。
- 测试：adapters 以 42.0 测试替换 41.0 测试——逐模板钉住常量声明与 `bodyPad()` 完整切片、`SEARCH_BAR_CLEARANCE` 三处引用计数、五处消费切片（maxScroll/首行回扫/逐行 y/行换算/涂绘守卫）与两处补偿切片、`toggleSearch` 的 responder → 补偿 → 回填次序链、`closeSearch` 的置空 → 还原次序链、旧钳制切片 `not.toContain`，并把「Ctrl 章节跳转」「跳转自适应时长」「行内链接」三处既有测试中的四处 `scrollToLine` 切片回退为朴素两行；205 个用例通过。九个适配器真编译，`javap` 取证见下表与证据段。

**1.21 渲染顺序缺陷**：`javap` 证实 1.21.1 `Screen.render()` 内部会再次调用 `renderBackground`，旧模板 `renderBackground → super.render` 导致背景覆盖面板且重复绘制；同时 `renderables` 字段在 1.21.1 为 private（1.20.1 为 public）。新模板改为「单次 renderBackground + 显式遍历 `this.children()` 绘制 Renderable」，lint 增加三条硬规则（禁止 `super.render(`、`renderBackground` 恰好一次、必须出现 `this.children()`）。

**真编译证据（UI 42.0，9/9）**（同一份含自动目录的四屏 Spec：dark/slide 的 guide、dark/fade 且 `contentsFor` 指向 guide 的 contents、light/fade/center 的 settings、contrast/none 的 credits，guide 21 行中含 3 个 heading、7 个 bullet、1 个 note、1 个 warn、2 个 step、5 条链接（1 条 `settings#accent` 跨屏深链落到 accent 说明，1 条跨屏打开 credits，2 条 `#anchor` 跳到本屏章节，末尾 1 条指向自身成为「返回顶部」）与 3 个 anchor，contents 在生成期补上 3 条 bullet 深链，另有作者写的 1 行正文与 1 个 note，settings 5 行含 1 个 anchor 与 heading/bullet/note，credits 9 行含 heading/bullet/note，另有长文本换行与滚动、4/2/1 按钮（guide 的 4 个分两行）、K/O 两个按键；`--spec docs/examples/ui2-demo.json`，target 与 modId 按适配器覆写。九个目标生成的 `GuideScreen.java` 均含 `ensureLineVisible` 的 `int margin = LINE_HEIGHT;`、`this.scrollTo(Math.max(0, start - margin), true);`、`int target = Math.min(start, end + margin - this.viewportHeight());` 与 `this.scrollTo(Math.max(0, target), true);`，`headingRows` 的 `first && style == 1` 首行缓存与 `clear()`，绘制块中 `currentHeading(scroll)` 与 `row * trackHeight / rowCount` 的刻度位置、当前章节 5px 全亮/其余 3px 半透明、轨道→刻度→滑块的顺序，`headingStep(boolean forward)` 的 `currentHeading(scrollTarget)` 基准与 `row > current` 前向查找、`Ctrl+↑/↓` 在 `maxScroll` 分支内且先于 `hasLinks` 拦截、命中后 `scrollToLine(lineForScroll(row * LINE_HEIGHT))` 的落点高亮，`MAX_SCROLL_ANIMATION_MS = 280`/`scrollDurationMs` 字段、`currentScroll()` 读实例时长、两参 `scrollTo` 委托基础时长、三参重载在 animate 分支写入钳制后的时长、`scrollDurationFor(target)` 的 `SCROLL_ANIMATION_MS + distance / 12` 封顶、`scrollToLine`/Home/End 传入自适应时长、自链接生成 `case 17: this.scrollTo(0, true, this.scrollDurationFor(0))` 而滚轮/翻页仍为两参调用，`headingLines`/`headingTooltips` 缓存与 `hoveredHeading` 逐帧计算（关闭过渡清空）、`headingAt(mouseX, mouseY)` 的轨道左侧 7px gutter 与 ±2px 纵向容差及 `maxScroll <= 0` 早退、悬停刻度 7px 全亮、tooltip 链的 `hoveredHeading` 分支与标题 tooltip 的 `hoveredHeading < 0` 条件、`mouseClicked` 中刻度先于 `scrollbarContains` 并调用 `scrollToLine(headingLines.get(heading))`，`pageStep()` 返回 `Math.max(LINE_HEIGHT, this.viewportHeight() - LINE_HEIGHT)` 且两个翻页分支改为传入 `pageStep()`，滚动条点击分支的 `boolean onThumb`、`scrollbarScrollAt(mouseY, scrollbarGrabOffset)` helper、轨道点击的三参 `scrollTo(target, true, scrollDurationFor(target))` 与 `scrollToMouse` 的即时 `false` 委托，`linkAt` 的 `int link = this.rowLinks.get(row);`、`rowLeft` 的 `CENTER_TEXT`/`rowIndents` 分支与 `rowWidths.get(row)` 容差返回，`lineForScroll` 的行区间查找、顶部逻辑行/行内偏移锚点与 `rememberedLine`/`laidOut` 记忆，滚轮与 PageUp/PageDown/Home/End 分支中先 `this.focusedLink = -1;` 再 `scrollTo`，`pressedLink` 字段与 `mouseClicked` 的记录、`mouseReleased` 的 `linkAt(...) == pressed` 重测与 `openLineLink(pressed)`，既有 `scrollbarGrabOffset`/滑块几何、`NOTE_COLOR`/`rowColor`/引用竖线、投影/分隔线/标题 tooltip/关闭过渡/焦点 tooltip/边缘渐隐/深链标记也仍在；UI 33.0 的九个 `GuideScreen.java` 均含 `private static final int WARN_COLOR = 0xFFFF8A65;`（guide 为 dark 主题；`CreditsScreen.java` 为 contrast `0xFFFF9100`）、`return style == 3 ? NOTE_COLOR : style == 4 ? WARN_COLOR : BODY_COLOR;`、`int indent = style == 2 || style == 3 || style == 4 ? 8 : 0;` 与 `if (style == 4) {` 块内的 2px 警告竖线 `guiGraphics.fill(x - 6, y, x - 4, y + LINE_HEIGHT, WARN_COLOR);`；UI 27.0 的九个 `GuideScreen.java` 均含 `private static final int TOGGLE_KEY = <keyCodePattern 渲染结果>;`（guide 的 K 渲染为 `org.lwjgl.glfw.GLFW.GLFW_KEY_K`，无键屏幕为 `-1`）、`if (TOGGLE_KEY >= 0 && keyCode == TOGGLE_KEY) { this.onClose(); return true; }` 位于关闭锁之后且先于 `this.pressedLink = -1;`，九个模板均不再出现 `active`/`isActive`/`closeActive`/`removed()`；生成的 `ModMainClient` 打开语句为 `if (KEY_GUIDE.consumeClick() && client.screen == null) { client.setScreen(new ModMainGuideScreen()); }`；UI 26.0 的九个 `GuideScreen.java` 均含 `private static final int LINK_PRESSED_COLOR = 0x66<accent>;`（默认 accent 为 `0x66FFAA00`，本 Spec 的 guide 为 `0x6611AABB`）、`boolean pressed = hovered && link == this.pressedLink;`、按下色三元与 `y + LINE_HEIGHT - (pressed ? 2 : 1)` 下划线；`CreditsScreen.java`（contrast 主题）含 `PANEL_COLOR = 0xFF08090B`、`ACCENT_COLOR = 0xFFFFD400`、`NOTE_COLOR = 0xFFC9CED6`、`LINK_PRESSED_COLOR = 0x66FFD400`；UI 28.0 的九个 `GuideScreen.java` 均含 `int footerButtonWidth0 = Math.max(1, Math.min(100, (this.panelWidth - 16 - 8 * (2 - 1)) / 2));` 与 `int footerRowWidth0 = 2 * footerButtonWidth0 + 8 * (2 - 1);`，两个按钮的 `.bounds` x 分别为 `left + (this.panelWidth - footerRowWidth0) / 2` 与 `... / 2 + footerButtonWidth0 + 8`、宽度均为 `footerButtonWidth0`（settings 的 2 按钮同构，credits 的 1 按钮为 `(this.panelWidth - 16 - 8 * (1 - 1)) / 1`）；UI 29.0 的九个 `ContentsScreen.java` 均含 `LINE_STYLES = { 2, 2, 2, 0, 3 }`、`LINE_LINKS = { 0, 1, 2, -1, -1 }`、`LINE_TARGET_KEYS` 前三条为 `screen.examplemod.guide.title`、`case 0: this.minecraft.setScreen(new ModMainGuideScreen(this, 0)); break;`、`case 1: ... this, 4); break;`、`case 2: ... this, 9); break;`（复用 guide 的显式 anchor 与两个合成锚点，分别落到 Welcome/What is generated/Try it）；UI 31.0 的九个 `ContentsScreen.java` 的 `LINE_KEYS` 前三条为 `<namespace>.screen.guide.line.1/line.5/line.10`（条目复用标题语言键），只有作者手写的两行生成 `contents.line.4/line.5`，生成的 `en_us.json` 34 条行键零重复值；UI 32.0 的九个 `GuideScreen.java` 均含 `private static final String[] LINE_SECTION_KEYS = …`（跨屏深链位取落点标题行键、本屏/自链接位为空串）与三分支 tooltip 缓存（`if (target < 0 || LINE_TARGET_KEYS[line].isEmpty())`、`} else if (LINE_SECTION_KEYS[line].isEmpty()) {` 与 `append(" › ").append(`），九个 `ContentsScreen.java` 的 `LINE_SECTION_KEYS` 前三条同样引用 `guide` 行键（目录条目的落点就是各章节标题自身）；guide 的 4 个按钮生成 `footerButtonWidth0`/`footerRowWidth0` 与 `footerButtonWidth1`/`footerRowWidth1` 两行；UI 34.0 的九个 `GuideScreen.java` 均含 `private static final String[] STEP_TEXT = { …, "1.", "2.", "" };`（第 19/20 位为 `"1."`/`"2."`，其余空串）、`private final List<String> rowStepTexts = new ArrayList<>();` 与 `this.rowStepTexts.clear();`、heading 前 spacer 行的 `this.rowStepTexts.add("");`、换行的 `this.rowStepTexts.add(first ? STEP_TEXT[line] : "");`、`int indent = style == 2 || style == 3 || style == 4 || style == 5 ? 8 : 0;` 与 `} else if (style == 5) {` 块内的 `String step = this.rowStepTexts.get(i);` 与 `guiGraphics.drawString(this.font, step, Math.max(left + 1, x - 3 - this.font.width(step)), y, ACCENT_COLOR, false);`，guide 的 `LINE_STYLES` 为 `{ 1, 0, 2, 2, 1, 2, 2, 0, 3, 1, 2, 2, 0, 0, 0, 0, 0, 2, 5, 5, 4 }`；contents/settings/credits 无 step 行，其 `STEP_TEXT` 为全空串数组；UI 35.0 的九个 `GuideScreen.java` 均含 `private static final String SEARCH_LANG_KEY = …;`（guide 为 `<namespace>.screen.guide.search`、其余屏各取自身 id）、`private EditBox searchBox;`、`private final List<String> searchTexts = new ArrayList<>();`、`private final List<Integer> searchMatches = new ArrayList<>();` 与 `private int searchIndex = -1;`，`keyPressed` 中 `if (Screen.hasControlDown() && keyCode == GLFW.GLFW_KEY_F) { this.toggleSearch(); return true; }` 先于 `if (this.searchBox != null && keyCode == GLFW.GLFW_KEY_ESCAPE) { this.closeSearch(); return true; }`、再先于 `if (this.searchBox != null && this.getFocused() == this.searchBox)` 内 Enter/KP_Enter→`nextSearchMatch` 与 `return super.keyPressed(…)`，而 `if (TOGGLE_KEY >= 0 && keyCode == TOGGLE_KEY)` 在查找分支之后；`toggleSearch()` 的 `new EditBox(this.font, left + BODY_SIDE, top + BODY_TOP - 6, boxWidth, 20, Component.translatable(SEARCH_LANG_KEY))`（`boxWidth = Math.max(40, Math.min(140, this.panelWidth - BODY_SIDE * 2 - 34))`）、`setHint`/`setMaxLength(48)`/`setResponder(this::refreshSearch)`/`addRenderableWidget` 与 `this.setFocused(this.searchBox)`；`ensureSearchTexts` 的 `Component.translatable(LINE_KEYS[i]).getString().toLowerCase(Locale.ROOT)`、`refreshSearch` 的 `query.trim().toLowerCase(Locale.ROOT)` 与 `contains` 扫描后 `this.searchIndex = 0` 并 `scrollToLine` 首个命中、`nextSearchMatch` 的 `(this.searchIndex + 1) % this.searchMatches.size()`、`closeSearch` 的 `removeWidget` 与 `this.setFocused(null)`、`searchBarContains` 的滑动条带矩形；`mouseClicked` 的 `if (this.searchBox != null && this.searchBarContains(mouseX, mouseY)) { return super.mouseClicked(mouseX, mouseY, button); }` 与 `mouseMoved` 中 `this.hoveredLink = this.closingAt < 0L && this.hasLinks && !(this.searchBox != null && this.searchBarContains(mouseX, mouseY)) ? this.linkAt(mouseX, mouseY) : -1;`；绘制块中条带的不透明 `(PANEL_COLOR & 0x00FFFFFF) | 0xFF000000` 填充、BORDER_COLOR 下划线、`String count = (this.searchIndex + 1) + "/" + this.searchMatches.size();` 右对齐与 `this.searchMatches.isEmpty() ? NOTE_COLOR : ACCENT_COLOR` 取色；`init()` 的 `this.searchBox = null;`/`this.searchIndex = -1;` 与两个 `clear()`；UI 36.0 的九个 `GuideScreen.java` 均含 `private int[] searchHits;` 字段与恰好三处 `this.searchHits = null;`（`closeSearch`、`init()`、`refreshSearch` 开头），`refreshSearch` 在首个命中落点后以 `this.searchHits = new int[this.rows.size()];` 重建、按 `int start = this.lineStarts.get(line);` 与 `int end = line + 1 < this.lineStarts.size() ? this.lineStarts.get(line + 1) : this.rows.size();` 的区间写 `this.searchHits[row] = i + 1;`，绘制块中的 `if (this.searchHits != null && i < this.searchHits.length && this.searchHits[i] > 0) {` 染色块先于 `int flash = this.flashColor(i);`（落点闪烁与链接悬停照旧叠在其上），块内 `int alpha = this.searchHits[i] - 1 == this.searchIndex ? 0x40 : 0x1C;` 与 `(ACCENT_COLOR & 0x00FFFFFF) | (alpha << 24)` 的 fill 几何与闪烁/悬停一致（`x - 2, y - 1, x + this.rowWidths.get(i) + 2, y + LINE_HEIGHT - 1`）；UI 37.0 的九个 `GuideScreen.java` 均含 `private static final String SEARCH_CYCLE_LANG_KEY = "…";`（guide 为 `<namespace>.screen.guide.search_cycle`、其余屏各取自身 id）与 `private boolean hoveredSearchCounter;`，`render` 里 `this.hoveredSearchCounter = this.closingAt < 0L && this.searchBox != null && this.searchCounterContains(mouseX, mouseY);`，tooltip 链的计数区分支 `if (this.hoveredSearchCounter) {`（分支内 `Component.translatable(SEARCH_CYCLE_LANG_KEY)`）位于 `} else if (this.hoveredLink >= 0) {` 之前，`mouseClicked` 的条带分支内 `if (button == 0 && !this.searchMatches.isEmpty() && this.searchCounterContains(mouseX, mouseY)) {` → `this.nextSearchMatch();` 先于 `return super.mouseClicked(mouseX, mouseY, button);`，`keyPressed` 的 Enter/KP_Enter 分支以 `if (Screen.hasShiftDown()) {` 分流 `this.prevSearchMatch();`/`this.nextSearchMatch();`，`prevSearchMatch` 的 `this.searchIndex = (this.searchIndex + this.searchMatches.size() - 1) % this.searchMatches.size();` 与 `searchCounterContains` 的 `int textLeft = left + this.panelWidth - 6 - this.font.width(count);`、命中矩形 `return mouseX >= textLeft - 2 && mouseX <= left + this.panelWidth - 3 && mouseY >= top && mouseY <= top + 24;`；UI 38.0 的九个 `GuideScreen.java` 均含 `private static String lastSearchQuery = "";`（全文件恰好四处引用：声明、`lastSearchQuery = query;` 存值、`if (!lastSearchQuery.isEmpty()) {` 判空、`this.searchBox.setValue(lastSearchQuery);` 回填），回填分支位于 `setResponder` 与 `addRenderableWidget` 之间（先接响应器再写值，恢复即重查），`refreshSearch` 首行存值先于 `this.searchMatches.clear();`（空查询同样存，删光词再重开不回填），初始落点从 `int topLine = this.lineForScroll(this.scrollTarget);` 起：`this.searchIndex = 0;` 默认回卷文档首条，扫描内首个 `this.searchMatches.get(i) >= topLine` 命中即 `this.searchIndex = i; break;`，随后 `this.scrollToLine(this.searchMatches.get(this.searchIndex));` 落到该条，`closeSearch`/`init()` 均不清 `lastSearchQuery`（会话记忆跨重开/重建存活）；UI 39.0/40.0 的九个 `GuideScreen.java` 均含 `int markLeft = x + 2;`（固定锚点，悬停加宽轨道不位移）与第二处命中循环（`for (int i = 0; i < this.searchMatches.size(); i++)`，位于章节刻度 fill 之后）、`int markTop = bodyTop + this.lineStarts.get(line) * trackHeight / rowCount;`（与章节刻度同一比例公式）、`boolean target = i == this.searchIndex;`、`boolean hovered = i == this.hoveredSearchMark;`、`int markWidth = target || hovered ? 5 : 3;`、`guiGraphics.fill(markLeft, markTop, markLeft + markWidth, markTop + 1, target || hovered ? ACCENT_COLOR : ((ACCENT_COLOR & 0x00FFFFFF) | 0x80000000));`（双档与章节刻度同款）与陈旧行号守卫 `if (line >= this.lineStarts.size()) {`，滑块 fill 紧随其后（绘制次序章节刻度 → 命中刻度 → 滑块）；UI 40.0 的九个 `GuideScreen.java` 另含 `private int hoveredSearchMark = -1;` 字段与 `render` 的逐帧赋值 `this.hoveredSearchMark = this.closingAt < 0L ? this.searchMarkAt(mouseX, mouseY) : -1;`、tooltip 链的 `} else if (this.hoveredSearchMark >= 0) {` 分支（内为 `Component.translatable(LINE_KEYS[this.searchMatches.get(this.hoveredSearchMark)])` 的 `renderTooltip`，位于计数区分支之后、`} else if (this.hoveredLink >= 0) {` 之前）、标题 tooltip 条件中的 `this.hoveredSearchMark < 0`、`searchMarkAt(double, double)` 的守卫 `if (this.searchBox == null || this.searchMatches.isEmpty() || this.maxScroll() <= 0) {` 与命中界 `if (mouseX < x + 2 || mouseX > x + 7) {`、`if (mouseY >= markTop - 2 && mouseY <= markTop + 2) {`，以及 `jumpToSearchMark(double, double)`（`this.searchIndex = mark;` 先于 `this.scrollToLine(this.searchMatches.get(mark));`），`mouseClicked` 条带分支内 `if (button == 0 && this.jumpToSearchMark(mouseX, mouseY)) {` 位于计数区点击之后、`return super.mouseClicked(mouseX, mouseY, button);` 之前，主链 `if (button == 0 && this.jumpToSearchMark(mouseX, mouseY)) {` 位于章节刻度块之后、`if (button == 0 && this.scrollbarContains(mouseX, mouseY)) {` 之前；UI 41.0/42.0 的九个 `GuideScreen.java` 均含 `private static final int SEARCH_BAR_CLEARANCE = 24;`（全文件恰好三处引用：声明、helper 返回与关条补偿）与单点判定 `private int bodyPad() {` → `return this.searchBox != null ? SEARCH_BAR_CLEARANCE : 0;`，`maxScroll()` 为 `Math.max(0, this.contentHeight() + this.bodyPad() - this.viewportHeight())`，绘制块首行回扫 `int first = Math.max(0, (scroll - this.bodyPad()) / LINE_HEIGHT);` 与逐行 y `int y = bodyTop + this.bodyPad() + i * LINE_HEIGHT - scroll;`，`linkAt` 行换算 `int row = (this.currentScroll() + (int) mouseY - top - this.bodyPad()) / LINE_HEIGHT;` 并紧跟涂绘区间守卫 `if (mouseY < top + this.bodyPad() + row * LINE_HEIGHT - this.currentScroll()) { return -1; }`（向零截断会把正文上缘空带的点击归到第 0 行，行顶未达即拒绝），`toggleSearch` 在 `setResponder` 之后以 `this.scrollTo(this.scrollOffset + this.bodyPad(), false);` 补偿（先于会话回填），`closeSearch` 在 `this.searchBox = null;` 之后以 `this.scrollTo(this.scrollOffset - SEARCH_BAR_CLEARANCE, false);` 还原（此时 `bodyPad()` 已归零、钳制落在无 pad 范围）；41.0 的落点钳制已整体移除——`scrollToLine` 体内只剩朴素两行（落点计算直接接三参 `scrollTo(target, true, this.scrollDurationFor(target));`，`searchBox` 守卫与 `Math.max` 钳制的字节码不复存在）。下表秒数为各目标 UI 42.0 成功复验（生成 + 构建；本轮清理 `Temp/verify-build` 后按干净目录重跑，仅全局依赖缓存为热，故各目标秒数整体高于上一轮增量复验）；九个目标按工具链分组顺序执行，时间不受并发干扰）：

| 目标 | 结果 | 产物 |
| --- | --- | --- |
| Fabric 1.20.4 | ✅ **BUILD SUCCESSFUL in 1m 37s** | `client/ModMainClient` + 四个 Screen 进 jar（新增 `ModMainContentsScreen`：`LINE_STYLES = { 2, 2, 2, 0, 3 }`、`LINE_LINKS = { 0, 1, 2, -1, -1 }`、`case 0/1/2 → new ModMainGuideScreen(this, 0/4/9)`、`LINE_KEYS` 前三条引用 guide 行键）；`LINE_LINKS = { -1, -1, 2, 3, …, 17 }`、`case 2: this.scrollToLine(4)`、`case 10: this.minecraft.setScreen(new ModMainSettingsScreen(this, 2))`、`case 17: this.scrollTo(0, true, this.scrollDurationFor(0))`、`LINE_STYLES` 中 note 行为 3、step 行为 5（`{ 1, 0, 2, 2, 1, 2, 2, 0, 3, 1, 2, 2, 0, 0, 0, 0, 0, 2, 5, 5, 4 }`）、`STEP_TEXT` 第 19/20 位为 `"1."`/`"2."`、`rowStepTexts`/`style == 5` 的 `drawString` 分支、`NOTE_COLOR = 0xFF8A94A6`、`rowColor(style, link)`、`style == 3` 的 1px 引用竖线、`scrollbarGrabOffset`/`scrollbarThumbHeight()`/`scrollbarThumbTop(...)`、滑块命中条件与 `double grab = ...`、`linkAt` 的 `int link = this.rowLinks.get(row);` 早退与 `rowWidths`/`rowIndents` 左缘 + 2px 容差、`lineStarts`、`lineForScroll`/`rememberedLine`/`laidOut` 的阅读位置记忆、滚轮与 PageUp/PageDown/Home/End 分支先 `this.focusedLink = -1;` 再 `scrollTo`、`FLASH_MS`/`flashColor`、`focusedLink`/`focusLink`/`ensureLineVisible`、焦点行 tooltip、`EDGE_FADE_HEIGHT`、`CLOSE_ANIMATION_MS`/`closingAt`/`closeSwitched`/`currentCloseSlide`/`closeProgress`、5 个输入守卫、`0x18000000`/`0x30000000` 双色带投影、`FOOTER_HEIGHT > 12` 分隔线、`titleTruncated`/`titleContains`、`initialLine`、`LINE_TARGET_KEYS`、`LINK_HOVER_COLOR`、`lineTooltips`/`hasLinks`、`openLineLink`、`currentSlide`、`SimpleSoundInstance.forUI(SoundEvents.UI_BUTTON_CLICK, 1.0F)` 均在生成源码中 |
| Fabric 1.21.1 | ✅ **BUILD SUCCESSFUL in 1m 27s** | 同上；UI 30.0 的 `javap` 在 `ensureLineVisible` 看到 `Math.max(II)` → `scrollTo(IZ)` 的上边界路径与 `viewportHeight` → `Math.min(II)` → `Math.max(II)` → `scrollTo(IZ)` 的下边界路径；UI 31.0 的 `javap` 在 `ModMainContentsScreen` 静态初始化看到前三条 `ldc` 依次为 `verifyfabric.screen.guide.line.1`/`line.5`/`line.10`，后两条为 `contents.line.4`/`line.5`（条目复用标题语言键）；UI 29.0 的 `javap` 在 `ContentsScreen.openLineLink` 看到 `tableswitch 0..2`，0/1/2 分支分别以 `iconst_0`/`iconst_4`/`bipush 9` 调 `ModMainGuideScreen.<init>(Screen,I)`，静态初始化把 `LINE_STYLES` 写成 `{2,2,2,0,3}`、`LINE_LINKS` 写成 `{0,1,2,-1,-1}`、`LINE_TARGET_KEYS` 前三条为 `verifyfabric.screen.guide.title`；UI 26.0 的 `javap` 看到 guide 的 `LINK_PRESSED_COLOR = 1712433851`（`0x6611AABB`）与 hover 色 `856795835`（`0x3311AABB`），`render` 中依次 `getfield hoveredLink`、`getfield pressedLink` 两条整型比较后以 `ldc` 选按下色/悬停色，下划线 y 用 `iload pressed`/`ifeq` 在 `iconst_2` 与 `iconst_1` 间选择后 `isub`；credits 的 `javap` 看到 `PANEL_COLOR = -16250613`（`0xFF08090B`）、`ACCENT_COLOR = -11264`（`0xFFFFD400`）、`NOTE_COLOR = -3551530`（`0xFFC9CED6`）、`LINK_PRESSED_COLOR = 1728041984`（`0x66FFD400`）；UI 27.0 的 `javap` 看到 guide 的 `TOGGLE_KEY = 75`（K），`method_25404`（按键）在关闭锁之后立即 `iload_1`/`bipush 75`/`if_icmpne`，命中时调 `method_25419`（onClose）后 `iconst_1 ireturn`，随后才 `putfield pressedLink:-1`；屏幕类不再有 `active`/`isActive`/`closeActive` 或 `method_25432`（removed）方法，`ModMainClient` 的 lambda 为 `KEY_GUIDE.method_1436`（consumeClick）→ `getfield field_1755`（screen）`ifnonnull` → `new` + `method_1507`（setScreen）；UI 28.0 的 `javap` 在 `init` 的 LocalVariableTable 看到 `footerButtonWidth0`/`footerRowWidth0`，首行按钮宽度的字节码为 `iconst_1`/`bipush 100`/`getfield panelWidth`/`bipush 16`/`isub`/`bipush 8`/`isub`/`iconst_2`/`idiv`/`Math.min(II)`/`Math.max(II)`/`istore`，第二行按钮为 `panelWidth - 16`（`8 * (1 - 1)` 折叠为 0）`/ 1`，`Button$Builder.bounds` 的宽度读该局部变量、第二个按钮 x 在居中值后 `iload width`/`iadd`/`bipush 8`/`iadd`（与生成源码的 `footerRowWidth0`/`footerButtonWidth0` 公式一致）；UI 23.0 的 `javap` 看到 `headingLines`（`List<Integer>`）/`headingTooltips`（`List<class_2561>`）/`hoveredHeading` 字段与 `headingAt(double, double)` 方法，`render` 以 `invokevirtual headingAt` 后 `putfield hoveredHeading`、`renderTooltip` 共 4 处（悬停/焦点/刻度/标题），`mouseClicked` 先 `invokevirtual headingAt`、再取 `headingLines`、`invokevirtual scrollToLine`；UI 24.0 的 `javap` 看到 `pageStep()` 以 `bipush 12`/`viewportHeight()`/`bipush 12`/`Math.max(II)` 返回 `max(12, viewport - 12)`，`method_25404` 的 266/267 分支（PageUp/PageDown）清 `focusedLink` 后取 `scrollTarget` 调 `pageStep()`，再以 `iconst_1` 走两参 `scrollTo(IZ)`；`method_25402` 用局部变量 8 保存 `onThumb`，命中滑块时调 `scrollToMouse(D)`，否则调 `scrollbarScrollAt(DI)` 取目标后以 `iconst_1` + `scrollDurationFor(I)` 调三参 `scrollTo(IZI)` 滑行；`scrollToMouse(D)` 只调 `scrollbarScrollAt(DI)` 并以 `iconst_0` 走两参 `scrollTo(IZ)`，`method_25406`（拖动）经由它保持即时跟手；UI 22.0 的 `javap` 看到常量 `SCROLL_ANIMATION_MS = 140`/`MAX_SCROLL_ANIMATION_MS = 280`、`scrollDurationMs` 字段与 `scrollTo(int, boolean)`/`scrollTo(int, boolean, int)`/`scrollDurationFor(int)` 三个方法：`currentScroll()` 两次 `getfield scrollDurationMs`（比较与除法），时长只在三参方法的 animate 分支 `putfield`，Home/End、`scrollToLine` 与返回顶部 switch 共 4 处 `invokevirtual scrollDurationFor`；此前 UI 21.0 的 `javap` 看到 `headingRows` 的 `java.util.List<java.lang.Integer>` 字段、`currentHeading(int)` 与 `headingStep(boolean)` 方法，`headingStep` 先以 `getfield scrollTarget` 调 `currentHeading`，前向分支遍历 `headingRows` 取 `row > current` 并 `ireturn`，`method_25404` 的 `Ctrl+↑/↓` 分支在 `maxScroll` 判断之后、链接焦点之前以 `hasControlDown` 拦截并调用 `scrollToLine`，该方法的 `iconst_m1`/`istore` 初值、循环取 `headingRows` 与 `row * LINE_HEIGHT > scroll` 的提前返回均在字节码中；`method_25402`（鼠标按下）只把 `linkAt` 命中的行 `putfield pressedLink` 后返回、不再调用 `openLineLink`，`method_25406`（释放）在关闭过渡与拖拽滚动条两个分支各 `putfield pressedLink:-1`，左键释放读出 `pressedLink`、清零、再以 `linkAt` 与暂存行比对相等才 `openLineLink(I)V`，`method_25404`（按键）第一条指令即 `putfield pressedLink:-1`、随后才 `maxScroll`；`method_25401`（滚轮）在偏移 20 处 `putfield focusedLink:-1`、紧接着 `putfield pressedLink:-1` 再调用 `scrollTo(IZ)`，`method_25404`（按键）的 266/267/268/269 四个分支同样先 `putfield focusedLink:-1` 再 `scrollTo`，`ensureLineVisible` 内的滚动路径没有清零；静态 `rememberedLine`、`laidOut`、`init` 调 `lineForScroll`、`scrollTo` 内 `lineForScroll` 后 `putstatic rememberedLine`，恢复分支读取两者；`linkAt` 先取 `rowLinks`、`link < 0` 早退，再按 `rowWidths`/`rowIndents` 与 2px 容差返回；`mouseClicked` 先调 `scrollbarThumbTop()`，随后写入 `scrollbarGrabOffset`；`rowColor` 仍按 link/heading→accent、style 3→弱化色分支；`renderTooltip` 仍为 4 次调用（悬停/焦点/刻度/标题），`none` 动画的 `CreditsScreen.onClose` 仍在 `closingAt` 早退后直接 `setScreen(parent)`；UI 32.0 的 `javap`（本轮对 dev 编译产物取证，official 名）在 `init` 的深链 tooltip 构建看到 `Component.translatable` 取落点标题 `verifyfabric.screen.settings.title` 后 `ldc " › "` → `append(Ljava/lang/String;)`（偏移 401）→ `getstatic LINE_SECTION_KEYS`/`aaload` → `Component.translatable(verifyfabric.screen.settings.line.3)` → `append(Lnet/minecraft/network/chat/Component;)`（偏移 413），相邻的单标题分支只调一次 `translatable` 直接 `List.add`；UI 33.0 的 `javap`（dev 编译产物，official 名）看到 `WARN_COLOR` 字段声明与 `rowColor` 的 `iconst_4` 分支：`style == 3` 取 `ldc_w -7695194`（`0xFF8A94A6`）、`style == 4` 取 `sipush -30107`（`0xFFFF8A65`）、其余 `ldc_w -4669236`（`0xFFB8C0CC`），绘制块 note 的 1px 竖线为 `fill(x-6, …, x-5, …, y+12)`、warn 的 2px 竖线为 `fill(x-6, …, x-4, …, y+12, -30107)`；UI 34.0 的 `javap`（dev 编译产物，official 名）看到 `STEP_TEXT` 字段声明与静态初始化：`bipush 18` 后 `ldc_w "1."`（偏移 733）、`bipush 19` 后 `ldc_w "2."`（偏移 740）、`bipush 20` 后空串 `ldc`（偏移 747）再 `putstatic`（偏移 750），`rowStepTexts` 字段（`java.util.List<java.lang.String>`）进入 `init` 的 `List.clear()` 序列（偏移 167），换行追加为 `iload first`/`ifeq` → `getstatic STEP_TEXT`/`iload line`/`aaload`、否则空串 `ldc`（偏移 730-749），绘制块 `iload style`/`iconst_5`/`if_icmpne`（偏移 269-270，紧接 bullet 的 `iconst_2` 分支之后）内的 `rowStepTexts.get(i)` → `checkcast String` → `Font.width(String)` → `Math.max(II)`（`left + 1` 为 `iload/iconst_1/iadd`，`x - 3 - width` 为 `iload x`/`iconst_3`/`isub`/`isub`）→ `drawString(Font, String, IIIZ)`（偏移 322，accent `ldc_w -15619397` 即 `0xFF11AABB`、`iconst_0` 不投影后 `pop`）；UI 35.0 的 `javap`（dev 编译产物，official 名）看到 `keyPressed` 的分支次序：关闭锁后 `hasControlDown`/`bipush 70` → `toggleSearch`（偏移 24），`ifnull` 守卫的 `sipush 256` → `closeSearch`（偏移 44），`getFocused` vs `searchBox` 后 `sipush 257`/`sipush 335` → `nextSearchMatch`（偏移 82）、否则 `invokespecial Screen.keyPressed`（偏移 91），`bipush 75` 的 `onClose` 在最后（偏移 101）；`toggleSearch` 的 `EditBox."<init>":(Font,IIII,Component)`（组件常量 `verifyfabric.screen.guide.search`）→ `setHint(Component)` → `setMaxLength(48)` → `setResponder(Consumer)`（invokedynamic）→ `addRenderableWidget(GuiEventListener)` → `setFocused(GuiEventListener)`（偏移 146）；`closeSearch` 的 `removeWidget(GuiEventListener)`（偏移 13）与 `setFocused(null)`（偏移 37）；`ensureSearchTexts` 的 `translatable(LINE_KEYS[i])`→`getString`→`toLowerCase(Locale.ROOT)`（`getstatic Locale.ROOT`，偏移 44）→`List.add`；`refreshSearch` 的 `trim`→`toLowerCase(Locale.ROOT)`（偏移 18）→`contains` 扫描与首个命中 `searchIndex=0`+`scrollToLine`；`nextSearchMatch` 的 `iadd`/`irem` 回卷（偏移 29）；`mouseClicked` 的 `searchBox != null && searchBarContains` → `invokespecial Screen.mouseClicked`（偏移 42）；`mouseMoved` 的 `hoveredLink` 在 `searchBarContains` 命中时经 `ifne` 取 `iconst_m1`；`render` 的计数 `searchIndex + 1` 与 `matches.size()` → `makeConcatWithConstants(II)`（偏移 1022）→ 右对齐 `drawString`（`left + panelWidth - 6 - Font.width(count)`、`barTop + 8`）；`init` 的 `putfield searchBox:null`（偏移 261）/`searchIndex:-1`（偏移 266）与随后两个 `List.clear()`；UI 36.0 的 `javap`（dev 编译产物，official 名）看到 `searchHits`（`int[]`）字段与恰三处 `aconst_null`+`putfield`（`init` 偏移 289、`closeSearch` 偏移 37 先于 `setFocused(null)` 的偏移 42、`refreshSearch` 偏移 16），`refreshSearch` 偏移 130-142 以 `rows.size()`→`newarray int`→`putfield` 重建数组，命中循环偏移 147-176 取 `searchMatches.get(i)` 为逻辑行、偏移 178-195 取 `lineStarts.get(line)` 为区间起点、偏移 197-244 的三元（`line + 1 < lineStarts.size()` → 偏移 213-232 取下一行起点，否则偏移 235-239 取 `rows.size()`）为终点，内层偏移 257-266 以 `iload row`/`iload i`/`iconst_1`/`iadd`/`iastore` 写 `i + 1`；绘制块偏移 384-408 的 `searchHits` 三重守卫（`ifnull`、`arraylength`+`if_icmpge`、`iaload`+`ifle` 均跳 486），偏移 411-434 的 alpha 三元（`iaload`/`iconst_1`/`isub`/`searchIndex` 比较后 `bipush 64` 与 `bipush 28` 二选一），偏移 436-483 的染色 `fill`（accent 折叠常量 `ldc_w 1157819` 即 `0x11AABB`、`iload alpha`/`bipush 24`/`ishl`/`ior`），偏移 486-489 的 `invokevirtual flashColor` 在其后（落点闪烁叠于染色之上）；UI 37.0 的 `javap`（dev 编译产物，official 名）看到 `hoveredSearchCounter`（`boolean`）字段声明，`render` 偏移 119-152 的逐帧赋值（偏移 121-126 `closingAt` 的 `lcmp`/`ifge 151` 守卫 → 偏移 130-133 `searchBox` 的 `ifnull 151` → 偏移 141 `invokevirtual searchCounterContains(DD)` → 偏移 144 `ifeq 151`/`iconst_1` 与偏移 147 `iconst_0` 二选一 → 偏移 152 `putfield`），偏移 298-320 的计数区 tooltip 分支（`getfield hoveredSearchCounter`/`ifeq 323` → `ldc_w verifyfabric.screen.guide.search_cycle` → `Component.translatable` → `renderTooltip` → `goto 504`）先于偏移 323 的 `hoveredLink` 分支（`getfield`/`iflt 368`）；`mouseClicked` 偏移 37-74 的条带内计数区点击（偏移 37-39 `iload 5`/`ifne 69`、偏移 43-51 `searchMatches.isEmpty`/`ifne 69`、偏移 57 `searchCounterContains`/偏移 60 `ifeq 69` → 偏移 64 `nextSearchMatch`/`ireturn`，落空则偏移 69-74 `invokespecial Screen.mouseClicked`）；`keyPressed` 偏移 81 的 `invokestatic Screen.hasShiftDown`/`ifeq 94` 分流（偏移 88 `prevSearchMatch`、偏移 95 `nextSearchMatch`）；`prevSearchMatch` 偏移 13-40 的取模（`searchIndex`/`size()`/`iadd`/`iconst_1`/`isub`/`size()`/`irem`/`putfield`）与偏移 43-63 的 `scrollToLine`；`searchCounterContains` 偏移 9 的 `slide`、偏移 11-22 的 `left = (width - panelWidth) / 2`、偏移 46-66 的计数串 `makeConcatWithConstants(II)`、偏移 68-88 的 `textLeft = left + panelWidth - 6 - font.width(count)`、偏移 90-97 `iconst_2` 与偏移 100-112 `iconst_3` 的横向界、偏移 115-120 与偏移 123-131 `bipush 24` 的纵向界；UI 38.0 的 `lastSearchQuery`（偏移 119 的静态字段声明、`<clinit>` 偏移 753 的 `ldc ""` 与偏移 755 的 `putstatic`）、`toggleSearch` 偏移 132 `getstatic`→偏移 135 `String.isEmpty`→`ifne 151` 的回填守卫（偏移 145 `getstatic`→偏移 148 `invokevirtual EditBox.setValue`，位于偏移 129 `setResponder` 与偏移 156 `addRenderableWidget` 之间）、`refreshSearch` 偏移 1 的 `putstatic`（先于偏移 4-8 的 `List.clear`）、偏移 110-114 `lineForScroll(scrollTarget)` 与偏移 117 `istore_3`、偏移 119-120 `searchIndex = 0` 默认回卷、偏移 123-173 的扫描循环（偏移 154-157 `Integer.intValue`→偏移 158 `if_icmplt 170`→偏移 162-164 `putfield searchIndex`→偏移 170 `iinc 4, 1`/偏移 173 `goto 126`）、偏移 176-196 `scrollToLine(searchMatches.get(searchIndex))`（偏移 181-185 取索引）、偏移 199-211 `searchHits = new int[rows.size()]`；UI 39.0/40.0 的 `drawBody` 偏移 1430-1434 `markLeft = x + 2`（`iload 16`/`iconst_2`/`iadd`/`istore 19`，固定锚点——锚点处不再出现 `trackWidth` 的 `getfield`）、偏移 1436-1605 的命中循环（循环头偏移 1439-1450 的 `if_icmpge 1608` 直接落到滑块 fill、偏移 1453-1470 `Integer.intValue` 取行、偏移 1472-1486 `lineStarts.size()` 守卫与偏移 1486 `goto 1602` 跳过、偏移 1489-1515 的 `lineStarts.get(line) * trackHeight / rowCount + bodyTop`（`imul`/`idiv`/`iadd`）、偏移 1517-1531 `target = i == searchIndex`、偏移 1533-1547 `hovered = i == hoveredSearchMark`（偏移 1536 `getfield #95`）、偏移 1549-1564 `target || hovered ? iconst_5 : iconst_3` 宽度、偏移 1580-1599 的颜色三元（偏移 1590 `ldc_w -15619397`（0xFF11AABB 全亮）与偏移 1596 `ldc_w -2146325829`（0x8011AABB 半透明）由 `ifne`/`ifeq` 双分支选择）、偏移 1599 `fill`）、章节刻度 fill 在偏移 1421（其后偏移 1424-1427 回跳）在前、偏移 1608-1626 的滑块 fill（常量同 `-15619397`，偏移 1629 `return`）紧随其后，绘制次序「章节刻度 → 命中刻度 → 滑块」由偏移次序直接可证；UI 40.0 另在 `render` 偏移 155-177 逐帧赋值 `hoveredSearchMark`（偏移 157-162 `closingAt`/`lcmp`/`ifge 176` 守卫 → 偏移 170 `invokevirtual #360 searchMarkAt(DD)I` → 偏移 173 `goto 177`，否则偏移 176 `iconst_m1` → 偏移 177 `putfield #95`；全类唯一另一处写入是构造器字段初始值偏移 208-209 的 `iconst_m1`/`putfield`），tooltip 链计数区分支以偏移 345 `goto 575` 收尾、命中分支偏移 348-391（偏移 349 `getfield #95 hoveredSearchMark`、偏移 352 `iflt 394`、偏移 360 `getstatic LINE_KEYS`、偏移 364-379 `searchMatches.get(hoveredSearchMark)` 取序号、偏移 382 `aaload`、偏移 383 `translatable`、偏移 388 `renderTooltip`、偏移 391 `goto 575`）夹在链接分支（偏移 394-398 `hoveredLink`/`iflt 439`）之前，标题 tooltip 条件链偏移 597 `getfield #95`/偏移 600 `ifge 644` 位于 `hoveredHeading`（偏移 590-593）之后；`mouseClicked` 条带分支内偏移 77 `invokevirtual #554 jumpToSearchMark(DD)Z`（在偏移 64 `nextSearchMatch`/偏移 68 `ireturn` 与偏移 90 `invokespecial Screen.mouseClicked`/偏移 93 `ireturn` 之间）、主链偏移 143 `invokevirtual #554`（在偏移 130 `scrollToLine`/偏移 134 `ireturn` 的章节块与偏移 159 `scrollbarContains` 之间）；`searchMarkAt` 偏移 0-27 三重守卫（偏移 4 `ifnull 26`、偏移 16 `isEmpty` 的 `ifne 26`、偏移 23 `ifgt 28`，否则 `iconst_m1`/`ireturn`）、偏移 28-47 `x = (width - panelWidth) / 2 + panelWidth - 7`、偏移 49-71 `x + 2`/`x + 7` 横向界（`iconst_2`/`bipush 7` 两次界值与 `dcmpg`/`dcmpl` 判定）、偏移 72-91 bodyTop（`bipush 42` + `currentSlide`）、偏移 99-112 `Math.max(1, rows.size())`、循环偏移 114-221（偏移 150-164 陈旧行守卫、偏移 167-193 `markTop` 同款公式、偏移 195-212 `markTop ± 2` 纵向容差、偏移 215 `ireturn`），循环外偏移 224 `iconst_m1`/`ireturn`；`jumpToSearchMark` 偏移 3 `invokevirtual #360 searchMarkAt` → 偏移 6 `istore 5`、偏移 8-14 `iflt` 早退、偏移 18 `putfield #92 searchIndex` 先于偏移 39 `invokevirtual #290 scrollToLine`、偏移 42 `iconst_1`/`ireturn`；UI 41.0/42.0 的 `javap`（本轮对 dev 编译产物取证）看到 42.0 的内边距落地与 41.0 钳制的退场：`scrollToLine` 偏移 30-49 的 `lineStarts.get(line) * 12` → `istore_2` 之后直接偏移 50-58 以 `iconst_1` 与 `scrollDurationFor(I)I`（偏移 55）走三参 `scrollTo(IZI)`、偏移 61 `return`——41.0 的 `searchBox` 守卫与 `bipush 24`/`Math.max` 钳制不复存在；新增的 `bodyPad()` 方法偏移 0-13（偏移 1 `getfield #174 searchBox`/偏移 4 `ifnull 12` → 偏移 7 `bipush 24`/偏移 9 `goto 13`，否则偏移 12 `iconst_0`、偏移 13 `ireturn`；常量内联、`SEARCH_BAR_CLEARANCE` 字段仍在类字段表第 27 行声明），全类恰好 6 处 `invokevirtual #473 bodyPad:()I`：`drawBody` 偏移 28 的首行回扫（`iconst_0`/`iload scroll`/`bodyPad`/`isub`/`bipush 12`/`idiv`/`Math.max:(II)I` → `istore 9`）与偏移 176 的逐行 y（`iload bodyTop`/`bodyPad`/`iadd`/`iload i`/`bipush 12`/`imul`/`iadd`/`iload scroll`/`isub` → `istore 15`），`maxScroll()` 偏移 6（偏移 2 `contentHeight`/偏移 6 `bodyPad`/偏移 9 `iadd`/偏移 11 `viewportHeight`/偏移 14 `isub`/偏移 15 `Math.max:(II)I`），`toggleSearch` 偏移 138（`getfield #268 scrollOffset`/`bodyPad`/`iadd`/`iconst_0`/偏移 143 两参 `scrollTo(IZ)V`，位于偏移 129 `setResponder` 之后、偏移 146 `getstatic lastSearchQuery` 回填守卫之前），`linkAt` 偏移 101 的行换算（`currentScroll`/`d2i`/`iadd`/`iload top`/`isub`/`bodyPad`/`isub`/`bipush 12`/`idiv` → `istore 8`）与偏移 135 的涂绘区间守卫（`iload mouseY`/`iload top`/`bodyPad`/`iadd`/`iload row`/`bipush 12`/`imul`/`iadd`/`currentScroll`/`isub`/`i2d`/`dcmpg`、偏移 152 `ifge 157`，未达则偏移 155-156 `iconst_m1`/`ireturn`），`closeSearch` 偏移 16-18 `aconst_null`/`putfield searchBox` 之后偏移 21-30 `getfield scrollOffset`/偏移 26 `bipush 24`/偏移 28 `isub`/偏移 29 `iconst_0`/偏移 30 两参 `scrollTo(IZ)V`、偏移 33 `searchIndex = -1` 随其后 |
| Fabric 1.21.4 | ✅ **BUILD SUCCESSFUL in 1m 19s** | 同上 |
| Forge 1.20.1 | ✅ **BUILD SUCCESSFUL in 30s** | 同上（经 `reobfJar`；UI 30.0 的 `javap` 在 `ensureLineVisible` 看到同样的 `Math.max(II)`/`Math.min(II)` 与两处 `scrollTo(IZ)` 调用，UI 31.0 的 `javap` 在目录屏静态初始化看到前三条 `ldc` 为 `verifyforge.screen.guide.line.1`/`line.5`/`line.10`、后两条为 `contents.line.4`/`line.5`（SRG 重映射不影响语言键字符串常量）；UI 29.0 的 `javap` 在 `ContentsScreen.openLineLink` 看到同样的 `tableswitch 0..2`，三个分支以 `iconst_0`/`iconst_4`/`bipush 9` 调 `ModMainGuideScreen.<init>(Screen,I)`；SRG 重映射后自有字段/方法名不变，UI 26.0 的 `javap` 看到 guide 的 `LINK_PRESSED_COLOR = 1712433851` 与渲染中 `getfield pressedLink` 后的 `ldc 1712433851` 分支，credits 的 contrast 四色常量（`PANEL_COLOR = -16250613`、`ACCENT_COLOR = -11264`、`NOTE_COLOR = -3551530`、`LINK_PRESSED_COLOR = 1728041984`）均在；UI 27.0 的 `javap` 看到 guide 的 `TOGGLE_KEY = 75`（K），`m_7933_`（按键）在关闭锁之后立即比较 75，命中时调 `m_7379_`（onClose）并 `iconst_1 ireturn`，之后才清 `pressedLink`；类中不再声明 `active`/`isActive`/`closeActive` 或 `m_7861_`（removed），`ModMainClient` 为 `KEY_GUIDE.m_90859_`（consumeClick）→ `f_91080_`（screen）`ifnonnull` → `m_91152_`（setScreen）；UI 28.0 的 `javap` 看到同一套页脚算术：`init` 中 `bipush 100`/`getfield panelWidth`/`bipush 16`/`isub`/`bipush 8`/`isub`/`iconst_2`/`idiv`/`Math.min(II)`/`Math.max(II)` 写入 `footerButtonWidth0`，`iconst_2 * width + 8` 写入 `footerRowWidth0`，第二行按钮用 `panelWidth - 16` 除以 1，`bounds` 的宽度与第二个按钮的 `+ width + 8` 偏移均消费这两个局部变量；UI 23.0 的 `javap` 看到 `headingLines`/`headingTooltips`/`hoveredHeading` 字段与 `headingAt(double, double)` 方法仍在，render 与鼠标按下各 1 处 `invokevirtual headingAt`，后者随后取 `headingLines` 并 `invokevirtual scrollToLine`，`renderTooltip` 共 4 处；UI 24.0 的 `javap` 看到 `pageStep()` 的 `bipush 12`/`viewportHeight`/`bipush 12`/`Math.max` 返回、`m_7933_`（按键）的 266/267 分支清 `focusedLink` 后调 `pageStep()` 再走两参 `scrollTo(IZ)`，`m_6375_`（按下）的 `onThumb`（局部 8）分支命中滑块走 `scrollToMouse(D)`、否则 `scrollbarScrollAt(DI)` 后在 `iconst_1`/`scrollDurationFor(I)` 下走三参 `scrollTo(IZI)`，`scrollToMouse(D)` 以 `scrollbarScrollAt(DI)` + `iconst_0` 走两参 `scrollTo(IZ)`，`m_7979_`（拖动）仍即时；UI 22.0 的 `javap` 看到常量 140/280、`scrollDurationMs` 字段、2/3 参 `scrollTo` 与 `scrollDurationFor(int)` 方法（时长只在三参 animate 分支 `putfield`，Home/End、`scrollToLine`、自链接共 4 处 `invokevirtual scrollDurationFor`），UI 21.0 的 `javap` 看到 `headingRows` 的 `java.util.List<java.lang.Integer>` 字段、`currentHeading(int)` 与 `headingStep(boolean)` 方法仍在，`m_6348_`（释放）在关闭与拖拽滚动条分支各 `putfield pressedLink:-1`，左键读出暂存行、清零后 `linkAt` 比对相等才 `openLineLink(I)V`，`m_7933_`（按键）起始即清 `pressedLink`，滚轮在 `scrollTo` 前 `putfield focusedLink:-1`、四个翻页/首尾键分支同序；`lineForScroll`/`rememberedLine`/`laidOut` 的阅读位置记忆、`linkAt` 的文字宽度命中、`scrollbarGrabOffset`/滑块几何、`NOTE_COLOR`/`rowColor`/note 竖线、`titleTruncated`/`titleContains`/投影与分隔线仍在，页脚关闭 lambda 仍委派 `onClose`）；UI 32.0 的 `javap`（dev 编译产物）在 `init` 看到同样的深链链：`append(Ljava/lang/String;)`（偏移 401）与 `append(Lnet/minecraft/network/chat/Component;)`（偏移 413）两次调用，落点常量 `verifyforge.screen.settings.line.3`（偏移 487）与标题 `…settings.title`（偏移 375）；UI 33.0 的 `javap`（dev 编译产物）看到同样的 `WARN_COLOR` 字段、`rowColor` 的 `style == 3`→`ldc_w -7695194` / `style == 4`→`sipush -30107` / 其余→`ldc_w -4669236` 三分支与 2px 警告竖线 `fill(x-6, …, x-4, …, y+12, -30107)`（note 为 `x-5` 的 1px）；UI 34.0 的 `javap`（dev 编译产物）看到同一结构：`STEP_TEXT` 静态初始化 `ldc_w "1."`（偏移 733，第 19 位）/`ldc_w "2."`（偏移 740，第 20 位）与空串后 `putstatic`（偏移 750），绘制块 `iload style`/`iconst_5`/`if_icmpne`（偏移 269-270）分支内的 `rowStepTexts.get(i)`/`checkcast String`/`Font.width(String)`/`Math.max(II)`/`drawString(Font, String, IIIZ)`（偏移 322，accent `-15619397`），与 Fabric 侧逐条一致；UI 35.0 的 `javap`（dev 编译产物，official 名，reobf 后按键即 `m_7933_`）看到同一结构：`keyPressed` 的查找分支次序一致（`hasControlDown`+`bipush 70`→`toggleSearch`、`sipush 256`→`closeSearch`、`getFocused`/`sipush 257`/`sipush 335`→`nextSearchMatch` 否则 `invokespecial Screen.keyPressed`、`bipush 75`→`onClose` 最后），`toggleSearch` 的 `EditBox."<init>":(Font,IIII,Component)`/`setHint(Component)`/`setMaxLength(48)`/`setResponder(Consumer)`/`addRenderableWidget(GuiEventListener)`/`setFocused(GuiEventListener)`（偏移 146）链、`closeSearch` 的 `removeWidget(GuiEventListener)` 与 `setFocused(null)`（偏移 37）、`ensureSearchTexts`/`refreshSearch` 两处 `getstatic Locale.ROOT`、`nextSearchMatch` 的 `irem` 回卷、`mouseClicked` 的 `searchBarContains` 门与 `mouseMoved` 的 `iconst_m1` 抑制；UI 36.0 的 `javap`（dev 编译产物）看到同一结构：`searchHits` 字段声明、恰好三处 `aconst_null`+`putfield`（`init` 偏移 289、`closeSearch` 偏移 37 先于 `setFocused(null)` 偏移 42、`refreshSearch` 偏移 16）、偏移 142 的 `newarray int` 重建、双层循环与三元 `end` 的同一偏移布局（命中循环 147-176、起点 178-195、三元 197-244、`iastore` 写 `i + 1` 于 257-266），绘制块守卫偏移 385-412、alpha 三元 427/432（`bipush 64`/`bipush 28`）与染色 `fill` 474-483（同一折叠常量 `1157819` 即 `0x11AABB`、`ishl` 24 位、`ior`）后接偏移 486 的 `flashColor`；UI 37.0 的 `javap`（dev 编译产物）看到同一结构：`hoveredSearchCounter` 字段声明与 `render` 偏移 117-148 的逐帧赋值（偏移 117-122 `closingAt` `lcmp`/`ifge 147` → 偏移 125-129 `searchBox` `ifnull 147` → 偏移 137 `searchCounterContains(DD)` → 偏移 140 `ifeq 147`/偏移 143 `iconst_1` 与偏移 147 `iconst_0` → 偏移 148 `putfield`），偏移 294-316 的计数区 tooltip 分支（`ifeq 319` → `ldc_w verifyforge.screen.guide.search_cycle` → `renderTooltip` → `goto 500`）先于偏移 319 的 `hoveredLink` 分支；`mouseClicked` 偏移 43-77 与 Fabric 同偏移同形（`isEmpty`/`ifne 69`、`searchCounterContains`/`ifeq 69`、`nextSearchMatch`/`ireturn`、`invokespecial Screen.mouseClicked`）；`keyPressed` 偏移 81/88/95 的 `hasShiftDown` 分流与 Fabric 一致；`prevSearchMatch` 偏移 0-66 与 `searchCounterContains` 偏移 0-139（含 `bipush 42`/`bipush 8` 的条带公式、`bipush 6`/`iconst_2`/`iconst_3`/`bipush 24` 的命中界）；UI 38.0 的 `lastSearchQuery` 偏移 119 声明、`<clinit>` 偏移 755 `putstatic`、`toggleSearch` 偏移 132/135/`ifne 151`/145/148 的回填守卫（同 Fabric 位次）、`refreshSearch` 偏移 1 `putstatic`、偏移 114 `lineForScroll`/偏移 117 `istore_3`、偏移 119-120 `searchIndex = 0`、偏移 158 `if_icmplt 170`/偏移 164 `putfield searchIndex`/偏移 170 `iinc`/偏移 173 `goto`、偏移 196 `scrollToLine`（偏移 181-185 取索引）、偏移 209 `newarray int` 逐条一致；UI 39.0/40.0 的 `drawBody` 偏移 1430-1434 `markLeft = x + 2`（`iload 16`/`iconst_2`/`iadd`/`istore 19`，同一固定锚点）、偏移 1436-1605 命中循环（循环头 `if_icmpge 1608`、`lineStarts.size()` 守卫 `if_icmplt 1489`/`goto 1602`、`imul`/`idiv` 定位、偏移 1536 `getfield #95` 的 `hovered`、偏移 1549-1564 `target || hovered ? 5 : 3`、偏移 1590/1596 的 `ldc_w -15619397`/`-2146325829` 双色、偏移 1599 `fill`）与偏移 1608-1626 滑块 fill（偏移 1629 `return`）及偏移 1421 章节刻度 fill 的相对次序与 Fabric 逐条同偏移同形；UI 40.0 的 `render` 偏移 166 `invokevirtual searchMarkAt(DD)I`/偏移 173 `putfield #95` 的逐帧赋值（构造器字段初始值同样在偏移 208-209），tooltip 链计数区以 `goto 571` 收尾后偏移 344-387 的命中分支（偏移 345 `getfield #95`/偏移 348 `iflt 390`、偏移 360-378 取 `searchMatches.get(hoveredSearchMark)` 序号、偏移 379 `translatable`、偏移 384 `renderTooltip`、偏移 387 `goto 571`）先于偏移 390-394 的链接分支（`hoveredLink`/`iflt 435`），标题条件偏移 593 `getfield #95`/偏移 596 `ifge 640`；`mouseClicked` 偏移 77/143 两处 `invokevirtual #555 jumpToSearchMark(DD)Z`（条带分支先于 `invokespecial Screen.mouseClicked`、主链先于 `scrollbarContains`）；`searchMarkAt` 偏移 0-27 守卫、偏移 49-71 `x + 2`/`x + 7` 界、偏移 167-193 `markTop` 与偏移 195-212 ±2 容差逐条同形；`jumpToSearchMark` 偏移 3 调 `searchMarkAt`、偏移 18 `putfield searchIndex` 先于偏移 39 `scrollToLine`；UI 41.0/42.0 的 `javap`（dev 编译产物）看到同一形态：`scrollToLine` 偏移 30-49 后直接偏移 50-58 三参 `scrollTo(IZI)`（`scrollDurationFor` 偏移 55）、偏移 61 `return`，41.0 的守卫与钳制不复存在；`bodyPad()` 偏移 0-13（偏移 1 `getfield #174 searchBox`/偏移 4 `ifnull 12` → 偏移 7 `bipush 24`/偏移 9 `goto 13`，否则偏移 12 `iconst_0`、偏移 13 `ireturn`），全类 6 处 `invokevirtual #474 bodyPad:()I`：`drawBody` 偏移 28/176、`maxScroll()` 偏移 6（`contentHeight`/`bodyPad`/`iadd`/`viewportHeight`/`isub`/`Math.max`）、`toggleSearch` 偏移 138（偏移 143 两参 `scrollTo(IZ)V`，位于 `setResponder` 与回填守卫之间）、`linkAt` 偏移 101（行换算）与偏移 135（涂绘守卫，偏移 155-156 `iconst_m1`/`ireturn`）、`closeSearch` 偏移 26 `bipush 24` 与偏移 30 两参 `scrollTo(IZ)V`，与 Fabric 侧逐条同偏移同形 |
| Forge 1.20.4 | ✅ **BUILD SUCCESSFUL in 31s** | 同上 |
| Forge 1.21.4 | ✅ **BUILD SUCCESSFUL in 20s** | 同上 |
| NeoForge 1.20.4 | ✅ **BUILD SUCCESSFUL in 21s** | 同上；官方名 jar 此前以 `javap` 看到 `GuiGraphics.renderTooltip(Font, Component, II)` 与带 `lineStarts` 范围检查的 `flashColor`；本轮源码含 `headingRows` 的 heading 首行缓存、轨道刻度绘制与 Ctrl 章节跳转（`headingStep`）、`pageStep` 的翻页重叠、`scrollbarScrollAt` 与轨道点击的三参 `scrollTo` 滑行、`pressedLink` 的按下记录/释放重测、手动滚动先清 `focusedLink` 与 `pressedLink`、逻辑行阅读位置记忆、文字宽度链接命中、滚动条抓取偏移、note 竖线、标题 tooltip、投影与分隔线 |
| NeoForge 1.21.1 | ✅ **BUILD SUCCESSFUL in 22s** | 同上 |
| NeoForge 1.21.4 | ✅ **BUILD SUCCESSFUL in 22s** | 同上 |

首次 UI 2.0 全量构建（冷缓存）的 Fabric 1.21.1 / NeoForge 1.21.1 / Forge 1.20.1 分别为 114s / 34s / 41s；Fabric 1.20.4/1.21.4 为 111s/121s（Loom 资产准备占大头）。

`scripts/verify-build.mjs` 新增 `--spec`（`--spec docs/examples/ui2-demo.json --adapter …`），target 与 modId 按适配器覆写，因此同一份交互 Spec 可在每条工具链上复验；生成的 `en_us.json` 含标题/逐行/按钮/按键名/按键分类键，按钮 label 与 target 校验由单测覆盖。新增 `--gradle-arg` 透传：`forge-1.21.4` 用它注册本机 JDK 25（`-Porg.gradle.java.installations.paths=…`，并关闭 foojay 自动下载），避免 FG7 Mavenizer 在受限网络上现场下载 JDK。NeoForge 1.20.4 的 `--java-home-17` 需指向 JDK 21（NFRT 的 21 toolchain 只从运行 Gradle 的 JVM 探测），否则 `createMinecraftArtifacts` 直接失败；Fabric 1.20.4 的 `--java-home-17` 同样要指向 JDK 21（Loom 1.17 插件要求 JVM 21，而生成工程的 target 仍是 Java 17）。两处环境约束与完整命令已写进 `docs/environment.md` 的「UI 复验环境与命令」。

**仍未验证**：本机无可启动图形客户端，屏幕的实际像素渲染、悬停高亮与 tooltip 的位置/遮挡、悬停/滚动手感、动画观感与行内链接点击未做运行时验证；本轮证据到「真实编译 + `javap` 字节码 + 生成源码/语言键/版本签名/交互约定断言」为止。另：键盘链接焦点（↑/↓/Enter/Tab）、焦点/标题/深链 tooltip（含「标题 › 章节」两段拼接后的观感）、滚动边缘渐隐、关闭过渡、面板投影、note 的弱化色对比度与引用竖线观感、warn 的暖色与 2px 竖线在四主题（尤其 contrast 的橙 vs 亮黄 accent）下的视觉区分度、滚动条拖动与轨道点击手感、链接命中区与文字的对齐（含 2px 容差是否在手感上合适）、跨屏深链的落点滚动/淡出只经真实编译与生成源码断言，实际按键手感、焦点环与 tooltip 遮挡、渐隐/投影层次、关闭节奏、提示行可读性、拖动精度、行尾空白确实不可点、深链落点、缩放后是否仍停在同一段、重开屏幕的落点是否自然、章节刻度在半透明/1px 下的可见度与当前章节高亮是否易读、Ctrl+↑/↓ 的跳章节节奏与落点高亮是否自然，以及手动滚动后焦点环/tooltip 是否即时消失、`Enter` 是否确实不再打开旧链接、按下链接后拖走是否确实取消且没有误触反馈，均未运行时验证。按键开关的屏幕内识别使用 Spec 键的 GLFW 码：玩家若在控制里重映射打开键，屏幕仍认 Spec 原键来关闭，这一交互也未运行时验证；页脚按钮只在编译期与字节码层确认按 `panelWidth` 收缩，极窄面板下标签是否仍可读同样未做运行时观察。键盘焦点的上下留白与长链接首行优先只经生成源码/字节码确认，留白是否够读、连续按 `↑`/`↓` 时滚动节奏是否舒适也未运行时观察。UI 35.0 的屏内搜索同样只到编译 + 字节码：查找条的打字手感/光标与焦点环、中文输入法组合、`n/m` 计数字号的可读性、条带对正文首行的遮挡观感、Ctrl+F 与其他 mod/系统的快捷键冲突、无命中时 `0/0` 的弱化色是否足够醒目、一行内多处命中只记行号是否够定位、获焦时点按不穿透与悬停抑制的实际手感、缩放后查找条被丢弃的体验均未运行时观察。

## 7. 数据切片（二）：配方 + 进度（本轮新增）

### 7.1 生成的产物

同一份 Spec 声明 4 个配方（有序合成 / 熔炼 / 高炉 / 无序合成）与 2 个进度（根 + 子），引擎产出 6 个 JSON；两版真编译产物入 jar：

| 版本线 | jar 内数据包路径（实测） |
| --- | --- |
| Fabric 1.21.1（jar 16,575 B） | `data/verifyfabric/recipe/*.json`、`data/verifyfabric/advancement/*.json`、`data/verifyfabric/loot_table/…`、`data/minecraft/tags/block/mineable/…`（**全单数**） |
| Forge 1.20.1（jar 18,345 B） | `data/verifyforge/recipes/*.json`、`data/verifyforge/advancements/*.json`、`data/verifyforge/loot_tables/…`、`data/minecraft/tags/blocks/mineable/…`（**全复数**） |

### 7.2 本轮最重要的发现：数据包 JSON 的「版本方言」

编译验证**不会**校验数据包 JSON —— 字段名写错照样 `BUILD SUCCESSFUL`。因此本轮改用**权威源**：直接读 jar 里的**原版数据文件**（1.20.1 客户端 jar 5887 条、1.21.1 服务端 jar 6795 条 `data/minecraft/**`）逐字段对照，结果发现 4 处会让 1.21.1 侧数据全部失效的方言差异：

| 位置 | 1.20.1（原版实测） | 1.21.1（原版实测） |
| --- | --- | --- |
| 物品栈（配方 result / 进度 icon） | `{"item": "minecraft:oak_planks", "count": 4}` | `{"id": "minecraft:oak_planks", "count": 4}` |
| 烹饪类配方 result | `"result": "minecraft:iron_ingot"`（字符串） | `"result": {"id": "minecraft:iron_ingot"}` |
| 切石配方 | `"result": "minecraft:deepslate_tiles"` + `"count": 1` | `"result": {"id": "…", "count": 1}` |
| 进度物品谓词 | `"items": [{"items": ["minecraft:diamond"]}]`（对象列表；标签用 `{"tag": …}`） | `"items": "minecraft:diamond"`（字符串；标签用 `"#minecraft:…"`） |

处理方式：**全部下沉为适配器模板片段**（`recipeShaped/Shapeless/Cooking/Stonecutting`、`advancement`、`advancementItemPredicate`、`advancementTagPredicate`），引擎只传原始值（`{{RESULT_ITEM}}`、`{{COUNT}}`、`{{ADV_ICON_ITEM}}`、`{{ITEM_ID}}`/`{{TAG_ID}}`）——引擎依旧零版本分支，并有两组护栏测试钉住两版写法。

顺带一处机制修正：原版解锁配方靠 `rewards.recipes`（配方书）+ `minecraft:recipe_unlocked` 判据，本框架现在两者都生成（两版同形）。

### 7.3 验收

| 项 | 证据 |
| --- | --- |
| 真编译 | Fabric **PASS（122s）**、Forge **PASS（44s）**，jar 内含全部 6 个数据文件 |
| 单测 | 61 passed（core 29 / adapters 16 / cli 4 / mcp 6 / api 6），含配方/进度的引擎逻辑、默认烹饪时间、判据与 rewards、父级引用、非法引用的字段级报错、两版方言护栏、所有生成 JSON 可解析 |
| 人工比对 | 生成文件与原版样本逐字段一致（见 §7.2 表） |
## 8. 数据切片（三）：实体（本轮新增）

### 8.1 一份 Spec 生成一只怪

```jsonc
"entities": [ { "id": "ruby_golem", "kind": "monster", "health": 30, "speed": 0.28, "attackDamage": 5,
                "followRange": 24, "width": 0.9, "height": 1.6, "shadow": 0.7, "model": "cow",
                "loot": [ { "item": "ruby", "min": 1, "max": 2 }, { "item": "charged_ruby", "chance": 0.25 } ] } ]
```

产出 4 个新文件（工程 38 个文件）：`entity/<Mod><Id>Entity.java`（实体类 + 属性）、`client/<Mod><Id>Renderer.java`（渲染器）、`<Mod>Entities.java`（实体类型与属性注册）、`data/<ns>/loot_table(s)/entities/<id>.json`（掉落表）；同时语言键与主类/客户端引导的注入点自动接线。

### 8.2 真编译证据

| 目标 | 结果 | jar 内容（实测） |
| --- | --- | --- |
| Fabric 1.21.1 | ✅ **BUILD SUCCESSFUL（122s）** | jar 20,646 B：`ModMainEntities.class`、`entity/ModMainRubyGolemEntity.class`、`client/ModMainRubyGolemRenderer.class`、`data/verifyfabric/loot_table/entities/ruby_golem.json` |
| Forge 1.20.1 | ✅ **BUILD SUCCESSFUL（45s）** | jar 23,816 B：`ModMainEntities{,$ModBus}.class`、`entity/ModMainRubyGolemEntity.class`、`client/ModMainRubyGolemRenderer{,$ModBus}.class`、`data/verifyforge/loot_tables/entities/ruby_golem.json` |

### 8.3 版本/加载器差异全部落在数据层

| 关注点 | 处理方式（都在适配器 JSON 里） |
| --- | --- |
| 实体注册 | Fabric 用 `Registry.register(BuiltInRegistries.ENTITY_TYPE, …)`；Forge/NeoForge 用 `DeferredRegister` + 主类注入的 `register(modEventBus)` |
| 属性注册 | Fabric 在 `init()` 里调 `FabricDefaultAttributeRegistry.register`；Forge/NeoForge 走 MOD 总线的 `EntityAttributeCreationEvent`（注册类内自带 `@EventBusSubscriber`/嵌套 `ModBus`） |
| 渲染器注册 | Fabric `EntityRendererRegistry.register`；Forge/NeoForge `EntityRenderersEvent.RegisterRenderers` 里的 `event.registerEntityRenderer(…)` |
| 基类与属性来源 | `entityKinds`：`monster → Monster.createMonsterAttributes()`、`creature → PathfinderMob + Mob.createMobAttributes()` |
| 客户端模型 | `entityModels`：`pig/cow/chicken/sheep` → 模型类 + `ModelLayers.X` 常量（两版同名，已 `javap` 取证） |
| 掉落表目录 | 1.21 `loot_table/entities/`；1.20.1 `loot_tables/entities/` |

### 8.4 本轮由「原版数据对照」修正的一处

掉落表的 `set_count.count` **必须显式写出数值来源类型**（`{"type": "minecraft:uniform", "min": 1, "max": 2}`）。最初省略 `type`，与 jar 内 `data/minecraft/loot_tables/entities/pig.json` 对照后补上——`minecraft:constant` 是默认值，省略会改变语义。这是又一次「编译不校验 JSON 语义、必须以原版数据为准」的实例。

### 8.5 验收

| 项 | 证据 |
| --- | --- |
| 真编译 | Fabric PASS（122s）、Forge PASS（45s），实体类/渲染器/注册类/掉落表全部进 jar |
| 单测 | **63 passed**（core 29 / adapters 18 / cli 4 / mcp 6 / api 6）：新增实体切片逐适配器断言、掉落表结构、语言键、注册注入点、以及「属性基类与模型只在适配器数据里」的原则守卫 |
| 未覆盖（诚实记录） | 实体 AI 目标（`registerGoals`）、生成蛋、贴图与运行时行为均未生成；渲染器复用原版模型（`model` 字段选 pig/cow/chicken/sheep），贴图需自备 |
## 9. datagen（方案 B，本轮新增）

开关式能力：Spec 顶层 `"datagen": true` 时，生成 ① 加载器对应的数据生成入口类 ② 最小示例 provider（演示 `DataProvider.saveStable`）③ 构建脚本的数据任务接线与生成资源目录；Fabric 另写入 `fabric-datagen` entrypoint。默认关闭，关闭时工程与之前逐字节一致。

| 项 | 证据 |
| --- | --- |
| 真编译 | Fabric **PASS（117s）**、Forge **PASS（45s）**；jar 内含 `datagen/ModMainDataGen.class`、`datagen/ModMainExampleProvider.class`（Fabric jar 22,817 B / Forge jar 25,922 B） |
| 任务存在性 | Fabric `gradle tasks --all` 列出 `runDatagen - Starts the 'datagen' run configuration`；Forge 列出 `prepareRunData`、`prepareRunDataCompile` |
| 关闭时零残留 | 单测：`datagen:false` ⇒ 无 `datagen/` 文件、构建脚本无 `runData*`、元数据无 `fabric-datagen` |
| 编译器抓到的缺陷（已修） | ① Fabric `pack.addProvider(Provider::new)` 重载歧义（`FabricDataGenerator.Pack` 亦继承 `DataGenerator.PackGenerator`）→ 显式目标类型转换；② Forge/NeoForge 的 datagen 类在子包引用主类 `MOD_ID` 缺 `import` |
| **明确未做** | **没有运行 datagen**（`runDatagen`/`runData` 未执行）——运行时行为未验证；这是本轮唯一的「编译/任务存在 ≠ 运行成功」缺口 |

评估与三选项（A 不做 / B 最小接线 / C 完整 provider）见 `docs/datagen-evaluation.md`；本轮落地的是可逆的 B。
## 9b. 贴图生成 / 生图（本轮新增）

开关式能力：Spec 顶层 `"textures": true` 时为每个物品/方块生成 16×16 PNG、为每个实体生成 64×32 贴图；单个内容可用 `texture: { style, palette, seed }` 覆盖。默认关闭（生成的 PNG 是受管文件，会覆盖手工美术）。

| 项 | 证据 |
| --- | --- |
| 真编译 | Fabric **PASS**（`gradle build` 退出码 0，产出 `examplemod-1.0.0.jar`） |
| 进 jar | jar 内 `assets/examplemod/textures/{item,block,entity}/*.png` 5 个文件齐全 |
| 字节一致性 | 从 jar 解出的 5 个 PNG 与生成源**逐字节相同**（sha256 前 12 位逐一比对：`209175298c23` / `8133c9082c7c` / `91779052d2c8` / `b97c35ecbcb1` / `09a92a170255`） |
| PNG 结构 | 5/5 通过**签名 + IHDR 尺寸 + CRC32 + IDAT inflate 长度**校验（16×16 raw=1040/1040；64×32 raw=8224/8224；crcBad=0） |
| 引用链路 | 模型/渲染器引用与落盘路径实测对应：`layer0: examplemod:item/ruby` → `textures/item/ruby.png`；`all: examplemod:block/ruby_ore` → `textures/block/ruby_ore.png`；渲染器 `textures/entity/ruby_golem.png` → 同名文件 |
| 确定性 | 同 Spec 重生成**逐字节一致**（`diff -r` 全等）——seeded mulberry32，无 `Math.random` |
| 开关关闭时零残留 | `textures:false` ⇒ 45 → 40 个文件，差集恰为 5 个 PNG；生成工程的 README 同步切回「需自备贴图」文案（两个分支均实测） |
| 多版本 | **三个适配器全覆盖**：Forge 1.20.1 与 NeoForge 1.21.1 用同一 Spec（含 handheld/cube_column）生成同样 5 个 PNG、45 个文件，落盘路径与引用链路同样对应（生成级验证；Fabric 编译级见上表） |
| 测试 | core 43 项通过（含 PNG 往返编解码、确定性、配色、开关、非法风格字段级报错） |
| MCP 面 | `scripts/mcp-smoke.mjs` 以宿主方式握手实测：5 个工具齐全、`list_versions` 返回 3 个适配器、`scaffold_mod`（textures + handheld + cube_column）干跑 ok，23 文件、2 个 PNG 路径正确 |
| **明确未做** | **贴图在游戏内的实际观感未验证**（无客户端运行）；实体贴图为 64×32 **纯色占位**，自定义 UV 美术仍需自备；未接真实图像模型（`paintTexture` 是预留的单一替换点） |

设计取舍：贴图走**参数化程序化绘制**而非调用图像模型——离线、瞬时、**可复现**。可复现是关键：改图会体现为 diff，而不是不可复现的噪声；接真实模型只需替换 `paintTexture` 一个函数。

### 9b.0 外部图片输入（2026-10-22 新增）

第三个贴图来源：`textureProvider: "file"` + `texture.file`（本地 PNG 路径）。与 image-api 共用同一条转换管线（decodePng → 抠背景 → 裁主体 → 缩放 → 编码），差异只在字节来源：

| 项 | 证据 |
| --- | --- |
| 相对路径 | CLI 实测：`file: "source.png"` 相对 spec 文件目录解析，产出 `textures/item/ruby.png` 正常（`Temp/filetest` 端到端） |
| 绝对路径约束 | 单测：无 baseDir（MCP/HTTP 场景）时相对路径报「must be an absolute path」 |
| 错误路径 | 单测：文件缺失 / 非可用 PNG / 超 20 MiB 均报 `SPEC_INVALID` 并带具体文件路径 |
| 降级可见 | 单测：file/image-api spec 未经 prepareTextures 直接进计划 → warning（不再静默画程序化贴图） |
| 三面一致 | CLI / MCP / HTTP 统一走 `prepareTextures` 单一分发器（审计修复 #1 的延续），`--dry-run` 不读文件不联网 |

### 9b.1 模型形态（handheld / cube_column）

| 项 | 证据 |
| --- | --- |
| 真编译 | 开启 `textures` + `handheld` 物品 + `cube_column` 方块，Fabric **PASS**（`gradle build` 退出码 0，产出 jar） |
| 进 jar | jar 内 `models/item/ruby.json`（95 B，handheld）、`models/block/ruby_ore.json`（140 B，cube_column）与 5 个贴图齐全 |
| 形态切换 | 生成级实测：`"parent": "minecraft:item/handheld"`；`cube_column` 同时绑定 `end`/`side` 且**不改变贴图路径** |
| 错误路径 | 单测：未知形态 → 字段级报错；适配器缺该模板 → 可修复错误（而非产出坏文件） |
| 文档一致性 | 生成工程 README 的贴图段落改为条件化 `{{TEXTURE_NOTES}}`（lint 强制），修掉「已生成贴图却提示自备」的矛盾 |

说明：模型 JSON 的语义**不由 `gradle build` 校验**（同 S8 的方法学），因此上面的「真编译」证明的是工程仍可构建、资源正确进 jar；JSON 语义由生成级比对与单测承担。

## 10. 本轮交付的其他能力

- Spec 新增 `ui.screens[]`（id/title/key/width/height/lines）并在 UI 2.0 扩展 theme/accent/align/animation/buttons、UI 3.0 扩展 `lines` 的 `{text, style}` 形式、UI 8.0 扩展 `{target: "#anchor", anchor}` 形式，缺省值可省略；非法键/非法样式、未声明 target、未声明/重复 anchor、close 带 target、按钮自跳转均给出字段级报错。
- 适配器契约新增 `keyCodePattern`（键码表达式，默认 `org.lwjgl.glfw.GLFW.GLFW_KEY_{{KEY}}`）与 `clientSubpackage`；UI 模板「可选但全有或全无」，由 lint 强制；screen 模板额外禁止 `super.render(`、要求单次 `renderBackground` 与 `this.children()`。
- `scripts/verify-build.mjs`：一键复验，按适配器声明的 wrapper 版本选 Gradle 线。
- Gradle 9.5.1 经腾讯云镜像重新取得（`services.gradle.org` 会跳转到被阻断的 github.com），Fabric 线复验能力恢复。

## 11. 阻塞 / 跳过 / 不适用

### 11.1 NeoForge 真编译 / 真运行 —— ✅ 已解除阻塞（2026-10-22）

原结论（「本机无法完成 NeoForge 编译验证」）已被推翻：三个 NeoForge 目标全部通过真编译 + 真运行，证据见 §16。环境阻塞靠四处工作绕开，**没有任何一步绕过验证**：

1. **插件解析**：`maven.neoforged.net` 仍不可达；settings.gradle 只用 ForgeCDN 镜像（`neoforged.forgecdn.net/releases`），官方主机刻意不列入（Gradle 对不可达仓库**硬失败**，不回落）。
2. **`net.neoforged:minecraft-dependencies:<mc>` 模块**：镜像 404、仅官方提供 ⇒ settings.gradle 从 Mojang 版本清单（`piston-meta.mojang.com`，可达）按当前 OS 合成等价 POM 到本地仓库 `.gradle/mcdeps-repo`，按版本缓存。
3. **NFRT 钉版库**：NFRT 用 NeoForge userdev 配置重编译 Minecraft，配置钉死精确库版本（如 guava 31.1-jre）；Gradle 冲突解析会升级它们，导致清单缺条目、NFRT 回头找官方 maven ⇒ build.gradle 用 `addArtifactsToManifest` 把 7 个钉版坐标显式加进清单（`transitive=false`）。
4. **1.20.4 的工具链**：MDG 1.x/NFRT 1.x 硬编码 `--release 21`（class 65 与 Java 17 工具链冲突）⇒ 换 MDG 2.0.147（官方支持 1.20.4 起）；NFRT 的 `createMinecraftArtifacts` 要求 Java 21 工具链 ⇒ Gradle 守护进程跑在 JDK 21 上（current-JVM 探测覆盖 21 工具链），JDK 17 由注册表自动探测。

原表（4 次失败尝试）保留如下，作为「Gradle 对不可达仓库硬失败」这一约束的证据：

| 尝试 | 配置 | 结果 | 说明 |
| --- | --- | --- | --- |
| 1 | 官方 maven 在前 | ❌ 插件未找到 | Gradle 访问 `maven.neoforged.net` 得到 SSL reset 后硬失败，不回落 |
| 2 | 镜像在前、官方在后 | ❌ 传递依赖失败 | 插件从镜像解析成功；`gradle-idea-ext` 回落官方 maven → 硬失败 |
| 3 | 官方 maven 置于最后 | ❌ `neoform-runtime` 失败 | 该工件只能从 MDG 自注册仓库（官方）取得 |
| 4 | `PREFER_SETTINGS` 强制设置级仓库 | ❌ `minecraft-dependencies` 缺失 | `net.neoforged:minecraft-dependencies:1.21.1` 在镜像 **404**，仅有官方 maven 提供 |

**离线静态校验（最大努力）**：NeoForge 适配器模板引用的 13 个 `net.minecraft.*` 类逐个 `javap`（1.21.1 真实映射 jar）→ **13/13 存在**；8 个 `net.neoforged.*` 类**无法离线校验**（类文件在 `neoforge-*-universal.jar` 与 FML 工件内，两者都托管在被阻断的 maven 上；本地 userdev jar 只有 config/patches/joined.lzma，joined 内是补丁后的原版 MC，不含 NeoForge 代码）。

静态检查无法替代编译的对照经验依然成立：Forge 线同样的模板结构被编译器抓出 3 处 API 错误（§5、§6.4），而 NeoForge 线真实构建又抓出 §16.2 的 6 处缺陷——其中「mods.toml 文件名」与「loaderVersion [4,)」两处是**编译器根本看不见、只有真实运行才暴露**的。

### 11.2 其他阻塞 / 跳过

| 项 | 状态 | 原因与影响 |
| --- | --- | --- |
| `gradlew` 自动下载 Gradle 发行版 | ⛔ 阻塞（环境） | 本机 Java 对发行版 CDN 连接超时；`services.gradle.org` 部分重定向到被阻断的 github.com。**不影响产物**：验收使用本地发行版，wrapper 四件套随工程分发 |
| 浏览器端验证 | ⏭ 跳过 | 本会话无可用浏览器 provider；生成物是游戏内 UI，本就无法在浏览器里验证 |
| **游戏内运行时验证**（真的按 K 打开屏幕） | ⏭ 跳过 | 需要可运行的 Minecraft 客户端与图形环境；本框架的验收止于「编译通过 + 类与资源进入 jar」 |
| MC 26.x（Java 25）目标 | ⏭ 跳过 | 无 JDK 25；未纳入本期适配器 |
| Linux/macOS 生成与构建 | ⏭ 跳过 | 本机为 Windows；已用 posix 相对路径 + `executable` 位降低风险，未实测 |

## 12. 一键复验 / Re-verification

```bash
pnpm -r build && pnpm -r test            # 155 passed (2026-10-22)
node scripts/verify-build.mjs --adapter fabric-1.21.1 \
  --gradle "9=C:/tools/gradle-9.5.1/bin/gradle.bat" --java-home-21 <jdk21>
node scripts/verify-build.mjs --adapter forge-1.20.1 \
  --gradle "8=C:/tools/gradle-8.8/bin/gradle.bat" --java-home-17 <jdk17>
```

运行级复验（`verify-runtime.mjs`：生成工程 → 起专用服务器 → 看 mod 初始化行 + `Done (`）：

```bash
node scripts/verify-runtime.mjs --adapter neoforge-1.21.1 --gradle "9=<gradle-9.5.1>/bin/gradle.bat" \
  --java-home-21 <jdk21> --timeout 900
node scripts/verify-runtime.mjs --adapter neoforge-1.21.4 --gradle "9=<gradle-9.5.1>/bin/gradle.bat" \
  --java-home-21 <jdk21> --timeout 900
# 1.20.4 注意：--java-home-17 这里传的是 JDK 21 路径——harness 把它用作 Gradle 守护进程的 JAVA_HOME。
# NFRT 的 createMinecraftArtifacts 要 Java 21 工具链，而本机只有 current-JVM 探测能覆盖它；
# JDK 17（编译 mod 用）由注册表自动探测。见 §11.1 第 4 条。
node scripts/verify-runtime.mjs --adapter neoforge-1.20.4 --gradle "9=<gradle-9.5.1>/bin/gradle.bat" \
  --java-home-17 <jdk21> --timeout 900

# forge-1.21.4 走 ForgeGradle 7：Mavenizer 需要 JDK 25（路径勿含空格）
node scripts/verify-runtime.mjs --adapter forge-1.21.4 --gradle "9=<gradle-9.5.1>/bin/gradle.bat" \
  --java-home-21 <jdk21> --gradle-arg "-Porg.gradle.java.installations.paths=<jdk25>" --timeout 1200
```

脚本按**适配器声明的 `gradleWrapperVersion`** 选择 Gradle 线，缺工具链时如实报 `SKIPPED`；失败退出码 1，并在 `Temp/verify-build/<adapter>/build.log` 与 `Temp/verify-runtime/<adapter>/runtime.log` 留完整日志。已知限制：`--gradle-arg` 经 shell 拼接不经转义，含空格的参数（如 `-Dorg.gradle.java.installations.paths`）会被拆坏，勿用。

## 13. 遗留风险与缺口

1. **NeoForge 验证依赖合成 POM 与钉版清单钩子**（§11.1/§16）：两者都建立在「Mojang 版本清单结构」与「NeoForge userdev 钉版库列表」的现状之上，上游改动时可能再次失效；全部细节已写入适配器 `notes`，失效时按 §12 复验即可定位。
2. **UI 只到「可编译」**：UI 2.0–42.0 已实现换行/滚动（含滚动条抓取偏移、章节刻度悬停/点击与 Ctrl 章节跳转、长距离自适应时长、翻页重叠、轨道点击滑行、指南按键开关：屏幕内按 `TOGGLE_KEY` 收起已打开的屏幕、tick 侧仅在 `client.screen == null` 时新建、按住链接的加深反馈、contrast 高对比主题、页脚每行按钮按面板宽度收缩、`contentsFor` 自动目录且目录条目复用目标标题语言键、跨屏深链 tooltip 显示「目标屏 › 落点章节」）/导航/主题/动画/行内链接（命中区与文字一致、松开时提交、拖走取消）/本屏跳转/跨屏深链/落点反馈/键盘链接焦点（手动滚动即退出；焦点行自动滚入视口时上下留一行上下文，长链接优先保住首行）/焦点 tooltip/滚动边缘渐隐/关闭淡出过渡/面板投影与标题 tooltip/note 提示行与 warn 警告行（主题暖色 + 2px 竖线）/step 有序步骤行（自动编号按 heading 重置）、屏内搜索（Ctrl+F 查找条：输入即查、Enter 循环命中并闪烁落点、右侧 n/m 计数、Esc 先关条、获焦独占键盘——输入开关按键不误关屏、点按与悬停不穿透到被遮挡的链接）、搜索命中行高亮（命中行铺主题 accent 弱透明底、Enter 落点行强化；落点闪烁与链接悬停仍居上层）、查找条循环增强（Shift+Enter 反向循环同规回绕、点击计数区等价 Enter 前进、悬停计数区显示两键说明）、查找条会话记忆（重开恢复上次查询并立即重查、新查询从当前阅读行起查并回卷顶部）、命中分布刻度（搜索激活时滚动条轨道外缘为每个命中行画刻度、当前命中全亮加宽，与左侧章节刻度互为镜像）、命中刻度交互化（悬停刻度加宽全亮并 tooltip 显示该命中行文本、点击直接跳到该命中并同步循环序号，刻度锚点固定不随轨道加宽位移）、查找态正文内边距（查找条打开时正文整体下移一个条带高度并扩滚动范围，开条补偿、关条还原，文档头部第 0 行与 Home 也完整落在条带下）/缩放与重开的逻辑行阅读位置记忆并通过三加载器真编译，但本机无法启动图形客户端，屏幕的实际渲染、悬停/滚动手感、拖动精度、动画观感、深链落点、按键焦点、渐隐层次、关闭过渡、投影层次、提示行可读性、warn 与 note 在真实像素下的区分度（尤其 contrast 主题的橙 `0xFFFF9100` 与亮黄 accent `0xFFFFD400` 相邻色域在花哨场景下是否仍分得开）、刻度可见度与点击命中区、刻度悬停手感、章节跳转节奏、远跳时长的快慢手感、翻页一行重叠是否足够、轨道点击滑行的落点与时长是否自然、按键再次按下是否稳定收起（快速连按、关闭过渡中再按、与 ESC 混用）、屏幕内开关只按 Spec 键的 GLFW 键码匹配而不随用户重绑（重绑后须按新绑定的键才能从屏幕内收起，tick 侧仍能按重绑键打开）、按住链接时加深/加粗的幅度是否足够明显、拖走后是否干净恢复、contrast 主题在明亮场景下的实际对比与亮黄 accent 是否刺眼、极窄面板下按钮收缩后的标签是否仍可读（收缩只保证控件留在边框内，不再保证 100px 完整标签）、自动目录条目在真实标题文本下的可读性与点击落点、目录屏返回后的阅读位置、深链 tooltip 两段拼接后的文字长度与遮挡、缩放/重开落点、手动滚动的焦点退出与链接松开/取消手感、step 步号在真实字体下的右对齐观感与两位数步号（「10.」起）和正文的最小间距是否仍舒展（`Math.max(left + 1, …)` 只保证不溢出面板，不保证步号与正文不相邻）仍未运行时验证；屏内搜索条是本仓库的第一个输入控件（vanilla `EditBox`），其打字手感、光标与焦点环、中文输入法组合、提示文本的实际显示均未运行时观察，其他输入型/列表控件仍未实现。UI 36.0 的两档命中染色（0x1C/0x40）在四主题（尤其 contrast 的亮黄 accent）下的辨识度、「全部命中」与「当前命中」的对比强度、与落点闪烁/链接悬停底色叠加时的层次、一行内多处命中合并为一档的观感同样未运行时观察；染色写法为 `(ACCENT_COLOR & 0x00FFFFFF) | (alpha << 24)`，在 `searchIndex` 指向的行与其他命中行之间只差一档 alpha，快速连击 Enter 时「哪条是当前」是否够醒目也未观察。UI 37.0 的反向循环、计数区点击与计数区悬停 tooltip 同样未运行时观察：`Shift+Enter` 在 `EditBox` 获焦时与输入法/系统组合键是否冲突、计数区点击热区（右锚 ±2px、纵向同条带）在真实鼠标下的边界手感与误触概率、悬停计数区 tooltip 与链接 tooltip 链的优先级观感（计数区分支在最前，恰与首行链接重叠时以计数区提示为准），均只能在图形客户端确认。UI 38.0 的会话记忆与起始行选择同样未运行时观察：`EditBox.setValue` 触发响应器的即时重查是否与用户预期一致（恢复后光标默认落在文本末尾，继续打字即替换语义）、`lineForScroll(scrollTarget)` 在落点动画尚未播完时作为「阅读位置」的稳定性、查询被全部清空后重开不回填、以及「从当前行起查」在命中恰好都在上方时整屏跳回顶部的观感是否自然，都只能在图形客户端确认。UI 39.0 的命中分布刻度同样未运行时观察：轨道外缘 3/5px 刻度在四主题（尤其 contrast 的亮黄 accent）下的可见度、命中密集时相邻行刻度纵向合并成连片实线的观感、与左侧章节刻度并排时两种地图信息（章节分布/命中分布）是否互相干扰，都只能在图形客户端确认。UI 40.0 的刻度悬停/点击同样未运行时观察：悬停热区（x 界 5px 宽 + 纵向 ±2px 容差）与加宽后刻度的对应手感、tooltip 直接展示整行文本（长行可能接近屏宽）的可读性、刻度点击与轨道点击滑行在非命中行处的分界、以及条带覆盖的首行刻度「悬停会弹、点击归查找条」的处置是否自然，都只能在图形客户端确认。UI 41.0/42.0 的查找态落点处理同样未运行时观察（42.0 的内边距已取代 41.0 的单点钳制）：开条/关条瞬间的滚动补偿是否视觉无痕（阅读位置应当真正原地不动）、正文下移后视口可见行数少一行的观感、文档头部第 0 行在条带下方 8px 处的可读性、滚动条滑块因范围扩 24px 而产生的微小位移、以及「正文上缘空带点击被涂绘区间守卫拒绝」的手感，都只能在图形客户端确认。NeoForge/Forge 的运行验证止于专用服务器启动 + mod 初始化日志；客户端路径（屏幕渲染、按键绑定）仍未验证。
3. **版本漂移**：适配器钉住的版本号会随上游变旧，需要版本巡检工作流（数据源见 docs/research/2026-09-version-api-knowledge.md §2.4）。
4. **贴图缺失**：物品/方块贴图需自备（生成工程 README 已明确）。
5. **覆盖子集仍有限**：配方、进度、实体、附魔、datagen 尚未实现。
6. **未做负面安全测试**：路径逃逸有实现级守卫与单测，但无模糊测试；MCP/HTTP 面未做鉴权（默认仅监听 loopback）。

## 14. L4 真编译（四）：1.16.5（本轮新增，跨代际重写）

### 14.1 命令与结果

```bash
node scripts/smoke-spec.mjs .probe116/spec-1165.json 1.16.5 fabric
node packages/cli/dist/index.js gen .probe116/spec-1165.json -o .probe116/gen
cd .probe116/gen/examplemod && <gradle-9.5.1>/bin/gradle build     # BUILD SUCCESSFUL, 25 files
```
```
> Task :compileJava
> Task :remapJar
> Task :build
BUILD SUCCESSFUL in 17s
```

```bash
node scripts/smoke-spec.mjs .probe116/spec-1165-forge.json 1.16.5 forge
node packages/cli/dist/index.js gen .probe116/spec-1165-forge.json -o .probe116/gen-forge
cd .probe116/gen-forge/examplemod && <gradle-8.8>/bin/gradle build  # BUILD SUCCESSFUL
```
```
> Task :compileJava
> Task :reobfJar
> Task :build
BUILD SUCCESSFUL in 21s
```

### 14.2 由真编译/取证发现并修复的缺陷

| 缺陷 | 发现方式 | 处理 |
| --- | --- | --- |
| `var id = ...` 在 Java 8 目标编译失败 | 编译器报「找不到符号: 类 var」 | 模板改用显式类型；**并加 lint**：`adapter.java < 10` 时任何模板出现 `var` 即报错 |
| 1.16 没有 `ItemGroupEvents`，旧的组挂钩模板产出坏 Java | `javap` 该版本聚合器解析到的 `fabric-item-groups-v0` 构件 | 契约新增 `itemGroupSuffix`，改为构造期 `Item.Properties#tab()` |
| Forge 1.16.5 编译用 MCP 名而非官方名 | 对 ForgeGradle 真实产出的 `_mapped_official_1.16.5.jar` 做 `javap` | 模板全量改用 MCP 名；`mappings` 字段如实标注 |
| `RegistryObject` 包路径 | `javap` | 该版本是 `net.minecraftforge.fml.RegistryObject` |
| `com.mojang.logging.LogUtils` 不存在 | 编译 + 查 jar 内容 | 改用 log4j |
| 数据包目录复数 | 读真实 client.jar | `loot_tables/`、`tags/blocks/` |

### 14.3 没做到的部分（如实标注）

1. **运行期一律未验证**：两个 1.16.5 工程只做到「产出 jar」。自定义标签页是否真的出现在创造模式界面、
   物品是否落在预期分页，**没有任何目标做过真机运行验证**（本机无可用图形客户端）。
   间接证据是 `javap -c` 字节码（Fabric 的 `CreativeModeTab.<init>` 末尾 `TABS[id] = this`）
   与 Forge 官方补丁源码（`addGroupSafe`），但那是**代码路径证据，不是运行证据**。
2. **1.16.5 只覆盖 items + blocks + textures**：UI/配方/进度/实体/datagen 切片未移植（其模板不是版本无关的）。
3. **Forge 1.16.5 的 MCP 命名是工具链行为，不是我们的选择**：若上游 ForgeGradle 改变该行为，
   该适配器需重新取证。已写进 `notes` 与 `docs/adding-a-version.md` §2.5。
4. **`fabric-datagen` entrypoint** 在 1.16 模板中被移除（该 entrypoint 是 1.17+）。

## 15. L4 真编译（五）：1.12.2（本轮新增，又一代际）

### 15.1 命令与结果

```bash
node scripts/smoke-spec.mjs .probe112/spec-1122.json 1.12.2 forge
node packages/cli/dist/index.js gen .probe112/spec-1122.json -o .probe112/gen
JAVA_HOME=<jdk8> <gradle-4.10.3>/bin/gradle -p .probe112/gen/examplemod build
```
```
> Task :compileJava
> Task :reobfJar
> Task :build
BUILD SUCCESSFUL in 28s
```

### 15.2 上游事实：1.12.2 没有 Fabric

`meta.fabricmc.net/v2/versions/loader/1.12.2` → **HTTP 400**；Fabric API 无任何 1.12 构建。
Fabric 从 1.14 开始。**该目标只有 Forge，这是上游事实不是框架缺口。**

### 15.3 工具链取证（三条路只走通一条）

| 路线 | 结果 | 证据 |
| --- | --- | --- |
| ForgeGradle 6 + Gradle 8.8 | ❌ | FG6 内部 `Project services has been closed` / `DefaultToolchainSpec` 实例化失败 |
| ForgeGradle 2.3 + Gradle 4.10.3 | ❌ | `forge-1.12.2-*.userdev.jar` 在 Forge maven 全站 **404**（只有 `-universal.jar` / `-sources.jar`） |
| **ForgeGradle 3 + Gradle 4.10.3 + JDK 8** | ✅ | 官方 `MinecraftForge/MinecraftForge` 分支 `1.12.x` 的 `mdk/build.gradle` 用的就是 `ForgeGradle:3.+` |

### 15.4 由真编译/取证发现并修复的缺陷

| 缺陷 | 发现方式 | 处理 |
| --- | --- | --- |
| 引擎硬编码 `.durability(n)`（1.13+ 的 API 名） | 1.12.2 需要 `.setMaxDamage(n)` | 契约新增 `itemDurabilitySuffix` 模板；引擎不再认识任何 MC API 名 |
| 引擎无条件产出方块战利品表 | 真实 1.12.2 jar 的 `loot_tables/` 只有 chests/entities/gameplay | `lootTable` 改为可选切片（1.14+） |
| 引擎无条件产出 mineable 标签 | 1.12.2 无 `tags/`（1.13+） | `mineableTag` 改为可选切片；lint 强制 templates/contentPaths 成对 |
| `{{tool}}`/`{{HARDNESS}}` 只在 settings 渲染时可用 | `setHarvestLevel` 返回 void，不能链式，必须在注册函数里调用 | 这三个变量提升到方块的通用变量集 |
| `minecraft { runDir 'run' }` 在 FG3 上不存在 | 构建报 `Could not find method runDir()` | 改为 FG3 的 `runs { client {...} }` |
| `Items.STONE` 在 1.12.2 不存在（物品/方块注册表 1.13 才合并） | 编译器 | 改用 `Blocks.STONE` |
| `Material` 未导入 | 编译器 | 补 `net.minecraft.block.material.Material` |
| 模板注释里硬编码了 `1.12.2` | 既有测试「模板不得硬编码自身 MC 版本」 | 改写注释 |

### 15.5 没做到的部分（如实标注）

1. **运行期一律未验证**：只做到「产出 jar」。`@Mod.EventBusSubscriber` 是否确实收到
   `RegistryEvent`、自定义 `CreativeTabs` 是否出现在创造模式界面、ItemBlock 是否继承方块的
   本地化键——**都是代码路径推理 + javap/字节码证据，不是运行证据**。
2. **1.12.2 只覆盖 items + blocks + textures**：UI/配方/进度/实体/datagen 切片未移植。
3. **采集等级固定为 1**：ModSpec 只建模「用什么工具」，不建模「什么等级」，1.12.2 需要等级参数，
   适配器取了该年代普通方块的默认值 1。已在 `notes` 里写明。
4. **Fabric 侧无对应目标**，非本框架所能补。

## 16. L4 真编译 + 真运行（六）：NeoForge 1.20.4 / 1.21.1 / 1.21.4（本轮新增）

### 16.1 命令与结果

三个目标用同一份冒烟 Spec（物品 + 方块 + 钓鱼竿行为 + 原版创造组 + 自定义标签页 + 程序化贴图）生成工程，`gradle build` 通过后，由 `scripts/verify-runtime.mjs` 起**专用服务器**，判据是日志出现 mod 自己的初始化行 **且** `Done (`：

| 目标 | 构建 | 运行（verify-runtime.mjs） | 证据（runtime.log） |
| --- | --- | --- | --- |
| `neoforge-1.20.4` | ✅ BUILD SUCCESSFUL（jar 进 build/libs） | ✅ PASS（77s） | `rtcheckneoforge initialized for Minecraft 1.20.4` + `Done (17.777s)` |
| `neoforge-1.21.1` | ✅ BUILD SUCCESSFUL | ✅ PASS（205s） | `rtcheckneoforge initialized for Minecraft 1.21.1` + `Done (` |
| `neoforge-1.21.4` | ✅ BUILD SUCCESSFUL | ✅ PASS（43s） | `rtcheckneoforge initialized for Minecraft 1.21.4` + `Done (7.429s)` |

### 16.2 由真编译 / 真运行发现并修复的缺陷

| 缺陷 | 发现方式 | 处理 |
| --- | --- | --- |
| MDG 1.x / NFRT 1.x 硬编码 `--release 21`，Java 17 工具链报 class 65（`Bad class file`） | 1.20.4 构建失败 | 三个适配器统一换 **MDG 2.0.147**（官方支持 1.20.4 起） |
| NFRT 钉版库（guava 31.1-jre 等）被 Gradle 冲突解析升级后从工件清单消失，NFRT 回头访问被阻断的官方 maven | 1.20.4 构建失败 | build.gradle 追加 `addArtifactsToManifest` 钩子：7 个钉版坐标、`transitive=false` |
| 1.20.4 的 FML 2.0.17 只扫描 `META-INF/mods.toml`（`neoforge.mods.toml` 是 1.21+ 的名字） | 运行 WARN：服务器启动、mod **从未加载** | 1.20.4 的 mods.toml 路径改回 `META-INF/mods.toml` + 回归测试 |
| 1.20.4 的 mods.toml 声明 `loaderVersion = "[4,)"`，但 FML 2.0.17 的 javafml 语言版本是 **2.0** | 运行 WARN：`Missing language javafml version [4,) wanted by main, found 2.0` | 1.20.4 的 `fmlLoaderVersionRange` 与模板改 `"[2,)"` + 回归测试 |
| MC 1.21.2+ 注册物品/方块必须带 registry id | 1.21.4 运行 FAIL：`Item id not set` / `Block id not set` | 1.21.4 的 item/block settings 模板补 `.setId(ResourceKey.create(...))` + imports |
| 1.20.4 数据包目录是复数 `loot_tables` / `tags/blocks`（单数是 1.21 改动） | 与 1.21.x 对照 + 真实 jar 取证 | 1.20.4 的 `contentPaths` 改复数 |

前两条被**编译器**抓住；「mods.toml 文件名」与「loaderVersion [4,)」两条是编译器根本看不见、**只有真实运行才暴露**的——服务器开开心心启动完，mod 从未被加载。这正是把验收从「编译级」推进到「运行级」的动机（§1 L4 真运行行）。

### 16.3 环境阻塞的解除方式

见 §11.1。核心是承认「官方 maven 不可达」为环境常量，然后逐项消除构建对它的依赖：插件走 ForgeCDN 镜像、`minecraft-dependencies` 模块本地合成、钉版库显式进清单。全部改动在真实构建中执行并留下日志（`Temp/verify-build/`、`Temp/verify-runtime/`）。

### 16.4 没做到的部分（如实标注）

1. **运行验证止于专用服务器**：mod 在服务器上完成构造、注册并进入世界；客户端路径（屏幕渲染、按键绑定、创造模式标签页展示）未验证。
2. **1.20.4 的验证依赖「JDK 21 守护进程 + 注册表探测 JDK 17」**：本机 Gradle 的 current-JVM 探测覆盖 21 工具链、17 靠注册表；换机器若探测不到 17，需配置 `org.gradle.java.installations.paths`（本机实测该参数经 harness 的 `--gradle-arg` 传递会被 shell 转义破坏，故未采用，见 §12 已知限制）。
3. 三个目标仍只覆盖 items + blocks + textures 切片（UI/配方/进度/实体/datagen 未移植到 NeoForge，同 §15.5）。

## 17. 全项目审核与修复（2026-10-22）

对引擎、适配器数据、三个接入面、文档与脚本的全面审核，发现并修复 7 项：

| 发现 | 修复 |
| --- | --- |
| MCP `scaffold_mod` 与 HTTP `/api/generate` 不预取 image-api 贴图，程序化贴图静默顶替，与 CLI 行为不一致 | 两面与 CLI 对齐（dryRun 仍离线）；`planGeneration` 对「image-api 但无预取图片 / 有 prompt 但缺图」推 warning，不再静默 |
| `gradle.fmlLoaderVersionRange`（NeoForge×3）与 `loaderVersionRange`/`minecraftVersionRange`（forge-1.12.2）声明后无任何模板引用，正是「loaderVersion [4,) 漂移」一案的温床 | NeoForge 的 modsToml 改用 `{{gradle_fmlLoaderVersionRange}}`；1.12.2 删去死键；`lintAdapter` 新增规则：**gradle 键必须被模板或 projectFile 路径消费**（回归测试覆盖） |
| `decodePng` 无尺寸上限，恶意 IHDR 可致巨量分配 | 4096px/边上限 + 非正尺寸拒绝（在 inflate 前拦截） |
| image-provider 配置无校验：负超时穿透、端点/下载 URL 无 scheme 校验、下载无字节上限 | 超时钳制为正值；端点与下载 URL 仅 http(s)；下载与 b64_json 上限 20 MiB、生成响应文本上限 64 MiB |
| `ENTITY_FQ` 手工 `basePackagePattern.replace`，绕过已算好的包名 | 改用 `ctx.vars.entityPackageName` |
| CLI / MCP / API 三处硬编码 `VERSION = "0.1.0"` | 三面运行时读各自 package.json，版本单一来源 |
| API 无匹配路由复用 `ADAPTER_NOT_FOUND` 码；测试缺 body 超限/example/adapters/generate 等用例 | 新增 `ROUTE_NOT_FOUND`（404）；api.test.ts 6 用例 → 13 用例 |

测试从 119 增至 **139**（core +13：解码上限、provider 校验、gradle 键消费、贴图降级 warning；api +7）；外部图片输入再增 **7**（core：file provider 加载/校验/转换/降级，见 §9b.0），合计 **146**；随后新增 3 项 `forge-1.21.4` 回归测试，合计 **155**（见 §18）。

## 18. Forge 1.21.4 运行失败修复 + SmoothForge 性能 mod（2026-10-22）

### 18.1 症状与根因

用 `forge-1.21.4` 适配器生成 SmoothForge 后，`gradlew build` 通过，但专用服务器启动即失败：

```
File ...\build\resources\main constructed 0 mods: [], but had 1 mods specified: [smoothforge]
The following classes are missing, but are reported in the mods.toml: [smoothforge]
java.lang.UnsupportedOperationException at ModLoader.buildMods(ModLoader.java:322)
```

对比官方 MDK（`forge-1.21.4-54.1.18-mdk.zip`）后确认根因：**Forge 1.21.4 的开发启动目标 `forge_userdev_server` 需要 ForgeGradle 7**。
FG6 只把 `build/resources/main` 交给 mod 定位器，类文件在另一个目录，于是定位器读得到 `mods.toml` 却扫不到 `@Mod` 类；
FG7 通过 `net.minecraftforge.gradle.merge-source-sets=true` 把类与资源合并到 `build/sourceSets/main`（运行日志中定位器识别的正是该目录）。
官方 MDK 同时用 Gradle 9.3.1，FG7 的 Minecraft Mavenizer 是一个 **Java 25** 构件（`org.gradle.jvm.version=25`），因此构建还需要 JDK 25 工具链。

### 18.2 适配器修复（`packages/adapters/data/forge-1.21.4.json`）

| 项 | 修改 |
| --- | --- |
| ForgeGradle | 6.0.54 → **7.0.40**（Gradle Plugin Portal 坐标；Forge maven 上没有 7.x） |
| Gradle wrapper | 8.8 → **9.5.1**（复用已有 `gradle-9.5.1` 资产） |
| `settings.gradle` | 增加 `org.gradle.toolchains.foojay-resolver-convention` 1.0.0，缺失 JDK 25 时自动下载 |
| `gradle.properties` | 增加 `net.minecraftforge.gradle.merge-source-sets=true`（FG7 dev run 的唯一正确姿势） |
| `build.gradle` | FG7 DSL：`minecraft.mavenizer(it)` / `fg.forgeMaven` / `implementation minecraft.dependency(...)`；去掉 FG6 的 `mods { source sourceSets.main }` |
| 数据包路径 | 修正为 1.21 的单数目录：`data/<ns>/loot_table/blocks/`、`data/minecraft/tags/block/mineable/`（原为 1.20 的复数） |
| notes / references | 清除从 1.20.1 拷贝的版本事实（Java 17、Gradle 8.8、Forge 47.4.10 等），改为 1.21.4 的真实事实 |

同类错误一并修正：`forge-1.19.4` / `forge-1.20.4` 的 notes 也写着 1.20.1 的版本事实（仅文案，不影响产物）。

### 18.3 回归测试

`packages/adapters/test/real-adapter.test.ts` 新增 `forge-1.21.4 dev-run wiring` 3 项：
FG7 + Gradle 9.5.1 资产、`merge-source-sets` + FG7 mavenizer DSL、1.21 单数数据包目录。

### 18.4 证据

| 步骤 | 命令 | 结果 |
| --- | --- | --- |
| 编译 | `gradle build`（Gradle 9.5.1 + JDK 21，`-Porg.gradle.java.installations.paths=<jdk25>`） | ✅ `BUILD SUCCESSFUL in 9m 42s`，产出 `smoothforge-1.0.0.jar` |
| 运行 | `gradle runServer`，同工具链 | ✅ `smoothforge loaded` @15:52:59；`Done (11.930s)!` @15:53:17；无 `constructed 0 mods` |
| 全量测试 | `pnpm -r test` | ✅ **155 passed**（core 93 / adapters 39 / api 13 / cli 4 / mcp 6） |

首次 FG7 构建慢（下载并反编译 1.21.4，约 10 分钟）；产物缓存在
`~/.gradle/caches/minecraftforge/forgegradle/`，后续构建不再重复。本机 JDK 25 为 Microsoft OpenJDK 25.0.4.1（`.tools/jdk-25`，已 gitignore）。

### 18.5 交付物：SmoothForge

`mods/smoothforge/` 下两个工程（1.20.1 / 1.21.4），共享同一份手写性能代码：

- 服务端掉落物合并（生成时 + 每玩家周期清扫，满堆即并、绝不丢物品）；
- 客户端活体实体与姓名牌距离裁剪；
- `/smoothforge stats|reload`（权限 2）；
- `config/smoothforge.json` 纯 JSON 配置（Gson，带范围钳制），首次启动自动写入。

1.20.1 运行证据：`smoothforge loaded` + `Done (28.876s)!`（`forge-1.20.1/smoothforge/run/server.log`）。
两端均为非 Mixin 实现；MCP/HTTP 面不执行构建的设计不变。
