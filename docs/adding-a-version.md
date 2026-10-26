# 新增一个 MC 版本 / 加载器

> 目标：把「查不同版本的文档、对着接口试错」这件事，压缩成一份**可复用、可验证**的清单。
> 核心原则（见 `docs/project-brief.md` 原则 1）：**版本差异只允许存在于适配器数据里，引擎代码零版本分支。**

新增一个目标 = **新增一个 JSON 文件**，不改 `packages/core` 一行代码。若你发现必须改引擎，那是引擎的 bug（或适配器契约缺字段），应当先补契约。

## 0. 先确认边界

```bash
node packages/cli/dist/index.js list-versions      # 现有目标
node packages/cli/dist/index.js adapter <id> --templates   # 参考一个已有适配器的模板全貌
```

## 1. 取证：不要凭记忆写版本事实

**先看目标适配器自带的 `references[]`**——每个适配器都记录了该 (版本 × 加载器) 的权威来源（官方文档、映射查询、迁移指南）：

```bash
node packages/cli/dist/index.js adapter forge-1.20.1 --json   # 人 / 脚本
# 智能体走 MCP：get_adapter { mcVersion, loader }
```

`kind: "migration"` 的那些尤其省时间：**「这一版改了什么」几乎总能在那类文档里直接找到答案**，比逐类 `javap` 试错快得多。

本仓库一贯的做法是**先取证再写模板**，三个层次：

| 手段 | 用途 | 本仓库实例 |
| --- | --- | --- |
| `javap` 真实映射 jar | 拿到**类是否存在、方法签名是什么**——这是文档最容易过时、也最容易骗人的地方 | `Screen#renderBackground` 在 1.20.1 收 `(GuiGraphics)`、1.21.x 收 `(GuiGraphics,int,int,float)`，两版分叉进各自模板 |
| 读 **jar 内原版数据** | 拿到**数据包 JSON 的方言**——`gradle build` 完全不校验 JSON 语义，文档也常滞后 | 1.21 把物品栈键从 `item` 改成 `id`、物品谓词拍平成字符串、目录 `recipes/`→`recipe/`；共发现并修复 4 处 |
| 官方示例 / 文档 / 迁移指南 | 拿到**构建事实**（插件版本、Gradle/JDK 约束、仓库地址）与**版本差异** | `fabric-example-mod`（CC0）、各加载器官网、ChampionAsh5357 的逐版本迁移 gist |

映射查询工具（Linkie、Parchment）用来在写模板前核对名字——**映射名是本仓库最容易出错、也最难靠编译发现的一类事实**
（名字写错通常编译报错，但名字"能编译却语义不同"时只有核对来源才发现）。

中文资源索引（含教程、工具、社群）见 `docs/research/2026-09-cn-modding-resources.md`；注意其许可边界，只取链接目标。

**判断标准**：任何「我记得是这样」的版本事实，都必须落到上面某一种证据上，否则写进 `notes` 时标注为未取证。

## 1.5 取构建事实（工具化，不必手查）

```bash
node scripts/version-facts.mjs 1.21.4 fabric --pack-format   # 单个目标
node scripts/version-facts.mjs --all --pack-format            # 全部目标
```

从权威端点读，**不靠记忆**：Fabric meta/maven（loader、loom、fabric-api）、Forge maven、
NeoForge maven（官方不可达时自动走 creeperhost 镜像）、`pack_format` 读**真实游戏 jar 的
`pack.mcmeta`**（比 `version.json` 更直接，也是 1.16.5 及更早唯一可得的来源）。

两个已踩过的坑，脚本里已处理：

- **Forge 版本排序**：元数据是**降序**的，且 `"1.16.5-36.2.42"` 按整串切分会让 `Number("5-36")` = `NaN`，
  排序静默失效、取到**最旧**版。必须只比较 `<mc>-` 之后的部分。
- **Fabric API 后缀**：1.16.5 写作 `0.42.0+1.16` 而非 `+1.16.5`，需要按 major.minor 回落匹配。

## 2. 复制一份现有适配器

机械部分可以直接派生（**但派生只是起点，不是正确性声明**）：

```bash
node scripts/derive-adapter.mjs <源适配器id> <mcVersion> <loader>
# 例：node scripts/derive-adapter.mjs fabric-1.21.1 1.21.4 fabric
```

派生脚本**刻意不自动化语义**（版本间的 API 变更）——那正是适配器要记录、编译器要抓的东西。
它默认**剥离可选切片**（UI/配方/进度/实体/datagen），因为这些模板**不是版本无关的**：
1.21.2 起 `MobRenderer` 多了一个类型变量、`EntityType.Builder#build` 改收 `ResourceKey`，
照抄 1.21.1 的实体模板在 1.21.4 上根本编译不过。保留陈旧模板会产出坏 Java；剥离后生成器会
给出「该适配器不支持 entities」的明确报错。

**另有两个由真机编译抓出的坑，务必注意：**

- **loom 要按代际选，不能取「最新」**：loom 1.18.2 要求 **JVM 25**，Java 21 的目标根本装不上；
  loom 1.17.21 又要求 **Gradle 9.5.0**，用 8.8 会因 `org.gradle.plugin.api-version` 不匹配失败。
  所以派生时**继承同代源适配器的 loom**，而不是用「最新稳定版」。
- **Forge 1.20.2+ 取消了 reobfuscation**：`reobfJar` 任务不存在，`finalizedBy 'reobfJar'` 会让构建失败，必须删掉。
- **NeoForge 的仓库顺序要紧**：官方 maven 在被阻断的网络上返回 `Connection reset by peer`，这是**硬失败而非回落**。
  它若排在 `gradlePluginPortal()` 之前，传递依赖（如 `gradle-idea-ext`）就永远解析不到。正确顺序是
  **镜像 → 公共仓库 → 官方 maven 放最后**。

```bash
cp packages/adapters/data/<loader>-<oldVersion>.json packages/adapters/data/<loader>-<newVersion>.json
```

然后逐项改：`id` / `mcVersion` / `java` / `loaderVersion` / `mappings` / `gradle.*` / `gradleWrapperVersion`。

