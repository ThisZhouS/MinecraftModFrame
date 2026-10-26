---
name: mcmod
description: 用 mcmodkit 把一句提示词变成可编译的 Minecraft mod 工程。适用于「生成一个 mod」「加一个物品/方块/实体/配方/UI/贴图」「换 MC 版本或加载器重新生成」等请求。会先校验 Spec、干跑文件计划，再真实生成，并明确报告哪些部分经过编译验证、哪些没有。
---

# mcmodkit：提示词 → 可编译 mod

本框架把「多版本 × 多加载器」的工程知识沉淀为**适配器数据**（`packages/adapters/data/<loader>-<mcVersion>.json`），
引擎代码零版本分支。因此**不要凭记忆写 Java 或查各版本文档**——把意图写成 Spec，让适配器决定代码形态。

## 铁律

1. **先 `validate` 再 `gen`**：校验是字段级的，报错会列出可用取值。照报错改，不要猜。
2. **先 `--dry-run` 再落盘**：先看文件计划，再真写。
3. **不谎称已验证**：只有跑过 `gradlew build` 的目标才算编译验证。本机仅 JDK 21 ⇒ 只有 Java 21 目标（1.20.5+/1.21.x）可本机编译验证；1.20.1 需 JDK 17，未编译前一律标注「仅生成」。
4. **不要给生成工程里的受管文件做手工修改**：重新生成会覆盖。要改就改 Spec。

## 调用序列

> 命令形式：全局链接后可直接用 `mcmod`（`packages/cli` 暴露了 `bin.mcmod`）；
> 未链接时用 `node packages/cli/dist/index.js` 代替。首次使用前先 `pnpm install && pnpm -r build`。

```
list-versions                       # 选 (mcVersion, loader)；看哪些能力该适配器支持
example -o my-mod.json              # 拿到可用的 Spec 骨架（含各切片示例）
# —— 按用户意图编辑 Spec ——
validate my-mod.json                # 字段级报错 → 就地修正
gen my-mod.json -o ./out --dry-run --json   # 看文件计划
gen my-mod.json -o ./out            # 真实生成
cd out/<modId> && ./gradlew build   # 编译验证（首次需联网）
```

MCP 面同构：`list_versions` / `get_adapter` / `example_spec` / `validate_spec` / `scaffold_mod`。
**MCP 面不执行任何 shell 命令**——构建由使用方自行决定，避免把任意命令执行暴露给模型。

## 意图 → Spec 字段

