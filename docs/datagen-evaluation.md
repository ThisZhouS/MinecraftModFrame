# datagen 评估 / Data Generation Evaluation

> 日期：2026-09-15 · 结论：**先不盲目落地**，给出三个选项与证据，等决策。

## 1. 什么是 datagen，与现有路径的关系

Minecraft 官方支持在**构建期**用 Java 代码（`DataProvider`）产出数据包/资源包 JSON：配方、模型、方块状态、掉落表、标签、语言、进度等。

本框架目前走的是**另一条路径**：从 Spec 直接生成同样的 JSON（已由真编译 + jar 内容 + **jar 内原版数据逐字段对照**验证）。两条路径产出物重叠，因此必须先回答「datagen 能带来什么现有路径给不了的东西」。

| 维度 | 直接生成 JSON（现状） | datagen |
| --- | --- | --- |
| 版本正确性 | 依赖模板；已用**原版数据对照**修正 5 处方言差异（§见验收报告 §7.2、§8.4）并加护栏测试 | 由游戏自身的 codec/API 产出，**天然版本正确** |
| 校验强度 | 生成即得 JSON；语义靠对照原版 + 测试 | 编译期类型检查 + 运行 datagen 产出 |
| 验证成本 | 秒级（纯文本断言） | 需**运行** `runData`/`runDatagen`（拉取完整 MC 资源、分钟级、可能受网络限制） |
| 智能体友好度 | 高：改 JSON 即可，零编译 | 低：需写 Java、跑 Gradle 任务 |
| 与 Spec 模型契合 | 直接映射 | 需为每种内容×每个加载器写 provider 模板 |

## 2. 各加载器的接线方式

| 加载器 | 入口 | Gradle 任务 |
| --- | --- | --- |
| Fabric | `DataGeneratorEntrypoint#onInitializeDataGenerator(FabricDataGenerator)` + `FabricDataGenerator.Pack` | Loom 的 `runDatagen` |
| Forge 1.20.1 | `@Mod.EventBusSubscriber(bus = MOD)` + `@SubscribeEvent GatherDataEvent`（`net.minecraftforge.data.event`） | ForgeGradle 的 `runData` |
| NeoForge 1.21.1 | `@EventBusSubscriber(bus = MOD)` + `GatherDataEvent`（`net.neoforged.neoforge.data.event`） | ModDevGradle 的 `runData` |

## 3. 关键证据：provider API 在 1.20.1 → 1.21.1 之间是**破坏性变更**

对两版真实映射 jar 跑 `javap`（与既有取证方式一致）：

```
1.20.1  net.minecraft.data.recipes.RecipeProvider
        protected abstract void buildRecipes(java.util.function.Consumer<FinishedRecipe>);
        protected static void oreSmelting(Consumer<FinishedRecipe>, List<ItemLike>, RecipeCategory, ItemLike, float, int, String);

1.21.1  net.minecraft.data.recipes.RecipeProvider
        protected abstract void buildRecipes(net.minecraft.data.recipes.RecipeOutput);
        protected static void oreSmelting(RecipeOutput, List<ItemLike>, RecipeCategory, ItemLike, float, int, String);
```

即：**provider 代码本身也要按版本分叉**（不只是按加载器），且每种内容类型（配方/模型/掉落/标签/语言/进度）都要写一遍。

## 4. 成本与收益

- 成本：新增 3 加载器 × N 内容类型 的 provider 模板与 Gradle 任务接线；验收从「秒级文本断言」升级为「分钟级 runData」，且 runData 需要完整 MC 资源与可用的数据生成环境（本机 Fabric/Forge 已验证可构建，但 datagen 运行未验证）。
- 收益：把「模板正确性」问题转化为「类型正确性」问题；对**用户自己写的 Java 内容**（而非 Spec 生成的内容）尤其有价值。
- 现状已覆盖：本轮 5 处方言差异全部由「原版数据对照」发现并修复，且已加护栏测试——这正是 datagen 的最大卖点，目前已有替代保障。

## 5. 三个选项

| 选项 | 内容 | 适用 |
| --- | --- | --- |
| **A. 不做 datagen** | 保持 Spec → JSON 路径，继续用「原版数据对照 + 护栏测试」保证版本正确 | 智能体主导、以 Spec 为唯一事实源的工作流 |
| **B. 最小接线**（推荐折中） | 仅生成**入口骨架**：加载器对应的 datagen 入口类 + 必要的 Gradle 任务接线（`runData`/`runDatagen`），provider 由使用者自行添加；带一个语言文件的示例 provider | 想在自己写 Java 时用官方 datagen 的人 |
| **C. 完整 datagen** | 为本框架所有内容类型（配方/掉落/标签/语言/进度/模型）生成 provider，并按版本分叉 | 需要脱离本框架、长期只用官方 datagen 维护的项目 |

## 6. 建议

先做 **B**：它把「能不能用官方 datagen」这个门槛降为零，成本可控（每加载器 1 个入口类 + 1 处 Gradle 接线），且不会与现有 JSON 路径产生重复维护压力。若日后确实需要 C，再按内容类型增量推进。

> 需要决策：选 A / B / C？选 B 或 C 时，是否接受验收标准从「编译通过」扩展为「运行 datagen 并产出一致结果」（分钟级、需完整 MC 资源）？
