# mcmodkit（工作名）

面向 AI 智能体的 Minecraft 模组开发框架：把「多版本 × 多加载器」的工程知识沉淀为**版本适配数据层**，以 **CLI / MCP / HTTP API** 三个面供 codex、claude、DeepSeek Harness 等智能体调用，从一份 JSON Spec 生成**可编译**的 mod 工程，并按反馈迭代调整。

```
ModSpec (JSON)  ──validate──▶  适配器数据 (版本×加载器)  ──plan──▶  文件计划  ──emit──▶  可构建的 mod 工程
                                        ▲                                              │
                                        └──────── 编译验证（gradlew build）◀───────────┘
```

## 快速开始（CLI）

```bash
pnpm install && pnpm -r build

# 1) 看看支持哪些目标
node packages/cli/dist/index.js list-versions

# 2) 导出一份示例 Spec，然后按需修改
node packages/cli/dist/index.js example -o my-mod.json

# 3) 干跑：先看将要写入哪些文件
node packages/cli/dist/index.js gen my-mod.json -o ./out --dry-run --json

# 4) 真正生成（受管文件可重复覆盖，你自己的文件不会被碰）
node packages/cli/dist/index.js gen my-mod.json -o ./out

# 5) 构建生成的 mod（需要 JDK，首次会联网下载依赖）
cd out/my-mod && ./gradlew build      # Windows: gradlew.bat build
```

## 三个接入面（同一 core，零逻辑复制）

| 面 | 入口 | 典型用途 |
| --- | --- | --- |
| CLI | `packages/cli`（`list-versions` / `adapter` / `example` / `validate` / `gen`） | 智能体一次性调用、人类手动使用；`--json` 统一信封，退出码 0/1/2/3/4/5 语义化 |
| MCP | `packages/mcp-server`（stdio，MCP SDK v2） | 智能体把它作为工具集接入：`list_versions`、`get_adapter`、`validate_spec`、`example_spec`、`scaffold_mod` |
| HTTP API | `packages/api`（`node:http`，默认 127.0.0.1:7420） | 平台集成：`GET /api/versions`、`POST /api/validate`、`POST /api/generate` 等 |

MCP 工具**不执行任何 shell/构建命令**：构建由使用方自行决定，避免把任意命令执行暴露给模型。

## 适配器（版本事实的唯一存放处）

适配器 = 一个 (MC 版本 × 加载器) 的 JSON 数据文件：构建事实（Java/映射/Gradle/插件版本）、文件骨架、注册代码模板、资源路径约定、陷阱注记。**引擎代码不含任何版本分支**。

| 适配器 | MC | 加载器 | Java | 状态 |
| --- | --- | --- | --- | --- |
| `forge-1.12.2` | 1.12.2 | Forge (14.23.5.2864, ForgeGradle 3.+, Gradle 4.10.3) | 8 | ✅ **真编译通过**（产出 jar；MCP 名 + 无标签/无战利品表，见下） |
| `fabric-1.16.5` | 1.16.5 | Fabric (loader 0.19.5) | 8 | ✅ **真编译通过**（产出 jar） |
| `fabric-1.19.4` | 1.19.4 | Fabric (loader 0.19.5) | 17 | ✅ **真编译通过**（产出 jar） |
| `fabric-1.20.4` | 1.20.4 | Fabric (loader 0.19.5) | 17 | ✅ **真编译通过**（产出 jar） |
| `fabric-1.21.1` | 1.21.1 | Fabric (loader 0.19.5) | 21 | ✅ **真编译通过**（产出 jar） |
| `fabric-1.21.4` | 1.21.4 | Fabric (loader 0.19.5) | 21 | ✅ **真编译通过**（产出 jar） |
| `forge-1.16.5` | 1.16.5 | Forge (36.2.42, ForgeGradle 6.0.54, Gradle 8.8) | 8 | ✅ **真编译通过**（产出 jar；该版本用 MCP 名，见下） |
| `forge-1.19.4` | 1.19.4 | Forge (45.4.5, ForgeGradle 6.0.54, Gradle 8.8) | 17 | ✅ **真编译通过**（产出 jar） |
| `forge-1.20.1` | 1.20.1 | Forge (47.4.10, ForgeGradle 6.0.54, Gradle 8.8) | 17 | ✅ **真编译通过**（产出经 reobfJar 的 jar） |
| `forge-1.20.4` | 1.20.4 | Forge (49.2.9, ForgeGradle 6.0.54, Gradle 8.8) | 17 | ✅ **真编译通过**（产出 jar） |
| `forge-1.21.4` | 1.21.4 | Forge (54.1.18, ForgeGradle 7.0.40, Gradle 9.5.1) | 21 | ✅ **真编译 + 真运行通过**（产出 jar；专用服务器带 mod 启动） |
| `neoforge-1.20.4` | 1.20.4 | NeoForge (20.4.251, ModDevGradle 2.0.147) | 17 | ✅ **真编译 + 真运行通过**（产出 jar；专用服务器带 mod 启动，见验收报告 §16） |
| `neoforge-1.21.1` | 1.21.1 | NeoForge (21.1.250, ModDevGradle 2.0.147) | 21 | ✅ **真编译 + 真运行通过**（产出 jar；专用服务器带 mod 启动） |
| `neoforge-1.21.4` | 1.21.4 | NeoForge (21.4.157, ModDevGradle 2.0.147) | 21 | ✅ **真编译 + 真运行通过**（产出 jar；专用服务器带 mod 启动） |