**最容易踩的三个坑**（都已在现有适配器里有对照）：
- **Java 版本**：目标 `java` 决定编译级别；ForgeGradle 7 的 Mavenizer 另需 JDK 25，用 `--gradle-arg -Porg.gradle.java.installations.paths=<JDK25>` 注册（否则 foojay resolver 会现场下载，受限网络上可能卡住）。
- **Gradle 版本**：ForgeGradle 6 与 Gradle 9 不兼容，所以 `forge-1.20.1` 必须钉 Gradle 8.8 并自带 8.8 的 wrapper 资产。
- **数据包目录单复数**：1.21+ 是 `recipe/`、`loot_table/`、`tags/block/`；1.20.1 是复数。**写错不会报错，会静默不加载**——这类必须靠「读 jar 内原版数据」发现。

### UI 切片（screenClass）移植清单

`derive-adapter.mjs` 默认剥离 UI 模板，因为 Screen 的 API 逐代变化。恢复 UI 前先对**新版本真实映射 jar** 逐项取证：

| 事实 | 取证 | 当前已知分叉 |
| --- | --- | --- |
| `renderBackground` 签名 | `javap -p net.minecraft.client.gui.screens.Screen` | 1.20.1 `(GuiGraphics)`；1.21.x `(GuiGraphics,int,int,float)` |
| `mouseScrolled` 签名 | 同上 | 1.20.1 `(double,double,double)`；1.21.x 多收 `scrollX` |
| `render` 是否自绘背景 | 反编译/读源码 | 1.21 的 `Screen.render` 内部会再调 `renderBackground` |
| 控件集合可见性 | 同上 | 1.20.1 `renderables` 为 public；1.21.1 为 private，必须用 `children()` |
| 文本换行/宽度 API | `Font#split` / `Font#width` | 两版一致：`split(FormattedText,int)` / `width(FormattedCharSequence)` |
| 鼠标/键盘输入签名 | `javap GuiEventListener` / `Screen` | 两版一致：`mouseClicked(double,double,int)`、`mouseDragged(double,double,int,double,double)`、`mouseReleased(double,double,int)`、`keyPressed(int,int,int)` |
| 滚动区域裁剪 | `GuiGraphics#enableScissor` | 两版一致；**scissor 是屏幕坐标**，slide 动画时要加 `bodyTop + slide` |
| 动画时钟 | `Util#getMillis` | 两版一致；面板 fade/slide 与滚动缓动共用 |
| 客户端 tick / 事件总线 | `javap` 该版本的载体 jar | Forge 1.20.x 与 NeoForge 1.20.4 用融合事件 `TickEvent.ClientTickEvent`（判 `Phase.END`）+ 嵌套 `Mod.EventBusSubscriber`；NeoForge 1.20.5+ 改为 `ClientTickEvent.Post` + 顶层 `EventBusSubscriber`。照抄 1.21 模板到 1.20.4 会编译失败 |
| 按键注册事件 | `javap` 事件类 | Forge/NeoForge 用 `RegisterKeyMappingsEvent`（包名随加载器变），Fabric 用 `KeyBindingHelper`；键码表达式由契约 `keyCodePattern` 提供 |
| 窗口尺寸 / 布局 | `Screen#width/height`（`init()` 时更新） | 各代一致；`width/height` 只作偏好尺寸，模板必须在 `init()` 里按窗口钳制并重排页脚 |

