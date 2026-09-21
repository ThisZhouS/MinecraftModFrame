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
| 游戏内界面 | `ui.screens[]`（`key` 绑按键；`lines` 逐行文本） |
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
