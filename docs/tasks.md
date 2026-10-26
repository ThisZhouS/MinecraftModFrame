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
| S4b 真实适配器 | NeoForge 1.21.1（后扩到 1.20.4 / 1.21.4）：适配器数据与生成；真编译 + 真运行（S18） | S4 | `mcmod gen` + `gradle build` + `verify-runtime.mjs` | ✅ 编译 + 运行验证通过（见 S18） |
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

## S15 交付物（版本事实的权威来源：adapter references，已完成）

**动机**：结合 `mouse0w0/MinecraftDeveloperGuide`（中文开发者资源索引）完善项目。该仓库是**链接索引**而非 API 手册，
对框架实现几乎无可直接编码的内容；但它精确指出了**「版本事实该去哪里取证」**——正是本项目最含糊的一环。

- 适配器契约新增 `references[]`：`{ label, url, kind, note? }`，`kind` ∈ official-docs / mappings / migration / example-mod / datapack / community。
- 三适配器各填入真实来源（官方文档、Linkie 映射查询、Parchment、ChampionAsh5357 迁移 gist、NeoForge primer 等）。
- 约束由 schema + lint 强制：URL 必须 https；不允许重复 URL；只要声明 references 就必须含官方文档（避免只堆二手教程）。
- **`adapterSummary()` 收敛到 `packages/adapters`**：CLI 与 MCP 此前各自手写字段清单——那正是「字段只到一个面」的典型成因。
  现在 `references` 随事实一起到 `mcmod adapter <id>` 与 MCP `get_adapter`。
- **许可边界**：原指南 CC-BY-SA-4.0 与本仓库 MIT 不兼容 ⇒ **只取链接目标，不复制任何原文表述**；说明文字均自写。
  见 `docs/research/2026-09-cn-modding-resources.md`。
- 验收：core 67 项（+4 项 references 约束）、adapters 22 项（+2 项 adapterSummary）、全套 105 项通过；
  MCP 冒烟脚本实测 `get_adapter` 返回 5 条 references（kinds: mappings,migration,official-docs）。

## S14 交付物（运行期缺陷修复：Forge 创造模式标签页，已完成）

**背景**：把 MK2 钓鱼竿装进真实 Forge 1.20.1 客户端启动，崩溃：

```
java.lang.NullPointerException: Registry Object not present: mk2:mk2
    at com.mk2.ModMainItems.register(ModMainItems.java:38)
```

**根因**：Forge 适配器的 `tabEntryLineItem/Block` 生成 `TAB_ENTRIES.add(...MK2.get())`，而这行落在 `register()` 里——它由 mod 构造器调用，**早于任何 RegisterEvent**。`DeferredRegister` 此时还没填充，`.get()` 必然抛错。**编译完全无法发现**：这正是本仓库一直标注的「运行期行为未验证」缺口。

**为什么只有 Forge 中招**：Fabric 的 `Registry.register` 是立即注册（列表存的是 Item 本身，正确）；NeoForge 的模板早已是 `List<Supplier<? extends ItemLike>>` 且惰性解析（正确）；只有 Forge 写成了即时 `.get()`。三个适配器里唯一写错的那个，恰好是唯一做过真机验证的那个。

**修复**：Forge 改为与 NeoForge 同构——`TAB_ENTRIES` 存 `Supplier<? extends ItemLike>`（`RegistryObject` 本身就是 Supplier），在创造模式标签页的 lambda 里惰性 `.get()`。

**防回归**：lint 新增规则——`tabEntryLineItem/tabEntryLineBlock` 不得含 `.get()`（这类行必然被发射进 `register()`，在那里查注册表**永远是错的**，与加载器无关）。2 项单测钉住正反两例。

**运行期验收**（`gradlew runServer`，无 GUI 也能走完构造+注册）：
- 日志出现 `[co.mk.ModMain/]: mk2 loaded`——该行位于 `ModMainItems.register()` **之后**，证明构造期注册全部走通。
- 全程 `grep -i "error\|exception\|crash\|not present"` 无任何 mk2/ModMain 命中。
- 服务器越过注册阶段并进入世界生成（`Preparing spawn area: 42%`）。
- 同一份 mod、同一台机器：修复前必崩于构造期，修复后正常加载。

## S13 交付物（真实图像模型 + 物品行为，已完成）

**真实图像模型（AI 生图）**：`textureProvider: "image-api"` + 内容级 `texture.prompt` / `texture.size`。
- `packages/core/src/image-ops.ts`：零依赖 PNG 解码（8bit RGB/RGBA、非交错；其余显式报错不猜）、边界泛洪抠背景、**最大连通域去杂点**、保比例缩放（**预乘 alpha** 平均，避免透明像素把颜色拉黑）。
- `packages/core/src/image-provider.ts`：调用图像 API；**凭据只走环境变量**（`MCMODKIT_IMAGE_*`），Spec 永不携带密钥，缺 key 直接报错不降级。
- 网络步骤刻意放在 `planGeneration` **之外**：生成计划仍是同步纯函数，调用方 `prefetchTextures` 后传入字节。`--dry-run` 不联网。
- **物品行为**：`items[].behavior`（适配器 `itemBehaviors` / `itemBehaviorImports`）+ `items[].durability`；模板新增 `{{ITEM_CTOR}}` / `{{DURABILITY_SUFFIX}}` / `{{ITEM_BEHAVIOR_IMPORTS}}` 注入点，lint 强制。
- NeoForge 的 `itemRegistration` 由 `registerSimpleItem` 改为 `ITEMS.register(name, supplier)`（前者无法表达自定义类）——**未编译验证**（本机无法访问 maven.neoforged.net），已写入该适配器 `notes`。
- 验收：**Forge 1.20.1 真编译通过**，产出 `mk2-1.0.0.jar`；`javap` 确认字节码为 `new net/minecraft/world/item/FishingRodItem` + `(Item$Properties)V`；AI 生成的 32×32 贴图（1080 B）在 jar 内。core 61 项测试（含 11 项图像、7 项行为）通过，全套 97 项通过。
- 未做：图像模型出图质量未做系统评估（仅人工看过一例）；未接图像编辑/重绘；实体贴图仍是程序化占位。

## S12 交付物（模型形态，已完成）

- Spec 新增 `items[].model`（`generated`/`handheld`）与 `blocks[].model`（`cube_all`/`cube_column`）。
- 模型 JSON 本体作为适配器模板（`itemModelHandheld` / `blockModelColumn`，三适配器各 +2），引擎按 Spec 选择；缺模板时报可修复错误而非产出坏文件。
- 生成工程的 README 文本改为**条件化**（`{{TEXTURE_NOTES}}`，lint 强制）：开了贴图就说「已生成，改 Spec 而非改 PNG」，否则提示自备——避免文档与实际产物矛盾。
- 验收：43 项 core 测试（含形态切换、贴图路径不变、未知形态字段级报错、缺模板报错）；三适配器 lint clean；生成级实测 handheld/cube_column 正确。
- 说明：模型形态是**纯资源 JSON**，`gradle build` 不校验其语义（见 S8 方法学），故以生成级 + 单测验证；编译验证由贴图切片承担。

## S11 交付物（贴图生成 / 生图，已完成）

- Spec 新增 `textures`（默认 false，受管文件不可默认覆盖手工美术）与物品/方块/实体级 `texture: { style, palette, seed }`。
- `packages/core/src/png.ts`：零依赖 PNG 编码器（`node:zlib` deflate + 自实现 CRC32，IHDR/IDAT/IEND）。
- `packages/core/src/texture.ts`：7 种风格（solid/noise/speckle/ore/gradient/border/planks）+ seeded mulberry32，**同 Spec 逐字节可复现**；省略 palette 时由 id 哈希出色相。
- 引擎 `genTextures`：物品/方块 16×16、实体 64×32（原版猪/牛/鸡/羊 UV 版式）；`FileEntry.bytes` 支持二进制落盘；三适配器各加 3 条 `contentPaths.*Texture` + lint「全有或全无」。
- 验收：45 文件（关闭时 40，差集恰为 5 个 PNG）；5 个 PNG 全部通过**签名 + IHDR + CRC + IDAT inflate 长度**校验；重生成 byte-identical；模型引用链路实测对应（`item/ruby`、`block/ruby_ore`、`textures/entity/ruby_golem.png`）；core 38 项测试通过。
- 未做：自定义 UV 实体贴图（当前为纯色占位）、真实图像模型接入、贴图在游戏内的实际观感验证。