**注意 `forge-1.16.5` 用的是 MCP 名**（`net.minecraft.item.Item`），其余目标用 Mojang 官方名——
这不是笔误：ForgeGradle 在该版本产出的构件虽然叫 `..._mapped_official_1.16.5.jar`，内容却是 MCP 命名。
判据一律是 `javap` 真实构件，不是构件名。详见 `docs/adding-a-version.md` §2.5。

**`forge-1.21.4` 走 ForgeGradle 7 线**：Forge 1.21.4 的开发启动目标（`forge_userdev_server`）只认 FG7 合并后的输出目录，
FG6 会在运行时失败并报 `constructed 0 mods`（编译却通过）。因此该适配器钉 **FG 7.0.40 + Gradle 9.5.1**，并在
`gradle.properties` 里启用 `net.minecraftforge.gradle.merge-source-sets=true`；FG7 的 Mavenizer 需要 **JDK 25**
（生成的 `settings.gradle` 用 foojay resolver 自动下载，离线时用 `org.gradle.java.installations.paths` 注册）。

**`forge-1.12.2` 没有对应的 Fabric 目标，这是上游事实不是缺口**：Fabric 从 1.14 才开始，
`meta.fabricmc.net` 对 1.12.2 返回 400，Fabric API 也没有任何 1.12 构建。
该版本还缺 1.13+ 才有的数据包标签与 1.14+ 才有的方块战利品表，所以适配器**不声明**这两类文件，
生成器直接跳过（而不是产出游戏会忽略的文件）——采集工具改由 `Block#setHarvestLevel` 在代码里表达。

新增一个目标 = 新增 `packages/adapters/data/<loader>-<mcVersion>.json`（可用 `mcmod adapter <id> --templates` 参考现有适配器），无需改动引擎。

**适配器还带 `references[]`——该目标的权威来源**（官方文档 / 映射查询 / 迁移指南 / 示例工程）。它随 `notes` 一起通过 `mcmod adapter <id>` 与 MCP `get_adapter` 到达智能体：**缺某个版本事实时，目标自己会告诉你该去哪儿查**，而不是回去翻训练数据。取证流程见 `docs/adding-a-version.md`。

## 生成的工程长什么样

```
out/my-mod/
├── gradlew / gradlew.bat / gradle/wrapper/…      # 自带 wrapper，脱离本框架也能构建
├── settings.gradle / build.gradle / gradle.properties
├── README.md                                     # 构建/贴图/迭代说明
└── src/main/
    ├── java/com/examplemod/ModMain*.java         # 主类 + 物品/方块注册类
    ├── java/com/examplemod/client/…              # UI：<Mod><Id>Screen + 按键/客户端引导（声明 ui.screens 时）
    └── resources/
        ├── fabric.mod.json | META-INF/neoforge.mods.toml, pack.mcmeta
        ├── assets/<ns>/{lang,models,blockstates}
        └── data/<ns>/loot_table/…, data/minecraft/tags/block/…   # 1.21+ 单数目录
```

## 模型形态（可选）

```jsonc
"content": {
  "items":  [ { "id": "ruby_pick",  "model": "handheld" } ],   // 默认 generated（平铺图标）
  "blocks": [ { "id": "ruby_pillar", "model": "cube_column" } ] // 默认 cube_all（六面同图）
}
```

`generated` / `handheld`（工具、武器握持姿态）与 `cube_all` / `cube_column`（原木、柱子：顶底与侧面分开）。**模型形态不改变贴图路径**——仍是 `item/<id>.png` / `block/<id>.png`。模型 JSON 本体是适配器数据（`itemModelHandheld` / `blockModelColumn`），引擎只做选择；适配器没有该模板时给出可修复的报错而非产出坏文件。

## 真实图像模型（AI 生图，可选）

上面那套是**本地程序化绘制**；要真正调用图像模型，把 `textureProvider` 设为 `image-api`，并在内容上写 `texture.prompt`：

```jsonc
{
  "textures": true,
  "textureProvider": "image-api",
  "content": {
    "items": [
      { "id": "mk2", "texture": { "prompt": "Minecraft pixel art item icon: a wooden fishing rod...", "size": 32 } }
    ]
  }
}
```