硬性要求（由 `lintAdapter` 拦截）：`renderBackground` 恰好一次、**禁止** `super.render(`、必须遍历 `this.children()` 渲染 `Renderable`；主题调色板与布局留在引擎，版本差异只进模板。UI 2.1/2.2/2.3 的交互与布局约定也由测试钉住：`init()` 不重置阅读位置（UI 18.0 起按逻辑行锚定，且取 `currentScroll()` 的实际插值）；拖动滚动条走 `scrollTo(..., false)`（即时），滚轮/键盘走缓动；滚动条悬停/拖动时加宽；`init()` 用 `Math.min(PANEL_WIDTH, this.width - 16)` 把面板钳制进窗口，绘制/滚动/边框全部走 `this.panelWidth/panelHeight`，裸常量只允许出现在声明、字段初值与钳制三处；生成器产出的按钮 bounds 必须引用实时字段（`footerButtonWidthN`/`footerRowWidthN` 由 `panelWidth` 计算），每行按钮在窄面板下收缩而不是溢出，不能写死编译期坐标；`openedAt` 用 `-1L` 哨兵保证重建不重播动画，标题用 `Font.plainSubstrByWidth` 截断缓存。UI 3.0 的行样式也必须由模板消费：`LINE_STYLES` 常量、`rowStyles/rowIndents/rowStarts` 三个按行的缓存，heading 用 accent 竖线、bullet 用首行方块标记，续行保留缩进且不重复画标记；UI 3.1 还要求 heading 前的空白缓存行（`FormattedCharSequence.EMPTY`，首行与连续 heading 除外）以及绘制时按 `rowWidths == 0` 跳过——这些都由测试逐模板钉住。UI 4.0 的行内链接同样是模板契约：`LINE_LINKS` 常量、`rowLinks` 按行缓存（空白行也必须 add(-1)，否则 heading 之后的链接会错位）、`linkAt` 命中、`openLineLink` 占位符，以及「链接行用 accent 色、悬停画下划线、`mouseClicked` 先滚动条后链接」的顺序；缺少任一项链接就会指向错误的行或无法点击。UI 4.1 还把 slide 位移收进 `currentSlide()`：render、`linkAt`、`scrollbarContains`、`scrollToMouse` 必须共用它，悬停必须逐帧在 `render` 里重算、不得只在 `mouseMoved` 更新（否则平滑滚动/入场动画时下划线与点击位置会漂移）。UI 5.0 另需 `LINE_TARGET_KEYS`/`LINK_HOVER_COLOR` 常量、悬停行背景高亮，以及在 `fade` 遮罩之后调用 `GuiGraphics.renderTooltip(Font, Component, int, int)`；该重载在 1.20.1–1.21.4 一致，但新版本仍需 `javap` 确认。UI 5.1 要求 tooltip 的 `Component` 在 `init()` 里按逻辑行缓存到 `lineTooltips`（未链接行为 `null`），悬停帧不得再 `Component.translatable`；同时由 `hasLinks` 让无链接屏幕跳过 `linkAt`，缓存必须随行列表一起清空。UI 6.0 把「target 指向自身」生成为 `this.scrollTo(0, true)`，因此模板必须保留 `private void scrollTo(int target, boolean animate)` 这个签名，并让 self link 的 target key 为空（不弹 tooltip）。UI 7.0 要求 `openLineLink` 在动作 switch 之前播放 `SoundEvents.UI_BUTTON_CLICK`（`SimpleSoundInstance.forUI(..., 1.0F)`）；新版本需确认 `SoundEvents.UI_BUTTON_CLICK` 是 `SoundEvent` 还是 `Holder<SoundEvent>`、`forUI` 是否有对应重载，并用 `javap` 取证。UI 8.0 要求 `init()` 按逻辑行构建 `lineStarts`（记录该行在 `rows` 中的首行索引，必须在 heading 空白行插入之后采集）并提供 `scrollToLine(int)`：模板的 `scrollTo(int, boolean)` 签名保持不变，`scrollToLine` 只把行号换算成像素并转交它；测试会逐模板检查字段、清空、构建顺序与 helper。UI 9.0 要求同一 helper 在滚动前记录 `flashLine`/`flashStartedAt`，由 `flashColor(int row)` 用 `lineStarts` 算出目标逻辑行的可见行区间 `[start, end)` 并输出 600ms 淡出的 accent 背景，在 `drawBody` 的文字与悬停高亮之前绘制；`init()` 必须清除 flash 状态，过期后置 `-1`，静止帧不得计时或分配。该特性只用既有 `GuiGraphics.fill` 与 `Util`，不需要新的版本 API。UI 10.0 要求 `keyPressed` 在 `super.keyPressed` 之前处理 `↑`/`↓`/`Enter`/小键盘 Enter/`Tab`：`focusLink` 在 `LINE_LINKS` 上循环并跳过未链接行，先 `setFocused(null)` 再记录 `focusedLink`、调用 `ensureLineVisible`（用 `lineStarts` 的行区间做最小滚动）；`Enter` 仅在 `focusedLink >= 0 && getFocused() == null` 时打开链接，`Tab` 清空 `focusedLink` 并把按键交还原版控件。焦点行在文字左侧与底部各画一条 accent：`guiGraphics.fill(x - 3, y - 1, x - 1, y + LINE_HEIGHT, ACCENT_COLOR)` 与 `fill(x - 1, y + LINE_HEIGHT - 1, x + this.rowWidths.get(i) + 1, y + LINE_HEIGHT, ACCENT_COLOR)`。迁移到新版本时须用 `javap` 确认 `AbstractContainerEventHandler.getFocused()`/`setFocused(GuiEventListener)` 存在且允许 `null`；`openLineLink` 的点击音必须是第一条语句，焦点赋值放在音效之后。UI 10.1 要求 `mouseClicked` 的第一条语句是 `this.focusedLink = -1;`（鼠标按下退出键盘焦点；链接命中时 `openLineLink` 会重新设回该行）。UI 11.0 要求模板保留 `private int initialLine = -1;`、`(Screen parent, int initialLine)` 构造重载，并在 `init()` 的 `lineStarts` 构建、`scrollOffset` 钳制与 `openedAt` 初始化之后消费它：记录到局部变量、立刻把字段清回 `-1`，再调用 `scrollToLine(line)`。这保证跨屏深链只在首次打开时滚动并闪一次，后续 `init()`（缩放/返回）不重复跳转；目标屏的 anchor 行号由引擎按逻辑行计算，模板不做字符串查找。UI 12.0 要求焦点 tooltip 复用 `lineTooltips` 缓存、用 `lineStarts` 定位，并渲染在鼠标悬停分支之后；滚动渐隐要求 `EDGE_FADE_HEIGHT = 4`、`fadeHeight = Math.min(..., viewport / 2)`，只在 `scroll > 0` / `scroll < maxScroll` 时按 `(PANEL_COLOR & 0x00FFFFFF) | (alpha << 24)` 画在 scissor 内。两者只使用既有的 `GuiGraphics.fill` 与模板字段，不需要新的版本 API。UI 13.0 要求 `onClose()` 在 `fade`/`slide` 主题下只启动 120ms 关闭过渡（`closingAt`/`closeSwitched`），`render` 末尾在满帧时切屏；`mouseScrolled`/`mouseClicked`/`mouseDragged`/`mouseReleased`/`keyPressed` 与 `onClose` 自身都要在 `closingAt >= 0` 时短路，`none` 主题必须保持立即 `setScreen(parent)`，常量折叠后不得依赖关闭字段。该特性只用既有 `Util.getMillis` 与 `GuiGraphics.fill`。UI 14.0 要求 `drawPanel` 在面板填充前画两层投影（`0x18000000` 外圈与 `0x30000000` 内圈），有按钮时按 `FOOTER_HEIGHT > 12` 画页脚分隔线；`trimmedTitle()` 必须写 `titleTruncated`，标题带命中 `titleContains` 要计入 `currentSlide() + currentCloseSlide()`，并在无悬停/焦点链接且未关闭时渲染完整标题 tooltip。UI 15.0 要求模板消费 `NOTE_COLOR` 占位符（引擎按主题给出弱化色），样式码 3 的行缩进 8px、用 `rowColor(style, link)` 选色（链接与 heading 仍为 accent），并在每条换行行左侧画 1px 引用竖线；不得把 note 颜色写死进模板，否则换主题会失去弱化层级。UI 16.0 要求滑块几何由 `scrollbarThumbHeight()`/`scrollbarThumbTop(int)` 统一提供，绘制、命中与拖动共用；`mouseClicked` 按是否命中滑块设置 `scrollbarGrabOffset`，`scrollToMouse` 用该偏移让滑块跟手，`mouseReleased` 与 `init()` 必须清回 `-1`。UI 17.0 要求 `linkAt` 在拿到 `rowLinks` 后继续检查该行的 `rowWidths`/`rowIndents`（居中屏按面板宽度重算左缘），只在实际文字范围加 2px 容差内返回链接，否则返回 `-1`；不得退回整行面板宽度判定。UI 18.0 要求 `init()` 在清空行缓存前用 `lineForScroll(currentScroll())` 记下顶部逻辑行、行内行偏移与该行内像素偏移，重建后按新 `lineStarts` 恢复（同一布局精确到像素，换行变化后仍锚在同一逻辑段）；模板需保留 `private static int rememberedLine = -1` 与 `private boolean laidOut`，在 `scrollTo` 每次改变目标时写入 `rememberedLine = lineForScroll(clamped)`，首次 `init()`（`!laidOut`、无 `initialLine`）据此恢复阅读行，之后仍由 `initialLine` 覆盖；`lineForScroll` 必须用 `lineStarts` 做行区间查找（空布局返回 -1）。UI 18.1 要求手动滚动输入在滚动前清空 `focusedLink`：`mouseScrolled` 的滚动分支与 `keyPressed` 的 `PageUp`/`PageDown`/`Home`/`End` 四个分支都要写 `this.focusedLink = -1;`，而 `focusLink` 调用的 `ensureLineVisible` 不能被清掉（清焦点只能发生在输入处理里，不得写进 `scrollTo`）。UI 19.0 要求链接点击按原版按钮语义在释放时提交：`mouseClicked` 命中链接时只写 `this.pressedLink = line;` 并返回，不得直接调用 `openLineLink`；`mouseReleased` 在滚动条/关闭分支清空 `pressedLink`，其余情况用 `linkAt(mouseX, mouseY) == pressed` 重测，仍在原行才调用 `openLineLink(pressed)`；`mouseScrolled`、`keyPressed` 与 `init()` 都要清掉待打开行，避免滚动、按键或重建后释放补开。`pressedLink` 初值与 `focusedLink` 一样为 `-1`。UI 20.0 要求把章节结构画在滚动条轨道上：`init()` 重建行缓存时，在 heading 的首个视觉行处把行索引加入 `headingRows`（`first && style == 1`，续行不重复），并在清空行缓存时一并 `clear()`；`drawBody` 的滚动条分支在轨道填充之后、滑块填充之前遍历 `headingRows`，按 `bodyTop + row * trackHeight / rowCount` 画 1px 刻度（当前章节 5px 全亮、其余 3px 用 `(ACCENT_COLOR & 0x00FFFFFF) | 0x80000000`），当前章节由 `currentHeading(scroll)` 取 `row * LINE_HEIGHT <= scroll` 的最后一个标题；无滚动条时不得进入该分支。UI 21.0 要求 `keyPressed` 在 `maxScroll > 0` 分支内、链接焦点之前处理 `Ctrl+↑/↓`：`headingStep(forward)` 以 `currentHeading(scrollTarget)` 为基准遍历 `headingRows` 取相邻标题行（首/尾返回 `-1`），命中后清 `focusedLink` 并调用 `scrollToLine(lineForScroll(row * LINE_HEIGHT))`，组合键必须 `return true` 以免漏给 `focusLink`。UI 22.0 要求保留两参 `scrollTo(int, boolean)` 作为基础时长的委托入口，并新增 `scrollTo(int, boolean, int)` 与 `scrollDurationFor(int)`（`min(280, 140 + |clamped - scrollTarget| / 12)`）；`currentScroll()` 必须读 `scrollDurationMs` 实例字段而不是常量，`scrollToLine`/Home/End 与生成器的自链接必须传入自适应时长，滚轮/翻页/`ensureLineVisible` 仍用两参入口。UI 23.0 要求把刻度变成导航：`init()` 在 `headingRows` 之外并行缓存 `headingLines`（逻辑行）与 `headingTooltips`（`Component.translatable(LINE_KEYS[line])`，随行缓存一起清空）；`render` 逐帧计算 `hoveredHeading = headingAt(mouseX, mouseY)`（关闭过渡中恒为 -1），悬停刻度全亮并加宽到 7px，tooltip 链在悬停链接/键盘焦点之后输出 `headingTooltips.get(hoveredHeading)`，标题 tooltip 的条件需排除悬停刻度；`mouseClicked` 在 `scrollbarContains` 之前用同一 `headingAt` 命中 gutter（轨道左侧 7px、纵向 ±2px、`maxScroll <= 0` 时返回 -1），命中即 `scrollToLine(headingLines.get(i))`。这些均只用 `fill`/`renderTooltip` 与既有字段。UI 24.0 要求翻页与轨道点击共享阅读连续性：`pageStep()` 返回 `max(LINE_HEIGHT, viewportHeight() - LINE_HEIGHT)`，`PageUp`/`PageDown` 用它代替整屏步进，仍走两参 `scrollTo`（基础时长）；`mouseClicked` 先算出 `onThumb`，命中滑块时直接 `scrollToMouse` 跟手，点轨道则把 `scrollbarScrollAt(mouseY, grabOffset)` 的结果交给三参 `scrollTo(..., true, scrollDurationFor(target))` 滑行过去；目标换算必须抽在同一 helper（拖动路径即时、点击路径动画），`scrollToMouse` 只负责用当前抓取偏移调用 helper 并传 `false`。UI 27.0 要求屏幕自己处理开关键：原版 `KeyboardHandler` 在任意 Screen 打开时会在 `KeyMapping.set/click` 之前返回（Forge 1.20.1 字节码取证），所以模板不得依赖 tick 侧的 `consumeClick` 关闭已打开屏幕。屏幕模板必须消费 `{{SCREEN_KEY_CODE}}`（引擎渲染 Spec 键的 GLFW 码，未绑定时 `-1`）并声明 `TOGGLE_KEY` 常量，在 `keyPressed` 的关闭锁检查之后、其余按键处理（含 `pressedLink` 清空）之前判断 `TOGGLE_KEY >= 0 && keyCode == TOGGLE_KEY`，命中调用 `onClose()` 并 `return true`；生成器的打开语句写成 `if (<Key>.consumeClick() && client.screen == null)`，因此不再需要 `active`/`isActive()`/`closeActive()`/`removed()` 这套静态实例状态。迁移时用 `javap` 确认该版本 `Screen.keyPressed(int,int,int)` 的签名（1.20.1–1.21.4 一致）与 `Minecraft.screen` 字段可读；GLFW 键码由契约 `keyCodePattern` 提供，不写死在模板里。UI 26.0 要求模板在链接行绘制 `boolean pressed = hovered && link == this.pressedLink;`，悬停底色按 `pressed ? LINK_PRESSED_COLOR : LINK_HOVER_COLOR` 取色、下划线写成 `y + LINE_HEIGHT - (pressed ? 2 : 1)`，并声明 `LINK_PRESSED_COLOR` 占位符；两个颜色都由引擎按 accent 派生（alpha 0x66/0x33），主题调色板（含 `contrast`）同样只在引擎侧，新增主题不需要改模板。UI 28.0 要求生成器为页脚每一行声明 `footerButtonWidthN = max(1, min(100, (panelWidth - 16 - 8 * (rowCount - 1)) / rowCount))` 与 `footerRowWidthN`，`.bounds` 用它们计算 x 与宽度（同行第二个按钮偏移 `footerButtonWidthN + 8`），因此 2 个按钮在低于 240px 的面板里会收缩而不会越出边框；`width` 只是偏好尺寸，不是按钮可用宽度的保证。UI 29.0 是引擎侧的 Spec 展开，不新增模板契约：`contentsFor` 在生成前被展开为普通 bullet 深链行，模板仍只消费 `LINE_*` 常量；目标屏只要满足 UI 8.0 的 `lineStarts` 逻辑行定位，就自然支持目录落点。UI 30.0 要求 `ensureLineVisible` 在最小滚动之外保留 `LINE_HEIGHT` 一行余量：向上时滚到 `max(0, start - margin)`，向下时滚到 `max(0, min(start, end + margin - viewportHeight()))`，使焦点链接上下都有上下文，且比视口更高的链接先保住首行；`scrollTo` 自身继续负责钳制，首尾章节不得出现负滚动或越界。UI 31.0 同样只在引擎侧：目录条目按标题在目标屏的逻辑行索引复用其语言键（`langKeys.screenLine` 模板渲染出的键），新适配器只要 `screenLine` 模板含 `id` 与 `n` 占位符就自动兼容，模板不需要任何新占位符。UI 32.0 要求 `screenClass` 模板消费新占位符 `{{LINE_SECTION_KEYS_JAVA}}`（声明为 `private static final String[] LINE_SECTION_KEYS = ...`）：跨屏深链的 tooltip 在目标标题之后追加落点章节名（`Component.translatable(标题).append(" › ").append(Component.translatable(章节))`），本屏跳转与自链接两条分支保持单标题、无第二段，三个分支的 `Component` 在 `init()` 里按行缓存，悬停帧不分配。`MutableComponent.append(String)` 与 `append(Component)` 两个重载在 1.20.1–1.21.4 的映射 jar 上已用 `javap` 取证一致，新版本迁移时照此复核即可。UI 33.0 要求模板消费 `{{WARN_COLOR}}`（引擎按主题给暖色警告色）：样式码 4 的行与 note 一样缩进 8px，但 `rowColor` 链为 `style == 3 ? NOTE_COLOR : style == 4 ? WARN_COLOR : BODY_COLOR`，竖线分支 `if (style == 4)` 画 2px（`fill(x - 6, y, x - 4, ...)`）——警告与提示的颜色都不得写死进模板，否则换主题时两个层级会同时丢失。UI 34.0 要求模板消费 `{{STEP_TEXT_JAVA}}`（引擎按 heading 重置计数预计算的 `STEP_TEXT` 数组）并维护与行索引对齐的 `private final List<String> rowStepTexts` 列表（清空、spacer 行填 `""`、换行时 `first ? STEP_TEXT[line] : ""`）；样式码 5 的行在首行画自动编号 `drawString(this.font, step, Math.max(left + 1, x - 3 - this.font.width(step)), y, ACCENT_COLOR, false)`，编号不得写死或退化成 bullet。UI 35.0 要求模板消费 `{{SCREEN_SEARCH_KEY}}`（引擎按 `langKeys.screenSearch` 渲染的占位/提示文本，`UI_LANG_KEYS` 已把它列为屏幕适配器必填语言键）并实现 Ctrl+F 查找条：`EditBox(Font, int, int, int, int, Component)` 六参构造、`setHint(Component)`、`setResponder(Consumer<String>)`、`setMaxLength(int)`、`Screen.removeWidget(GuiEventListener)`、`Screen.hasControlDown()` 在 1.20.1–1.21.4 的映射 jar 上已 `javap` 取证一致；`AbstractContainerEventHandler.setFocused(GuiEventListener)` 自 1.20.1 起会把焦点传播到控件自身的 `setFocused(boolean)`，因此聚焦只需 `this.setFocused(this.searchBox)`。查找条获焦时 `keyPressed` 必须最早分流（Ctrl+F 开关 → 有查找条时 Esc 关条 → 获焦时 Enter 循环命中、其余 `return super.keyPressed` 交给文本框），Spec 开关按键与滚动/链接分支全部留在其后，否则输入 "k" 这类字符会误触开关、方向键会滚屏；行文本（`Component.translatable(LINE_KEYS[i]).getString()`）与查询都按 `Locale.ROOT` 小写比较，命中跳转复用 `scrollToLine` 的闪烁，不新增版本 API。`drawString(Font, String, int, int, int, boolean)` 与 `Font.width(String)` 在 1.20.1–1.21.4 一致。UI 36.0 要求模板维护可视行级的命中映射 `private int[] searchHits`（0 为无命中、n 为第 n 个命中）：`refreshSearch` 收集命中后按 `lineStarts` 的逻辑行区间（`start = lineStarts.get(line)`、`end = 下一行起点或 rows.size()`，与 `flashColor` 同款 `[start, end)` 写法）为每个可视行写 `i + 1`；绘制块在 `int flash = this.flashColor(i);` 之前按行铺 `(ACCENT_COLOR & 0x00FFFFFF) | ((hit - 1 == searchIndex ? 0x40 : 0x1C) << 24)` 的背景（几何与闪烁/悬停一致，闪烁与悬停仍居上层），并带 `i < searchHits.length` 守卫；`closeSearch`、`init()` 与 `refreshSearch` 开头三处必须把数组置空。只用既有 `GuiGraphics.fill` 与 `lineStarts`，不需要新占位符、语言键或版本 API，新适配器照抄即可。UI 37.0 要求模板消费 `{{SCREEN_SEARCH_CYCLE_KEY}}`（引擎按 `langKeys.screenSearchCycle` 渲染的计数器说明文本，语言键与占位符都已列入屏幕适配器必填，硬编码提示被 lint 拦截）并实现查找条的双向循环与计数区指针控件：`Screen.hasShiftDown()` 与 UI 35.0 取证的 `hasControlDown()` 同族，1.20.1–1.21.4 一致；`keyPressed` 的 Enter 分支先判 Shift 再分流 `prevSearchMatch()`/`nextSearchMatch()`，`prevSearchMatch` 用 `(this.searchIndex + this.searchMatches.size() - 1) % this.searchMatches.size()` 避免负数取模；`hoveredSearchCounter` 由 `render` 逐帧计算（沿用既有悬停字段的 `closingAt < 0L` 守卫），tooltip 链必须把计数区分支放在链接之前（计数区叠在首行链接之上，链序即优先级）；`mouseClicked` 的查找条条带分支内先判计数区命中再委派 `super.mouseClicked`，命中矩形 `searchCounterContains` 必须与绘制几何同源（右锚 `left + this.panelWidth - 6 - this.font.width(count)`、横向 ±2px、纵向同条带），两处分开写会在改版时静默错位。这些只用既有 `EditBox`/`fill`/`renderTooltip` 与模板字段，新适配器照抄即可，最后用 `scripts/verify-build.mjs --spec docs/examples/ui2-demo.json --adapter <新目标>` 对含查找条的四屏 Spec 复验。UI 38.0 要求模板为查找条加会话记忆与就近起查：`private static String lastSearchQuery = "";`（静态字段跨屏幕实例存活，`closeSearch`/`init()` 都不清它）在 `setResponder` 与 `addRenderableWidget` 之间回填（`if (!lastSearchQuery.isEmpty()) { this.searchBox.setValue(lastSearchQuery); }`，`setValue` 触发响应器即重查），`refreshSearch` 首行先存值后清命中集，初始落点从 `lineForScroll(scrollTarget)` 的当前阅读行起扫首个更下方的命中、无则回卷文档首条——纯模板实现，无新占位符/语言键/Spec 字段，照抄同版本段的查找条代码即可。UI 39.0 要求模板把命中分布画上滚动条轨道：在章节刻度循环之后、滑块之前，`int markLeft = x + trackWidth;` 取轨道外缘逐 `searchMatches` 画 1px 短刻度（`this.lineStarts.get(line) * trackHeight / rowCount` 与章节刻度同一比例公式；当前命中 `i == this.searchIndex` 全亮 5px、其余 50% 透明 3px），陈旧行号守卫跳过——纯模板实现，无新占位符/语言键/Spec 字段，照抄同版本段的轨道绘制代码即可。UI 40.0 要求刻度可悬停/点击：`markLeft` 改为固定 `x + 2`（悬停加宽轨道不再位移刻度），`private int hoveredSearchMark = -1;` 由 `render` 逐帧计算（`closingAt < 0L` 守卫），命中循环把悬停档并入（`boolean hovered = i == this.hoveredSearchMark;`、`target || hovered ? 5 : 3`）；tooltip 链在计数区之后、链接之前插入 `} else if (this.hoveredSearchMark >= 0) {` 分支（`Component.translatable(LINE_KEYS[this.searchMatches.get(this.hoveredSearchMark)])`，`searchTexts` 与 `LINE_KEYS` 索引空间一致），标题 tooltip 条件同步加 `this.hoveredSearchMark < 0`；命中盒 `searchMarkAt(double, double)` 镜像同屏 `headingAt`（x 界 `x + 2`..`x + 7`、纵向 ±2px 容差、守卫 `searchBox == null || searchMatches.isEmpty() || maxScroll() <= 0`），跳转助手 `jumpToSearchMark(double, double)` 先写 `this.searchIndex = mark;` 再 `this.scrollToLine(this.searchMatches.get(mark));`；`mouseClicked` 两处调用该助手（条带分支内先于文本框委派、主链在章节刻度之后与 `scrollbarContains` 之前）——同样纯模板、无新占位符/语言键/Spec 字段，`Font`/`Component`/`renderTooltip` 已在前几轮取证。先确认该版本 `resize → repositionElements → rebuildWidgets → clearWidgets → init` 的路径（1.20.1 与 1.21.1 一致），否则重建语义要另写。UI 42.0 要求查找条打开时给正文加内边距（41.0 的单点落点钳制对文档头部因 0 钳制而无效，已被取代）：声明 `private static final int SEARCH_BAR_CLEARANCE = 24;`（与条带几何 `bodyTop - 8 .. bodyTop + 16` 的 24px 高对齐）与单点判定 `private int bodyPad() { return this.searchBox != null ? SEARCH_BAR_CLEARANCE : 0; }`，由五处消费——①`maxScroll()` 改为 `return Math.max(0, this.contentHeight() + this.bodyPad() - this.viewportHeight());`（滚动范围随内边距扩展，滚动条轨道/滑块/命中刻度经它自动同步）；②绘制块首行回扫 `int first = Math.max(0, (scroll - this.bodyPad()) / LINE_HEIGHT);`；③逐行 y `int y = bodyTop + this.bodyPad() + i * LINE_HEIGHT - scroll;`；④`linkAt` 的行换算 `int row = (this.currentScroll() + (int) mouseY - top - this.bodyPad()) / LINE_HEIGHT;` 并紧跟涂绘区间守卫 `if (mouseY < top + this.bodyPad() + row * LINE_HEIGHT - this.currentScroll()) { return -1; }`（Java 除法向零截断，正文上缘与条带间 8px 空带的点击会被归到第 0 行，行顶未达即拒绝）；⑤开关补偿——`toggleSearch` 在 `setResponder` 之后、会话回填之前 `this.scrollTo(this.scrollOffset + this.bodyPad(), false);`（立即、非动画，保持视图不跳），`closeSearch` 在 `this.searchBox = null;` 之后 `this.scrollTo(this.scrollOffset - SEARCH_BAR_CLEARANCE, false);`（此时 `bodyPad()` 已归零，钳制落在无 pad 范围）。`scrollToLine` 回归朴素两行（`int target = …; this.scrollTo(target, true, this.scrollDurationFor(target));`），落点行自然落在条带之下。`lineForScroll`/`ensureLineVisible` 的公式无需改动——pad 在绘制与滚动两侧同额偏移、语义自洽。纯模板、无新占位符/语言键/Spec 字段。最后用 `scripts/verify-build.mjs --spec docs/examples/ui2-demo.json --adapter <新目标>` 编译含自动目录的四屏 Spec（含换行/滚动/按钮/动画），通过后才在 `notes` 里声明支持 UI。FG7 目标在受限网络上还要补 `--gradle-arg "-Porg.gradle.java.installations.paths=<JDK25 路径>"` 与 `--gradle-arg "-Porg.gradle.java.installations.auto-download=false"`，避免 foojay resolver 现场下载 JDK 25；Fabric 1.20.4 与 NeoForge 1.20.4 的 `--java-home-17` 都要指向 JDK 21（前者 Loom 插件要求 JVM 21，后者 NFRT 只从运行 JVM 探测 21 toolchain）。