## S10 交付物（datagen 方案 B，已完成）

- Spec 开关 `datagen`（默认 false）；三适配器各新增 3 个模板（dataGenClass / dataGenProvider / dataGenRunConfig）。
- 产出加载器数据生成入口 + 最小示例 provider + `runDatagen`(Fabric)/`runData`(Forge/NeoForge) 接线与生成资源目录；Fabric 写入 `fabric-datagen` entrypoint。
- 验收：Fabric PASS(117s)/Forge PASS(45s)，datagen 类进 jar；Gradle 任务存在性实测；开关关闭时零残留（单测）。
- 未做：实际运行 datagen（运行时行为未验证）；评估与三选项见 docs/datagen-evaluation.md。

## S9 交付物（实体，已完成）

- Spec 新增 `content.entities[]`：kind/category、生命/速度/攻击/索敌、体积与阴影、复用模型、掉落表。
- 引擎 `genEntities`：实体类 + 渲染器 + 实体注册类 + 掉落表 + 语言键，并向主类注入 `{{REGISTRY_INIT_CALLS}}`、向客户端引导注入 `{{ENTITY_RENDERER_REGISTRATIONS}}`（普通项目文件也能被生成器接线）。
- 适配器新增 8 个实体模板与 `entityKinds`/`entityModels` 数据；掉落表目录按版本分叉。
- 验收：Fabric PASS(122s) / Forge PASS(45s)，实体类/渲染器/注册类/掉落表进 jar；63 项测试通过。
- 未生成（记录在案）：AI 目标、生成蛋、贴图、运行时行为。

## S8 交付物（配方 + 进度，已完成）

- Spec 新增 `content.recipes[]`（7 种配方类型，含 pattern/key/ingredients/ingredient/experience/cookingTime/count/group 与跨字段校验）与 `content.advancements[]`（父子树、icon、unlockRecipes、hasItems、frame/展示开关、根进度背景）。
- 引擎 `genRecipes` / `genAdvancements`：引用解析（本 mod id → `ns:id`，显式资源位置直通，未知 id 报字段级错误）、默认烹饪时间、判据与 `rewards.recipes`、语言键。
- 三个适配器各新增 7 个模板（4 配方 + advancement + 两种物品谓词）与 2 个 langKeys；数据包目录按版本分叉（`recipe/` vs `recipes/`）。
- **方法学补充**：数据包 JSON 的语义不由 `gradle build` 校验，因此以 **jar 内原版数据**为权威源逐字段对照，发现并修复 4 处版本方言（`item`→`id`、烹饪 result 形态、切石形态、物品谓词形态）。
- 验收：Fabric/Forge 真编译通过，jar 内 6 个数据文件路径与内容正确；61 项测试通过。

## S7 交付物（UI 切片 + UI 2.0/2.1/2.2/2.3/3.0/3.1/4.0/4.1/5.0/5.1/6.0/7.0/8.0/9.0/10.0/10.1/11.0/12.0/13.0/14.0/15.0/16.0/17.0/18.0/18.1/19.0/20.0/21.0/22.0/23.0/24.0/25.0/26.0/27.0/28.0/29.0/30.0/31.0/32.0/33.0/34.0/35.0/36.0/37.0/38.0/39.0/40.0/41.0/42.0，已完成）

