---
name: mcmod-textures
description: mcmodkit 贴图生成指南。覆盖三种贴图来源——procedural（本地程序化绘制，默认）、image-api（图像模型 API 生图，凭据走 MCMODKIT_IMAGE_* 环境变量）、file（本地 PNG 文件路径）——以及它们共享的转换管线（解码→抠背景→去杂点→裁主体→缩放）。当用户需要为 Minecraft mod 生成物品/方块/实体贴图、配置 textureProvider 与 texture 字段、编写生图 prompt、指定本地图片文件或排查贴图相关 SPEC_INVALID 报错时使用。
when_to_use: 用户提到贴图、纹理、texture、textureProvider、生图、图片输入、image-api、MCMODKIT_IMAGE 环境变量或贴图报错时。
---

# mcmodkit 贴图生成

mcmodkit 用一份 ModSpec 生成可编译的 Minecraft mod 工程，`content` 里的每个物品/方块/实体都可以带可选贴图。本 skill 讲三种贴图来源怎么选、怎么配。

## 核心决策：三个 provider

| provider | 来源 | 需要什么 | 何时用 |
| --- | --- | --- | --- |
| `procedural`（默认） | 本地程序化绘制（seeded mulberry32） | `texture.style` / `palette` / `seed` | 占位图、风格统一、离线可复现 |
| `image-api` | 图像模型 API 生图 | `texture.prompt` + 环境变量凭据 | 要真实质感与细节 |
| `file` | 本地 PNG 文件 | `texture.file`（路径） | 已有现成美术，不想生图 |

三种来源走**同一条转换管线**：解码 PNG → 抠背景 → 去杂点 → 裁剪到主体 → 保比例缩放 → 编码带 alpha 的 PNG。

## 顶层开关

```jsonc
{
  "textures": true,            // 打开后才为每个内容生成 PNG；默认关闭
  "textureProvider": "file",   // procedural（默认）/ image-api / file
  "content": { "items": [ ... ] }
}
```

不写 `textures: true` 时任何 provider 都不会触发。打开后：

- 没有 `texture` 字段的内容：`procedural` 走默认风格；`image-api` / `file` 下没有 prompt/file 的内容**回退本地绘制**并给出警告（不报错）。
- 生成的 PNG 是受管文件，重生成会覆盖；手工美术请用 `file` provider 引用外部文件，不要放生成目录里。

## procedural：本地程序化绘制

```jsonc
{
  "textures": true,
  "content": {
    "items": [
      { "id": "ruby", "texture": { "style": "speckle", "palette": ["#b91c1c", "#7f1d1d", "#f87171"] } }
    ],
    "blocks": [
      { "id": "ruby_ore", "texture": { "style": "ore", "palette": ["#6b7280", "#dc2626"] } }
    ]
  }
}
```

- 风格：`solid` / `noise` / `speckle` / `ore` / `gradient` / `border` / `planks`；物品默认 `speckle`，方块默认 `noise`。
- 省略 `palette` 时由内容 id 哈希出稳定色相（同名同色，永不漂移）；`seed` 可在不换配色前提下重掷图案。
- 确定性：同一份 Spec 永远产出逐字节相同的 PNG（无 `Math.random`），改图体现为 diff。
- 完全离线、瞬时；实现是参数化绘制（`packages/core/src/texture.ts` + 零依赖 PNG 编码器 `png.ts`）。

## image-api：图像模型生图

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

- 凭据**只从环境变量读**，Spec 是可提交可分享的产物，绝不能带密钥；缺 key 时框架直接报错而不是静默降级。

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `MCMODKIT_IMAGE_API_URL` | 无（必填） | 只接受 http(s) 协议 |
| `MCMODKIT_IMAGE_API_KEY` | 无（必填） | 缺 key 即报错 |
| `MCMODKIT_IMAGE_MODEL` | 无（必填） | 模型名 |
| `MCMODKIT_IMAGE_SIZE` | `1920x1920` | API 出图尺寸 |
| `MCMODKIT_IMAGE_FORMAT` | `png` | 输出编码 |
| `MCMODKIT_IMAGE_TIMEOUT` | `180` | 单张图秒数；非正数回退 180 |

