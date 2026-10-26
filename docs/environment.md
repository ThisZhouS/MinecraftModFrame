# 环境记录 / Environment

> 由 project-driver 执行约定第 2 条生成。测量时间：2026-09-15。测量方式：pwsh 实测（Get-Command / --version）。

## 主机 / OS

| 项 | 值 |
| --- | --- |
| 操作系统 | Windows 11 (Microsoft Windows NT 10.0.26100.0) |
| Shell | PowerShell 5.1（DSH harness 内为 pwsh 执行器，只读命令 ConstrainedLanguage） |
| 工作区 | E:\MCMOD（项目启动时为空目录） |
| 沙箱 | DSH 文件策略 danger-full-access；审批策略 never（自动拒绝需审批操作） |

## 工具链 / Toolchain（实测）

| 工具 | 版本 | 位置 |
| --- | --- | --- |
| node | v24.11.0 | E:\box\Node\node.exe |
| npm | 11.6.1 | E:\box\Node\npm.ps1 |
| pnpm | 11.6.0 | C:\Users\zs\AppData\Roaming\npm\pnpm.ps1 |
| python | 3.13.7 | C:\Users\zs\AppData\Local\Programs\Python\Python313\python.exe |
| git | 2.53.0.windows.1 | D:\GIT\Git\cmd\git.exe |
| java | OpenJDK 21.0.11 LTS (Microsoft) | C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot |
| JAVA_HOME | C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot\ | — |
| java 17 | OpenJDK 17.0.12 LTS | C:\Program Files\Java\jdk-17（另有 Microsoft 17.0.13 于 C:\Program Files\Microsoft\jdk-17.0.13.11-hotspot） |
| java 25 | OpenJDK 25.0.4.1 LTS | E:\MCMOD\.tools\jdk-25（临时，不入库；只有 ForgeGradle 7 的 mavenizer 需要） |
| maven | 3.9.12 | D:\apache-maven\apache-maven-3.9.12\bin\mvn.cmd（本框架预计不用） |
| gradle | 未全局安装 | 验收用本地发行版：Gradle 8.8 于 E:\MCMOD\.tools\gradle-8.8，Gradle 9.5.1 于 E:\MCMOD\Temp\tools\gradle-9.5.1（临时，不入库；mod 模板仍必须自带 wrapper） |
| docker | 未安装 | —（不依赖容器） |
| vscode | 有 | D:\VSCode\Microsoft VS Code\bin\code.cmd |

## 浏览器 / 验证工具

- DSH 内置 browser_* 工具可用：用于 HTTP API 冒烟验证。
- 无浏览器自动化以外的 GUI 测试需求（本框架不开发 Web 前端界面；HTTP API 以 JSON 为主）。

## 对方案的约束 / Constraints derived

1. 本机具备 **JDK 17 / 21 / 25**（2026-10-25 更新；早期只有 JDK 21）：Java 17 目标（1.20.1/1.20.4）与 Java 21 目标（1.20.5+/1.21.x）均可**完整编译验证**；JDK 25 仅用于 ForgeGradle 7 的 mavenizer 工具链，不是任何 mod 的运行目标。构建时按目标把 `--java-home-<17|21>` 指到对应 JDK。
2. gradle 未全局安装：所有生成的 mod 项目必须**内嵌 gradle wrapper**（gradlew + gradle-wrapper.properties 固定版本），保证脱离本框架仍可构建。
3. pnpm 可用：采用 pnpm workspace monorepo；构建入口从仓库根目录可复现（`pnpm -r build` / `pnpm test`）。
4. Windows 路径与 PowerShell：所有脚本必须兼容 Windows（避免 POSIX-only 命令）。

## 复现命令 / Reproduce

```powershell
node --version; npm --version; pnpm --version; python --version; git --version; java -version
Get-Command node,npm,pnpm,python,git,java,gradle,mvn,docker | Format-Table Source
```
## 网络环境（2026-09-15 实测，影响构建验证）

本机网络对工具链并非「全通」，实测结论如下（均用 `curl.exe` 与 JDK 自带 HttpClient 双向对照）：

| 目标 | curl.exe | Java(JDK21 HttpClient) | 影响 |
| --- | --- | --- | --- |
| `services.gradle.org` | ✅ 200 | ✅ 200 | 正常 |
| `services.gradle.org` 的发行版 CDN 重定向目标 | — | ❌ 连接超时 | `gradlew` 首次自动下载 Gradle 发行版失败（见验收报告 §6） |
| `maven.fabricmc.net` / `repo1.maven.org` / `plugins.gradle.org` | ✅ 200 | ✅ 200 | Fabric 构建可完整验证 |
| `maven.creeperhost.net`（Forge/NeoForge 镜像） | ✅ 200 | ✅ 200 | NeoForge 工件可经镜像获取 |
| `maven.neoforged.net` | ⚠️ 连接重置 | ❌ SSL 握手被终止 | 官方 maven 不可用，需镜像；Gradle 遇到不可达仓库会**硬失败**而非跳过 |
| `raw.githubusercontent.com` | ⚠️ 间歇超时 | — | 文档/模板取证需重试 |