- Spec 新增 `ui.screens[]`：id / title / key(A-Z) / width / height / lines，以及 UI 2.0 的 theme / accent / align / animation / buttons。
- 引擎 `genUi`：每个 screen 一个 `client/<Mod><Id>Screen.java`；有声明的键时额外产出 `client/<Mod>Client.java`（注册键 + 打开屏幕），并生成标题/每行/按钮/按键名/按键分类 5 类语言键。
- **9 个适配器**各 5 个 UI 模板（screenClass / clientBootstrap / keybindField / keybindRegister / screenOpenStatement）+ 5 个 langKeys：Fabric 1.20.4/1.21.1/1.21.4、Forge 1.20.1/1.20.4/1.21.4、NeoForge 1.20.4/1.21.1/1.21.4；Fabric 额外把 `client` entrypoint 接入 `fabric.mod.json`。
- 契约新增：`keyCodePattern`（键码表达式，默认 GLFW）、`clientSubpackage`；lint 强制「UI 模板全有或全无」且必须配齐语言键，并禁止 screen 模板调用 `super.render(`、要求 `renderBackground` 恰好一次且绘制 `this.children()`。
- UI 2.0：长文本自动换行 + 滚轮/PageUp/PageDown/Home/End/拖动滚动条、主题/主色/对齐、fade/slide 动画（180ms 后自动静止）、最多 4 个按钮（每行 2 个）跨屏导航、ESC/关闭回父屏；换行与行宽在 init 缓存、只画视口行。
- UI 2.1：滚动平滑动画（140ms ease-out；拖动滚动条时不加缓动、即时跟手），滚动条悬停/拖动时加宽；返回父屏或窗口缩放后保留滚动位置（`init()` 只钳制、不归零）；跨屏重复 screen id / 重复快捷键在解析期报错。
- UI 2.2：`width`/`height` 变为偏好尺寸，`init()` 把面板钳制到窗口内（四周 16px），换行宽度、视口、滚动条与边框全部改用实时面板尺寸；按钮 bounds 由引擎按 `panelWidth/panelHeight` 生成，页脚始终居中贴底。测试钉住「裸 `PANEL_WIDTH/HEIGHT` 恰 3 处」，9 个适配器全部重编译通过。
- UI 2.3：窗口缩放会走 `rebuildWidgets → init()`（已用 1.20.1/1.21.1 字节码核对），因此 `init()` 改为幂等：`openedAt` 用 `-1L` 哨兵只取一次时，重建不重播入场动画；滚动位置取 `currentScroll()` 的实际插值再钳制，缓动中缩放不跳变；标题超宽时用 `Font.plainSubstrByWidth` 截断加 `...` 并缓存到 `displayTitle`。9 个适配器重编译通过。
- UI 3.0：`lines` 支持 `{text, style: body|heading|bullet}`（字符串归一化为 body），引擎输出 `LINE_STYLES` 样式码；模板按逻辑行缓存 `rowStyles/rowIndents/rowStarts`，heading 用 accent 色加左侧竖线，bullet 缩进 8px 加方块标记（仅首行），自动换行的续行保持缩进、不重复标记。解析期对非法样式给出 `ui.screens.<n>.lines.<i>.style` 字段级错误；三个屏幕的 demo spec 已加入 heading/bullet 并在 9 个适配器重编译通过。
- UI 3.1：heading 前插入一个空白缓存行（首行与连续 heading 除外），形成稳定的区块间隔；空行沿用固定行高，滚动/视口/滚动条计算不变，绘制时按 `rowWidths == 0` 直接跳过。demo spec 的 3 个屏幕已覆盖 heading/bullet + 长文本换行，9 个适配器重编译通过。
- UI 4.0：行项新增可选 `target`，该行成为行内链接：accent 色绘制、悬停画下划线、点击打开目标屏并以当前屏为父屏（返回保留滚动位置）。引擎校验 target 已声明且非自身，输出 `LINE_LINKS` 与 `openLineLink(int)` 的 switch；模板按逻辑行缓存 `rowLinks`（含空白 heading 行占位，保证索引对齐），`linkAt` 用滚动偏移做行命中，`mouseClicked` 优先滚动条再判链接。demo spec 的两条 bullet 已改为链接，9 个适配器重编译通过。
- UI 4.1：链接命中与悬停改为逐帧计算——`currentSlide()` 统一 slide 位移，`linkAt`/`scrollbarContains`/`scrollToMouse` 都计入它；`render` 每帧用真实鼠标坐标刷新 `hoveredLink`，平滑滚动时下划线跟随文字，入场动画期间点击也落在可见位置。移除只在 `mouseMoved` 时更新的旧实现，9 个适配器重编译通过。
- UI 5.0：链接悬停增加行背景高亮（引擎输出 `LINK_HOVER_COLOR`，accent 的 0x33 alpha 版本）与目标屏标题 tooltip（引擎输出 `LINE_TARGET_KEYS`，复用标题语言键）；tooltip 用 `GuiGraphics.renderTooltip(Font, Component, int, int)`，在 1.20.1/1.20.4/1.21.1/1.21.4 映射 jar 上 `javap` 核对一致。9 个适配器重编译通过。
- UI 5.1：tooltip 的 `Component` 在 `init()` 里按逻辑行缓存为 `lineTooltips`（未链接行为 `null`），悬停帧不再 `Component.translatable` 分配；`init()` 同时算出 `hasLinks`，无链接屏幕在 `render` 中直接跳过 `linkAt` 命中测试。缓存与行列表一起在重建时清理，语言键变化会在下次打开屏幕时生效。9 个适配器重编译通过。
- UI 6.0：行内链接指向自身屏幕不再是解析错误，而是长文档的「返回顶部」——生成器为该行输出 `case i: this.scrollTo(0, true); break;`，复用滚轮/键盘的 140ms 平滑滚动，不创建重复屏幕；该行仍以 accent 色和悬停反馈表示可点，但 `LINE_TARGET_KEYS` 为空，因而不弹目标屏标题 tooltip。目标屏幕的存在性校验保持不变；按钮自跳转仍被拒绝。demo 的 guide 末尾加入一条指向自身的 bullet，9 个适配器重编译通过。
- UI 7.0：行内链接点击反馈补齐听觉维度——`openLineLink` 在分发目标前播放原版 `SoundEvents.UI_BUTTON_CLICK`（`SimpleSoundInstance.forUI(..., 1.0F)`），与页脚按钮一致；返回顶部这类不换屏的动作也能被听见。`SoundEvents.UI_BUTTON_CLICK` 在 1.20.1+ 是 `Holder<SoundEvent>`，`forUI` 的 Holder 重载在 1.20.1/1.20.4/1.21.1/1.21.4 映射 jar 上一致，因此九个模板共用同一行。9 个适配器重编译通过。
- UI 8.0：行项新增可选 `anchor`，链接 `target` 接受 `#anchor` 表示**本屏内跳转**。解析期登记每个屏幕的 anchor，重复 anchor 与未声明的 `#anchor` 都给出字段级错误；生成器输出 `case i: this.scrollToLine(n); break;`（目标为空、不弹 tooltip）。模板在 `init()` 构建 `lineStarts`（逻辑行 → 首行缓存索引，空白 heading 行不改变映射），`scrollToLine(int)` 复用 140ms 平滑滚动，长文档可从目录直接跳到章节。demo 的 guide 增加 3 个 anchor 与 2 条目录链接（另保留返回顶部），9 个适配器重编译通过。
- UI 9.0：anchor 跳转后落点行以 accent 背景淡出 600ms（`FLASH_MS`/`flashLine`/`flashStartedAt`，`flashColor(row)` 用 `lineStarts` 算出目标逻辑行的可见行区间 `[start, end)`，`drawBody` 在文字与悬停高亮之前绘制）。淡出用 `Util.getMillis()`，结束后置 `flashLine = -1`，静止帧只做一次 `flashLine < 0` 判断；`init()` 重建时清除状态，不依赖新版本 API。9 个适配器重编译通过。
- UI 10.0：行内链接支持键盘操作——`↑`/`↓` 在 `LINE_LINKS` 中循环查找链接，`focusLink` 先 `setFocused(null)` 让焦点离开页脚按钮，再记录 `focusedLink` 并调用 `ensureLineVisible`（按 `lineStarts` 的行区间做最小滚动，已可见则不动）；`Enter`/小键盘 Enter 仅在焦点链接存在且 `getFocused() == null` 时触发 `openLineLink`。焦点行在文字左侧画 accent 竖条并在底部画 1px 线，与悬停背景/下划线区分；`Tab` 清空链接焦点并交还原版控件导航。`setFocused(null)`/`getFocused()` 在 1.20.1/1.20.4/1.21.1/1.21.4 映射 jar 上均已 `javap` 核对。9 个适配器重编译通过。
- UI 10.1：`mouseClicked` 的第一条语句清空 `focusedLink`，鼠标按下（滚动条、页脚按钮或空白）即退出键盘链接导航；按在链接上时 `openLineLink` 会在点击音之后把焦点设回该行，两种输入状态不会同时残留。
- UI 11.0：行内链接支持跨屏深链 `screen#anchor`。Spec 正则从「屏幕 id 或 #anchor」扩展为三选一，`UiSpec.superRefine` 校验目标屏上的 anchor 并列出可用项，生成器把该行输出为 `new TargetScreen(this, <anchor 逻辑行>)`；同一屏的 `screen#anchor` 与 `#anchor` 等价，只 `scrollToLine`，不复制屏幕。模板新增 `initialLine` 字段与 `(Screen parent, int initialLine)` 构造重载，`init()` 在 `lineStarts` 构建完成后消费一次并清回 `-1`，因此首次打开会平滑落到章节并触发既有 600ms 落点高亮，而窗口缩放/从子屏返回不会再次跳动。跨屏深链的 tooltip 仍显示目标屏标题。9 个适配器重编译通过。
- UI 12.0：键盘焦点行复用 `lineTooltips` 缓存，在焦点行下方弹出与悬停相同的目标标题 tooltip（`lineStarts` 定位 + `currentSlide`/滚动偏移），键盘用户不碰鼠标也能确认链接去向；正文视口上下边缘各加 4px 面板色渐隐（0xC0→0x30，保留主题 RGB 只改 alpha），只在对应方向仍可滚动时绘制，视口过小时高度收敛到 `viewport / 2`。每侧最多 4 次 `fill`，静止帧不分配。9 个适配器重编译通过。
- UI 13.0：关闭不再硬切——`fade`/`slide` 主题在 `onClose()` 记录 `closingAt`，`render` 按 120ms ease-in 淡出（slide 主题面板同步下移 12px），满帧才 `setScreen(parent)`，`closeSwitched` 保证只切一次；过渡期间 `mouseScrolled`/`mouseClicked`/`mouseDragged`/`mouseReleased`/`keyPressed` 全部短路，滚动条/链接悬停也跳过，避免误开新屏被挂起的切换覆盖。`none` 主题常量折叠为立即关闭；返回父屏不重播动画、不丢滚动位置。9 个适配器重编译通过。
- UI 14.0：面板增加两层半透明黑色投影（外圈 3px `0x18000000`、内圈 1px `0x30000000`），从压暗的世界中托起内容；有按钮时页脚上方画 `BORDER_COLOR` 分隔线（`FOOTER_HEIGHT > 12` 条件保证无按钮屏不画）。`trimmedTitle()` 记录 `titleTruncated`，鼠标停在标题带（命中计入 slide/关闭位移）且没有悬停/焦点链接时，用 `renderTooltip` 显示完整标题；关闭过渡期间不显示。9 个适配器重编译通过。
- UI 15.0：行样式新增 `note`（样式码 3）——缩进 8px、使用引擎按主题生成的弱化色 `NOTE_COLOR`（vanilla `0xFF8C8C8C`、dark `0xFF8A94A6`、light `0xFF6B6B6B`），并在文字左侧画 1px 引用竖线；竖线对每条换行行都绘制，读起来像引用块。配色选择收进 `rowColor(style, link)`：链接行与 heading 仍优先 accent，链接 note 不会因为弱化而失去可点击语义。demo 三屏各加一条 note，9 个适配器重编译通过。
- UI 16.0：修复滚动条交互毛刺——此前按下轨道会立刻把滑块中心吸到指针，从滑块上按下再拖也会先跳一下。新增 `scrollbarGrabOffset`：按在滑块内时记录指针相对滑块顶部的偏移，拖动只改变滚动目标而不改变该偏移，滑块跟手；按在轨道上才把滑块居中。滑块高度/顶部收进 `scrollbarThumbHeight()`/`scrollbarThumbTop(...)`，绘制、命中与拖动共用同一几何；`init()` 与 `mouseReleased` 把抓取偏移清回 `-1`，窗口重建或关闭过渡不会残留拖动状态。9 个适配器重编译通过。
- UI 17.0：修复链接隐形热区——悬停背景与下划线一直只覆盖文字，但 `linkAt` 按整行面板宽度判定，短链接右侧的空白也会打开屏幕。命中判定改为读取缓存的行宽与缩进（居中屏同样适配），带 2px 容差；换行后的每个片段各自按自己的宽度命中，键盘焦点仍按逻辑行移动。9 个适配器重编译通过。
- UI 18.0：阅读位置按逻辑行记忆——此前 `init()` 保留原始像素偏移，窗口缩放导致重新换行后读者会落到别的段落，关闭再重开则会回到顶部。现在 `init()` 先把旧布局的顶部逻辑行与行内偏移缓存下来，重建后按新行号恢复（同一布局精确到像素），并用每个屏幕类独立的静态 `rememberedLine` 记录最后一次 `scrollTo` 的目标行，使本次游戏会话内重开屏幕回到上次阅读位置；深链 `initialLine` 仍在之后执行并覆盖记忆。`lineForScroll` 同时服务两处，滚动路径不变。9 个适配器重编译通过。
- UI 18.1：手动滚动退出键盘链接焦点——滚轮与 `PageUp`/`PageDown`/`Home`/`End` 过去只滚正文、不移除 `focusedLink`，焦点行滚出视口后 `Enter` 仍会打开看不见的链接，焦点 tooltip 还可能被钳到屏幕边缘。现在这些手动滚动在 `scrollTo` 之前清空焦点；`focusLink` 自己的 `ensureLineVisible` 滚动不受影响，键盘导航仍会把选中行自动带入视口。9 个适配器重编译通过。
- UI 19.0：行内链接按下/释放语义——链接过去在鼠标按下时就打开目标，起手拖动会误开新屏，也没有反悔余地。现在按下只把行号记入 `pressedLink`，`mouseReleased` 用与悬停相同的文字级命中重测，仍在该行才播放点击音并执行打开/跳转/深链；拖走即取消。滚轮、翻页键、任意按键、重置/滚动条分支与 `init()` 都会清掉待打开行，释放不会隔帧补开；绘制与滚动路径不变。9 个适配器重编译通过。
- UI 20.0：滚动条章节刻度——滚动条过去只显示阅读位置，不显示书的章节结构。`init()` 重建行缓存时把每个 heading 的首个视觉行缓存进 `headingRows`（续行不重复），绘制时在轨道左侧按 `row * trackHeight / rowCount` 画 1px 刻度，轨道→刻度→滑块依次绘制；视口顶部所在章节的刻度用全亮 accent 加宽到 5px，其余用 50% 透明同色 3px，`currentHeading(scroll)` 取已滚到视口顶部及以上最后一个 heading（题头阶段无亮刻度）。无滚动条时不绘制不占宽，绘制期只遍历标题而非全文。9 个适配器重编译通过。
- UI 21.0：Ctrl+↑/↓ 章节跳转——有了刻度还得一屏屏滚。`keyPressed` 在 `maxScroll > 0` 分支里、`hasLinks` 的 `↑`/`↓` 链接焦点之前拦截 `Ctrl+↑`/`Ctrl+↓`：`headingStep(forward)` 以 `currentHeading(scrollTarget)` 为基准沿 `headingRows` 找上/下一个标题行，命中后调用既有 `scrollToLine(lineForScroll(row * LINE_HEIGHT))` 平滑滚动并复用 anchor 落点 600ms 高亮；到首/尾章节或无标题时返回 `-1`，组合键仍被消费且先清 `focusedLink`，不会误移动链接焦点。无新增绘制/缓存，连续按键可跨多章。9 个适配器重编译通过。
- UI 22.0：长距离滚动自适应时长——anchor/深链/Ctrl 章节/Home/End/返回顶部此前和滚轮一样固定 140ms，整段文档的跳转像瞬移。`scrollTo` 保留两参入口（基础 140ms，供滚轮/翻页/`ensureLineVisible`）并新增三参重载；`scrollDurationFor(target)` 按 `|clamped - scrollTarget| / 12` 加时、封顶 280ms，动画启动时写入 `scrollDurationMs`，`currentScroll()` 改读实例字段。`scrollToLine`（anchor/深链/Ctrl 共用）、Home/End 与生成器的自链接改走自适应入口；被滚轮打断后立即回到基础节奏。无新增绘制/缓存/状态机。9 个适配器重编译通过。
- UI 23.0：章节刻度可点击 + 悬停章节名——刻度此前只能看不能点，到达章节仍靠 Ctrl 或拖动。`init()` 在缓存 `headingRows` 时并行缓存 `headingLines`（逻辑行）与 `headingTooltips`（`Component`，每 init 一次、悬停帧不分配）；`render` 逐帧用 `headingAt(mouseX, mouseY)` 计算悬停刻度，悬停刻度全亮并加宽到 7px，`renderTooltip` 的悬停/焦点分支之后显示章节名（标题 tooltip 让位）；`mouseClicked` 在滚动条命中之前先查刻度 gutter（轨道左侧 7px、纵向 ±2px），命中即 `scrollToLine(headingLines.get(i))`，复用 anchor 落点高亮与 UI 22.0 的自适应时长，不会误启动拖动。无滚动时 `headingAt` 直接返回 -1；无新增每帧分配。9 个适配器重编译通过。
- UI 24.0：翻页保留一行上下文 + 轨道点击滑行——`PageUp`/`PageDown` 原先整屏步进，新页第一行紧接着上一页最后一行，等于丢掉一行上下文；新增 `pageStep()`（`max(LINE_HEIGHT, viewportHeight() - LINE_HEIGHT)`）让相邻两页重叠一行，仍走基础时长的两参 `scrollTo`。滚动条点轨道原先用 `scrollTo(..., false)` 瞬移，现在把目标换算抽到 `scrollbarScrollAt(mouseY, grabOffset)`：命中滑块仍即时跟手，点轨道用 `scrollDurationFor(target)` 滑行到目标（远跳自适应、近跳基础节奏），拖动路径不变。9 个适配器重编译通过。
- UI 25.0：指南按键开关（初版，已被 UI 27.0 修正）——绑定按键此前每次按下都 `setScreen(new ...)`，指南已打开时再按会叠一层新屏幕（父屏、阅读位置、关闭动画都丢失）。初版用屏幕静态 `active`：`init()` 标记、`removed()` 清理、`isActive()`/`closeActive()`（后者调用实例 `onClose()` 复用 120ms 关闭淡出），生成器按键分支改为已打开时 `closeActive()`、否则新建。后续对 Forge 1.20.1 `KeyboardHandler` 的字节码取证发现：任意 Screen 打开时原版在 `KeyMapping.set/click` 之前就返回，tick 侧的 toggle 分支实际不可达；UI 27.0 改为屏幕内处理并删除这套静态状态。
- UI 26.0：高对比主题 + 按下反馈——新增 `contrast` 调色板（全不透明近黑面板、亮黄 accent、近白正文与仍可读的弱化色），颜色仍全部在引擎侧，模板只消费占位符。链接「松开才提交」此前按下无任何视觉响应，现在悬停且 `pressedLink` 命中时用更深的 accent 底色（alpha 0x66 对 0x33）并把下划线从 1px 加粗到 2px；拖走即回到普通悬停态，与取消语义一致。不新增状态或分配：复用既有逐帧 `hoveredLink` 与 `pressedLink`。9 个适配器重编译通过。
- UI 27.0：屏幕内按键开关（修复 UI 25.0 死代码）——Forge 1.20.1 `KeyboardHandler.keyPress` 的字节码显示：Screen 未消费按键后直接跳到 `ForgeHooksClient.onKeyInput` 并返回，`KeyMapping.set/click` 只在 `Minecraft.screen == null` 时执行，所以 UI 25.0 在 tick 侧的 `isActive()` 分支永远走不到。现在引擎把 Spec 键渲染为 `SCREEN_KEY_CODE` 传给屏幕模板，屏幕持有 `TOGGLE_KEY`（未绑定时 -1）并在 `keyPressed` 最前面识别它，命中即 `onClose()` 走既有淡出与输入锁定；按键映射本身继续负责在无屏幕时打开。删除 `active` 字段、`removed()` 覆盖、`isActive()`/`closeActive()`，tick 打开语句改为 `consumeClick() && client.screen == null`，快速连按不会重建已打开的界面。契约把 `SCREEN_KEY_CODE` 列为屏幕模板必消费占位符；核心测试覆盖有键/无键屏幕的 `TOGGLE_KEY` 替换，适配器测试覆盖九个模板的字段、顺序与打开守卫。9 个适配器重编译 + `javap` 取证通过。
- UI 28.0：页脚按钮随窄面板收缩——按钮此前固定 100px，两个按钮需要 240px 的可用宽度；面板被小窗口或高 GUI Scale 钳到更窄时，按钮会左右越出面板边框（旧注释声称「仍在面板内」并不成立）。生成器现在为页脚每一行声明 `footerButtonWidthN = max(1, min(100, (panelWidth - 16 - 8 * (rowCount - 1)) / rowCount))` 与 `footerRowWidthN`，坐标与宽度都用它们计算；面板足够宽时仍是 100px 与原布局，变窄时才收缩，4 个按钮的两行各自独立计算。单测钉住两按钮与四按钮两行的公式和 bounds；9 个适配器重编译通过。
- UI 29.0：自动目录屏（`contentsFor`）——长指南此前要手写「跳到某章」链接并随 heading 增删同步维护，漏改就断链。`ScreenSpec` 新增 `contentsFor: "<screen id>"`：生成器在构建类名/锚点映射之前把它展开为普通行，目标屏每个 `heading` 生成一条 `bullet` 深链（文本取标题、target 为 `screen#anchor`）并排在本屏原有 `lines` 之前；带显式 `anchor` 的标题直接复用，未声明的标题写入 `section_N` 合成锚点（跳过已用名字，多个目录屏引用同一目标时复用同一批合成锚点）。展开后一切走既有链接路径：跨屏构造参数携带标题逻辑行、目标屏 `init()` 滚动并高亮、返回保留阅读位置、tooltip 显示目标屏标题，模板与九个适配器无需改动。`UiSpec` 校验目标存在、不是自身、不是另一个自动目录屏、且至少有一个 heading；引擎侧对未声明目标也有 `SPEC_INVALID` 兜底。单测覆盖生成顺序/样式/链接/语言键、显式锚点复用、`section_1` 冲突避让与四类校验错误；示例 Spec 增加 guide 的 Contents 按钮与第四屏，9 个适配器重编译通过。
- UI 30.0：键盘焦点滚动留上下文——`ensureLineVisible` 此前只做最小滚动，焦点链接正好贴在视口上/下边缘，前后文各只剩半行可见；现在上下各留 `LINE_HEIGHT` 一行余量，并用 `Math.min(start, end + margin - viewportHeight)` 兜住「链接本身比视口还高」的情况：向下聚焦时优先保住首行，不会把焦点行开头推到上边缘之外。`scrollTo` 仍负责钳到 `[0, maxScroll]`，首尾章节自然贴边；不新增字段或分配，鼠标滚动与章节跳转路径不变。测试钉住四个留白表达式；9 个适配器重编译通过，Fabric 1.21.1 与 Forge 1.20.1 的 `javap` 确认 `ensureLineVisible` 中的 `Math.max`/`Math.min` 与 `scrollTo(IZ)` 调用。
- UI 31.0：自动目录复用标题语言键——UI 29.0 的目录条目会把标题文本复制成目录屏自己的 `line.N` 语言键：改标题或补翻译要改两处，漏改就出现「目录与正文不一致」，语言文件里同一句出现两次。生成器现在在展开时用标题在目标屏的逻辑行索引算出它的既有语言键，并记录到行对象上（`lineKeyByLine`），主循环取键优先用记录：目录屏 `LINE_KEYS` 前三条直接是 `guide.line.1/line.5/line.10`（本 Spec 的三个 heading），只有作者手写的行才生成 `contents.line.N`。纯引擎改动、零模板改动；生成物语言文件里 34 条行键无重复值。单测覆盖键复用、目录屏不再产生条目键与 `section_1` 冲突场景的键映射；194 个用例通过，9 个适配器重编译通过，Fabric 1.21.1 与 Forge 1.20.1 的 `javap` 在目录屏静态初始化看到前三条 `ldc` 引用 guide 行键。
- UI 32.0：深链 tooltip 显示落点章节——跨屏深链的悬停/焦点 tooltip 此前只显示目标屏标题（「Settings」），读者点之前不知道会落到屏内哪一节。引擎为每行额外产出 `LINE_SECTION_KEYS`（`screen#anchor` 取被锚定行自己的语言键，其余为空串），屏幕模板在 `init()` 缓存 tooltip 时按三段分支：无链接 → `null`，普通跨屏链接 → 屏幕标题，深链 → `屏幕标题.append(" › ").append(章节标题)`（仍只在 init 构造一次，悬停帧零分配）。契约把 `LINE_SECTION_KEYS_JAVA` 列为屏幕模板必消费占位符。单测覆盖引擎产出的章节键（深链、自动目录条目、普通链接与自链接的空串）与九个模板的三段分支；194 个用例通过，9 个适配器重编译通过，Fabric 1.21.1 与 Forge 1.20.1 的 `javap` 看到 `MutableComponent.append(String)`/`append(Component)` 两次调用与 `settings.line.3` 常量。
- UI 33.0：warn 警告行样式——`note` 承担的是「提示/注意事项」，作者想标真正的警告时只能加重语气写句子，视觉上仍与普通提示同级。新增样式 `warn`（样式码 4）：沿用 note 的 8px 缩进与左侧竖线几何，但 ①颜色来自各主题新的暖色警告色（引擎调色板新增 `warn` 字段，vanilla `0xFFFF7043`/dark `0xFFFF8A65`/light `0xFFE64A19`/contrast `0xFFFF9100`，`rowColor` 链 `style == 3 ? NOTE_COLOR : style == 4 ? WARN_COLOR : BODY_COLOR`），②竖线加粗到 2px（`fill(x - 6, y, x - 4, ...)`）——彩色 + 粗细双重线索让警告不依赖单一颜色也能与 note 区分。契约把 `{{NOTE_COLOR}}`/`{{WARN_COLOR}}` 都列为屏幕模板必消费占位符，防止模板把层级颜色写死。单测覆盖样式枚举接受 `warn`（`quote` 等仍报错）、引擎产出的样式码 4 与 dark/contrast 调色板值、九个模板的声明/`rowColor` 链/缩进/2px 竖线；196 个用例通过，9 个适配器重编译通过，`javap` 看到 `WARN_COLOR` 常量与 `style == 4` 的 2px 分支。
- UI 34.0：step 有序步骤行样式——教程类指南常写「1. 挖矿 2. 合镐」这类操作步骤，此前只能用 bullet 逐条列出，读者得自己数到第几步，增删一步后全文序号跟着改。新增样式 `step`（样式码 5）：沿用 bullet 的 8px 缩进，但首行不再画方块标记，改为在标记槽内右对齐绘制自动编号（「1.」「2.」…，`Math.max(left + 1, x - 3 - font.width(step))` 让两位数也贴住正文左缘不进正文），编号在每个 `heading` 处重置——每节各自读作一份有序清单。引擎在渲染时预计算 `STEP_TEXT` 数组（非 step 行为空串），模板维护与各行索引对齐的 `rowStepTexts` 列表（spacer 行填空串、换行续行只有首行携带编号）；正文仍用行自身颜色、编号取 accent 色。契约把 `{{STEP_TEXT_JAVA}}` 列为屏幕模板必消费占位符，防止模板把编号写死或退化成 bullet。单测覆盖样式枚举接受 `step`、按 heading 重置的编号序列与九个模板的声明/列表维护/`style == 5` 绘制分支；198 个用例通过，9 个适配器重编译通过，`javap` 看到 `STEP_TEXT` 静态初始化的 `"1."`/`"2."` 常量与 `style == 5` 分支的 `drawString(Font, String, int, int, int, boolean)` 调用。
- UI 35.0：屏内搜索（Ctrl+F 查找 + 匹配循环 + 计数）——长指南只能靠滚动与章节刻度找内容，读者记得某个词却不知道它在哪一节。现在 Ctrl+F 在面板顶部弹出一行查找条（`EditBox`，位置/宽度随活动面板计算，窄面板下 `Math.max(40, Math.min(140, panelWidth - BODY_SIDE * 2 - 34))` 保证两侧留白），输入即查：响应器把行文本（按 `LINE_KEYS` 逐行取的译文，`Locale.ROOT` 小写）与查询（同样 trim + 小写）逐行 `contains`，命中首条立即用既有的 `scrollToLine` 滚动并闪烁；Enter 在命中集内循环跳转（`(index + 1) % size`），计数器「n/m」画在查找条右端（无命中取弱化色、有命中取 accent），Esc 先关查找条、再按一次才关屏。查找条获焦时独占键盘（方向键/退格/输入全部交给文本框，Spec 的开关按键不再触发关屏），Ctrl+F 开关、点查找条区域的鼠标事件不再落到被遮挡的行内链接与滚动条命中区（悬停高亮同样抑制）；窗口缩放丢失查找条（沿用「重开再查」的简单语义）。占位/提示文本来自适配器 `langKeys.screenSearch`（`{{namespace}}.screen.{{id}}.search`，引擎兜底文案 "Search..."），契约把 `screenSearch` 加入 `UI_LANG_KEYS`、把 `{{SCREEN_SEARCH_KEY}}` 列为屏幕模板必消费占位符，防止模板写死英文。单测覆盖引擎产出的语言键与九个模板的查找切片（导入/字段/查找条构造/响应器/循环/键序/命中区/缩放清理）；199 个用例通过，9 个适配器重编译通过，`javap` 取证见 acceptance-report §6.5。
- UI 36.0：搜索命中行高亮（全匹配弱染 + 当前匹配强化）——UI 35.0 的查找只把首个命中滚入视口并闪烁一次，视口之外还有多少命中、当前 `n/m` 对应哪一行都要靠 Enter 逐条翻。现在命中行的整行背景即时染色：全部命中铺主题 accent 的弱透明底（alpha `0x1C`），Enter/输入将落到的那条用更强一档（`0x40`）标出——「命中分布」与「当前落点」一眼可分；折行后的所有可视行一起染（一行内多处命中合并为同一档、不逐字拆分），几何与既有落点闪烁/链接悬停一致（`x - 2, y - 1, x + rowWidths + 2, y + LINE_HEIGHT - 1`）但绘制在其之前，闪烁与悬停底色仍居上层读得清。纯模板迭代：零引擎改动、零新占位符/语言键/Spec 字段，`searchHits` 可视行序号映射（0 无命中、n 为第 n 个命中）由 `refreshSearch` 从既有 `lineStarts` 逻辑行区间推导（与 `flashColor` 同款区间），绘制带 `i < length` 守卫防旧数组越界；关闭查找、`init()` 重建、每次重查三处置空/重建，不残留旧命中。单测逐模板钉住字段声明、区间构建循环、双档 alpha 三元、染色先于 `flashColor` 的绘制次序与恰好三处 `searchHits = null;`；200 个用例通过，9 个适配器重编译通过，`javap` 取证见 acceptance-report §6.5。
- UI 37.0：查找条循环增强（Shift+Enter 反向 + 点击计数区 + 悬停提示）——UI 35.0/36.0 的查找条只会单向前进：错过一个命中要按 Enter 绕一整圈，右角的 `n/m` 计数对鼠标用户只是一串数字，既不能点，也没有任何提示说明 Enter 能逐条走。本轮把循环双向化并把计数区变成指针控件：`Shift+Enter` 反向走（`prevSearchMatch` 用 `(this.searchIndex + this.searchMatches.size() - 1) % this.searchMatches.size()` 保持非负回绕），点击计数区等价 Enter 前进，悬停计数区弹出说明两键的 tooltip——键盘与鼠标两条路径都补齐。引擎新增语言键 `screenSearchCycle`（`{{namespace}}.screen.{{id}}.search_cycle`，进 `UI_LANG_KEYS`，与 `screenSearch` 同为屏幕必填）与 `{{SCREEN_SEARCH_CYCLE_KEY}}` 契约占位符（模板硬编码提示即 lint 报错），`en_us.json` 兜底文案 "Enter: next, Shift+Enter: previous"。模板新增 `SEARCH_CYCLE_LANG_KEY` 常量与 `private boolean hoveredSearchCounter;`（`render` 逐帧按 `closingAt < 0L && searchBox != null && searchCounterContains(...)` 计算）；tooltip 链把计数区分支放到链接之前（计数区叠在首行链接之上，链序即优先级）；`mouseClicked` 的查找条条带分支内先判计数区命中再委派文本框（条带其余部分仍是文本框的）；`searchCounterContains` 命中矩形镜像绘制几何（右锚 `left + this.panelWidth - 6 - this.font.width(count)`、横向 ±2px、纵向同条带）。单测覆盖引擎语言键与九个模板的循环切片（常量/悬停字段与逐帧赋值/tooltip 链序/条带内点击分支与委派次序/Shift 分流与 `prevSearchMatch` 恰一处/反向取模/命中矩形）；201 个用例通过，9 个适配器重编译通过，`javap` 取证见 acceptance-report §6.5。
- UI 38.0：查找条会话记忆（重开恢复查询 + 从阅读位置起查）——UI 35.0–37.0 的查找条每次打开都是空的：读者在长文档里查到一个词、滚去上下文、再按 Ctrl+F 想接着找，得重新把同一个词敲一遍；而且无论当前读到哪，新查询的落点永远从文档第一条命中算起——刚在第 40 行查到第 3 处，重开后再输入同一个词又跳回第 1 行，把刚建立的位置感清掉。本轮把查找条做成「会话记忆 + 就近起查」：关闭查找条或重建屏幕都不清上次查询，重开 Ctrl+F 时把查询回填进 `EditBox`（`setValue` 触发响应器，命中集与计数即时重建），新查询的初始命中改为「当前阅读行起的第一条命中」，整篇都在上方则回卷到文档首条——输入一次、滚动、继续输入，位置永远接着走。纯模板迭代：零引擎改动、零新占位符/语言键/Spec 字段，`private static String lastSearchQuery = "";`（静态字段跨屏幕实例存活，全文件恰好四处引用：声明/存值/判空/回填），回填分支位于 `setResponder` 与 `addRenderableWidget` 之间（先接响应器再写值，恢复即重查）；`refreshSearch` 首行存值先于清空命中集（空查询同样存——把词删光再重开不回填）；初始落点从 `lineForScroll(this.scrollTarget)` 取当前逻辑行，`searchIndex` 从 0 起扫描「首个 `>= topLine` 的命中」（默认值天然回卷文档首条，`lineForScroll` 空文档返回 -1 时也命中 0），随后 `scrollToLine(this.searchMatches.get(this.searchIndex))` 落到该条。单测逐模板钉住字段声明、恰好四处引用、回填分支的位置与 `setValue` 先于 `addRenderableWidget`、存值先于清空、`topLine` 扫描与回卷（`get(i) >= topLine` 早退、默认 0）、`closeSearch`/`init()` 不清字段；202 个用例通过，9 个适配器重编译通过，`javap` 取证见 acceptance-report §6.5。
- UI 39.0：搜索命中分布刻度（滚动条轨道上的命中标记）——UI 36.0 的命中染色只在视口内可见、UI 38.0 让重开接着查，但「整篇文档里这个词有多少处、分布在哪」仍要顺 Enter 一条条翻。滚动条左缘的章节刻度已经是一张「文档地图」，本轮把命中分布也画上轨道：搜索激活时，每个命中行在轨道外缘（右侧，与左侧章节刻度镜像）有一道短刻度，当前循环落点全亮加宽——不滚动即可判读命中集中在前半还是散落全篇。纯模板迭代：零引擎改动、零新占位符/语言键/Spec 字段、零新状态；绘制块位于章节刻度循环之后、滑块之前，`int markLeft = x + trackWidth;` 取轨道外缘（左缘向左伸章节刻度、右缘向右伸命中刻度，互不遮挡也不与滑块相叠），逐 `searchMatches` 项以 `this.lineStarts.get(line) * trackHeight / rowCount`（与章节刻度同一比例公式，命中行即该逻辑行的首个可视行）定位，`boolean target = i == this.searchIndex;` 决定档位——当前命中 `ACCENT_COLOR` 全亮 5px、其余 `(ACCENT_COLOR & 0x00FFFFFF) | 0x80000000` 50% 透明 3px（与章节刻度「当前 5px 全亮/其余 3px 半透明」完全同档，仅所在边不同）；陈旧行号（`line >= this.lineStarts.size()`）直接跳过不画；纯视觉层，无悬停/点击，导航仍走 Enter/Shift+Enter/点击。单测逐模板钉住注释、`markLeft` 取轨道外缘、比例定位公式、`target` 条件与 5/3 宽度、双档 fill、越界守卫与「章节刻度之后、滑块之前」的绘制次序；203 个用例通过，9 个适配器重编译通过，`javap` 取证见 acceptance-report §6.5。
- UI 40.0：命中刻度交互化（悬停显示命中行 + 点击跳转）——UI 39.0 把命中分布画上了轨道，但刻度只是地图：看见「这里有个命中」点不动，想知道命中在哪一行只能顺 Enter 一条条转。本轮把刻度变成控件并顺手修掉一个 39.0 的手感缺陷：悬停的刻度加宽全亮（与章节刻度悬停同款语言）并弹出该命中行的文本，点击直接跳到该命中——鼠标用户不再需要键盘循环；`markLeft` 从 `x + trackWidth` 改为固定 `x + 2`，悬停加宽轨道时刻度不再右移 2px、5px 目标刻度也不再越过面板右缘。纯模板迭代：零引擎改动、零新占位符/语言键/Spec 字段；`private int hoveredSearchMark = -1;` 与 `render` 逐帧赋值（`this.hoveredSearchMark = this.closingAt < 0L ? this.searchMarkAt(mouseX, mouseY) : -1;`），命中循环内 `boolean hovered = i == this.hoveredSearchMark;` 并入档位选择（`target || hovered ? 5 : 3`，同款全亮/半透明色）；tooltip 链在计数区之后、链接之前插入 `} else if (this.hoveredSearchMark >= 0) {` 分支，取 `Component.translatable(LINE_KEYS[this.searchMatches.get(this.hoveredSearchMark)])`（`searchTexts` 由 `LINE_KEYS` 逐行构建、索引空间一致），标题 tooltip 条件加入 `this.hoveredSearchMark < 0` 让位；新 `searchMarkAt(double, double)` 镜像 `headingAt`（守卫 `searchBox == null || searchMatches.isEmpty() || maxScroll() <= 0`，x 界 `x + 2`..`x + 7`，纵向 ±2px 容差，`markTop` 公式与绘制同款）；新 `jumpToSearchMark(double, double)` 先 `this.searchIndex = mark;` 再 `this.scrollToLine(this.searchMatches.get(mark));`（跳到该命中并让 Enter 从它继续）；`mouseClicked` 两处调用——条带分支内先判计数区、再判命中（查找条覆盖的首行刻度仍可点击，条带其余部分仍归文本框），主链在章节刻度块之后、`scrollbarContains` 之前（刻度处不再触发轨道滑行，非命中行处仍正常滑行）。单测逐模板钉住字段与逐帧赋值、双档宽度与 fill、固定锚点（旧锚点 not.toContain）、tooltip 链序与取值、标题让位、命中盒守卫与 x 界、跳转助手次序与「恰一处定义两处调用」、两处点击的相对次序，并同步更新 UI 14.0 标题条件、37.0 链序切片与 39.0 刻度切片至新形态；204 个用例通过，9 个适配器重编译通过，`javap` 取证见 acceptance-report §6.5。
- UI 41.0：查找态落点避让查找条（跳转落点不再藏在条带下）——查找条的条带（`bodyTop - 8`..`bodyTop + 16`）盖住视口顶部约两行，而所有跳转都走 `scrollToLine`、目标行恰好落在视口顶：Enter/Shift+Enter 循环、点击命中刻度、Ctrl+章节跳转、锚点链接全部把要看的行滚进条带底下，读者每次定位后都得再滚一下才能读到。本轮让 `scrollToLine` 在查找条打开时把落点下移一个条带高度：新常量 `SEARCH_BAR_CLEARANCE = 24`（即条带高度，落点行顶 = 条带底 + 8px，整行可见且留一点呼吸），`int target = this.lineStarts.get(line) * LINE_HEIGHT;` 之后插入 `if (this.searchBox != null) { target = Math.max(0, target - SEARCH_BAR_CLEARANCE); }`——`Math.max(0, …)` 钳制文档头部（第 0/1 行无可再避，属物理下限），`scrollDurationFor(target)` 继续用钳制后的目标算滑行时长；查找条关闭时行为逐字节不变。纯模板迭代：零引擎改动、零新占位符/语言键/Spec 字段，九个模板同步。单测逐模板钉住常量声明与恰好两处引用、`scrollToLine` 体内「闪烁 → 守卫 → 钳制 → 滑行」的次序链，并同步更新 UI 8.0/9.0/21.0/22.0 四处既有 `scrollToLine` 断言至新形态；205 个用例通过，9 个适配器重编译通过，`javap` 取证见 acceptance-report §6.5。
- UI 42.0：查找态正文视口内边距（文档头部在查找时也可读）——41.0 把落点下移一个条带高度，但实现是 `Math.max(0, target - 24)` 钳制：文档头部的落点被 0 吃掉，第 0/1 行依旧藏在条带（`bodyTop - 8`..`bodyTop + 16`）下面，手动滚到顶也读不到第一行。本轮把避让从「落点补丁」升级成「视口内边距」：`private int bodyPad()`（查找条开时返回 `SEARCH_BAR_CLEARANCE = 24`、关时 0）单点判定，正文绘制起点（`int y = bodyTop + this.bodyPad() + i * LINE_HEIGHT - scroll;`）、首行回扫（`int first = Math.max(0, (scroll - this.bodyPad()) / LINE_HEIGHT);`）、点击行换算（`int row = (this.currentScroll() + (int) mouseY - top - this.bodyPad()) / LINE_HEIGHT;` 加涂绘区间守卫——向零截断会把正文上缘空带的点击归到第 0 行，行顶未达即拒绝）与滚动范围（`maxScroll()` 加 pad）全部共用它；开条在 `setResponder` 之后 `this.scrollTo(this.scrollOffset + this.bodyPad(), false);` 立即补偿、关条在清空 `searchBox` 之后 `this.scrollTo(this.scrollOffset - SEARCH_BAR_CLEARANCE, false);` 立即还原，开关瞬间阅读位置不跳；滚动条轨道/滑块/命中刻度读 `maxScroll()`/`currentScroll()` 而自动同步。41.0 的单点落点钳制整体移除，`scrollToLine` 回归朴素两行。纯模板迭代：零引擎改动、零新占位符/语言键/Spec 字段，九个模板同步。单测以 42.0 测试替换 41.0 测试（钉住 bodyPad 声明与恰好三处引用、maxScroll/绘制/命中/守卫/开关补偿五处消费、开关次序链与旧钳制 not.toContain），并把 UI 8.0/9.0/21.0/22.0 四处既有 `scrollToLine` 切片回退为朴素两行；205 个用例通过，9 个适配器重编译通过，`javap` 取证见 acceptance-report §6.5。
- 修复 1.21 真实渲染缺陷：`Screen.render` 会二次绘制背景，旧模板的 `super.render` 会盖住面板；新模板单次背景 + 显式绘制子控件。
- 修复版本 API 差异：NeoForge 1.20.4 的客户端 tick 是融合事件 `TickEvent.ClientTickEvent`（需判 `Phase.END`）+ 嵌套 `Mod.EventBusSubscriber`；`ClientTickEvent.Post` 与顶层 `EventBusSubscriber` 是 1.20.5+ 的写法，照抄 1.21 模板会编译失败。
- 验收：同一份含自动目录的四屏 Spec（`docs/examples/ui2-demo.json`）在 9 个 UI 适配器上真编译通过（见 acceptance-report §6.5）。

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
| UI 模板只实现一半（三个加载器各有自己的客户端引导方式） | 产出无法编译的 Java | 契约把 UI 模板定为「全有或全无」，lint 直接拦截；Screen 本体按 `javap` 取证的两版签名分叉 |
| 版本 API 漂移（1.21.x 持续破坏性变更） | 模板过期 | 适配器数据 + 编译级验收；每个适配器带 `notes` 陷阱注记 |
| 本机仅预装 JDK 21 | 1.20.1（Java 17）原本无法本机编译 | 实测可通过 `api.adoptium.net` 取得 Temurin JDK 17 ⇒ **1.20.1 已编译验证**；26.x（Java 25）仍为「仅生成、受限验证」 |
| 首次构建需联网（Gradle/Loom/Minecraft） | 离线环境无法构建 | 生成阶段零网络；README 明示首次构建需联网；wrapper 随工程分发 |
| 本机 Java 对部分 CDN 直连不稳定 | wrapper 自动下载发行版可能失败 | 验收使用本地已解压的 Gradle 发行版；把该环境限制写入 docs/environment.md |
| 适配器 schema 演进 | 旧数据失效 | `schemaVersion` + 加载期校验与可读报错 |

