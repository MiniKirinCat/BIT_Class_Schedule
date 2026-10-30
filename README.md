# 下一节

北京理工大学个人课表工具：从教务系统自动同步课表，打开就能看到今天和下一节；课表变化时通过 Server酱 Turbo 发一条微信提醒；历史学期会自动归档，电脑关机时手机仍可通过 GitHub Pages 上的只读 PWA 查看当前和历史课表，首次加载后还能离线打开。

这是单用户、本地优先的工具。本地服务只监听 `127.0.0.1`，不开放局域网；课表和设置存本机 SQLite，密码、token 只进 Windows 凭据管理器。云端 Gist 只保存 AES-256-GCM 密文，手机在浏览器内解密。

v1.4 在 v1.3“纸页”设计语言的基础上加入纸页、青瓷、雾蓝、绛陶四套配色，保留暖白纸张、深绿主色与衬线标题；四套配色共用同一布局和课程颜色，深色模式自动跟随系统。周、月、学期仍在同一课表页，宽屏提供工作台与专注两种形态。安装包自带 Python 运行时，不需要管理员权限；升级时可在 **设置 → 关于 → 检查更新** 手动检查 GitHub Releases。

## 安装包（推荐）

从 [GitHub Releases](https://github.com/MiniKirinCat/BIT_Class_Schedule/releases) 下载 `NextClass-Setup-<版本>.exe`，双击按向导安装即可。安装到 `%LOCALAPPDATA%\Programs\NextClass`，不需要另外安装 Python 或 Node.js。

- 课表、日志和运行状态在 `%LOCALAPPDATA%\NextClass\data`；
- 卸载默认保留课表数据，便于重新安装后继续使用；
- 安装包当前没有代码签名，SmartScreen 提示时请先核对来源和 SHA256；
- 更新检查只读取 GitHub 公开版本信息，不会自动下载或安装；
- 从源码版切换到安装版时，先退出源码版，把 `data\next_class.db` 复制到 `%LOCALAPPDATA%\NextClass\data`，否则历史学期不会自动带过去；凭据管理器中的密码和 token 会沿用。

完整的安装、升级、卸载、构建和发布步骤见 **[Windows 安装包、升级与发布](docs/install.md)**。下面的内容是从源码运行和开发的方式。

## 环境

- Windows 10/11
- Python 3.13（`py -3.13` 可用）
- Node.js 20+
- 能访问北理工统一身份认证和教务系统（校园网或 WebVPN）

## 初始化（源码运行）

普通用户使用上面的安装包即可。以下步骤适合开发、修改代码或直接运行源码。在项目根目录 PowerShell 中运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

脚本会创建 `.venv`、安装后端依赖、安装前端依赖并构建本地管理端 `frontend\dist-local`，同时创建 `data` 目录。云端只读页面由 GitHub Actions 单独构建 `frontend\dist-cloud`，本地日常使用不需要构建它。

## 启动与停止

最省事的方式是双击项目根目录的 `start.vbs`。它会用 `pythonw` 启动托盘并打开页面，不会出现终端窗口；之后通过托盘图标操作。如果系统禁用了 VBS，改用下面的 `scripts\start.ps1`。

也可以在 PowerShell 中运行：

```powershell
scripts\start.ps1
```

默认会在后台启动托盘并打开页面，脚本立即返回，这个终端窗口可以直接关闭。已有健康实例时只会复用并打开现有页面。

- `scripts\start.ps1 -NoOpen`：后台启动托盘，不自动打开浏览器。
- `scripts\start.ps1 -Foreground`：前台运行服务并保留控制台日志（先停止现有实例），适合调试；关闭终端会停止服务。
- `scripts\stop.ps1`：停止当前实例；托盘菜单“退出并停止服务”同样有效。

服务默认尝试 `127.0.0.1:17800`；被占用时向系统申请一个空闲端口。若设置 `NEXT_CLASS_PORT`，则只使用该端口，被占用时报错。实际端口和 PID 写入 `data\runtime.json`。

如果 PowerShell 执行策略阻止脚本，改用 `powershell -ExecutionPolicy Bypass -File scripts\start.ps1`（停止同理）。停止脚本只会结束 `data\runtime.json` 指向且命令行匹配本应用的进程，不会杀占用端口的其他程序。

## 托盘与开机自启

日常使用建议双击 `start.vbs`，或运行 `scripts\start.ps1`，托盘会在后台运行，不必保留终端窗口。也可以直接运行：

```powershell
.venv\Scripts\pythonw.exe scripts\tray.py
```

托盘图标提供：

- **打开下一节**：打开本地页面（双击图标同效）；
- **立即同步**：触发一次手动同步；
- **状态行**：显示上次同步时间或同步异常；
- **查看日志**：打开 `data\app.log`；
- **退出并停止服务**：同时结束本应用启动的本地服务，不需要再运行停止脚本。

托盘启动时会复用已经健康的本地实例；没有实例时才在后台启动一个无控制台窗口的服务。重复运行托盘不会启动第二份；`start.vbs` 和默认的 `scripts\start.ps1` 会带 `--open`，因此会打开现有页面。

在 **设置 → 启动与退出 → 开启开机自启** 会在 Windows 启动文件夹创建 `下一节.lnk`，登录后自动运行托盘；再次点击即可关闭。该操作写入当前用户目录，不需要管理员权限。

## 手动检查更新

打开 **设置 → 关于 → 检查更新**。应用先读取 GitHub Releases API，遇到限流或代理拦截时回退到公开的 Releases Atom 源，获取最新版本号。发现新版本时显示版本、发布时间、Release 说明（Atom 回退时可能没有说明）和发布页链接。它不会上传账号、课表或密钥，也不会自动下载或静默安装。

更新方式：关闭托盘，运行新版本的 `NextClass-Setup-<版本>.exe` 覆盖安装。课表历史、设置和凭据都会保留。仓库还没有发布 Release 时，检查会显示“还没有已发布的版本”。

## 首次配置

1. 输入学号和密码，点击“连接并同步”。密码只发给本机服务，再写入 Windows 凭据管理器。
2. 可选填 Server酱 Turbo SendKey 并发送测试提醒；也可以跳过。
3. 可选配置云端快照：填写 GitHub token 和 Pages 地址，应用会自动创建 secret Gist、加密发布当前课表并生成手机二维码；也可以跳过。
4. 完成后进入今天工作台。课表页可在周、月、学期之间切换；顶栏学期按钮可切换当前和历史学期。

如果 keyring 不可用，应用会明确报错并停止保存敏感信息，不会退化成明文文件。

## 日常查看

- **今天**：深绿色主卡根据时间显示正在上、下一节、今天的课已结束或今天没有课；下方是当天时间线、本周日期条、接下来几天、最新变动和学期进度。
- **课表**：周、月、学期合并在同一页。周视图可切换整周网格或单日列表，左右滑动、`←` `→` 方向键或工具栏按钮切换周次；搜索框支持课程名、课程代码、教师、教室和校区。月视图是 6 周网格加当天安排；学期视图提供周次密度热力图和课程时间轴。
- **课程详情**：点击今天的时间轴、周课表的课程块或单日列表，可以查看同一门课本学期的全部上课安排，并复制课程摘要或下载 `.ics` 日历文件。日历文件只包含当前快照中的课程时间，导入系统日历后随课表变化重新下载即可。
- **学期归档**：每个学期的快照都会保留；新学期第一次同步后，旧学期自动进入历史，不会丢失。点顶栏的学期按钮可切换当前/历史学期；历史学期有学期回顾、课程一览、课表和变动记录，手机云端同样可以查看。
- **桌面与专注**：宽度超过 920px 时使用左侧导航；超过 1180px 可在顶栏切换“工作台 / 专注”，专注会收起侧栏和右侧信息。手机端固定使用底部导航和单日课表。
- **外观**：在 **设置 → 外观**（手机云端为 **设备 → 外观**）切换纸页、青瓷、雾蓝、绛陶四套配色。四套配色共用同一套布局、字体和课程颜色，只改变界面色彩；深色模式自动跟随系统，不需要手动深浅开关，选择按设备记忆。
- **键盘快捷键**（不在输入框或弹窗内时生效）：`T` 今天、`W` 课表、`C` 变动、`S` 设置；手机云端页面用 `D` 打开设备页。

## 云端快照与手机端

手机端是一个纯静态只读 PWA，不包含教务账号、同步按钮或 GitHub token。它只做三件事：拉取 Gist 密文、在本机浏览器解密、展示今天/课表/变动；配对后可以在当前学期和历史学期之间切换，首次在线加载后还能离线打开。

完整的 Git 推送、Pages 启用、token 权限、扫码配对、验收清单和排错步骤见 **[云端快照与手机端部署指引](docs/cloud-setup.md)**。

### 一次性部署

当前仓库已完成仓库创建、Pages 启用和首次部署，站点 <https://minikirincat.github.io/BIT_Class_Schedule/> 已上线；可以直接从第 5 步（创建 gist token）继续。下面是完整重建步骤。

1. 仓库已创建并推送：<https://github.com/MiniKirinCat/BIT_Class_Schedule>（public，`master`）。
2. 打开仓库 **Settings → Pages**，把 **Build and deployment → Source** 设为 **GitHub Actions**。GitHub 不允许 Actions 自带的 token 创建 Pages，所以这一次必须手动；之后部署全自动。
3. 到 **Actions → Deploy cloud PWA** 点击 **Re-run all jobs**（或 **Run workflow**）。工作流会执行 `npm run build:cloud` 并把 `frontend/dist-cloud` 发布到 Pages。
4. Pages 地址：`https://minikirincat.github.io/BIT_Class_Schedule/`。
5. 在 GitHub **Settings → Developer settings → Personal access tokens → Tokens (classic)** 创建一个只勾选 `gist` 权限的 token。Gist API 目前建议使用 classic token。

### 配对手机

1. 本地启动「下一节」，进入 **设置 → 云端快照**，填写 GitHub token 和 Pages 地址，点击 **保存并发布**。应用会自动创建或更新 secret Gist，并生成二维码。
2. 手机扫描二维码。PWA 会从 URL fragment 导入 Gist 地址和密钥，然后立即清除地址栏中的 fragment；密钥只保存在该浏览器的 localStorage。
3. 在手机浏览器菜单中选择“添加到主屏幕”。首次在线加载后应用壳会缓存，之后断网也能打开并显示最后一次解密快照；电脑关机不影响已发布的快照。
4. 以后每次成功同步都会自动重新加密并发布包含所有学期的快照。手机重新打开或回到前台时会尝试拉取；也可以在 **设备 → 重新拉取** 手动更新。顶部学期按钮可切换当前和历史学期。

### 云端数据规则

- 发布内容使用快照 v2 结构：所有学期的课程、各学期最近 50 条变动、14 天日历切片和节次时间，整包放在同一个加密信封中；不含学号、姓名、密码、Cookie 或 GitHub token。
- 加密使用 AES-256-GCM，12 字节随机 nonce；Gist 中只有 `snapshot.enc.json` 密文信封。
- 解密密钥是 32 字节随机值，保存在 Windows 凭据管理器和手机 localStorage。二维码本身包含密钥，不要截图或转发。
- 手机首次在线加载后会缓存应用壳；之后断网也能打开，但仍显示 localStorage 中最后一次成功解密的快照。应用壳缓存不含课表明文、密钥或 token。
- 拉取顺序：Gist raw 地址 → GitHub Gist API → 本机缓存。网络失败时可显示缓存；**密钥错误或数据损坏时不会回退到缓存**，以免把旧数据误认为最新课表。
- 超过同步间隔 + 24 小时，云端页面会显示“数据可能已过期”。
- **重置配对密钥**会让旧二维码立即失效，需要重新扫码；Gist 会重新发布为新密钥的密文。

## 同步规则

- 默认每 1 天同步一次，可在设置中改为 1/2/3 天。
- 应用启动时若已到期会补同步；运行期间每小时做一次轻量到期检查。
- 自动同步失败按 1h → 3h → 6h → 12h → 24h 退避，成功后重置。
- 手动同步绕过到期时间，但有 5 分钟冷却。
- 电脑关机或应用未运行时不会同步；页面会显示最后同步时间。
- 教务系统返回空课表时，第一次保留旧快照并提醒；连续第二次才按空课表更新。

## 微信提醒

提醒通过 [Server酱 Turbo](https://sct.ftqq.com/) 发送，替代了需要付费实名认证的 PushPlus：

1. 用微信登录 Server酱，按页面提示获取 SendKey（形如 `SCT...`），并关注其公众号。
2. 在首次配置的“提醒”步骤，或 **设置 → Server酱** 中粘贴 SendKey；保存时可勾选发送测试提醒。
3. 课表变动会合并成一条消息，包含变动摘要和同步失败原因；通知失败不会影响课表数据，错误会显示在设置页和状态徽标中。
4. 免费版每天只能发少量消息（当前为 5 条/天），务必保留测试和变动提醒的额度；Server酱的配额与实名政策以其页面为准。
5. SendKey 只保存在 Windows 凭据管理器，日志和诊断报告中会被脱敏。

## 诊断与排错

**设置 → 诊断** 可以：

- **运行环境预检**：检查凭据管理器、统一身份认证和 WebVPN 的连通性，并给出建议的网络模式（校园网 / WebVPN / 自动）。
- **复制诊断报告**：生成脱敏后的版本、平台、同步状态、数据量和最近同步记录文本，便于排查；不包含学号、密码、SendKey、GitHub token 或课表内容。
- **查看同步记录**：最近 5 次同步的时间、触发方式、耗时、结果和云端发布状态。

常见错误会给出可操作提示，例如短信验证码、登录频率限制、超时、未找到当前学期或课表解析失败。

如果 Server酱测试报 `SSL: UNEXPECTED_EOF_WHILE_READING`，或 `nslookup sctapi.ftqq.com` 返回 `198.18.x.x`，说明代理的 fake-IP 把请求交给了节点。请在代理规则中让 `ftqq.com` 直连；以 Clash/Mihomo 为例，可加入 `DOMAIN-SUFFIX,ftqq.com,DIRECT`，并把 `ftqq.com` 和 `+.ftqq.com` 加入 `fake-ip-filter`，同时指定国内 DNS。

## 隐私与安全

- 本地服务只绑定 `127.0.0.1`，无 CORS、无 LAN/PIN。
- 学号密码、Server酱 SendKey、GitHub token、快照密钥都存在 Windows 凭据管理器；SQLite、日志、前端产物中不保存这些值。
- 日志轮转 1 MB × 3，写入前对密码、token、Cookie、Authorization、URL 查询参数脱敏。
- 安装版的课表数据在 `%LOCALAPPDATA%\NextClass\data\next_class.db`，日志在同一目录的 `app.log`；从源码运行时在项目 `data\next_class.db` 和 `data\app.log`。
- 卸载安装版默认保留 `%LOCALAPPDATA%\NextClass\data`，不会删除课表历史；凭据管理器中的条目也不会自动删除，需要时请手动清理服务名 `next-class`。
- Gist 只保存密文。GitHub Pages 上只有静态代码，不含 token、账号或密钥。
- 二维码由本地 `/api/setup/qr` 生成，响应禁止缓存；只在 `127.0.0.1` 可访问。
- 手机端明文快照缓存在站点 localStorage；清除站点数据或点击“清除本机数据”会移除。

## 开发

后端：

```bash
./.venv/Scripts/python.exe -m pytest backend/tests -v
```

前端：

```bash
cd frontend
npm run test
npm run build:local
npm run build:cloud
```

本地开发时先启动后端：

```bash
./.venv/Scripts/python.exe scripts/run_server.py --no-open
```

再启动 Vite（默认代理到 `http://127.0.0.1:17800`）：

```bash
cd frontend
npm run dev
```

浏览器冒烟测试：

```bash
cd frontend
npx playwright install chromium
npm run e2e
```

`npm run e2e` 会先构建 `dist-local` 和 `dist-cloud`。冒烟测试使用假数据服务 `scripts/dev_fixture_server.py` 与 `scripts/dev_cloud_fixture_server.py`，不会访问真实教务系统或 GitHub，也不需要账号密码。

构建 Windows 安装包：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_installer.ps1
```

脚本会构建前端、下载并校验官方 Python embeddable 运行时、组装 `.build\installer-stage`、做启动冒烟检查，最后用 Inno Setup 输出 `dist\NextClass-Setup-<版本>.exe`。需要先安装 Inno Setup 6；完整参数、发布流程和排错见 [docs/install.md](docs/install.md)。

## 主要依赖

- 后端：FastAPI、Uvicorn、Pydantic、httpx、keyring、cryptography、qrcode、pystray、Pillow、pytest、pytest-asyncio、BIT-Login-Python。
- 前端：React、Vite、TypeScript、Vitest、React Testing Library、Playwright。
- 版本由 `backend/requirements.txt` 和 `frontend/package-lock.json` 锁定。

## 数据来源与署名

课表抓取依赖开源项目 [BIT-Login-Python](https://github.com/BIT101-dev/BIT-Login-Python)，固定 commit `5d537ca6123b405666b82eabc2328b8f4c70b6ca`，作为依赖安装，不复制其源码。感谢 BIT101 社区。

本项目是个人工具，与北京理工大学官方无关。使用前请确认符合学校账号与数据使用规定，不要分享自己的学号、密码或 token。

## 已知限制

- 需要校园网或 WebVPN；遇到短信验证码时 V1 不支持交互式验证。
- GitHub 可达性、Server酱 配额与实名政策、教务系统接口变更都可能影响使用。
- 电脑关机期间不会产生新的同步或提醒；手机端只读，没有后台同步或推送。
- 离线壳只缓存应用代码和图标，不缓存课表明文；断网时仍依赖本机 localStorage 中最后一次成功解密的快照。清除站点数据后需要联网并重新扫码。
- GitHub Pages 必须由仓库管理员手动开启一次（Actions token 无权创建 Pages）；开启后后续部署自动。Pages 地址需要手动填入设置。
- GitHub Gist API 的未登录回退请求有速率限制；正常使用 raw 地址或手机缓存不受影响。
- 如果本地快照超过 14 天且今天不在日历切片内，页面会按学期起始日推算周次并标注“推算”，不会额外重新登录抓取当天日历。