```bash
export MCMODKIT_IMAGE_API_URL="https://ark.cn-beijing.volces.com/api/plan/v3/images/generations"
export MCMODKIT_IMAGE_API_KEY="<your key>"
export MCMODKIT_IMAGE_MODEL="doubao-seedream-5.0-lite"
node packages/cli/dist/index.js gen examples/mk2-fishing-rod-forge-1.20.1.json -o out
```

- **凭据只从环境变量读**（`MCMODKIT_IMAGE_API_URL` / `_API_KEY` / `_MODEL` / `_SIZE` / `_FORMAT` / `_TIMEOUT`）。Spec 是可提交、可分享的产物，**绝不能带密钥**——框架会在缺 key 时直接报错而不是悄悄降级。
- 模型出图是**大尺寸不透明**的（实测 1920×1920、RGB 无 alpha），管线自动完成：解码 PNG → 抠背景（模型常把"透明"画成棋盘格）→ 去杂点 → **裁剪到主体** → 保比例缩放到 16/32/64 → 编码成带 alpha 的 PNG。
- **裁剪到主体是关键**：生成的图里主体只占半个画幅，整幅缩到 16px 会把像素浪费在背景上。**去杂点**同样必要——两个角落的杂点会把包围盒撑满整幅，主体被缩成缩略图。
- 没有 `prompt` 的内容仍走本地绘制；`--dry-run` **不联网**（干跑不该花钱）。
- 网络步骤在 `planGeneration` **之外**：生成计划始终是同步、无 I/O 的纯函数，图像字节由调用方预取后传入——这样生成器可离线测试。
- `size` 建议 32：实测 1920px 的图缩到 16px 会把钓线这类细特征平均掉，32px 能保住。

## 外部图片（本地 PNG，可选）

不想生图、只想用现成美术：把 `textureProvider` 设为 `file`，内容上写 `texture.file`（本地 PNG 路径）：

```jsonc
{
  "textures": true,
  "textureProvider": "file",
  "content": {
    "items":  [ { "id": "ruby", "texture": { "file": "art/ruby.png", "size": 16 } } ],
    "blocks": [ { "id": "ruby_pillar", "texture": { "file": "C:/art/pillar.png" } } ]
  }
}
```

- CLI 里**相对路径**相对于 spec 文件所在目录解析（`-` 读 stdin 时相对于当前目录）；MCP `scaffold_mod` 与 HTTP `/api/generate` **只接受绝对路径**（服务端不知道 spec 文件在哪）。
- 走同一条转换管线（解码 → 抠背景 → 裁主体 → 缩放），所以大图、白底、带水印的素材也能直接进。
- 文件不是可用的 8-bit RGB/RGBA PNG、或超过 20 MiB 时，报 `SPEC_INVALID` 并指出具体文件；没有 `file` 的内容仍走本地绘制；`--dry-run` **不读文件**。

## 物品行为（可选）

框架默认产出裸 `Item`。要真正有行为（比如钓鱼竿要能抛竿），用 `behavior` 选一个适配器提供的构造式：

```jsonc
{ "id": "mk2", "behavior": "fishing_rod", "model": "handheld", "maxCount": 1, "durability": 128 }
```

产出 `ITEMS.register("mk2", () -> new FishingRodItem(new Item.Properties().stacksTo(1).durability(128)))`，并按需注入 `import net.minecraft.world.item.FishingRodItem;`（**只导入用到的**）。类名与构造式是**适配器数据**（`itemBehaviors` / `itemBehaviorImports`），引擎不认识任何 Minecraft 类名；未知 behavior 给出列出可用取值的报错。

## 贴图生成（生图，可选，默认关闭）

```jsonc
{
  "textures": true,                       // 开关；打开后为每个物品/方块/实体生成 PNG
  "content": {
    "items": [
      { "id": "ruby", "texture": { "style": "speckle", "palette": ["#b91c1c", "#7f1d1d", "#f87171"] } },
      { "id": "charged_ruby", "texture": { "style": "gradient", "palette": ["#b91c1c", "#fbbf24"] } }
    ],
    "blocks": [
      { "id": "ruby_ore", "texture": { "style": "ore", "palette": ["#6b7280", "#dc2626"] } }
    ]
  }
}
```