## S16 交付物（多版本推进：13 个目标 / 10 个编译验证，已完成）

**动机**：把框架从「一个能跑的版本」推进到「覆盖跨代际的版本」，并且**每一代都用真编译而不是记忆来定版**。

- 新增目标：`1.19.4`、`1.20.4`、`1.21.4`（fabric+forge）、`1.21.1` fabric、`1.16.5`（fabric+forge），
  加上原有 `fabric-1.21.1` / `forge-1.20.1` / 三个 neoforge ⇒ 共 13 个适配器，**10 个真编译通过**。
- `scripts/version-facts.mjs`：从权威端点取构建事实（Fabric meta/maven、Forge maven、NeoForge maven 带镜像回落、
  `pack_format` 读真实游戏 jar 的 `pack.mcmeta`）。已修两个静默错误：Forge 元数据降序导致取到最旧版、
  Fabric API `+1.16` 需要 major.minor 回落。
- `scripts/derive-adapter.mjs`：同代派生。**刻意不自动化语义差异**（那正是适配器要记录的），默认剥离可选切片。
- **代际边界**（实测）：同代派生 + 少量修正可通过；跨代（1.19.4→1.16.5）必须整套模板重写。
- 1.16.5 是本轮最重的一块，两个加载器的差异都已逐条取证并写进 `notes` 与 `docs/adding-a-version.md` §2.5：
  两边都没有「注册后挂钩」、标签页靠构造期自注册、Forge 侧**该版本编译用 MCP 名而非官方名**。