| 用户说 | 写进 Spec |
| --- | --- |
| 物品 / 方块 | `content.items[]` / `content.blocks[]`（方块有 hardness/resistance/tool） |
| 合成 / 烧炼 / 切石 | `content.recipes[]`（7 种类型；`key`/`ingredients`/`ingredient` 跨字段校验） |
| 进度 / 成就 | `content.advancements[]`（`unlockRecipes`/`hasItems` 至少其一） |
| 生物 / 怪物 | `content.entities[]`（属性、体积、掉落；`model` 复用原版模型） |
| 游戏内界面 | `ui.screens[]`（`key` 绑按键；`lines` 支持字符串或 `{text, style: body/heading/bullet/note/warn/step, target, anchor}`，带 `target` 的行是行内链接（accent 色 + 悬停高亮/下划线 + 目标标题 tooltip，点击打开目标屏并播放按钮点击音，与原版按钮一样松开时才提交、拖走即取消；tooltip 组件按行缓存；`target` 指向自身表示平滑返回顶部，`target: "#anchor"` 配合行上的 `anchor` 表示本屏内平滑跳转并在落点行闪一次高亮；`target: "other#anchor"` 打开另一屏并直接落到该屏的命名行（构造参数传入、首次 init 消费一次；悬停/焦点 tooltip 显示「目标屏标题 › 落点章节标题」）；`↑`/`↓` 在正文链接间移动焦点（焦点行自动滚入视口时上下留一行上下文），`Enter` 打开，`Tab` 交还原版控件，鼠标按下退出焦点，滚轮/PageUp/PageDown/Home/End 手动滚动也退出焦点；焦点行复用同一缓存的 tooltip；正文仍有内容的一侧以面板色 4px 渐隐提示可滚动方向；关闭带 120ms 淡出（slide 主题下移），过渡期间输入锁定；面板有双层投影、按钮屏有页脚分隔线，标题过长截断后悬停标题带可看全文；`note` 行用主题弱化色 + 引用竖线呈现提示/注意事项，`warn` 行沿用同样几何但用主题暖色警告色与 2px 加粗竖线拉开「警告」与「提示」的层次，`step` 行同缩进、首行用 accent 色右对齐画出自动编号（每个 heading 重置计数）适合写操作步骤；Ctrl+F 打开屏内搜索条（输入即查、大小写不敏感，Enter 循环命中并闪烁落点行，右侧 n/m 计数，Esc 先关查找条；获焦时独占键盘，输入开关按键不误关屏、点按不穿透到被遮挡的链接；命中行整行染色——全部命中铺 accent 弱透明底、当前落点行即时强化，折行一起染、一行多处命中合并为一档；`Shift+Enter` 反向循环同规回绕，点击右侧计数区等价 Enter 前进、悬停计数区提示两键；查找条会话记忆——重开恢复上次查询并即时重查，新查询从当前阅读行起查、无更下方命中则回卷文档首条；命中分布刻度——搜索激活时滚动条轨道外缘为每个命中行画一道刻度、当前命中全亮加宽，悬停刻度显示该命中行文本、点击跳到该命中并同步循环序号；查找条打开时正文整体下移一个条带高度（绘制偏移/点击行换算/滚动范围同步扩展并即时补偿、关条还原），跳转落点与文档头部第 0 行都在条带下方完整可读）；拖动滚动条保留抓取偏移、滑块不跳动，点轨道按距离滑行过去，绘制/命中/拖动共用同一几何；滚动条轨道按 heading 画出章节刻度、当前章节高亮，构成文档地图，刻度可悬停显示章节名并点击跳转，`Ctrl+↑`/`Ctrl+↓` 可直接跳到上/下一章节并在落点高亮；长距离跳转按距离延长滚动动画（140→280ms），滚轮/翻页仍保持基础节奏，翻页保留一行重叠；绑定按键在指南已打开时再次按下会沿关闭淡出收起而不是叠屏；链接热区与实际文字宽度一致；窗口缩放/从子屏返回按逻辑行锚定阅读位置，本次游戏会话内重开同一屏幕回到上次滚到的行），heading 前自动留区块空白，自动换行/平滑滚动、阅读位置记忆；`theme`（vanilla/dark/light/contrast 高对比）/`accent`/`align`；按住链接时底色加深、下划线变粗，拖走即恢复悬停态；`animation` fade/slide；`buttons` 跨屏导航（每行按钮宽度按实时面板宽度收缩，窄面板下不溢出边框）；`contentsFor: "<screen id>"` 自动目录屏：把目标屏所有 heading 生成为正文顶部的深链条目（复用显式 anchor，未声明的合成 `section_N` 并避开已用名字；条目复用目标标题自己的语言键，改标题即改目录；目标缺失/自指/目标无 heading/链式目录均字段级报错）；面板按窗口自适应，`width`/`height` 是偏好尺寸，长标题自动省略，窗口重建不重播动画）。适用于 Fabric 1.20.4+、Forge 1.20.1+、NeoForge 1.20.4+ 的适配器 |
| **贴图** | 顶层 `"textures": true`，内容级 `texture: { style, palette, seed }` |
| 数据生成入口 | 顶层 `"datagen": true`（只给入口与接线，provider 自己写） |

### 贴图要点

- 风格：`solid` / `noise` / `speckle` / `ore` / `gradient` / `border` / `planks`。物品默认 `speckle`，方块默认 `noise`。
- 省略 `palette` 会由内容 id 哈希出稳定色相；换 `seed` 可在保留配色的前提下重掷图案。
- 贴图是**确定性**的：同一份 Spec 永远产出逐字节相同的 PNG ⇒ 改图体现为 diff，可复核。
- 产物路径与模型引用自动对应（`item/<id>` → `textures/item/<id>.png` 等）。实体贴图是 64×32 纯色占位。

## 新增一个 MC 版本 / 加载器

**不要改引擎代码。** 复制一份现有适配器 JSON 改数据即可；适配器自带 `notes` 记录该版本的陷阱。
新增后用 `lintAdapter` 自查（契约要求：模板键齐全、UI/配方/实体/贴图模板「全有或全无」、路径含 `{{id}}`/`{{namespace}}`），
再生成一个最小工程跑 `gradlew build`——**编译是唯一的终极验证**。

## 完成时怎么汇报

说清楚三件事：① 生成了什么（文件数、关键路径）；② **哪些经过了什么级别的验证**（编译通过 / 仅生成 / 未运行）；③ 遗留缺口。
本项目的一贯标准是「绝不谎称已验证」——没跑过的就说没跑过。
