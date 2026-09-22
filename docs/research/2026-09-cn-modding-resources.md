# 中文模组开发资源索引（2026-09）

> 来源：[mouse0w0/MinecraftDeveloperGuide](https://github.com/mouse0w0/MinecraftDeveloperGuide)（我的世界开发者中文指南）。
> 该仓库是一份**资源索引**（教程、文档、工具、社群链接），不是 API 参考手册。

## 许可与引用边界（重要）

原指南采用 **CC-BY-SA-4.0**，本仓库自研代码为 **MIT**。两者不兼容，因此本项目**只采用链接目标（URL）与事实性信息**，
**不复制任何原文表述**——本文件与适配器 `references[]` 中的说明文字均为本项目自写。若将来需要引用原文，必须单独标注
CC-BY-SA-4.0 并隔离存放，不能混入 MIT 部分。

## 我们从这份索引里取走了什么

结论先说：对**框架实现**而言，这份索引几乎不提供可直接编码的 API 知识（它是链接集合，不是接口文档）。但它精确地指出了
**「版本事实该去哪里取证」**——这恰好是本项目此前最含糊的一环（`docs/adding-a-version.md` 原本只写「官方示例 / 文档」）。

因此本轮没有新增生成器，而是把**权威来源**做成了适配器数据的一部分：

| 类别 | 取用的来源 | 为什么对框架有价值 |
| --- | --- | --- |
| 官方文档 | Forge readthedocs、NeoForge docs、Fabric wiki | 事实的第一来源，替代训练数据与二手教程 |
| 映射查询 | Linkie（mojmap/yarn/intermediary 对照）、Parchment（1.16.5+ 参数名） | 直接服务于本仓库的 `javap` 取证流程：写模板前先核对签名 |
| 迁移指南 | ChampionAsh5357 的逐版本 gist、NeoForge 官方 primer | **新增版本时最省时间的一类文档**——它就是「这一版改了什么」的答案 |
| 示例工程 | fabric-example-mod（CC0）、Kaupenjoe/McJty 示例 | 本仓库的构建事实本来就以此取证；CC0 的尤其适合直接对照 |
| 数据包工具 | misode 数据包生成器、香草图书馆 | 数据包 JSON 方言的交叉核对（本仓库已用 jar 内原版数据取证） |

## 落地方式

`AdapterRecord.references[]`（`packages/core/src/adapter-contract.ts`）：

```jsonc
{
  "label": "ForgeGradle 6 迁移指南",
  "url": "https://gist.github.com/ChampionAsh5357/98b08c117cb2057d8029a8919c378a4c",
  "kind": "migration",           // official-docs | mappings | migration | example-mod | datapack | community
  "note": "本适配器钉 Gradle 8.8 的原因（ForgeGradle 6 不兼容 Gradle 9）"
}
```

约束（由 schema 与 lint 强制）：

- URL **必须 https**；
- 不允许重复 URL（重复链接让列表看起来比实际知识更丰富）；
- 只要声明了 references，就**必须**包含该加载器的官方文档（`kind: "official-docs"`）——避免只堆二手教程。

## 三个面都能拿到

`adapterSummary()` 从 `packages/adapters` 统一导出，CLI（`mcmod adapter <id>`）与 MCP（`get_adapter`）共用同一份实现。
此前两边各自手写字段清单——那正是「某个字段只到一个面、另一个面悄悄落后」的典型成因。现在 `references` 随事实一起到达智能体：

```
mcmod adapter forge-1.20.1 --json          # 人 / 脚本
get_adapter { mcVersion, loader }          # 智能体
```

## 明确没有采纳的部分

- **教程正文与翻译**：许可不兼容，且与「版本事实以取证为准」的路线冲突——二手教程容易滞后。
- **非 Forge/NeoForge/Fabric 平台**（Bukkit/Spigot/Sponge/BungeeCord/基岩版/启动器）：不在本项目目标范围内。
- **各版本专属教程的正文**：只在需要时作为线索使用，结论仍须落到 `javap` / jar 内原版数据 / 真机编译三者之一。