- 契约新增 `itemGroupSuffix`（可选）：旧版在构造物品时绑定标签页（`Item.Properties#tab`），
  新版在注册后挂钩（`ItemGroupEvents`）。哪一种是适配器数据，引擎不做版本分支。
- lint 新增 `var` 检查：Java 10 以下目标出现 `var` 直接报错——javac 把它报成「找不到符号: 类 var」。
- 验收：109 项测试通过；`fabric-1.16.5` 与 `forge-1.16.5` 生成工程均 **BUILD SUCCESSFUL** 并产出 jar。

## S17 交付物（1.12.2，已完成）

- **先确认上游**：Fabric 无 1.12.2（loader API 返回 400、无 Fabric API 构建）⇒ 该版本只有 Forge 目标。
- `packages/adapters/assets/gradle-4.10.3/`：新增 wrapper 资产（本仓库唯一一个 Gradle 4 目标，
  也是唯一需要 Java 8 守护进程的）。附 `PROVENANCE.md` 说明来源与为何需要。
- `packages/adapters/data/forge-1.12.2.json`：按 1.12 年代重写——`RegistryEvent.Register` 注册、
  setter 式物品配置、`mcmod.info`、`assets/` 下的复数贴图目录、`item.<n>.name` / `tile.<n>.name` 语言键。