**代际边界**：UI 2.0 模板依赖 `GuiGraphics`，适用于 1.20+；1.19.4 及更早的 `render`/`renderBackground` 收 `PoseStack`，不能照抄，必须另写旧代模板（`derive-adapter.mjs` 因此默认剥离 UI）。1.20.2+ 的 4 参数 `renderBackground` 与 4 参数 `mouseScrolled` 已用 1.20.4/1.21.4 映射 jar 验证与 1.21.1 相同；1.20.1 是 1 参数/3 参数的特例。

## 2.5 代际边界：派生能走多远（实测结论）

**派生只在同一代际内有效。** 实测记录：

| 目标 | 派生来源 | 结果 |
| --- | --- | --- |
| 1.21.4 fabric/forge | 1.21.1 / 1.20.1 | ✅ 编译通过（少数构建事实差异） |
| 1.20.4 fabric/forge | 1.21.1 / 1.20.1 | ✅ 编译通过（一处 `ResourceLocation` 差异） |
| **1.19.4** | 1.20.4 | ✅ 编译通过（**按年代重写**后，见下） |
| **1.16.5** fabric/forge | 1.19.4 | ✅ 编译通过（**整套模板按年代重写**，见下） |
| **1.12.2** forge | 1.16.5 | ✅ 编译通过（**又一代际，几乎无共同点**；Fabric 无此版本，见下） |