补充事实：

- PowerShell 5.1 的 `Invoke-WebRequest` 默认 TLS 协商失败（无法连接），**下载一律用 `curl.exe`**。
- PowerShell 5.1 的 `>` / `Out-File` 默认写出 UTF-16LE，会让 JSON 解析失败；因此 CLI 提供 `example -o <file>`，加载器也会识别 UTF-8/UTF-16 BOM。
- DSH 会话内**浏览器工具不可用**（无可用 browser provider），HTTP 冒烟改用 `curl.exe`。
- 已在本机解压一份 Gradle 9.5.1 发行版用于验收（`Temp/tools/gradle-9.5.1`，属临时产物，不入库）。

### 对方案的追加约束

5. 生成的 mod 工程要能在「部分域名不可达」的网络下工作：仓库顺序把可达镜像放前、官方 maven 放后（不可达仓库会导致 Gradle 硬失败）。
6. 构建验收要区分「模板缺陷」与「网络阻断」：前者必须修复模板，后者记为阻塞并保留证据，不得混同为通过或失败。
## 追加实测（本轮，Forge 1.20.1 编译验证）

| 目标 | curl.exe | Java(JDK 17/21) | 影响 |
| --- | --- | --- | --- |
| `maven.minecraftforge.net`（Forge 官方 maven） | ✅ 200 | ✅ 200（实测拉取 userdev jar 3 MB） | Forge 线**可完整编译验证** |
| `api.adoptium.net` → GitHub release assets | ✅ | — | 可取得 Temurin **JDK 17.0.20.1**（本机因此具备 Java 17 编译能力） |
| `github.com` | ❌ 连接超时 | — | `services.gradle.org` 的部分发行版重定向到 GitHub ⇒ 从官方源重下 Gradle 会失败；应保留本地发行版副本 |
| `mirrors.cloud.tencent.com/gradle/` | ✅ 206（支持断点/范围请求） | — | **Gradle 发行版的可用镜像**：`curl -L -o gradle-9.5.1-bin.zip https://mirrors.cloud.tencent.com/gradle/gradle-9.5.1-bin.zip`（阿里云镜像该路径 404） |
| `maven.neoforged.net` | ⚠️ 连接重置 | ❌ SSL 握手终止 | NeoForge 线仍阻塞（见验收报告 §7.1） |

### 本轮取得的工具链（临时，位于 Temp/tools，不入库）

- Temurin `jdk-17.0.20.1+1`（`api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse`）
- Gradle `8.8`（Forge 线必需；ForgeGradle 6 拒绝 Gradle 9）与 Gradle `9.5.1`（Fabric 线；本轮重下受 github.com 阻塞，需保留副本）
- 生成工程的构建缓存位于 `%USERPROFILE%\.gradle\caches\forge_gradle`（Forge 线首次构建约 385 MB）

## 追加实测（2026-10-22，NeoForge 三目标编译 + 运行验证）