- 风格：`solid` / `noise` / `speckle` / `ore` / `gradient` / `border` / `planks`；**物品默认 `speckle`，方块默认 `noise`**。
- 省略 `palette` 时由内容 id 哈希出稳定色相（同名同色，永不漂移）；`seed` 可在不换配色的前提下重掷图案。
- 产物路径与模型引用**严格对应**：`layer0: <ns>:item/<id>` → `assets/<ns>/textures/item/<id>.png`；方块 `all: <ns>:block/<id>` → `textures/block/<id>.png`；实体渲染器的 `textures/entity/<id>.png` 生成为 **64×32**（原版猪/牛/鸡/羊的 UV 版式），否则每个 UV 都会采样错像素。
- **确定性**：同一份 Spec 永远产出逐字节相同的 PNG（seeded mulberry32，无 `Math.random`），所以改图会体现为 diff，而不是不可复现的噪声。
- 实现是**参数化程序化绘制**（`packages/core/src/texture.ts` + 零依赖 PNG 编码器 `png.ts`，仅用 `node:zlib`），离线、瞬时、可复现。要接真实图像模型，只需替换 `paintTexture`，Spec 字段与落盘链路不变。
- 默认关闭的原因：生成的 PNG 是**受管文件**，重生成会覆盖——手工美术不会被误伤。关闭时工程与之前完全一致（实测 45 → 40 个文件，差集恰为 5 个 PNG）。
- 实体的 64×32 图是**纯色占位**（渲染成单色生物），自定义 UV 美术仍需自备；这是刻意取舍，见下。

## UI 生成：一份 Spec 描述游戏内界面

```jsonc
"ui": {
  "screens": [
    {
      "id": "guide",
      "title": "Example Mod Guide",   // 缺省时由 id 推导
      "key": "K",                     // 单个大写字母；省略则只生成类、不绑定按键
      "width": 260, "height": 150,    // 面板最小尺寸；页脚按钮放不下时自动增高
      "theme": "dark",                // vanilla / dark / light / contrast（高对比），缺省 vanilla
      "accent": "#11AABB",            // 覆盖主题主色（分隔条/滚动条），缺省取主题色
      "align": "center",              // left / center，缺省 left
      "animation": "slide",           // none / fade / slide（180ms ease-out），缺省 slide
      "lines": [                        // 字符串 = 正文；对象形式带样式角色
        "第一行（过长自动换行，超出面板自动可滚动）",
        { "text": "Getting started", "style": "heading", "anchor": "start" },  // accent 色 + 左侧竖线；anchor 可被 "#start" 跳转
        { "text": "Mine ruby ore", "style": "bullet" },     // 缩进 + 方块标记，续行保持缩进
        { "text": "Skip to recipes", "target": "#recipes" }, // 行内链到本屏 anchor：平滑滚动到该行
        { "text": "Open Settings", "target": "settings" },  // 行内链接：accent 色 + 悬停下划线，点击打开
        { "text": "Back to top", "target": "guide" }        // 指向自身：平滑回到本屏顶部，不打开新屏
      ],
      "buttons": [                    // 最多 4 个、每行 2 个；缺省给一个 Done
        { "action": "open", "target": "settings", "label": "Settings" },
        { "action": "close", "label": "Close" }
      ]
    },
    { "id": "settings", "title": "Settings", "theme": "light", "lines": ["..."] },
    { "id": "contents", "title": "Contents", "contentsFor": "guide" } // 自动目录：guide 的每个 heading 生成一个条目
  ]
}
```

产出：`client/<Mod><Id>Screen.java`（每个屏幕一个 Screen 子类）、`client/<Mod>Client.java`（按键注册与打开逻辑）、标题/每行/按钮/按键名/按键分类 5 类语言键。三个加载器各自用**自己的**事件与入口（Fabric 的 `ClientModInitializer` + `fabric.mod.json` client entrypoint；Forge/NeoForge 的 `@Mod.EventBusSubscriber`/`@EventBusSubscriber` + `RegisterKeyMappingsEvent`），引擎只做装配。

交互与性能：