### 1.16.5：不是修几处，是整套重写（两个加载器均已完成）

派生仍然只是起点：编译器列出的差异覆盖主类、两个注册类、物品组 API、包名、日志。

**最反直觉的一条：Forge 1.16.5 编译用的是 MCP 名字，不是 Mojang 官方名。**
`mappings channel: 'official', version: '1.16.5'` 产出的构件名字里带 `_mapped_official_1.16.5`，
但内容不是官方名。对那个构件 `javap` 实测：

```
net.minecraft.item.Item implements net.minecraft.util.IItemProvider   ← 存在
net.minecraft.block.AbstractBlock / net.minecraft.block.material.Material
net.minecraft.item.ItemGroup / net.minecraft.util.ResourceLocation
net.minecraft.world.item.Item                                        ← 不存在
```

所以 forge-1.16.5 的模板全用 MCP 名，适配器的 `mappings` 字段也如实标注——
**不要因为构件名里有 "official" 就假定是官方名，要 javap 它。**

其余由编译器 / 字节码 / 构件实测抓出的点：

- **两个加载器在这个版本都没有「注册后挂钩」**。Fabric 侧：聚合器 `fabric-api-0.42.0+1.16`
  解析到的 `fabric-item-groups-v0` `0.3.1+3cc0f0907d` 里没有 `ItemGroupEvents`（`0.3.39` 线也没有，
  `javap` 实测）。Forge 侧：`BuildCreativeModeTabContentsEvent` 是 1.19.4+。
  两边的创造标签页都只能在**构造物品时**用 `Item.Properties#tab()` 绑定。
