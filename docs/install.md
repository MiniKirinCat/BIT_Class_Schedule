# Windows 安装包、升级与发布

本文说明「下一节」的按用户安装包：如何构建、安装、升级、卸载，以及怎样把安装包发布到 GitHub Releases。安装包不需要管理员权限，也不会覆盖项目目录里的开发环境。

## 1. 用户安装

### 1.1 下载与运行

从 GitHub Releases 下载 `NextClass-Setup-<版本>.exe`，双击运行。

安装器默认安装到当前用户目录，不弹 UAC：

```text
%LOCALAPPDATA%\Programs\NextClass
```

安装向导是简体中文。可选任务：

- **创建桌面快捷方式**：默认不勾选；
- **开机时自动启动下一节托盘**：默认不勾选，之后也可以在应用的 **设置 → 启动与退出** 中打开。

安装完成后会启动托盘并打开本地页面。首次使用仍需要在页面里登录教务账号；已有数据不会被安装包覆盖。

### 1.2 安装后的文件位置

| 内容 | 路径 |
|---|---|
| 程序与自带 Python 运行时 | `%LOCALAPPDATA%\Programs\NextClass` |
| 课表数据库、日志、运行端口 | `%LOCALAPPDATA%\NextClass\data` |
| 开始菜单快捷方式 | `%APPDATA%\Microsoft\Windows\Start Menu\Programs\下一节\下一节.lnk` |
| 开机启动快捷方式（可选） | `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\下一节.lnk` |
| 密码、Server酱 SendKey、GitHub token、快照密钥 | Windows 凭据管理器，服务名 `next-class` |

安装版自带 Python 3.13 运行时和全部后端依赖，不需要另外安装 Python、Node.js 或运行 `scripts\setup.ps1`。

### 1.3 从源码版迁移数据

安装版使用独立的用户数据目录，不会自动读取项目里的 `data`。如果你之前一直从源码运行，并且想保留课表历史、学期归档和云端 Gist 设置，请在首次启动安装版之前迁移数据库：

1. 右键源码版托盘 → **退出并停止服务**，确认 `data\runtime.json` 已消失；
2. 创建目录 `%LOCALAPPDATA%\NextClass\data`；
3. 把项目 `data\next_class.db` 复制到该目录；如果旁边还有 `next_class.db-wal` 或 `next_class.db-shm`，一并复制；
4. 启动安装版，打开设置确认云端 Gist、Pages 地址和历史学期都在。

PowerShell 示例（在项目根目录运行）：

```powershell
$target = Join-Path $env:LOCALAPPDATA "NextClass\data"
New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item .\data\next_class.db* $target
```

学号密码、Server酱 SendKey、GitHub token 和快照密钥存放在 Windows 凭据管理器，服务名都是 `next-class`；安装版会继续读取这些凭据，不需要重新扫码或重新输入（除非你主动重置过）。

如果不迁移数据库，安装版会从空课表开始；凭据仍在，但仍需重新同步才能生成课表，历史学期不会自动带过来。

### 1.4 未签名安装包的提示

当前安装包没有购买代码签名证书。Windows SmartScreen 可能显示“Windows 已保护你的电脑”：

1. 点击 **更多信息**；
2. 确认文件名和来源是 `MiniKirinCat/BIT_Class_Schedule` 的 Release；
3. 点击 **仍要运行**。

发布页会同时给出安装包的 SHA256。可以在 PowerShell 中核对：

```powershell
Get-FileHash .\NextClass-Setup-1.4.0.exe -Algorithm SHA256
```

哈希一致只说明文件没有被改动，不代表发布者购买了代码签名。只从本仓库的 Releases 下载安装包。

## 2. 升级

### 2.1 手动检查更新

打开本地页面，进入 **设置 → 关于 → 检查更新**。应用会读取：

```text
https://api.github.com/repos/MiniKirinCat/BIT_Class_Schedule/releases/latest
```

结果显示：

- **已是最新版本**：当前版本不低于 GitHub 最新 Release；
- **发现新版本**：显示版本号、发布时间、Release 说明和“打开发布页面”按钮；
- **还没有已发布的版本**：仓库尚未创建 Release，或检查时网络不可用。