- **按键开关**：绑定键在指南已打开时再次按下会沿同一 120ms 淡出关闭，而不是叠一层新屏幕。原版 `KeyboardHandler` 在任意 Screen 打开时会在派发 `KeyMapping` 之前返回（对 Forge 1.20.1 字节码核实过），所以打开的屏幕在 `keyPressed` 里用生成期写入的 `TOGGLE_KEY`（Spec 键的 GLFW 码，未绑定按键为 -1）识别自己的开关；关闭路径与 ESC 相同，仍走淡出与输入锁定。tick 侧只在 `client.screen == null` 时构造屏幕，快速连按不会重建已打开的界面；九个适配器共用同一方案。
- **换行与滚动**：正文用 `Font.split` 按面板内宽换行；滚轮、`PageUp`/`PageDown`/`Home`/`End` 平滑滚动（基础 140ms ease-out，远跳最多 280ms），拖动右侧滚动条时即时跟手（按下滑块不会跳动、只保留抓取时的相对位置；点轨道才把滑块居中，并按距离滑行过去而不是瞬移；滚动条仅在内容超高时出现，悬停/拖动时加宽）。滚动条左侧还按 heading 的位置画出章节刻度，构成一张文档地图：当前视口顶部所在章节的刻度全亮加宽，其余半透明，长 guide 不看正文也能判断章节分布与所处位置。刻度同时是导航：悬停时该刻度全亮加宽并显示章节标题，点击直接跳到该章节（落点高亮与远跳时长同 anchor，且优先于滚动条拖动）。`Ctrl+↑`/`Ctrl+↓` 直接跳到上/下一个章节，落点行像 anchor 跳转一样高亮淡出，连续按键可跨多章；没有标题或已到首/尾章节时组合键不会误触链接焦点。anchor、深链、Ctrl 章节、`Home`/`End` 与「返回顶部」这类长距离跳转按距离延长时长（每 12px 加 1ms，140ms 起、280ms 封顶），滚轮与翻页仍保持基础节奏（翻页保留一行重叠，跨页不丢句），远跳不再像瞬移。正文上/下仍有未显示内容时，对应边缘画 4px 面板色渐隐，颜色随主题、无溢出侧不画，长文档一眼看出还能往哪滚。换行结果与行宽在 `init()` 里缓存一次，渲染只画视口内的行，长页面与短页面代价相同；背景每帧只画一次。
- **导航**：`open` 按钮跳到 Spec 中已声明的屏幕（未声明的 target 直接报 `SPEC_INVALID`），子屏幕持有父屏幕，按钮关闭或 ESC 返回父屏幕，父屏幕的阅读位置按逻辑行保留（重新 `init()` 只做钳制、不归零）；无父屏幕时返回游戏。关闭不是硬切：`fade`/`slide` 主题用 120ms 淡出收尾（slide 同时下移），淡出满帧才真正切屏，期间鼠标/键盘输入被吞掉，避免等待切换时误开新屏；`none` 主题保持立即关闭。
- **行内链接**：正文项可带 `target`（同 Spec 中已声明的屏幕 id），该行以 accent 色绘制并成为可点击链接；鼠标悬停时行背景以低透明度 accent 高亮、画下划线，并弹出目标屏标题的 tooltip（标题取自生成的标题语言键，随语言文件本地化），点击打开目标屏并以当前屏为父屏，返回时仍回到原阅读位置。链接按已缓存的逻辑行命中（自动换行出的续行同样可点，命中区与该片段的实际文字宽度一致，行内空白不再触发打开），命中与悬停都计入滚动偏移和 slide 入场位移，并在每帧重算——平滑滚动时下划线会跟着文字走，不会停在旧行。tooltip 的 `Component` 在 `init()` 里按逻辑行缓存，悬停帧只做一次列表读取、不分配对象；没有链接的屏幕直接跳过命中测试。`target` 还可以是 `#anchor`：被链接行用 `anchor` 命名后，点击会像滚轮一样平滑滚动到该逻辑行（`lineStarts` 缓存行号，续行不会滚偏），落点行随即以 accent 高亮淡出 600ms，读者一眼看到跳到了哪里；重复 anchor 与未声明的 `#anchor` 都在生成期字段级报错。`target` 指向自身时是长文档的「返回顶部」：点击触发与滚轮相同的平滑滚动，不打开新屏、不弹目标标题 tooltip；未声明的跨屏 `target` 同样在生成期字段级报错。`target` 写成 `screen#anchor` 时是跨屏深链：打开目标屏的构造参数携带 anchor 的逻辑行，目标屏首次 `init()` 在行缓存就绪后平滑滚到该行并触发同样的 600ms 落点高亮；深链的悬停/焦点 tooltip 会显示「目标屏 › 落点行」（取目标屏标题键与被锚定行自己的语言键，随语言文件本地化），点之前就知道会落到哪一节；`screen` 与当前屏同名时等价于 `#anchor`，不会打开重复屏幕。点击任意行内链接会播放原版按钮的 UI 点击音（与页脚按钮一致），返回顶部时也有明确的听觉反馈。链接与原版按钮一样在**松开时提交**：按在链接上只记录待打开行，松手仍在同一行才打开；拖到别处、滚动或按键都会取消这次按下，从链接上起手拖动不会再误开新屏。按住且指针仍在链接上时，该行底色加深、下划线加粗，给出明确的「已按下」反馈；拖走后恢复普通悬停态，与取消语义一致。键盘同样可达：`↑`/`↓` 在链接之间移动焦点（自动滚到可见位置并在上下各留一行上下文，聚焦到比视口更高的链接时优先保住它的首行；焦点行左侧加 accent 竖条），`Enter` 打开焦点链接；`Tab` 仍交给原版控件系统，焦点回到页脚按钮，按 `Esc` 返回父屏。鼠标按下会退出键盘链接焦点（完成链接时该行重新获得焦点），鼠标与键盘状态不会同时残留；滚轮或 `PageUp`/`PageDown`/`Home`/`End` 手动滚动同样退出链接焦点，因此焦点行滚出视口后不会留下可被 `Enter` 打开的隐形链接或钳在屏幕边缘的 tooltip。键盘焦点行同样弹出目标标题 tooltip（复用悬停的缓存组件，锚在焦点行下方），不碰鼠标也能确认这一行会去哪里。
- **自动目录**：屏幕声明 `contentsFor: "<screen id>"` 后，生成器把目标屏的每个 `heading` 变成本屏正文顶部的 `bullet` 深链，并排在作者自己的 `lines` 之前。带 `anchor` 的标题复用现有锚点，没有锚点的标题获得 `section_N` 合成锚点（自动避开已声明的名字），所以长指南只加一个字段就有可点击目录，不用手写和同步链接。条目走既有跨屏深链：目标屏首次 `init()` 滚到该标题并高亮 600ms，返回时目录屏仍停在原阅读位置。目标必须存在、不能是自己、不能是另一个自动目录屏，且至少有一个 heading；违反时生成期按字段报错。目录条目直接引用目标屏标题自己的语言键（改一次标题文案/翻译，目录同步更新，语言文件不出现重复文案），目录屏只为自己手写的行生成语言键。目录屏自身仍可写正文、note、按钮与按键。
- **主题与动画**：四套 ARGB 调色板在引擎侧（颜色不是版本事实；`contrast` 用全不透明近黑面板、亮黄 accent 与近白正文，适合明亮或花哨场景下的可读性），版本差异（`renderBackground` 参数、滚动签名、`children()` 渲染）全部留在适配器模板；`fade`/`slide` 在 180ms 后自动停止，静止时不产生额外绘制。面板下方有两层半透明投影把内容从压暗的世界里托起，有按钮的屏幕在页脚上方多一条分隔线；超长标题被截断后，鼠标停在标题带会弹出完整标题 tooltip。
- **排版样式**：`lines` 的每一项可以是字符串（正文），也可以是 `{text, style}`。`heading` 用 accent 色绘制并在左侧画竖线，`bullet` 缩进 8px 并在首行画方块标记，`note` 同样缩进但改用各主题的弱化色与左侧引用竖线（竖线覆盖整段含换行行，读起来像引用块）；`warn` 沿用 note 的缩进与竖线几何，但换成各主题的暖色警告色并把竖线加粗到 2px，「警告」一眼区别于普通提示；`step` 同样缩进，首行以 accent 色右对齐画出自动编号（「1.」「2.」…，两位数也不会压到正文），编号在每个 heading 处重新从 1 开始，让操作步骤读起来像有序清单；heading/bullet 只标记逻辑行的首行，自动换行出的续行沿用同样缩进、不重复画标记。区块之间在 heading 前自动留一个空白行（首行与连续 heading 除外），空行只占行高、绘制时直接跳过。样式码在引擎侧生成（`LINE_STYLES`），模板只负责标记像素，因此主题配色与字体仍然不由版本模板决定。内置 Ctrl+F 屏内搜索：面板顶部弹出查找条，输入即查（大小写不敏感），首条命中立即滚动并闪烁，`Enter` 在命中集内循环跳转，右侧「n/m」计数实时反馈，`Esc` 先关查找条再按才关屏；查找条获焦时独占键盘（输入开关按键不会误关屏，方向键/退格都归文本框），点按查找条区域也不会穿透到被遮挡的行内链接；占位文本来自适配器的 `langKeys.screenSearch`，可翻译。
- **小窗口自适应**：`width`/`height` 是偏好尺寸，打开屏幕时按当前窗口（四周留 16px）钳制面板；正文按实际宽度重新换行，边框、滚动条与按钮页脚也随实时面板尺寸重算，每行按钮还会按面板宽度收缩，窄窗口或高 GUI scale 下按钮不会溢出边框。窗口缩放/从子屏返回会重建控件，重建时按**逻辑行**（而非原始像素）锚定阅读位置——换行变化后仍停在同一段文字，不重播入场动画；本次游戏会话内关闭再打开同一屏幕会回到上次滚到的行（`rememberedLine` 为每个屏幕类独立的静态状态，可由 `Home` 显式回到顶部）；超长标题自动截断为 `...`，不会溢出面板。
- **按钮是真正的原版控件**：用 `Button.builder` + `addRenderableWidget`，悬停、键盘导航与旁白均可用；按钮宽度与坐标由引擎按实时 `panelWidth/panelHeight` 计算（每行最宽 100px，面板变窄时同比例收缩），页脚始终居中贴底；模板通过 `this.children()` 绘制控件，不调用 `super.render()`。

