# 下一节

北京理工大学个人课表工具：从教务系统自动同步课表，打开就能看到今天和下一节；课表变化时通过 PushPlus 发一条微信提醒。

这是单用户、本地优先的工具。本地服务只监听 `127.0.0.1`，不开放局域网；课表和设置存本机 SQLite，密码、token 只进 Windows 凭据管理器。

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

脚本会创建 `.venv`、安装后端依赖、安装前端依赖并构建 `frontend\dist-local`，同时创建 `data` 目录。

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
3. 完成后进入今天页。布局按钮可切换三种今天布局；周课表页可切换整周/单日。

如果 keyring 不可用，应用会明确报错并停止保存敏感信息，不会退化成明文文件。

## 同步规则

- 默认每 1 天同步一次，可在设置中改为 1/2/3 天。
- 应用启动时若已到期会补同步；运行期间每小时做一次轻量到期检查。
- 自动同步失败按 1h → 3h → 6h → 12h → 24h 退避，成功后重置。
- 手动同步绕过到期时间，但有 5 分钟冷却。
- 电脑关机或应用未运行时不会同步；页面会显示最后同步时间。
- 教务系统返回空课表时，第一次保留旧快照并提醒；连续第二次才按空课表更新。

## 隐私与安全

- 本地服务只绑定 `127.0.0.1`，无 CORS、无 LAN/PIN。
- 学号密码、PushPlus token 存在 Windows 凭据管理器；SQLite、日志、前端产物中不保存这些值。
- 日志轮转 1 MB × 3，写入前对密码、token、Cookie、Authorization、URL 查询参数脱敏。
- 课表数据在 `data\next_class.db`；日志在 `data\app.log`。
- 云端只读快照（加密 Gist + GitHub Pages）是下一份实现计划的范围；本计划不包含云端凭据或上传。

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
npm run build:local
npm run e2e
```

冒烟测试使用假数据服务 `scripts/dev_fixture_server.py`，不会访问真实教务系统，也不需要账号密码。

## 主要依赖

- 后端：FastAPI、Uvicorn、Pydantic、httpx、keyring、cryptography、pytest、pytest-asyncio、BIT-Login-Python。
- 前端：React、Vite、TypeScript、Vitest、React Testing Library、Playwright。
- 版本由 `backend/requirements.txt` 和 `frontend/package-lock.json` 锁定。

## 数据来源与署名

课表抓取依赖开源项目 [BIT-Login-Python](https://github.com/BIT101-dev/BIT-Login-Python)，固定 commit `5d537ca6123b405666b82eabc2328b8f4c70b6ca`，作为依赖安装，不复制其源码。感谢 BIT101 社区。

本项目是个人工具，与北京理工大学官方无关。使用前请确认符合学校账号与数据使用规定，不要分享自己的学号、密码或 token。

## 已知限制

- 需要校园网或 WebVPN；遇到短信验证码时 V1 不支持交互式验证。
- GitHub 可达性、PushPlus 配额、教务系统接口变更都可能影响使用。
- 电脑关机期间不会产生新的同步或提醒。
- 如果本地快照超过 14 天且今天不在日历切片内，页面会按学期起始日推算周次并标注“推算”，不会额外重新登录抓取当天日历。
