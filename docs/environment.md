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
| maven | 3.9.12 | D:\apache-maven\apache-maven-3.9.12\bin\mvn.cmd（本框架预计不用） |
| gradle | 未安装 | —（mod 模板必须自带 gradle wrapper） |
| docker | 未安装 | —（不依赖容器） |
| vscode | 有 | D:\VSCode\Microsoft VS Code\bin\code.cmd |

## 浏览器 / 验证工具

- DSH 内置 browser_* 工具可用：用于 HTTP API 冒烟验证。
- 无浏览器自动化以外的 GUI 测试需求（本框架不开发 Web 前端界面；HTTP API 以 JSON 为主）。

## 对方案的约束 / Constraints derived

1. 本机仅有 **JDK 21**：MC 1.20.5+ / 1.21.x 恰好要求 Java 21，可做**完整编译验证**；MC 1.20.1（Forge/Fabric 需要 Java 17）只能生成项目与代码，编译验证依赖 gradle toolchain 自动下载 JDK 17（需要网络），未验证前一律标注"受限验证"，不得声称已验证。
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
| `github.com` | ❌ 连接超时（本轮重下 Gradle 9.5.1 时失败） | — | `services.gradle.org` 的部分发行版重定向到 GitHub ⇒ 重下 Gradle 可能失败；应保留本地发行版副本 |
| `maven.neoforged.net` | ⚠️ 连接重置 | ❌ SSL 握手终止 | NeoForge 线仍阻塞（见验收报告 §7.1） |

### 本轮取得的工具链（临时，位于 Temp/tools，不入库）

- Temurin `jdk-17.0.20.1+1`（`api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse`）
- Gradle `8.8`（Forge 线必需；ForgeGradle 6 拒绝 Gradle 9）与 Gradle `9.5.1`（Fabric 线；本轮重下受 github.com 阻塞，需保留副本）
- 生成工程的构建缓存位于 `%USERPROFILE%\.gradle\caches\forge_gradle`（Forge 线首次构建约 385 MB）