> 1.21 的 `Screen.render()` 自身会再画一次背景，旧模板在 `renderBackground` 后调 `super.render` 会把面板盖住且背景重复——新模板只画一次背景并显式绘制子控件，适配器 lint 禁止 screen 模板再出现 `super.render(`。同一份含自动目录的四屏 Spec（`docs/examples/ui2-demo.json`）已在全部 9 个 UI 适配器上真实编译通过：Fabric 1.20.4/1.21.1/1.21.4、Forge 1.20.1/1.20.4/1.21.4、NeoForge 1.20.4/1.21.1/1.21.4（见验收报告 §6.5）。UI 2.0/2.1/2.2/2.3/3.0/3.1/4.0/4.1/5.0/5.1/6.0/7.0/8.0/9.0/10.0/10.1/11.0/12.0/13.0/14.0/15.0/16.0/17.0/18.0/18.1/19.0/20.0/21.0/22.0/23.0/24.0/25.0/26.0/27.0/28.0/29.0/30.0/31.0/32.0/33.0/34.0/35.0/36.0/37.0/38.0/39.0/40.0/41.0/42.0 模板依赖 `GuiGraphics`，适用 1.20+；1.19.4 及更早的 `PoseStack` 渲染需另写旧代模板，本框架暂不生成。

## 配方与进度生成