- **契约新增两个可选切片**：`lootTable`（1.14+）与 `mineableTag`（1.13+）。
  不声明即跳过，声明则必须成对（lint 强制）。1.12.2 用 `Block#setHarvestLevel` 在代码里表达采集工具。
- **契约修正**：`itemDurabilitySuffix` 模板取代引擎里硬编码的 `.durability(n)`——
  那是 Mojang 1.13+ 的 API 名，1.12.2 是 `.setMaxDamage(n)`。引擎现在不认识任何 MC API 名。
- 工具链取证结论：**ForgeGradle 3（官方 1.12.x MDK 用的就是它，不是 2.3）+ Gradle 4.10.3 + JDK 8**；
  FG6 在该版本挂掉，FG2.3 因 Forge 不再发布 `-userdev.jar` 而无法使用。
- 验收：生成工程 **BUILD SUCCESSFUL** 并产出 jar；全套 113 项测试通过；
  fabric-1.16.5 / forge-1.16.5 复验仍通过（引擎改动无回归）。

## S18 交付物（NeoForge 三目标编译 + 运行验证，已完成）

**动机**：三个 NeoForge 目标长期挂着「已生成，未编译验证」——本机无法访问官方 maven，且事后证明
**编译级验证也不够**：两处缺陷（mods.toml 文件名、loaderVersion 范围）只有真实运行才暴露
（服务器正常启动、mod 从未加载）。本轮把「阻塞」拆成四个可解的子问题逐一消除。

