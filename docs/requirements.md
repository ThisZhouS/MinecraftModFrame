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
| FR-14 | UI 生成：按 Spec 生成游戏内 Screen（标题/尺寸/文本行及其样式/行内链接/主题/动画/按钮导航），并按声明生成打开它的按键绑定与客户端入口 | 生成 `client/<Mod><Id>Screen.java` + `client/<Mod>Client.java`；标题/每行/按钮/按键名/按键分类语言键齐全；同 Spec 在全部 9 个 UI 适配器真实编译通过；面板按窗口尺寸响应式收缩（偏好尺寸不强制），长标题截断加省略号，窗口重建不重复控件、不重播动画、不跳滚动位置；正文行支持 body/heading/bullet/note/warn/step 六种样式，续行保留缩进，heading/bullet 不重复画标记、note 的引用竖线覆盖整段、warn 用主题暖色警告色与 2px 加粗竖线同 note 拉开层次、step 在首行以 accent 色右对齐绘制自动编号（编号在每个 heading 处重新计数，两位数右对齐不压正文），heading 前自动留出区块空白（首行/连续 heading 除外）；支持 Ctrl+F 屏内搜索（面板顶部查找条，输入即查、大小写不敏感，新查询的初始命中从当前阅读行起算（无更下方的命中则回卷文档首条）并立即滚动闪烁，Enter 在命中集内循环跳转，右侧 n/m 计数无命中时取弱化色；Esc 先关查找条再按才关屏；查找条获焦时独占键盘——输入开关按键不误关屏、方向键/退格归文本框，点按查找条区域不穿透到被遮挡的行内链接与滚动条命中区，悬停高亮同样抑制；窗口缩放丢弃查找条；占位/提示文本走适配器 `langKeys.screenSearch` 语言键；命中行在正文里即时染色——全部命中铺主题 accent 弱透明底、Enter/输入将落到的那行用更强一档 alpha 标出，随输入与循环同步更新，一行内多处命中合并为同一档，落点闪烁与链接悬停仍叠在染色之上，查找条循环增强：`Shift+Enter` 反向循环（同样回绕，`prevSearchMatch` 用 `(index + size - 1) % size` 保持非负），点击右侧 n/m 计数区等价 Enter 前进（条带其余部分仍是文本框的），悬停计数区显示两键说明 tooltip——tooltip 链把计数区分支放在链接之前（计数区叠在首行链接之上），说明文本走 `langKeys.screenSearchCycle` 语言键、模板消费 `{{SCREEN_SEARCH_CYCLE_KEY}}` 占位符，硬编码英文被 lint 拦截；查找条会话记忆：重开自动恢复上次查询并即时重查（关闭查找条或重建屏幕都不清该值，空查询不因重开回填）；命中分布刻度：搜索激活时滚动条轨道外缘（与左侧章节刻度相对的一侧）为每个命中行画一道短刻度并随输入/循环即时更新——当前 Enter 落点全亮且加宽、其余半透明，命中的全文分布不滚动即可判读；命中刻度交互化：悬停的刻度加宽全亮并弹出该命中行文本（tooltip 链位于计数区之后、链接之前，标题 tooltip 让位），点击直接跳到该命中并把循环序号同步到它（随后 Enter/Shift+Enter 从该命中继续；查找条覆盖的首行刻度经条带分支仍可点击，非命中行处仍走轨道滑行），刻度锚点固定不随轨道 hover 加宽而位移；查找态正文内边距：查找条打开时正文整体下移一个条带高度（单点判定 `bodyPad()` 返回 `SEARCH_BAR_CLEARANCE = 24`、关条返回 0），绘制偏移与首行回扫、点击的行换算（含涂绘区间守卫：截断求整会把正文上缘的点击归到第 0 行，该行行顶未达即拒绝）与滚动范围（`maxScroll()` 加 pad）全部共用它，开条以 `scrollTo(scrollOffset + pad, false)` 立即补偿、关条以 `scrollTo(scrollOffset − 24, false)` 立即还原，滚动条轨道/滑块/命中刻度随新滚动范围同步——文档头部第 0 行与 Home 在查找时也完整落在条带下方（原单点落点钳制对头部因 0 钳制而无效，已被本内边距取代），跳转落点回归视口顶目标并自然落在条带之下（`scrollToLine` 不再钳制））；带 `target` 的行是行内链接（accent 色 + 悬停背景/下划线 + 目标标题 tooltip，`screen#anchor` 深链的 tooltip 追加落点行文本「屏幕 › 章节」，点击打开目标屏并以当前屏为父屏；`target` 为 `#anchor` 时平滑滚动到本屏命名行并让落点行高亮淡出 600ms；`target` 为 `screen#anchor` 时打开目标屏并在首次 `init()` 落到该命名行（同样淡出，且不重复触发）；`target` 指向自身时改为平滑回到本屏顶部；点击播放原版 UI 按钮音（与原版按钮一样松开时提交：按下只记录待打开行，松手仍在同一行才打开，拖走、滚动或按键都会取消；按住且指针仍在链接上时底色加深、下划线加粗，拖走即恢复悬停态）；拖动滚动条保留按下时的抓取偏移（点轨道才居中滑块，并按距离滑行到该位置而非瞬移），绘制/命中/拖动共用同一滑块几何；滚动条轨道左侧按 heading 行画出按比例的章节刻度（每个标题一个 1px 刻度，当前视口顶部所在章节全亮加宽、其余半透明），长文档不看正文也能判断章节分布；刻度可悬停（全亮加宽并显示章节标题），点击直接跳到该章节（复用 anchor 落点高亮与自适应时长，优先于滚动条拖动）；`Ctrl+↑`/`Ctrl+↓` 跳到上/下一个标题（落点行复用 anchor 的 600ms 高亮淡出，首/尾章节与无标题时不误触链接焦点）；anchor/深链/Ctrl 章节/Home/End/返回顶部等长距离跳转按距离自适应动画时长（140ms 起、每 12px 加 1ms、280ms 封顶），滚轮/翻页/键盘链接自动滚动保持基础时长，`PageUp`/`PageDown` 每次翻页保留一行重叠以免跨页丢句；绑定按键在屏幕已打开时再次按下沿关闭淡出收起原屏幕（原版在任意 Screen 打开时会在派发 KeyMapping 前返回，因此由屏幕自身在 keyPressed 中按生成期写入的 TOGGLE_KEY 识别该键；tick 侧仅在 client.screen == null 时构造屏幕），不叠第二份；命中与悬停计入滚动偏移和 slide 位移并逐帧更新，链接热区与该行实际绘制的文字宽度一致（行内空白不触发）；窗口缩放/从子屏返回按逻辑行锚定阅读位置（重新换行后仍停在同一段文字），本次游戏会话内关闭再打开同一屏幕回到上次滚到的行；tooltip 组件在 `init()` 按行缓存，无链接屏幕跳过命中测试；行内链接也可用 `↑`/`↓` 移动焦点、`Enter` 打开，焦点行带 accent 标记并自动滚入视口（上下各留一行上下文，长链接优先保住首行），`Tab` 仍切换页脚控件，鼠标按下退出键盘焦点，滚轮/`PageUp`/`PageDown`/`Home`/`End` 手动滚动也退出焦点（滚出视口的焦点行不再响应 `Enter`，也不会残留边缘 tooltip）；焦点行复用缓存显示目标标题 tooltip；正文视口仍有内容的一侧以面板色 4px 渐隐提示滚动方向，无溢出侧不绘制；fade/slide 主题关闭时先做 120ms 淡出（slide 同时下移），完成帧再返回父屏，过渡期间输入锁定，none 主题保持立即关闭；面板带两层投影、有按钮时页脚上方有分隔线，标题被截断时悬停标题带显示完整标题 tooltip） | ✅ Fabric 1.20.4/1.21.1/1.21.4、Forge 1.20.1/1.20.4/1.21.4、NeoForge 1.20.4/1.21.1/1.21.4 |
| FR-15 | UI 参数化：尺寸、文本、行样式、行内链接、按键、主题、对齐、动画、跨屏导航都是 Spec 数据，改 Spec 重生成即改 UI | `ui.screens[].width/height/lines/key/theme/accent/align/animation/buttons/contentsFor`；`lines` 接受字符串或 `{text, style, target, anchor}`（字符串归一化为 body）；缺省值补齐；非法键/非法样式、未声明 target（按钮与行内链接，含 `screen#anchor` 的前半段）、未声明的 `#anchor`、目标屏上未声明的跨屏 anchor、重复 anchor、close 带 target、按钮自跳转、跨屏重复 id/重复键均字段级报错；行内链接 `target` 指向自身表示返回顶部，`#anchor` 表示本屏跳转，`screen#anchor` 表示跨屏落到命名行（tooltip 组合目标屏标题与该行自己的语言键），均不视为错误；`contentsFor` 把目标屏所有 heading 生成为本屏顶部的深链条目（复用显式 anchor，缺省合成 `section_N` 并避开已用名字），条目复用目标标题自己的语言键（改标题即改目录，语言文件无重复文案），目标缺失、指向自身、目标无 heading、链式目录均字段级报错；按钮布局随实时面板尺寸重排，每行按钮宽度按面板宽度收缩（最宽 100px），窄窗口下不会溢出边框 | ✅ 单测 + 编译验证 |
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
- 不做附魔生成，不做 Blockbench 模型导入（列入后续方向）。
- UI 只做声明式面板（文本/主题/按钮导航），不做输入框、列表控件与自定义 GUI 贴图。
- 不生成贴图 PNG（在生成工程 README 中明确提示需自备 16×16 贴图）。
- 不做 mod 发布/分发，不做游戏内机器人。
- 不承诺覆盖全部版本：未覆盖组合明确报「不支持」。

## 5. 待定问题（需用户决策）

1. ~~首发是否同时提供 NeoForge 1.21.1 适配器？Forge 1.20.1 是否作为「仅生成」目标进入？~~ **已决**：三个适配器全部提供（fabric-1.21.1 / neoforge-1.21.1 / forge-1.20.1）；其中 Fabric 与 Forge 已真编译验证，Forge 1.20.1 **不是**「仅生成」（经 Adoptium JDK 17 实测可编译），NeoForge 因网络阻塞暂为「未编译验证」。
2. HTTP API 是否需要 token 鉴权（当前默认 127.0.0.1、无鉴权）？
3. 默认命名空间与包名推导规则（当前：`modId` 即命名空间，包名默认 `com.<modId>`）。