```jsonc
"content": {
  "recipes": [
    { "id": "charged_ruby", "type": "crafting_shaped", "pattern": ["RR","RR"], "key": { "R": "ruby" }, "result": "charged_ruby" },
    { "id": "ruby_from_smelting", "type": "smelting", "ingredient": "ruby_ore", "result": "ruby", "experience": 0.7 },
    { "id": "ruby_from_charged", "type": "crafting_shapeless", "ingredients": ["charged_ruby", "charged_ruby"], "result": "ruby", "count": 2 }
  ],
  "advancements": [
    { "id": "root", "title": "Ruby Rush", "hasItems": ["ruby"], "background": "minecraft:textures/block/stone.png" },
    { "id": "charged", "parent": "root", "unlockRecipes": ["charged_ruby"] }
  ]
}
```

- 配方类型：`crafting_shaped` / `crafting_shapeless` / `smelting` / `blasting` / `smoking` / `campfire_cooking` / `stonecutting`。
- 引用可写本 mod 的内容 id（`"ruby"` → `examplemod:ruby`），也可直接写资源位置（`"minecraft:stick"`）或标签（`"#minecraft:coals"`）；写错的 id 会得到**字段级报错**并列出可用 id。
- 进度自动生成判据（`minecraft:recipe_unlocked` + `minecraft:inventory_changed`）、`rewards.recipes`（配方书解锁）与语言键。
- **版本方言自动适配**：1.21 把物品栈的键从 `item` 改成 `id`、把物品谓词拍平成字符串、烹饪/切石 result 换成对象形态，数据包目录也从 `recipes/` 变 `recipe/`（`advancements/` → `advancement/`）——这些差异全部写在适配器数据里，引擎零版本分支。方言以 **jar 内原版数据**为准（编译不校验 JSON 语义）。

## 实体生成

```jsonc
"entities": [
  { "id": "ruby_golem", "name": "Ruby Golem", "kind": "monster",
    "health": 30, "speed": 0.28, "attackDamage": 5, "followRange": 24,
    "width": 0.9, "height": 1.6, "shadow": 0.7,
    "model": "cow",                                   // 复用原版模型：pig/cow/chicken/sheep
    "loot": [ { "item": "ruby", "min": 1, "max": 2 },
              { "item": "charged_ruby", "chance": 0.25 } ] }
]
```

产出：`entity/<Mod>RubyGolemEntity.java`（属性与体积）、`client/<Mod>RubyGolemRenderer.java`、`<Mod>Entities.java`（实体类型 + 属性注册）、`data/<ns>/loot_table(s)/entities/ruby_golem.json`，并把注册调用注入主类、把渲染器注册注入客户端引导。三个加载器各用自己的机制（Fabric 的 `Registry.register` + `FabricDefaultAttributeRegistry` + `EntityRendererRegistry`；Forge/NeoForge 的 `DeferredRegister` + `EntityAttributeCreationEvent` + `EntityRenderersEvent`）。

**未生成**：AI 目标（`registerGoals`）、生成蛋、贴图与自定义模型（渲染器默认复用原版模型，贴图需自备 `assets/<ns>/textures/entity/<id>.png`）。

## datagen（可选，默认关闭）

```jsonc
{ "datagen": true }
```

打开后额外生成**加载器对应的数据生成入口**（Fabric：`DataGeneratorEntrypoint` + `fabric.mod.json` 的 `fabric-datagen` entrypoint；Forge/NeoForge：`GatherDataEvent` 订阅类）、一个最小示例 provider（演示 `DataProvider.saveStable`），以及构建脚本里的数据任务接线：

```bash
./gradlew runDatagen     # Fabric，输出到 src/main/generated
./gradlew runData        # Forge / NeoForge，输出到 src/generated/resources
```

设计取舍见 `docs/datagen-evaluation.md`：本框架生成的内容仍走 JSON 路径（已用 jar 内原版数据逐字段校验），datagen 只提供「你自己写 Java provider」所需的入口与接线，避免两条路径重复维护。默认关闭时工程与之前完全一致。

## 接给智能体 / Wiring an agent