- **标签页自身能自注册**，两边的证据都在字节码里：
  Fabric 的 `CreativeModeTab.<init>` 末尾是 `TABS[id] = this`（`getstatic`/`iload_1`/`aload_0`/`aastore`），
  这正是 `FabricItemGroupBuilder.build()` 先 `fabric_expandArray()` 再构造的意义；
  Forge 的补丁（`forge-1.16.5-36.2.42-sources.jar` 里 `patches/net/minecraft/item/ItemGroup.java.patch`）
  加了 `ItemGroup(String label)` → `addGroupSafe(-1, this)`，扩容 `TABS` 并写入。
  所以 `build()` / `new ItemGroup(label){}` 之后可以丢弃返回值。
- **翻译键不是自由可选的**：Fabric 的 builder 用 `String.format("%s.%s", namespace, path)`，
  Forge 用 `"itemGroup." + label`。适配器要让 `langKeys.itemGroup` 和它生成键的方式对齐。
- `net.minecraft.core.registries` 包不存在（1.19.3+ 才有）；Fabric 侧注册表是
  `Registry.ITEM` / `Registry.BLOCK`，`CreativeModeTab` 仍是 `net.minecraft.world.item` 下的普通类。
- `RegistryObject` 在 1.16.5 是 **`net.minecraftforge.fml.RegistryObject`**
  （`...registries.RegistryObject` 是 1.17+）。
