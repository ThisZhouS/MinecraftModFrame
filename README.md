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
| `fabric-1.16.5` | 1.16.5 | Fabric (loader 0.19.5) | 8 | ✅ **真编译通过**（产出 jar） |
| `fabric-1.19.4` | 1.19.4 | Fabric (loader 0.19.5) | 17 | ✅ **真编译通过**（产出 jar） |
| `fabric-1.20.4` | 1.20.4 | Fabric (loader 0.19.5) | 17 | ✅ **真编译通过**（产出 jar） |
| `fabric-1.21.1` | 1.21.1 | Fabric (loader 0.19.5) | 21 | ✅ **真编译通过**（产出 jar） |
| `fabric-1.21.4` | 1.21.4 | Fabric (loader 0.19.5) | 21 | ✅ **真编译通过**（产出 jar） |
| `forge-1.16.5` | 1.16.5 | Forge (36.2.42, ForgeGradle 6.0.54, Gradle 8.8) | 8 | ✅ **真编译通过**（产出 jar；该版本用 MCP 名，见下） |
| `forge-1.19.4` | 1.19.4 | Forge (45.4.5, ForgeGradle 6.0.54, Gradle 8.8) | 17 | ✅ **真编译通过**（产出 jar） |
| `forge-1.20.1` | 1.20.1 | Forge (47.4.10, ForgeGradle 6.0.54, Gradle 8.8) | 17 | ✅ **真编译通过**（产出经 reobfJar 的 jar） |
| `forge-1.20.4` | 1.20.4 | Forge (49.2.9, ForgeGradle 6.0.54, Gradle 8.8) | 17 | ✅ **真编译通过**（产出 jar） |
| `forge-1.21.4` | 1.21.4 | Forge (54.1.18, ForgeGradle 6.0.54, Gradle 8.8) | 21 | ✅ **真编译通过**（产出 jar） |
| `neoforge-1.20.4` | 1.20.4 | NeoForge (ModDevGradle) | 17 | ⚠️ 已生成，**未编译验证**（见验收报告 §8.1） |
| `neoforge-1.21.1` | 1.21.1 | NeoForge (21.1.250, ModDevGradle 2.0.147) | 21 | ⚠️ 已生成，**未编译验证**（本机网络无法访问 maven.neoforged.net） |
| `neoforge-1.21.4` | 1.21.4 | NeoForge (ModDevGradle) | 21 | ⚠️ 已生成，**未编译验证**（见验收报告 §8.1） |

**注意 `forge-1.16.5` 用的是 MCP 名**（`net.minecraft.item.Item`），其余目标用 Mojang 官方名——
这不是笔误：ForgeGradle 在该版本产出的构件虽然叫 `..._mapped_official_1.16.5.jar`，内容却是 MCP 命名。
判据一律是 `javap` 真实构件，不是构件名。详见 `docs/adding-a-version.md` §2.5。

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
      "width": 240, "height": 150,    // 面板尺寸（参数化，改 Spec 即改 UI）
      "lines": ["第一行", "第二行"]     // 逐行文本，自动生成语言键
    }
  ]
}
```

产出：`client/<Mod>GuideScreen.java`（Screen 子类 + Done 按钮）、`client/<Mod>Client.java`（按键注册与打开逻辑）、以及标题/每行/按键名/按键分类 4 类语言键。三个加载器各自用**自己的**事件与入口（Fabric 的 `ClientModInitializer` + `fabric.mod.json` client entrypoint；Forge/NeoForge 的 `@Mod.EventBusSubscriber`/`@EventBusSubscriber` + `RegisterKeyMappingsEvent`），引擎只做装配。

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

- 当前切片：物品 + 方块 + 配方 + 进度 + 实体 + UI(Screen) + datagen + **贴图生成**；**Fabric 1.21.1 与 Forge 1.20.1 均已通过真实编译验证**（NeoForge 1.21.1 因本机无法访问 maven.neoforged.net 而未编译验证）。
- 一键复验：`node scripts/verify-build.mjs --adapter forge-1.20.1 --gradle "8=<gradle-8.8>/bin/gradle.bat" --java-home-17 <jdk17>`（详情见 `docs/acceptance-report.md` §8）。
- 尚未实现：附魔/药水/盔甲/工具生成、跨版本升级工作流、自定义实体模型与 UV 贴图（当前实体贴图是 64×32 纯色占位）、真实图像模型接入（`paintTexture` 已是可替换的单一入口）。
- 本机仅 JDK 21 ⇒ 只有 Java 21 目标可本机编译验证；其他版本目标会被明确标注为「仅生成、受限验证」，绝不谎称已验证。

## 许可证

- 本仓库自研代码：MIT。
- 随附的 Gradle wrapper 资产：Apache-2.0（来源与生成方式见 `packages/adapters/assets/gradle-9.5.1/PROVENANCE.md`）。
- 版本事实的取证来源为 CC0 的 `fabric-example-mod` 与各加载器官方文档（见调研文档），模板文本为本项目自写。