### MCP（stdio，推荐）

先在仓库根目录 `pnpm install && pnpm -r build`，然后让 MCP 客户端启动 `packages/mcp-server/dist/index.js`：

```json
{
  "mcpServers": {
    "mcmodkit": {
      "command": "node",
      "args": ["E:/MCMOD/packages/mcp-server/dist/index.js"]
    }
  }
}
```

Codex（`~/.codex/config.toml`）：

```toml
[mcp_servers.mcmodkit]
command = "node"
args = ["E:/MCMOD/packages/mcp-server/dist/index.js"]
```

Claude Code：`claude mcp add mcmodkit -- node E:/MCMOD/packages/mcp-server/dist/index.js`（或写入同样的 `mcpServers` 配置）。

任何 stdio MCP 客户端（含 DeepSeek Harness）都能用同一份配置接入，因为服务端只依赖标准输入输出，不绑定特定宿主。

自检：`node scripts/mcp-smoke.mjs` 会像宿主一样起服务、握手、列工具，并用一份开了贴图与模型形态的 Spec 跑一次 `scaffold_mod` 干跑，确认产物路径正确。

### 智能体典型调用序列

```
list_versions  → 选定 (mcVersion, loader)
example_spec   → 拿到可用的 Spec 骨架
validate_spec  → 按字段级报错修正（无需读文档）
scaffold_mod   → dryRun 看文件计划 → 真实生成到指定目录
```

生成后由智能体（或人类）在目标目录执行 `gradlew build`；**MCP 面不执行任何 shell 命令**，以免把任意命令执行暴露给模型。

### CLI 与 HTTP

```bash
node packages/cli/dist/index.js --help          # 子命令与退出码语义
MCMODKIT_API_PORT=7431 node packages/api/dist/index.js   # 仅监听 loopback
```

## 仓库结构

| 路径 | 作用 |
| --- | --- |
| `packages/core` | Spec 模型与校验、id 转换、模板渲染、生成计划、落盘、错误码与信封 |
| `packages/adapters` | 适配器数据（`data/`）、二进制资产（`assets/`）、`planProject` 统一规划入口 |
| `packages/cli` · `packages/mcp-server` · `packages/api` | 三个接入面（薄封装，只做 I/O 与协议） |
| `docs/` | 简报、环境、调研、需求、任务、验收报告 |
| `Tree/` | 目录索引文档（`python scripts/update_tree.py . --output Tree` 生成） |

## 文档

- **新增版本/加载器：`docs/adding-a-version.md`**（取证清单：javap 签名 / jar 内原版数据 / 官方示例，三步取证 + lint 自查 + 编译验收）
- 项目简报与决策记录：`docs/project-brief.md`
- 环境与约束：`docs/environment.md`
- 调研（含版本 × 加载器 API 知识地图）：`docs/research.md` + `docs/research/`
- 需求基线：`docs/requirements.md` · 任务计划：`docs/tasks.md`
- 验收证据（命令、结果、阻塞项、遗留风险）：`docs/acceptance-report.md`

## 状态与边界

- 当前切片：物品 + 方块 + 配方 + 进度 + 实体 + UI(Screen) + datagen + **贴图生成**；**全部 14 个目标（Fabric 5 / Forge 6 / NeoForge 3）均已通过真实编译验证**；NeoForge 三个目标、Forge 1.20.1 与 Forge 1.21.4 还通过了**真实运行验证**（专用服务器实际加载 mod，`scripts/verify-runtime.mjs`，见验收报告 §16/§18）。
- 一键复验：编译 `node scripts/verify-build.mjs --adapter forge-1.20.1 --gradle "8=<gradle-8.8>/bin/gradle.bat" --java-home-17 <jdk17>`；运行 `node scripts/verify-runtime.mjs --adapter neoforge-1.21.1 --gradle "9=<gradle-9.5.1>/bin/gradle.bat" --java-home-21 <jdk21>`（详情见 `docs/acceptance-report.md` §12）。1.21.4 还需 `--gradle-arg "-Porg.gradle.java.installations.paths=<jdk25>"`（FG7 Mavenizer）。
- 尚未实现：附魔/药水/盔甲/工具生成、跨版本升级工作流、自定义实体模型与 UV 贴图（当前实体贴图是 64×32 纯色占位）、真实图像模型接入（`paintTexture` 已是可替换的单一入口）。
- 验证状态以目标行内标注为准（编译级/运行级分开）；无法在本机验证的目标会明确标注，绝不谎称已验证。

## 许可证

- 本仓库自研代码：MIT。
- 随附的 Gradle wrapper 资产：Apache-2.0（来源与生成方式见 `packages/adapters/assets/gradle-9.5.1/PROVENANCE.md`）。
- 版本事实的取证来源为 CC0 的 `fabric-example-mod` 与各加载器官方文档（见调研文档），模板文本为本项目自写。