- 只认 PNG 响应（`b64_json` 或 http(s) 下载 URL）；非 http(s) 的下载地址、超过 20 MiB 的响应体都直接报错，下载流式读取并设上限。
- `--dry-run` **不联网**（干跑不该花钱）。网络步骤在生成计划之外：计划始终是同步无 I/O 的纯函数，图像字节由调用方预取后传入。
- 没有 `prompt` 的内容仍走本地绘制。

## file：本地 PNG 文件

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

- 路径规则（按接入面）：
  - **CLI**：相对路径相对于 **spec 文件所在目录**；`-` 读 stdin 时相对于当前目录。
  - **MCP `scaffold_mod` / HTTP `/api/generate`**：**只接受绝对路径**；相对路径报 `SPEC_INVALID`（服务端不知道 spec 文件在哪，报错文案会提示 CLI 行为）。
- 文件要求：8-bit RGB/RGBA 非隔行 PNG、每边 ≤ 4096px、≤ 20 MiB；不满足时报 `SPEC_INVALID` 并指出具体文件。
- `--dry-run` / `dryRun: true` 不读文件、不联网。
- 没有 `file` 的内容仍走本地绘制。

## texture 字段速查

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| `style` | 7 种枚举 | 仅 procedural 使用 |
| `palette` | `#rrggbb` 数组（1–8） | 仅 procedural；省略时由 id 哈希色相 |
| `seed` | 0–4294967295 整数 | 仅 procedural；重掷图案不换配色 |
| `prompt` | 非空字符串 | 仅 image-api 使用 |
| `file` | 本地路径 | 仅 file 使用 |
| `size` | 2 的幂（8–256） | 输出贴图尺寸；**建议 32** |

`size` 建议 32 的原因：实测 1920px 的图整幅缩到 16px 会把钓线这类细特征平均掉，32px 能保住。

## 转换管线事实（三个 provider 共享）

- 解码：只支持 8-bit RGB/RGBA 非隔行 PNG；IHDR 每边 > 4096 或尺寸非法时**在分配像素缓冲之前**拒绝（防解压炸弹）。
- 抠背景：从图像边缘泛洪清除近似背景色——模型常把"透明"画成棋盘格，这一步自动处理。
- 去杂点：只保留最大连通分量——两个角落的杂点会把包围盒撑满整幅，主体被缩成缩略图。
- 裁剪：裁到主体包围盒后再缩放，避免大图整幅缩小后主体只占半个画幅。
- 缩放：premultiplied alpha 保比例缩放到 `size`，编码为带 alpha 的 PNG。
- 实体贴图固定 **64×32**（原版猪/牛/鸡/羊 UV 版式），否则每个 UV 都会采样错像素。

## 生图 prompt 编写要点

- 明确写 "Minecraft pixel art item icon"，注明正方形图标、单主体居中、纯色背景。
- 不要求模型输出真正的 alpha：预期棋盘格或不透明底，管线会自动抠除。
- 每个内容独立 prompt，避免多主体（裁剪只保最大连通分量，次要主体会被丢弃）。

## 排查

| 现象 | 处理 |
| --- | --- |
| `SPEC_INVALID: texture.file must be an absolute path here: ...` | MCP/HTTP 面用了相对路径；改绝对路径或走 CLI |
| `SPEC_INVALID: texture file not readable: <path>` | 文件不存在或不可读 |
| `SPEC_INVALID: texture file is not a usable PNG: <path> (...)` | 不是 8-bit RGB/RGBA 非隔行 PNG，或超尺寸限制 |
| `SPEC_INVALID: ... exceeds ... bytes` | 文件或响应超过 20 MiB |
| 配置缺 key 直接报错 | 故意为之，绝不静默降级；补环境变量 |
| 警告 `textureProvider is "image-api" but no textures were prepared` | dryRun，或内容都没写 prompt；已回退程序化绘制 |
| 警告 `item "x": declares a texture source but no prepared image` | 该内容写了 prompt/file 但没取到图；检查路径/凭据 |

## 相关

- 框架整体用法（工作流、ModSpec、错误码）见 `mcmod-framework` skill。
- 管线实现：`packages/core/src/image-provider.ts`（配置校验、fetch 与 provider 分发）、`image-ops.ts`（解码/抠图/裁剪/缩放）、`png.ts`（零依赖编码器）。