- `com.mojang.logging.LogUtils` 不在 1.16.5 的 jar 里（1.17+）；`org.slf4j` 也不在 Fabric 侧编译类路径上。
  两边都用 `org.apache.logging.log4j.LogManager`。
- `@Mod` 类用**无参构造** + `FMLJavaModLoadingContext.get()`（构造器注入是后来才有的）。
- `BlockBehaviour.Properties.of()` / `AbstractBlock.Properties.of()` 需要 `Material`（无参重载是 1.20+）。
- 数据包目录是**复数**：`data/<ns>/loot_tables/`、`data/minecraft/tags/blocks/`。
- **Java 8 目标不接受 `var`**：javac 报的是「找不到符号: 类 var」，和语言级别毫无关系，
  而且只有真编译过的目标才会暴露。现在 lint 直接拦（`adapter.java < 10` 时任何模板出现 `var` 即报错）。
- **ForgeGradle 6 能直接构建 1.16.5**（实测 6.0.54 + Gradle 8.8 wrapper），
  不需要退回 ForgeGradle 3 / 老 Gradle。
- **`version-facts.mjs` 的 `+<mc>` 后缀回落是对的**：1.16.5 的 Fabric API 写作 `0.42.0+1.16`，
  按 major.minor 回落即可命中，无需读聚合器 POM。

### 1.12.2：又一代际，几乎无共同点

**先确认上游是否存在**：Fabric 从 1.14 才有，`meta.fabricmc.net/v2/versions/loader/1.12.2` 返回 **400**，
Fabric API 也没有任何 1.12 构建 ⇒ **1.12.2 只有 Forge**。这不是框架缺口，是上游事实。

与 1.13+ 的差异是全面的，逐条取证后重写：