检查只读取公开版本信息，不上传学号、课表、token 或密钥，也不会自动下载或安装。需要手动下载安装包并运行。

GitHub 对未登录 API 有频率限制。应用在 REST API 被限流、被代理拦截或请求失败时，会自动改用公开的 Releases Atom 源；Atom 结果仍能给出最新版本号和发布页，只是通常没有 Release 正文。两者都不可用时才会显示“GitHub 请求受限/无法连接”，稍后再试即可，不影响同步和课表查看。

### 2.2 覆盖安装

1. 关闭正在运行的下一节：右键托盘图标 → **退出并停止服务**；
2. 运行新版本的 `NextClass-Setup-<版本>.exe`；
3. 安装器会自动停止残留的托盘/服务进程，然后覆盖程序文件；
4. 安装完成后重新启动。

安装器使用固定的 `AppId`，会沿用上次的安装目录和任务选项。以下内容会保留：

- `%LOCALAPPDATA%\NextClass\data` 中的课表、历史学期、同步记录和设置；
- Windows 凭据管理器中的账号、SendKey、GitHub token 和快照密钥；
- 已发布的 Gist 和手机端配对关系。

如果安装时提示文件被占用，先在托盘退出，或运行：

```powershell
powershell -ExecutionPolicy Bypass -File "%LOCALAPPDATA%\Programs\NextClass\scripts\stop_all.ps1" -Root "%LOCALAPPDATA%\Programs\NextClass"
```

### 2.3 卸载

打开 **Windows 设置 → 应用 → 已安装的应用 → 下一节 → 卸载**，或运行：

```text
%LOCALAPPDATA%\Programs\NextClass\unins000.exe
```

卸载器会先停止托盘和服务，再删除程序目录、开始菜单快捷方式和开机启动快捷方式。

**课表数据默认保留**在 `%LOCALAPPDATA%\NextClass\data`，重新安装后可以继续使用。需要彻底清除时，再手动删除该目录，并在 Windows 凭据管理器中删除服务名 `next-class` 的各项凭据。

## 3. 从源码构建安装包

### 3.1 准备环境

在仓库根目录确认开发环境已经就绪：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

另外需要：

- Python 3.13 的 `.venv`（`setup.ps1` 已创建）；
- Node.js 20+（构建前端）；
- Inno Setup 6.7.3 或更新的 6.x。可以用 winget 安装：

```powershell
winget install --id JRSoftware.InnoSetup -e
```

安装后 `ISCC.exe` 通常位于：

```text
%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe
```

也可以通过环境变量 `INNO_SETUP` 指定完整路径。

### 3.2 一键构建

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_installer.ps1
```

构建步骤：

1. 读取 `backend/app/config.py` 的 `app_version`，并要求 `frontend/package.json` 的版本一致；
2. 在 `frontend` 中执行 `npm ci` 和 `npm run build:local`；
3. 下载官方 Python 3.13.2 embeddable zip 到 `.build\python-embed`，按 `installer\python-3.13.2-embed-amd64.sha256` 校验；
4. 在 `.build\installer-stage` 中组装运行时、后端、前端静态文件、托盘脚本和图标；
5. 用打包后的 Python 做导入检查，并实际启动一次服务，检查健康接口、版本和首页；
6. 调用 Inno Setup 生成 `dist\NextClass-Setup-<版本>.exe`，最后打印大小和 SHA256。

可选参数：

```powershell
# 复用已有 frontend\dist-local，不重新 npm ci
powershell -ExecutionPolicy Bypass -File scripts\build_installer.ps1 -SkipFrontend