- **环境阻塞解除**（全部写入适配器 `notes` 与 acceptance-report §11.1/§16）：
  - 插件解析只走 ForgeCDN 镜像（`neoforged.forgecdn.net/releases`），官方主机刻意不列入（Gradle 对不可达仓库硬失败）。
  - `net.neoforged:minecraft-dependencies:<mc>` 镜像 404 ⇒ settings.gradle 从 Mojang 版本清单合成等价 POM 到本地仓库，按版本缓存。
  - NFRT 钉版库被 Gradle 升级导致清单缺条目 ⇒ build.gradle `addArtifactsToManifest` 显式补 7 个坐标（`transitive=false`）。
  - 1.20.4：MDG 1.x 硬编码 `--release 21` ⇒ 换 **MDG 2.0.147**；NFRT 要 Java 21 工具链 ⇒ Gradle 守护进程跑 JDK 21、JDK 17 靠注册表探测。
- **运行级验收**：新增 `scripts/verify-runtime.mjs`——生成工程 → 起专用服务器 → 判据为 mod 初始化行 + `Done (`；
  判出 WARN（服务器启动但 mod 未加载）/ FAIL（加载期崩溃）/ SKIPPED（缺工具链）/ TIMEOUT，失败退出码 1。
- **真运行抓出的三处模板缺陷**（编译看不见）：
  - 1.20.4：FML 2.0.17 只扫 `META-INF/mods.toml`（`neoforge.mods.toml` 是 1.21+ 的名字）→ 路径改回 + 回归测试。
  - 1.20.4：`loaderVersion = "[4,)"` 被拒（javafml 语言版本是 2.0，日志 `Missing language javafml ... found 2.0`）→ 改 `"[2,)"` + 回归测试。
  - 1.21.4：1.21.2+ 物品/方块必须带 registry id（运行 NPE `Item id not set`）→ settings 模板补 `.setId(ResourceKey.create(...))` + 回归测试。
- **真编译抓出的缺陷**：1.20.4 数据包目录应为复数 `loot_tables`/`tags/blocks`（单数是 1.21 改动）→ contentPaths 改复数。
- 验收：**3/3 真编译通过 + 3/3 真运行 PASS**（1.20.4 77s / 1.21.1 205s / 1.21.4 43s）；全套 **119 项测试通过**；
  README 目标表、acceptance-report（§1/§11.1/§12/§13/§16）、environment.md 已同步。