- **注册方式**：`RegistryEvent.Register<T>` + `@Mod.EventBusSubscriber`，不是 `DeferredRegister`。
  `javap` 确认 `Mod$EventBusSubscriber` 只有 `{value, modid}`（没有 bus 选择器），
  而 `GameData` 把 `RegistryEvent` post 到 `MinecraftForge.EVENT_BUS` ⇒ 默认配对就是对的。
- **物品配置**：用 setter（`setMaxStackSize` / `setMaxDamage` / `setCreativeTab`，都返回 `Item` 可链式），
  没有 `Item.Properties`。**但 `Block#setHarvestLevel(String,int)` 返回 void**，不能链式，
  所以它在注册函数里调用，而不是放进 settings。
- **没有数据包标签（1.13+）也没有方块战利品表（1.14+）**。适配器**不声明**这两类文件，
  生成器跳过；采集工具由 `setHarvestLevel` 在代码里表达，普通方块自带掉落、无需数据文件。
  这是契约新增的「可选切片」：`templates` 与 `contentPaths` 必须同进同退（lint 强制）。
- **元数据是 `mcmod.info` 不是 `mods.toml`**（1.13+）。
- **资源在 `assets/<ns>/` 下，不是 `data/<ns>/`**（数据包是 1.13+）；贴图目录是**复数**
  `textures/items/`、`textures/blocks/`（1.13 起变单数）；模型 `parent` **不带 `minecraft:` 前缀**。
  全部读真实 1.12.2 client jar 取证。
- **语言键是 `item.<name>.name` 和 `tile.<name>.name`**：`Item.getUnlocalizedName()` 前缀 `item.`，
  `Block` 的是 `tile.`，`ItemStack` 再补 `.name`。方块的 ItemBlock 继承方块的键，一条覆盖两者。
- **`Items.STONE` 不存在**：1.12.2 的物品/方块注册表还没合并（1.13 才合并），石头是 `Blocks.STONE`。
  编译器抓到的。
- 创造模式标签页是 `CreativeTabs`，`getTranslatedTabLabel()` 是 `"itemGroup." + label`（字节码确认），
  与 `langKeys.itemGroup` 一致。

**工具链是这个版本最大的坑**，三条路试了才知道哪条能走：

| 路线 | 结果 |
| --- | --- |
| ForgeGradle 6 + Gradle 8.8 | ❌ FG6 在自己的工具链处理里挂掉（`Project services has been closed`） |
| ForgeGradle 2.3 + Gradle 4.10.3 | ❌ Forge 已不再为 1.12.2 发布 `-userdev.jar`（全站 404） |
| **ForgeGradle 3 + Gradle 4.10.3 + JDK 8** | ✅ **官方 1.12.x MDK 用的就是这条**，实测通过 |

要点：**官方 MDK 写的是 `ForgeGradle:3.+`，不是很多人以为的 2.3**；Gradle 4.10.3 跑不了 Java 9+，
必须用 Java 8 守护进程；`minecraft { }` 块用 `runs { client {...} }` 而不是 FG2.3 的 `runDir`。

**1.12.2 的 jar 里没有 `pack.mcmeta`**，所以 `version-facts.mjs` 取不到 pack_format——
这个值来自官方 MDK 的 `mdk/src/main/resources/pack.mcmeta`（= 3）。工具在这种情况下如实报错而不是猜。

1.19.4 的实测差异（由编译器抓出，逐条已核对）：

- **`Registries.CREATIVE_MODE_TAB` 不存在**。查 Mojang 官方映射表取证：1.19.4 命中 **0** 次，1.20.4 命中 2 次
  ⇒ **创造模式标签页成为注册表是 1.20 才有的**（我原先以为 1.19.3，是错的——编译器是对的）。
  这两个版本要各写一套该年代的自定义标签页代码。
- **`BlockBehaviour.Properties.of()` 在 1.19.4 需要 `Material` 参数**，1.20+ 才是无参。
- **`FabricItemGroup.builder()` 在 1.19.4 签名不同**。

**处理方式：不发布。** 编译不过的适配器会产出**看起来对、实际是坏的**代码——这正是本项目要避免的失败模式，
比「没有这个版本」更糟。所以编译不过的一律移除，而不是标注为「未验证」保留。
（NeoForge 是例外：它生成正确、只是本机无法验证，性质不同。）
1.16.5 一度就是这样被移除的，直到整套模板按年代重写、真编译通过才重新发布。

**下次要做的顺序**：先按该年代的官方文档/示例写 `tabBlock` 与 `blockSettings`，**逐条用 `javap` 或官方映射表核对**，
再编译。不要指望派生脚本能跨代。

## 3. 用 lint 自查

```js
const { parseAdapterRecord, lintAdapter } = require("./packages/core/dist/index.js");
const a = parseAdapterRecord(JSON.parse(fs.readFileSync("packages/adapters/data/<id>.json", "utf8")));
console.log(a.ok ? lintAdapter(a.adapter) : a.issues);
```

lint 会拦住这些**会产出坏文件**的错误：模板键缺失、UI/配方/实体/贴图模板「只实现一半」、路径不含 `{{id}}`/`{{namespace}}`、主类缺 `{{REGISTRY_INIT_CALLS}}` 注入点等。

## 4. 记录陷阱

把第 1 步取证到的反直觉事实写进适配器的 `notes[]`。这些注记会随 `get_adapter` 暴露给智能体——**它们就是「不用再翻文档」的载体**。

## 5. 编译是唯一的终极验证

```bash
node packages/cli/dist/index.js gen <spec.json> -o ./out
cd out/<modId> && ./gradlew build      # 或 scripts/verify-build.mjs
```

**没跑过 `gradlew build` 的目标，一律标注为「仅生成、受限验证」，不得声称已验证。** 本仓库对 NeoForge 1.21.1 就是这么标的（本机网络无法访问 `maven.neoforged.net`）——诚实标注比虚假的绿勾有价值。

编译抓不到的东西（JSON 语义、资源路径、运行期行为）要另外验证：
- 资源路径 → 解 jar 比对（见 `docs/acceptance-report.md` §9b）
- JSON 语义 → 与 jar 内原版数据逐字段对照
- 运行期 → **目前没有任何目标做过**，标注为未验证

## 6. 收尾

- 更新 `README.md` 的适配器表与 `docs/tasks.md`。
- 跑 `python scripts/update_tree.py . --output Tree`。
- 在 `docs/acceptance-report.md` 记录：命令、结果、**以及没做到的部分**。