# 跳过打包运行时的启动检查（只建议在排错时使用）
powershell -ExecutionPolicy Bypass -File scripts\build_installer.ps1 -SkipRuntimeSmoke
```

构建脚本会拒绝 `backend/app/config.py` 与 `frontend/package.json` 版本不一致的情况；发版前先同时修改这两个文件，不要只改安装包文件名。

构建产物和中间文件都不进入 Git：

- `.build\installer-stage`：安装包暂存目录，可用于检查打包内容；
- `.build\python-embed`：缓存官方 Python zip；
- `dist\NextClass-Setup-<版本>.exe`：安装包。

### 3.3 安装包内容

安装器只包含运行所需文件：

```text
runtime\                 Python 3.13 embeddable + site-packages
backend\app\             FastAPI 后端
frontend\dist-local\     本地管理端静态文件
frontend\public\         托盘图标
scripts\run_server.py    本地服务启动器
scripts\tray.py          托盘
scripts\stop_all.ps1     升级/卸载前停止进程
scripts\stop.ps1         托盘停止现有实例
scripts\paths.ps1        数据目录解析
assets\next-class.ico    安装器/快捷方式图标
README.md
```

不包含：`data` 数据库、日志、token、密码、二维码、开发测试、Node 源码或 Playwright 依赖。

## 4. 发布到 GitHub Releases

### 4.1 版本号

同时修改：

- `backend/app/config.py` 的 `app_version`；
- `frontend/package.json` 的 `version`。

构建脚本发现两者不一致会直接失败。安装包文件名、页面显示的版本和更新检查的当前版本都来自这里。

### 4.2 构建并检查

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_installer.ps1
Get-FileHash .\dist\NextClass-Setup-1.4.0.exe -Algorithm SHA256
```

建议先在临时目录做一次静默安装/卸载检查：

```powershell
.\dist\NextClass-Setup-1.4.0.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART `
  "/DIR=$PWD\.build\install-check" /LOG="$PWD\.build\install-check.log"
& "$PWD\.build\install-check\unins000.exe" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
```

如果使用 Git Bash 执行安装器，先设置 `MSYS2_ARG_CONV_EXCL='*'`，否则 `/VERYSILENT` 会被当成路径改写。PowerShell 不需要这个变量。

### 4.3 创建 Release

先提交并推送版本改动：

```powershell
git add backend/app/config.py frontend/package.json
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" commit -m "chore: release 1.4.0"
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" push origin master
```

然后创建标签和 Release，把安装包作为附件上传：

```powershell
git tag v1.4.0
git push origin v1.4.0
gh release create v1.4.0 "dist\NextClass-Setup-1.4.0.exe" `
  --title "下一节 1.4.0" `
  --notes "本次更新内容和使用说明。`n`n安装包 SHA256：<粘贴哈希>"
```

注意：

- 更新检查读取 `/releases/latest`，**草稿和预发布版本不会被选中**；确认 Release 已发布；
- 安装包文件名建议保持 `NextClass-Setup-<版本>.exe`，方便用户和文档引用；
- Release 说明里附上 SHA256，方便核对下载文件；
- 发布后打开 **设置 → 关于 → 检查更新** 验证一次。GitHub API 有缓存和频率限制，刚创建 Release 后偶尔需要稍等。

### 4.4 不自动更新

当前只做“手动检查 + 打开下载页”。应用不会在后台下载安装包、不会静默运行安装器，也不会修改系统计划任务。升级仍由用户双击安装包完成。

## 5. 常见问题

**安装时提示“应用正在运行”或文件被占用。** 先右键托盘 → 退出并停止服务，再运行安装包。安装器也会尝试执行 `scripts\stop_all.ps1`，但正在写入的数据库文件可能导致占用。

**双击后没有页面。** 查看 `%LOCALAPPDATA%\NextClass\data\app.log`；也可以在安装目录运行：

```powershell
.\runtime\python.exe .\scripts\run_server.py --no-open
```

**端口被占用。** 应用默认尝试 `127.0.0.1:17800`，被占用时会自动选空闲端口；实际端口写在 `%LOCALAPPDATA%\NextClass\data\runtime.json`。端口由系统分配时，不要把它写死到手机端。

**开机自启没有生效。** 确认 `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\下一节.lnk` 存在；也可以在设置中关闭再开启一次。安装器的“开机自启”任务和应用内开关使用同一个快捷方式。

**卸载后课表还在。** 这是有意的数据保留策略。需要彻底删除时，手动删除 `%LOCALAPPDATA%\NextClass\data`，并在 Windows 凭据管理器中清理 `next-class` 凭据。

**SmartScreen 拦截。** 当前安装包未签名，按 1.4 节的步骤确认来源和 SHA256 后再运行；不要从聊天、网盘或第三方站点下载。
