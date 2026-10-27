# 下一节

北京理工大学个人课表工具：从教务系统自动同步课表，打开就能看到今天和下一节；课表变化时通过 PushPlus 发一条微信提醒；电脑关机时，手机仍可通过 GitHub Pages 上的只读 PWA 查看最后一次加密快照。

这是单用户、本地优先的工具。本地服务只监听 `127.0.0.1`，不开放局域网；课表和设置存本机 SQLite，密码、token 只进 Windows 凭据管理器。云端 Gist 只保存 AES-256-GCM 密文，手机在浏览器内解密。

## 环境

- Windows 10/11
- Python 3.13（`py -3.13` 可用）
- Node.js 20+
- 能访问北理工统一身份认证和教务系统（校园网或 WebVPN）

## 初始化

在项目根目录 PowerShell 中运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

脚本会创建 `.venv`、安装后端依赖、安装前端依赖并构建本地管理端 `frontend\dist-local`，同时创建 `data` 目录。云端只读页面由 GitHub Actions 单独构建 `frontend\dist-cloud`，本地日常使用不需要构建它。

## 启动与停止

```powershell
scripts\start.ps1
```

启动器会：

- 如果已有健康的下一节实例，直接打开它，不启动第二个进程；
- 否则默认尝试 `127.0.0.1:17800`；被占用时向系统申请一个空闲端口；
- 若设置了 `NEXT_CLASS_PORT`，则只使用该端口，被占用时报错，不自动改端口；
- 把实际端口和 PID 写入 `data\runtime.json`，然后打开浏览器。

```powershell
scripts\stop.ps1
```

如果 PowerShell 执行策略阻止脚本，改用 `powershell -ExecutionPolicy Bypass -File scripts\start.ps1`（停止同理）。停止脚本只会结束 `data\runtime.json` 指向且命令行匹配本应用的进程，不会杀占用端口的其他程序。

## 首次配置

1. 输入学号和密码，点击“连接并同步”。密码只发给本机服务，再写入 Windows 凭据管理器。
2. 可选填 PushPlus token 并发送测试提醒；也可以跳过。
3. 可选配置云端快照：填写 GitHub token 和 Pages 地址，应用会自动创建 secret Gist、加密发布当前课表并生成手机二维码；也可以跳过。
4. 完成后进入今天页。布局按钮可切换三种今天布局；周课表页可切换整周/单日。

如果 keyring 不可用，应用会明确报错并停止保存敏感信息，不会退化成明文文件。

## 云端快照与手机端

手机端是一个纯静态只读 PWA，不包含教务账号、同步按钮或 GitHub token。它只做三件事：拉取 Gist 密文、在本机浏览器解密、展示今天/周课表/变动。

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
3. 在手机浏览器菜单中选择“添加到主屏幕”。之后打开图标即可查看最后一次快照；电脑关机也不影响。
4. 以后每次成功同步都会自动重新加密并发布快照。手机重新打开或回到前台时会尝试拉取；也可以在 **设备 → 重新拉取** 手动更新。

### 云端数据规则

- 发布内容遵循设计中的快照结构：课程、最近 50 条变动、14 天日历切片、节次时间；不含学号、姓名、密码、Cookie 或 GitHub token。
- 加密使用 AES-256-GCM，12 字节随机 nonce；Gist 中只有 `snapshot.enc.json` 密文信封。
- 解密密钥是 32 字节随机值，保存在 Windows 凭据管理器和手机 localStorage。二维码本身包含密钥，不要截图或转发。
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

## 隐私与安全

- 本地服务只绑定 `127.0.0.1`，无 CORS、无 LAN/PIN。
- 学号密码、PushPlus token、GitHub token、快照密钥都存在 Windows 凭据管理器；SQLite、日志、前端产物中不保存这些值。
- 日志轮转 1 MB × 3，写入前对密码、token、Cookie、Authorization、URL 查询参数脱敏。
- 课表数据在 `data\next_class.db`；日志在 `data\app.log`。
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

## 主要依赖

- 后端：FastAPI、Uvicorn、Pydantic、httpx、keyring、cryptography、qrcode、pytest、pytest-asyncio、BIT-Login-Python。
- 前端：React、Vite、TypeScript、Vitest、React Testing Library、Playwright。
- 版本由 `backend/requirements.txt` 和 `frontend/package-lock.json` 锁定。

## 数据来源与署名

课表抓取依赖开源项目 [BIT-Login-Python](https://github.com/BIT101-dev/BIT-Login-Python)，固定 commit `5d537ca6123b405666b82eabc2328b8f4c70b6ca`，作为依赖安装，不复制其源码。感谢 BIT101 社区。

本项目是个人工具，与北京理工大学官方无关。使用前请确认符合学校账号与数据使用规定，不要分享自己的学号、密码或 token。

## 已知限制

- 需要校园网或 WebVPN；遇到短信验证码时 V1 不支持交互式验证。
- GitHub 可达性、PushPlus 配额、教务系统接口变更都可能影响使用。
- 电脑关机期间不会产生新的同步或提醒；手机端只读，没有后台同步或推送。
- 云端 PWA 没有 Service Worker（按设计不做离线应用壳）；断网时只有在页面已加载的情况下才能使用本机缓存。
- GitHub Pages 必须由仓库管理员手动开启一次（Actions token 无权创建 Pages）；开启后后续部署自动。Pages 地址需要手动填入设置。
- GitHub Gist API 的未登录回退请求有速率限制；正常使用 raw 地址或手机缓存不受影响。
- 如果本地快照超过 14 天且今天不在日历切片内，页面会按学期起始日推算周次并标注“推算”，不会额外重新登录抓取当天日历。