| 目标 | 实测 | 影响 |
| --- | --- | --- |
| `neoforged.forgecdn.net/releases`（ForgeCDN） | ✅ 可达 | NeoForge 插件与工件可经镜像解析 ⇒ settings.gradle 只用它，官方主机不列入 |
| `piston-meta.mojang.com`（Mojang 版本清单） | ✅ 可达 | 合成 `net.neoforged:minecraft-dependencies:<mc>` POM 的数据源（官方 maven 独有模块的替代） |
| `maven.neoforged.net` | ❌ 仍被阻断 | 构建对它的最后两处依赖（minecraft-dependencies 模块、NFRT 钉版库回退下载）已分别由合成 POM 与 `addArtifactsToManifest` 消除 |
| 本机 JDK | JDK 21.0.11 + JDK 17.0.13（`C:\Program Files\Microsoft\`） | Gradle 只通过**注册表**自动探测到 JDK 17；JDK 21 仅作为 **current JVM** 可探测 ⇒ 1.20.4 构建必须让 Gradle 守护进程跑在 JDK 21 上（NFRT 要 21 工具链），否则报 `Cannot find a Java installation ... languageVersion=21` |

工具链使用（临时，位于 `Temp/tools`，不入库）：Gradle 9.5.1 本地发行版（三个 NeoForge 目标共用）。验收产物日志：`Temp/verify-build/<adapter>/build.log` 与 `Temp/verify-runtime/<adapter>/runtime.log`。

## UI 复验环境与命令（2026-10-25 实测）

UI 2.0–42.0 的九目标编译复验使用 `scripts/verify-build.mjs --spec docs/examples/ui2-demo.json`，Gradle 按适配器声明的 `gradleWrapperVersion` 选线。注意 `--java-home-<n>` 的 `n` 是生成工程的 **target.java**（harness 的键名），**不是**运行 Gradle 的 JVM：Fabric 1.20.4（Loom 1.17 插件要求 JVM 21）与 NeoForge 1.20.4（NFRT 21 toolchain 探测）的 target 是 17，但 `--java-home-17` 必须指向 JDK 21。

| 目标群 | Gradle | `--java-home-*` |
| --- | --- | --- |
| Fabric 1.21.x | 9.5.1（`E:/MCMOD/Temp/tools/gradle-9.5.1`） | `--java-home-21` = JDK 21 |
| Fabric 1.20.4 | 9.5.1 | `--java-home-17` = **JDK 21**（Loom 插件不支持 JDK 17 JVM；Java 17 toolchain 由 Gradle 自动探测） |
| Forge 1.20.1 / 1.20.4 | 8.8（`E:/MCMOD/.tools/gradle-8.8`） | `--java-home-17` = JDK 17 |
| Forge 1.21.4 | 9.5.1 | `--java-home-21` = JDK 21，另需注册 JDK 25（见下） |
| NeoForge 1.21.1 / 1.21.4 | 9.5.1 | `--java-home-21` = JDK 21 |
| NeoForge 1.20.4 | 9.5.1 | `--java-home-17` = **JDK 21**（NFRT 的 21 toolchain 只从运行 Gradle 的 JVM 探测） |

```bash
# Fabric 1.21.1 与 Forge 1.20.x：一条命令指定两条 Gradle 线
node scripts/verify-build.mjs --spec docs/examples/ui2-demo.json \
  --gradle "8=E:/MCMOD/.tools/gradle-8.8/bin/gradle.bat,9=E:/MCMOD/Temp/tools/gradle-9.5.1/bin/gradle.bat" \
  --java-home-17 "C:/Program Files/Java/jdk-17" \
  --java-home-21 "C:/Program Files/Microsoft/jdk-21.0.11.10-hotspot" \
  --adapter fabric-1.21.1

# Forge 1.21.4：ForgeGradle 7 的 mavenizer 跑在 Java 25 工具链上
node scripts/verify-build.mjs --spec docs/examples/ui2-demo.json \
  --gradle "9=E:/MCMOD/Temp/tools/gradle-9.5.1/bin/gradle.bat" \
  --java-home-21 "C:/Program Files/Microsoft/jdk-21.0.11.10-hotspot" \
  --gradle-arg "-Porg.gradle.java.installations.paths=E:/MCMOD/.tools/jdk-25" \
  --gradle-arg "-Porg.gradle.java.installations.auto-download=false" \
  --adapter forge-1.21.4

# NeoForge 1.20.4：target.java 是 17，但 NFRT 的 21 toolchain 只从运行 Gradle 的 JVM 探测
node scripts/verify-build.mjs --spec docs/examples/ui2-demo.json \
  --gradle "9=E:/MCMOD/Temp/tools/gradle-9.5.1/bin/gradle.bat" \
  --java-home-17 "C:/Program Files/Microsoft/jdk-21.0.11.10-hotspot" \
  --adapter neoforge-1.20.4
```

- 两个 `-Porg.gradle.java.installations.*` 必须**各占一个 argv**（Git Bash 下用双引号包住）：只注册 JDK 25 而不关自动下载，foojay resolver 仍会在 `~/.gradle/jdks` 拉半截 JDK 25 压缩包，表现为构建长时间停滞。
- `fabric-1.20.4` 若让 Gradle 跑在 JDK 17 上，会在配置期报 `Dependency requires at least JVM runtime version 21`（Loom 1.17 插件自身要求）：把 `--java-home-17` 指向 JDK 21 即可，生成工程的 Java 17 toolchain 会由 Gradle 自动探测。
- FG7 首次成功构建后，旧工程里的 `.gradle/mavenizer`（约 47 MB）可直接复制到同目标的新验证工程，省去重新解析 Minecraft maven。
- 复验结束看每个目标的 `Temp/verify-build/<adapter>/build.log` 末行 `BUILD SUCCESSFUL`，并核对 jar 内 `com/verifyfabric|verifyforge/client/` 下的 Screen 类与 mod 元数据。
