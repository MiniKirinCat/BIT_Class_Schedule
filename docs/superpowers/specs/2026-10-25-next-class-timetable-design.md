# 「下一节」设计规格（V1）

- 状态：已确认，2026-10-25
- 项目：北京理工大学个人课表工具（工作名「下一节」）
- 目标平台：Windows 笔记本本地运行 + GitHub Pages 只读 PWA
- 文档位置：`docs/superpowers/specs/2026-10-25-next-class-timetable-design.md`

## 1. 背景与目标

北京理工大学教务系统（jxzxehall）是课表变动的权威来源，但查询步骤多、移动端体验差，调课/停课/换教室很容易发现得太晚。

「下一节」要解决三件事：

1. 自动从教务系统取课表，用户不需要反复登录、点菜单。
2. 打开就是“今天”和“下一节”，手机上一眼看清几点、去哪、还有多久。
3. 课表发生变化时，通过微信推送一条可独立阅读的摘要；电脑关机时，手机仍能查看最后一次同步的只读快照。

这是一个单用户、本地优先的个人工具，不做校园社区、成绩、考试、空教室或自动签到。

## 2. 范围

### 2.1 用户与场景

- 主要用户：一名北京理工大学本科生。
- 主要设备：Android 手机；需要兼容 iPhone 和电脑浏览器。
- 使用场景：
  - 早上打开手机看今天课程和下一节课。
  - 收到微信“课表变动”提醒后，打开只读 PWA 或本地页面查看细节。
  - 学期中偶尔打开本地管理端，手动刷新、检查同步状态或修改设置。
- 运行约束：只有一台笔记本可用，没有常开服务器；应用必须由用户启动，电脑关机或应用未运行时不会产生新同步。

### 2.2 V1 功能

- 教务系统登录、WebVPN 自动识别、当前学期与课表抓取。
- 本地 SQLite 保存快照、变动历史和同步记录。
- 默认每 24 小时同步一次，可设置 1/2/3 天；启动补同步；每小时轻量到期检查；手动同步（5 分钟冷却）。
- 课表变化检测：新增、取消、换教室/教师、调时间、周次调整、学期切换、学期起始日变化。
- 微信提醒（PushPlus）：变动摘要、同步失败提醒、云端发布连续失败提醒、测试提醒。
- 今天页三种可切换布局：聚焦下一节（默认）、时间轴、信息密度。
- 周课表两种可切换布局：整周网格、单日列表。
- 暖纸 / 雾蓝两套可切换主题；深色模式跟随系统自动切换，按设备记忆主题选择。
- 只读变动页：按时间倒序展示变动，标记未读。
- 本地管理端：首次配置、同步状态、设置、二维码、云端快照管理。
- 云端只读快照：AES-GCM 加密后上传 secret Gist；GitHub Pages 上的静态 PWA 拉取密文并在浏览器内解密。
- 手机首次通过二维码导入快照地址、Gist ID 和解密密钥；之后可随时查看，包括笔记本关机时。
- 云端快照的本机缓存：最近一次成功解密的快照存入 localStorage，网络或 Gist 暂时不可用时作为只读回退。

### 2.3 非目标（V1 不做）

- 局域网直连本地服务、PIN 登录、HTTPS 反向代理。
- 云端登录教务系统或云端定时抓取。
- QQ 群消息摘要、自动签到、成绩、考试、空教室、乐学作业。
- 校园社区、多用户、账号体系、分享。
- Android/iOS 原生应用。
- 手动强制浅色/深色开关、任意自定义主色取色器、离线应用壳（Service Worker）、自动密钥轮换、多设备密钥管理。
- Server酱等多推送渠道；通知层保留扩展点，但 V1 只实现 PushPlus。
- 自动创建 GitHub 仓库或自动启用 Pages；仓库创建和 Pages 启用是一次性手工步骤。

### 2.4 成功标准

- 用户连续一周打开「下一节」而不是教务系统查看课表。
- 应用运行时，课表变化在下一次同步后通过微信送达；消息本身足以知道“哪门课、什么时候、从什么变成什么”。
- 电脑关机时，手机仍能打开云 PWA 查看最后一次快照，并明确看到“最后同步于”。
- 不需要手动录入任何课程；不依赖任何第三方登录后端。
- 本地日志、SQLite、Gist 中都不出现明文密码；Gist 中不出现明文课表。

## 3. 产品体验

### 3.1 本地管理端

浏览器访问启动器打开的实际本地地址 `http://127.0.0.1:<port>`，仅在笔记本上可用。

- 首次配置向导：连接教务系统 → 微信提醒（可选）→ 云端快照（可选）→ 完成。
- 顶部状态：最后同步时间、同步状态、云端发布状态。
- 底部导航：今天 / 周课表 / 变动 / 设置。
- 今天页、周课表页、变动页与云端 PWA 复用相同的展示组件。
- 设置页包含：
  - 账号：学号、连接状态、重新登录。
  - 同步：1/2/3 天间隔、立即同步（5 分钟冷却）、下次到期时间。
  - 微信提醒：PushPlus token、启用开关、发送测试提醒。
  - 主题：暖纸 / 雾蓝；深色跟随系统，不提供手动深浅开关。
  - 云端快照：GitHub token、Gist 状态、Pages URL、立即发布、二维码、重置配对密钥。
  - 关于：版本、数据位置、隐私说明。

### 3.2 云端只读 PWA

部署在 GitHub Pages，可添加到手机主屏幕。

- 无本地服务、无教务系统凭据、无同步按钮。
- 首次打开：如果 URL fragment 带有快照配置，自动导入；否则显示“连接快照”表单，要求粘贴快照地址和密钥。
- 已连接：显示今天 / 周课表 / 变动三个只读页面，底部导航只有这三项和一个“设备”页。
- 设备页：布局偏好、主题（暖纸/雾蓝）、快照地址（脱敏）、密钥状态、重新拉取、清除本机数据。
- 顶部始终显示“最后同步于 …”；超过同步间隔 + 24 小时显示“数据可能已过期”。
- 拉取或解密失败时，优先显示 localStorage 中的最后一次成功快照，并标注“缓存快照 / 可能已过期”；没有缓存时显示可操作的错误页。
- 无后台推送；提醒由本地端经微信发出。

### 3.3 今天页（三种布局）

三种布局共享同一份数据、同一个“变动”横幅和同一个详情弹层；只改变信息层级。

| 模式 | 结构 | 默认场景 |
|---|---|---|
| A 聚焦下一节（默认） | 日期/周次 + 变动横幅 + 主色“下一节”大卡片（课程、教室、教师、倒计时）+ 今日时间轴 | 打开第一眼要看清几点走 |
| B 时间轴 | 日期/周次 + 变动横幅 + 今日概览 + 带“现在”刻度的垂直时间轴，下一节高亮 | 想看一天的节奏 |
| C 信息密度 | 日期/周次 + 周条 + 三个概览块（下一节/今日节数/变动数）+ 紧凑课程列表 | 想在一屏内扫完 |

共同规则：

- 当前正在上的课显示“正在上”；否则显示下一节和倒计时；今天课程结束后显示“今天的课结束了”；今天没课显示“今天没课”，并提示查看周课表。
- 倒计时由前端根据 `period_times`、当前时间、今日周次和课程周次计算，每 30 秒更新。
- 点击课程打开底部详情：课程名、教师、教室、周次、原始时间描述。
- 有未读变动时，顶部横幅显示数量并可跳转变动页。

### 3.4 周课表（两种布局）

| 模式 | 结构 | 规则 |
|---|---|---|
| 整周网格 | 时间列 + 7 天列，课程块按起止节次跨行；当前天高亮；窄屏横向滚动、时间列 sticky | 周一至周日都显示；点课程打开详情 |
| 单日列表 | 周条（周一至周日）+ 选中日课程列表，显示时间、课程、教室、教师、空档 | 默认选中今天；可左右切日期 |

- 首次加载没有用户选择时：视口宽度 < 900px 默认单日列表，否则默认整周网格。
- 用户手动选择后写入 localStorage，之后不再随视口自动变化。
- 周次切换：页头提供上一周/下一周和“本周”；课程按所选周次过滤。

### 3.5 变动页

- 按检测时间倒序排列，按日期分组。
- 每条显示：类型（新增/取消/改教室/改时间/周次调整/学期切换）、课程名、旧值 → 新值、检测时间。
- 未读用本地 localStorage 的 `lastSeenChangeId` 判断；打开变动页即标记已读。后端不维护已读状态。
- 空状态：“还没有检测到变动”。

### 3.6 布局与偏好持久化

- localStorage 键：
  - `next-class.todayLayout`（`focus` / `timeline` / `compact`）
  - `next-class.weekLayout`（`grid` / `list`）
  - `next-class.theme`（`warm` / `fog`），默认 `warm`
- 本地管理端和云端 PWA 是不同 origin，偏好彼此独立；同一设备的同一 origin 记住选择。
- 今天页页头提供“布局”按钮，打开三选一底部面板，带小型示意图。
- 周课表页头提供“整周 / 单日”两段式切换。
- 主题在本地设置页/云端设备页切换；深色不单独存，始终跟随系统 `prefers-color-scheme`。
- 未读变动游标：`next-class.lastSeenChangeId`。

### 3.7 视觉方向

- 中文界面；移动优先；两套可切换主题：**暖纸**（默认）与 **雾蓝**。每套都有浅色和深色变体。
- 深色模式跟随系统 `prefers-color-scheme` 自动切换；V1 不提供手动强制浅色/深色的开关。
- 所有组件只使用语义 token；切换主题只换 token，不改布局、不重载页面。
- 不使用通用后台模板、不加载外部字体和第三方 UI 库。

| token | 暖纸浅 | 暖纸深 | 雾蓝浅 | 雾蓝深 |
|---|---|---|---|---|
| 背景 | `#F7F5EF` | `#171A18` | `#F4F6F7` | `#121A22` |
| 表面/卡片 | `#FFFFFF` | `#232724` | `#FFFFFF` | `#1B2530` |
| 主文字 | `#1D211E` | `#F2F0E9` | `#17232E` | `#EAF2F7` |
| 次文字 | `#7C827B` | `#9AA39B` | `#6B7A86` | `#93A6B4` |
| 主色 | `#1F5C4A` | `#A8E6C1` | `#244C6B` | `#8FC7E8` |
| 浅主色 | `#DCE9DF` | `#2E3A33` | `#DCE7EF` | `#263A4A` |
| Hero 背景 | `#173F33` | `#24352D` | `#1B3A50` | `#152E42` |
| Hero 文字 | `#F7F5EF` | `#F2F0E9` | `#F4F8FA` | `#EAF2F7` |
| Hero 强调 | `#DFF3B5` | `#C9F5D8` | `#B9D9EE` | `#B9D9EE` |
| 提醒/变动 | `#C9772B` | `#F0B35A` | `#B85C3A` | `#E08A68` |
| 提醒浅底 | `#FBF0DD` | `#3A3124` | `#F7E7DF` | `#3A2A24` |
| 分割线 | `rgba(29,33,30,.08)` | `rgba(242,240,233,.08)` | `rgba(23,35,46,.08)` | `rgba(234,242,247,.08)` |

- 字体：`"Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`；时间与倒计时使用 tabular numerals。
- 圆角 12–18px；底部导航留出安全区；触控目标不小于 44px；支持 `prefers-reduced-motion`。
- 两套主题、浅深变体都必须满足 WCAG AA 对比度；变动状态不能只靠颜色表达。

## 4. 架构

### 4.1 组件

```text
手机/电脑浏览器（云端只读 PWA）
  └─ 拉取 Gist 密文 → 浏览器内 AES-GCM 解密 → 今天/周课表/变动

笔记本（本地）
  FastAPI 本地管理端（127.0.0.1，端口由启动器选择）
    ├─ 首次配置 / 设置 / 二维码 / 手动同步
    ├─ 同步调度器：启动补同步 + 每小时到期检查 + 手动触发
    ├─ BIT-Login 适配层：SSO、WebVPN、当前学期、课程表、日期→周次
    ├─ 归一化 + SQLite：课程节次、快照、变动、同步记录
    ├─ 变动检测：快照对比、配对、摘要、去重
    ├─ 通知：PushPlus
    └─ 加密发布：AES-256-GCM → GitHub Gist
```

外部服务：

- 北理工教务系统（校园网或 WebVPN）
- GitHub Gist（加密快照）
- GitHub Pages（静态 PWA）
- PushPlus → 微信

### 4.2 数据流

1. 应用启动或到期：调度器获取同步锁。
2. BIT-Login 登录教务系统，读取当前学期、学期起始日和课程行。
3. 归一化为课程节次；与上一份成功快照对比。
4. 有变化：写入变动记录并发送一条合并微信摘要；无变化则仅更新同步时间。
5. 无论有无变化，成功同步后都重新加密并发布云端快照；云端未配置时跳过发布，发布失败不回滚本地数据。
6. 手机打开 Pages PWA：读取 Gist 密文，用本机密钥解密，渲染；失败时回退到本地缓存快照。
7. 电脑关机：云 PWA 继续显示最后一次快照，并标注最后同步时间/过期状态。

### 4.3 技术栈与边界

- 后端：Python 3.13、FastAPI、Uvicorn、SQLite（标准库 `sqlite3`）、Pydantic v2、requests（由 BIT-Login 使用）、keyring、qrcode、cryptography。
- 数据源：`BIT-Login-Python`，从 GitHub 安装并固定 commit `5d537ca6123b405666b82eabc2328b8f4c70b6ca`；不把它复制进仓库，作为依赖使用并保留署名。
- 前端：React 19 + Vite + TypeScript；自定义 CSS；不使用 UI 框架。
- 前端测试：Vitest + React Testing Library；浏览器冒烟测试使用 Playwright。
- 后端测试：pytest。
- 本地服务只监听 `127.0.0.1`；不启用 CORS；不暴露局域网。
- 云端构建为纯静态资源；无服务端运行时。
- 时间统一使用 `Asia/Shanghai`；数据库时间戳为带 `+08:00` 的 ISO 8601。

## 5. 数据与接口

### 5.1 数据源与归一化

`bit_login.jxzxehall_login().login(username, password).get_session()` 后调用课程接口，返回：

```text
{
  "term": "2025-2026-1",
  "firstDay": "2025-09-01",
  "data": [ { ...教务原始行... } ]
}
```

使用的原始字段：

| 字段 | 含义 |
|---|---|
| `KCH` | 课程号 |
| `KCM` | 课程名 |
| `SKJS` | 教师，可能逗号分隔 |
| `JASMC` | 教室 |
| `YPSJDD` | 原始时间地点描述 |
| `SKZC` | 周次位图字符串，`1` 表示该周上课 |
| `SKXQ` | 星期几，1=周一 … 7=周日 |
| `KSJC` / `JSJC` | 开始/结束节次（1–13） |
| `XXXQMC` | 校区 |

归一化对象 `CourseSession`：

```json
{
  "course_code": "MATH101",
  "course_name": "高等数学",
  "teacher": "李老师",
  "room": "综教 A101",
  "campus": "良乡",
  "weekday": 1,
  "start_period": 3,
  "end_period": 4,
  "weeks": [1, 2, 3, 5, 6],
  "raw_time_text": "周一第3-4节{第1-3周|单周}"
}
```

规则：

- 周次位图逐字符解析，第 n 个字符为 1 表示第 n 周上课；忽略末尾空字符。
- `SKXQ` 必须在 1–7；`KSJC`/`JSJC` 必须在 1–13；不合法行导致本次解析失败，保留旧快照。
- 完全重复的归一化对象去重；同课程同时段但教室/教师不同的行保留为不同节次。
- 课程号缺失时使用 `KCM|SKJS` 作为稳定回退键，并在日志中记录一次警告（不记录完整原始行）。

节次时间表（V1 固定，后端常量并随快照下发）：

| 节次 | 开始 | 结束 |
|---|---|---|
| 1 | 08:00 | 08:45 |
| 2 | 08:50 | 09:35 |
| 3 | 09:55 | 10:40 |
| 4 | 10:45 | 11:30 |
| 5 | 11:35 | 12:20 |
| 6 | 13:20 | 14:05 |
| 7 | 14:10 | 14:55 |
| 8 | 15:15 | 16:00 |
| 9 | 16:05 | 16:50 |
| 10 | 16:55 | 17:40 |
| 11 | 18:30 | 19:15 |
| 12 | 19:20 | 20:05 |
| 13 | 20:10 | 20:55 |

### 5.2 本地 SQLite

数据库文件：`data/next_class.db`；启用 WAL。所有时间戳为 ISO 8601 +08:00。

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger TEXT NOT NULL,              -- startup | scheduled | manual
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,               -- success | failed | anomaly
  error_code TEXT,
  error_message TEXT,
  term TEXT,
  course_count INTEGER,
  change_count INTEGER,
  cloud_publish_status TEXT           -- success | failed | skipped
);

CREATE TABLE snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_run_id INTEGER NOT NULL,
  term TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  first_day TEXT NOT NULL,
  normalized_json TEXT NOT NULL,      -- CourseSession[]
  calendar_json TEXT NOT NULL,        -- CalendarEntry[]
  payload_hash TEXT NOT NULL,
  is_baseline INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_run_id INTEGER NOT NULL,
  snapshot_id INTEGER NOT NULL,
  detected_at TEXT NOT NULL,
  type TEXT NOT NULL,                 -- added | removed | modified | term_rollover | term_start_changed
  course_code TEXT,
  course_name TEXT,
  summary TEXT NOT NULL,
  details_json TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  notified_at TEXT
);

CREATE INDEX idx_snapshots_term ON snapshots(term, id DESC);
CREATE INDEX idx_changes_detected ON changes(detected_at DESC);
```

关键 `settings` 键：

- `sync_interval_days`：1/2/3，默认 1
- `push_enabled`：true/false
- `gist_id`、`gist_raw_url`、`pages_url`
- `last_success_sync_at`、`last_attempt_sync_at`、`last_cloud_publish_at`
- `last_cloud_error`、`last_notification_error`
- `failure_streak`、`cloud_failure_streak`、`empty_streak`
- `last_notified_change_set_hash`
- `last_term`、`app_schema_version`

敏感值只进 Windows 凭据管理器（keyring service `next-class`）：

- `school_username`
- `school_password`
- `pushplus_token`
- `github_token`
- `snapshot_key`（32 字节随机密钥的 base64url）

任何敏感值都不写入 SQLite、配置文件、日志或前端构建产物。

### 5.3 云端快照 JSON（加密前的明文结构）

```json
{
  "schema_version": 1,
  "app_version": "0.1.0",
  "synced_at": "2026-10-25T12:30:00+08:00",
  "sync_interval_days": 1,
  "term": "2025-2026-1",
  "first_day": "2025-09-01",
  "courses": [],
  "changes": [],
  "calendar": [
    { "date": "2026-10-25", "week": 9, "weekday": 6 }
  ],
  "period_times": [
    { "index": 1, "start": "08:00", "end": "08:45" }
  ]
}
```

- `courses` 为 `CourseSession[]`。
- `changes` 为当前学期最近 50 条变动，字段含 `id`、`detected_at`、`type`、`course_code`、`course_name`、`summary`、`before`、`after`。
- `calendar` 为同步时最好能拿到的日期→周次切片，覆盖同步当天起 14 天；取不到的日期省略。
- 不含学号、姓名、密码、Cookie、GitHub token 或解密密钥。

加密信封（Gist 文件内容）：

```json
{
  "format": "next-class-snapshot",
  "version": 1,
  "alg": "A256GCM",
  "nonce": "<base64url>",
  "ciphertext": "<base64url>",
  "created_at": "2026-10-25T12:30:00+08:00"
}
```

- 明文为快照 JSON 的 UTF-8 字节；AES-256-GCM，12 字节随机 nonce，无 AAD。
- 使用 `cryptography.hazmat.primitives.ciphers.aead.AESGCM`。
- 浏览器使用 WebCrypto `AES-GCM` 解密；密钥从 base64url 导入。

### 5.4 当前周次与日历切片

- 同步时用教务系统的“日期→周次”接口（`rqzhzcjc.do`，参数 `RQ`、`XN`、`XQ`）获取当天及之后 13 天的 `{week, weekday}`。
- `XN`/`XQ` 从学期字符串 `2025-2026-1` 拆分。
- 单个日期查询失败不影响整体同步；能拿到多少写多少。
- 本地管理端请求 dashboard 时，如果今天不在切片里，再请求当天一条并补进本地日历缓存；此扩展不回写或重新发布云端快照。查询失败则按 `first_day` 做 7 天推算。
- 云端 PWA 只用快照里的切片；今天不在切片里时按 `first_day` 推算，并显示“周次按校历推算”。
- 前端所有“今天”计算都以 `Asia/Shanghai` 为准。

### 5.5 本地 HTTP API（仅 localhost）

所有响应为 JSON；错误格式 `{"detail":"中文说明"}`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/status` | 配置状态、最后同步、下次到期、云端状态、版本 |
| POST | `/api/setup/school` | 学号/密码；验证登录并保存到 keyring，触发首次同步 |
| POST | `/api/setup/pushplus` | 保存 PushPlus token；可选立即测试 |
| POST | `/api/setup/cloud` | 保存 GitHub token + Pages URL；创建/确认 Gist；发布当前快照 |
| GET | `/api/setup/qr` | 返回二维码 SVG/data URL，含快照地址、Gist ID、密钥 |
| POST | `/api/cloud/publish` | 手动重新发布当前快照 |
| POST | `/api/cloud/reset-key` | 生成新密钥、重新加密并发布，返回新二维码 |
| POST | `/api/sync` | 手动同步；5 分钟冷却；返回本次结果 |
| GET | `/api/dashboard` | 最新快照：课程、变动、日历切片、节次时间、同步元数据 |
| GET | `/api/settings` | 非敏感设置 |
| PUT | `/api/settings` | 修改同步间隔、提醒开关 |
| POST | `/api/notifications/test` | 发送测试微信提醒 |

- `GET /api/dashboard` 始终返回最近一次成功快照；最新一次同步失败/异常时，通过同步状态字段另行告知，不用半成品覆盖页面。
- 不提供“标记变动已读”接口；未读状态由前端 localStorage 维护。
- 本地服务不启用认证；安全边界是 Windows 用户账户 + 只监听 `127.0.0.1`。
- 首次配置接口可能包含密码，必须在 localhost 上调用；服务端不记录请求体。

### 5.6 云端数据获取

- PWA 配置来源：二维码 URL fragment 或手动粘贴。
- fragment 格式：`#v=1&snapshot=<urlencoded raw url>&gist=<gist id>&key=<base64url>`。
- PWA 读取后立即 `history.replaceState` 清除 fragment，并存入 localStorage。
- 拉取顺序：
  1. `snapshot` 指向的 Gist raw URL。
  2. 若 raw 因 CORS/网络失败，请求 `https://api.github.com/gists/{gist}`，从 `files["snapshot.enc.json"].content` 取信封。
  3. 若仍失败，使用 localStorage 中最后一次成功解密的快照，并显示“缓存快照”。
- 解密失败（密钥错误/数据损坏）时不回退到缓存，明确提示“密钥不匹配，请重新扫码”，避免用户误以为看到的是最新数据。
- 成功解密后校验 `schema_version` 和必要字段；不合法则视为损坏。

## 6. 同步与变动检测

### 6.1 调度

- 应用启动完成且已配置教务账号时：
  - 若 `last_success_sync_at` 为空，或 `now - last_success_sync_at >= sync_interval_days`，立即同步。
- 后台每小时检查一次是否到期；检查本身不访问教务系统。
- 自动同步失败后按 1h → 3h → 6h → 12h → 24h 退避（上限 24h），成功或学期切换后重置；手动同步可绕过退避，但仍受 5 分钟冷却。
- 电脑睡眠时定时器暂停；唤醒后下一次检查会补上。
- 手动同步绕过到期时间，但受 5 分钟冷却限制；冷却从 `last_attempt_sync_at` 起算。
- 同步使用全局 `asyncio.Lock`；同一时间只允许一个同步。手动请求遇到正在运行返回 409。
- 应用未运行或电脑关机时不产生同步；本地页面和云 PWA 都会显示最后同步时间。

### 6.2 取数与保护

每次同步：

1. 登录并获取 `{term, firstDay, data}`。
2. 归一化课程行；记录 `term`、`firstDay`、课程数量。
3. 获取 14 天日历切片（尽力而为）。
4. 与上一份成功快照比较（同 term）。

保护规则：

- **学期切换**：`term` 不同时，本次作为新基线；生成一条 `term_rollover` 变动，微信提醒“已切换到新学期，课表已同步”。不把旧学期课程报成取消，重置 `empty_streak` 与失败退避。
- **学期起始日变化**：同 term 但 `firstDay` 不同，生成 `term_start_changed`；更新快照并提醒。
- **空结果**：
  - 同 term、上一份快照有课、本次 0 门：`empty_streak += 1`。
  - 第 1 次：`status=anomaly`，保留旧快照，不生成“全部取消”；若这是失败连续段的第一次，发一次微信提醒。
  - 连续第 2 次：接受空课表为新基线，生成一条“课表连续两次为空，已按空课表更新”的变动，重置 `empty_streak`。
  - 学期切换导致的空结果：直接作为新基线，不算异常。
- **解析失败**：保留旧快照，记录 `PARSE_ERROR`，不覆盖任何数据。
- 每次成功同步都写 `snapshots` 与 `sync_runs`；失败也写 `sync_runs`。

### 6.3 变动识别

匹配步骤：

1. 计算每个节次的精确键：
   `course_code | weekday | start_period | end_period | weeks_bitmap | room | teacher`
2. 精确键相同的视为未变化。
3. 旧集合与新集合中未匹配的项：
   - 按 `course_code` 分组。
   - 同课程内，按周次是否有交集配对；有交集且时间/周次不同，记为 `modified`。
   - 无交集或无法唯一配对，分别记为 `removed` / `added`。
4. 生成变动摘要（中文）：
   - 新增：`新增：周二 7-8 节 物理实验 · 实验楼 201`
   - 取消：`取消：周五 5-6 节 大学物理`
   - 改教室/教师：`周三 3-4 节 高等数学：A101 → B202`
   - 调时间：`周五 5-6 节 大学物理调整到周四 3-4 节`
   - 周次调整：`周三 1-2 节 线性代数：第1-8周 → 第1-6周`
5. 每个变动计算独立 `fingerprint` 存入 `changes`，只用于同一次同步内的去重，不设数据库唯一约束。
6. 把本次全部变动的稳定键 + 摘要排序后计算“变动集合哈希”；集合非空且与 `settings.last_notified_change_set_hash` 不同时发送，发送成功后写入该哈希。无变动的同步把该值清空，保证同一变动在消失后再次出现时仍会提醒。
7. 一次同步最多发一条变动摘要：前 5 条 + `共 N 处`。超过 5 条不展开全部。

### 6.4 通知

PushPlus：

- 端点：`POST https://www.pushplus.plus/send`
- 请求：`{"token":"...","title":"...","content":"...","template":"txt"}`
- 成功：HTTP 200 且响应 `code=200`；其他视为失败。
- 失败时立即重试一次；仍失败则记录 `last_notification_error`，不影响同步结果。

通知场景：

| 场景 | 是否发送 | 内容 |
|---|---|---|
| 首次成功同步（基线） | 否 | — |
| 有课表变动 | 是，一条合并摘要 | 标题 `课表变动 · N 处`；内容含检测时间、明细、前 5 条上限 |
| 同步失败/异常 | 连续段第一次 | 标题 `课表同步失败`；含原因和建议 |
| 云端发布失败 | 连续第 2 次 | 标题 `云端快照未更新`；提示检查 GitHub token |
| 新学期 | 是 | 标题 `新学期课表已同步` |
| 测试按钮 | 手动 | 标题 `下一节测试提醒` |

- 同步失败恢复后重置 `failure_streak`。
- 云端发布恢复后重置 `cloud_failure_streak`。
- 通知内容不包含解密密钥、token、Gist URL 或任何链接；消息本身可读。

### 6.5 失败与过期

| 失败 | 本地数据 | 云端 | 用户看到 |
|---|---|---|---|
| 教务登录失败 | 保留上一份快照 | 不变 | 本地错误横幅；第一次失败发微信；云端 PWA 显示旧快照和过期提示 |
| 网络/WebVPN 失败 | 保留 | 不变 | 同上 |
| 解析失败 | 保留 | 不变 | 同上，错误码 `PARSE_ERROR` |
| 同 term 首次空结果 | 保留 | 不变 | 异常提示；第一次失败发微信 |
| 云端发布失败 | 正常更新 | 保持旧密文 | 本地设置页标红；连续两次失败发微信 |
| Gist token 失效 | 正常 | 保持旧密文 | 本地提示重新配置 token |
| Gist 被删除 | 正常 | 无法发布 | 本地提示重新创建；新 Gist 需重新生成二维码 |
| 解密失败（手机） | — | 正常 | PWA 报“密钥不匹配”，不回退缓存 |

云端过期规则：

- 快照中的 `sync_interval_days` + 24 小时为阈值。
- 超过阈值，PWA 顶部显示“数据可能已过期”。
- 无网络/Gist 不可达时使用缓存快照，并显示“缓存快照 · 最后同步于 …”。

## 7. 云端快照与安全

### 7.1 GitHub

- 认证：经典 personal access token，仅勾选 `gist` scope；存放在 Windows 凭据管理器。
- 首次发布：
  - `POST https://api.github.com/gists`
  - `{"description":"next-class encrypted timetable snapshot","public":false,"files":{"snapshot.enc.json":{"content":"<envelope>"}}}`
  - 保存 `gist_id` 与 `files["snapshot.enc.json"].raw_url`。
- 后续发布：`PATCH https://api.github.com/gists/{gist_id}` 更新同一文件。
- Gist 为 secret（不公开列出），且内容本身加密；两者叠加，不把 secret Gist 当唯一安全边界。
- Pages：项目仓库公开；GitHub Actions 构建 `VITE_APP_MODE=cloud` 的静态站点并部署到 GitHub Pages。仓库和 Pages 由用户一次性创建/启用，应用不自动操作仓库。
- 云端构建不包含任何秘密；`VITE_BASE_PATH` 由仓库名决定。

### 7.2 密钥与二维码

- 首次配置云端时生成 32 字节随机密钥（`secrets.token_bytes(32)`），base64url 无填充。
- 密钥存 keyring 和手机 localStorage；Gist、SQLite、日志、前端构建产物中都没有它。
- 二维码内容：
  `https://<user>.github.io/<repo>/#v=1&snapshot=<encoded raw url>&gist=<id>&key=<key>`
- PWA 读取 fragment 后清空地址栏；fragment 不会发送给 GitHub。
- 二维码只在本地管理端显示；页面提供“显示密钥”手动复制。
- `POST /api/cloud/reset-key`：生成新密钥，重新加密当前快照并发布，返回新二维码；旧手机会解密失败，需要重新扫码。

### 7.3 凭据与日志

- Windows 凭据管理器（keyring）：学号、密码、PushPlus token、GitHub token、快照密钥。
- 如果 keyring 不可用：直接报错并停止保存；**不**回退到明文文件。
- 日志：应用日志写 `data/app.log`，轮转 1 MB × 3；对密码、token、Cookie、密钥、Authorization 头做脱敏。
- 不记录完整请求体、不记录原始课程行；解析错误只记录字段名和错误类型。
- `sync_runs.error_message`、设置页错误和 API 错误文案在写入/返回前脱敏：去掉 URL 查询参数、Cookie、token；API 不返回堆栈。
- 本地 SQLite 只存课表与设置，不存密码/token/密钥。
- 云端 PWA 无 analytics、无第三方脚本、无外部字体；使用严格 CSP。

### 7.4 安全边界

- 本地服务只绑定 `127.0.0.1`；不提供局域网访问、PIN 或 CORS。
- 同一 Windows 用户下的其他进程可以访问 localhost 上的实际端口；这被视为用户自己的信任边界。
- 云端 PWA 只读；不接触教务系统，不持有 GitHub token。
- Gist 只存密文；Pages 只托管静态代码。
- 手机丢失时，持有 localStorage 密钥的人可解密快照；用户可在本地管理端重置密钥并让旧设备失效。

### 7.5 CSP

云端 `index.html` 至少包含：

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
connect-src 'self' https://gist.githubusercontent.com https://api.github.com;
manifest-src 'self';
base-uri 'self';
form-action 'none';
frame-ancestors 'none';
```

## 8. 前端实现

### 8.1 双模式与共享组件

同一套 React 代码，两个构建入口/模式：

- `VITE_APP_MODE=local`：由 FastAPI 托管，调用本地 `/api`，包含管理页。
- `VITE_APP_MODE=cloud`：静态部署到 GitHub Pages，使用 `CloudDataProvider`，只读。

共享：

- `Dashboard` 视图、今天页 3 种布局、周课表 2 种布局、变动页、课程详情弹层、未读逻辑、倒计时/下一节计算、样式。
- 主题系统：语义 CSS 变量 + 根节点 `data-theme="warm|fog"`；`@media (prefers-color-scheme: dark)` 覆盖为对应深色 token。主题选择存 localStorage；切换不重载页面。
- 数据形状 `ScheduleSnapshot` 两端一致；本地 API 返回同样字段。
- 本地端额外的管理页/设置页/向导独立。

数据提供者接口：

```ts
type DataProvider = {
  loadSnapshot(): Promise<ScheduleSnapshot>;
  isAdmin: boolean;
  sync?: () => Promise<SyncResult>;
  ...
};
```

- `LocalApiProvider`：`GET /api/dashboard`。
- `CloudSnapshotProvider`：读取配置 → 拉取 → 解密 → 校验 → 缓存。

### 8.2 页面与状态

- 无 URL 路由；底部导航用 React 状态切换页面，避免 GitHub Pages 的 SPA 回退问题。
- 今天页：`useNow()` 每 30 秒更新；从 `courses`、`calendar`、`period_times` 计算今天/下一节/正在上。
- 周课表：当前周由用户选择；用 `course.weeks.includes(week)` 过滤；网格按 `start_period`/`end_period` 跨行。
- 变动页：读取 `snapshot.changes`；打开页面时更新 `lastSeenChangeId`。
- 云端“设备”页：显示快照地址（脱敏）、密钥状态、布局、主题、清除本机数据、重新拉取。
- 本地设置页：管理端 API；主题选择、敏感字段不回显完整值，只显示“已配置/需要更新”。
- 主题切换只更新根节点 `data-theme` 和 localStorage，不触发数据请求；深色切换完全由系统媒体查询驱动。

### 8.3 首次配置（本地）

1. 连接教务系统：学号 + 密码 → 调 `/api/setup/school` → 首次同步 → 显示今日课表。
2. 微信提醒（可跳过）：PushPlus token → 测试提醒。
3. 云端快照（可跳过，之后可在设置补全）：
   - GitHub token → `/api/setup/cloud` 创建/确认 secret Gist。
   - Pages URL（用户部署后填写）。
   - 显示二维码；提示用手机扫描或手动复制地址+密钥。
4. 完成。

云端 PWA 部署步骤写入 README；应用不自动创建仓库。用户需要：

- 创建公开 GitHub 仓库并推送本项目。
- 在仓库 Settings → Pages 选择 GitHub Actions。
- 等待 `pages.yml` 部署完成，复制 Pages URL 填入本地设置。

### 8.4 可访问性与移动端

- 底部导航和主要按钮触控目标 ≥ 44px。
- 颜色对比度满足 WCAG AA；变动状态不只靠颜色，还带文字/图标。
- 表单有 label 和错误文案；弹层可 Esc 关闭。
- 支持 `prefers-reduced-motion`；倒计时不使用持续动画。
- 移动端安全区 `env(safe-area-inset-bottom)`。
- 屏幕阅读器：课程块使用 button，周网格有时间/星期语义标签。

## 9. 测试与验收

### 9.1 自动化测试

后端（pytest）：

- 归一化：周次位图、单双周、非法 SKXQ/节次、去重、课程号缺失回退。
- 日历切片：成功、部分失败、全失败、日期→周次字段类型。
- 变动检测：新增、取消、换教室、换教师、调时间、周次变化、无法配对时保守拆分、学期切换、`firstDay` 变化。
- 空结果两连击：第一次保留、第二次接受。
- 变动指纹去重；通知只发一次。
- 调度：到期判断、启动补同步、手动冷却、锁冲突。
- 加密：AES-GCM 往返；Python 加密可由 WebCrypto 测试向量解密（Node 脚本或 Vitest）。
- 快照 schema 校验；Gist 发布成功/失败；PushPlus 成功/失败；keyring 缺失时报错。
- API：FastAPI TestClient + fake gateway/notifier/publisher，覆盖 setup、sync、dashboard、settings、qr、reset-key。

前端（Vitest + RTL）：

- 今天页 3 种布局在同一数据下渲染正确；正在上/下一节/结束/无课四态。
- 周课表 grid/list 切换、周次过滤、跨节次课程块。
- 布局偏好写入 localStorage 并在重载后恢复。
- 主题：暖纸/雾蓝切换、localStorage 持久化、`prefers-color-scheme: dark` 下深色 token 生效；5 种布局在浅/深两套主题下都正常渲染。
- 未读变动游标。
- 云端解锁：正确密钥解密、错误密钥报错且不回退缓存、无网络使用缓存。
- 过期阈值显示。
- 管理端表单校验和错误展示。

浏览器冒烟（Playwright 或手工）：

- 本地端在 390px 移动视口和桌面视口完成：配置假数据 → 今天页切换 3 种布局 → 周课表切换 2 种布局；分别在浅色和深色（Playwright `colorScheme`）下检查。
- 云端构建用假快照/假加密数据完成：导入 → 解密 → 三个页面 → 过期提示。
- 真实教务登录由用户在本机运行首次配置完成；开发过程不索取或记录账号密码。

### 9.2 手工验收清单

- 首次配置后能看到今天课程和下一节；倒计时与节次时间一致。
- 暖纸/雾蓝切换后所有页面同步变色；系统切到深色时自动使用深色变体；刷新后主题选择保留；没有手动深浅开关。
- 修改一份本地 fixture 课表，重新同步后：变动页正确、微信收到一条合并摘要、不重复。
- 关闭本地服务后打开云 PWA：仍显示最后快照，并显示最后同步时间；超过阈值显示过期。
- 故意填错密钥：云 PWA 报“密钥不匹配”，不显示缓存内容。
- 故意让 PushPlus token 失效：同步仍成功，本地显示通知错误，数据不丢。
- 故意让 GitHub token 失效：本地同步成功、微信正常、云端发布失败提示；恢复后重试成功。
- 日志、SQLite、Gist 中搜索不到明文密码/密钥/课表。
- 本地服务只监听 127.0.0.1。

### 9.3 完成定义

- 所有自动化测试通过。
- 手工验收清单通过；真实登录和 PushPlus 测试由用户确认。
- README 中的首次配置、启动、Pages 部署步骤可直接照做。
- 没有未完成的实现项、占位页面或待定的核心路径。

## 10. 交付与运行

### 10.1 目录结构

```text
next-class/
  backend/
    app/
      __init__.py
      main.py            # FastAPI、静态文件、生命周期
      config.py          # 路径、常量、时区
      db.py              # SQLite schema 与访问
      models.py          # Pydantic / dataclass
      security.py        # keyring、日志脱敏、加密
      school_gateway.py  # BIT-Login 适配
      normalizer.py      # 原始行 → CourseSession
      schedule.py        # 周次、今天、日历切片
      change_detector.py
      notifier.py        # PushPlus
      snapshot_publisher.py # Gist + Pages/QR 配置
      sync_service.py
      scheduler.py
      api.py
    tests/
    requirements.txt
  frontend/
    src/
      main.tsx
      App.tsx
      styles.css
      styles/themes.css  # 暖纸/雾蓝 × 浅色/深色语义 token
      types.ts
      lib/                # 时间、布局、下一节计算、加密
      shared/             # 今天/周课表/变动/组件
      local/              # 管理端、设置、向导
      cloud/              # 只读 PWA、解锁、设备
      data/               # LocalApiProvider / CloudSnapshotProvider
    package.json
    vite.config.ts
    index.html
  .github/workflows/pages.yml
  scripts/
    setup.ps1
    start.ps1
    stop.ps1
    run_server.py
  docs/superpowers/specs/2026-10-25-next-class-timetable-design.md
  .gitignore
  README.md
```

### 10.2 运行

- 一次性初始化：`scripts/setup.ps1`
  - 检查 Python 3.13 和 Node；
  - 创建 `.venv`，安装依赖；
  - `npm ci`，构建 `dist-local`；
  - 初始化 `data/`。
- 启动：`scripts/start.ps1`
  - 调用 `scripts/run_server.py`；
  - 若 `data/runtime.json` 指向一个 `/api/health` 健康的现有实例，直接打开它，不启动第二个；
  - 否则选择一个可用端口启动 Uvicorn（只绑定 127.0.0.1），等待健康检查，再打开实际 URL。
- 停止：`scripts/stop.ps1` 结束本应用进程并清理 `data/runtime.json`。
- 端口选择：
  - 默认尝试 `17800`；
  - 若设置了 `NEXT_CLASS_PORT`，使用该端口；被其他进程占用时报错，不自动改端口；
  - 未设置时，17800 被占用则向操作系统申请一个空闲端口（`127.0.0.1:0`）；
  - 实际端口与 PID 写入 `data/runtime.json`；前端只用相对 `/api`，不硬编码端口；
  - 不结束或杀掉占用端口的其他进程。
- 开发模式：Vite 代理到 `NEXT_CLASS_DEV_API`（默认 `http://127.0.0.1:17800`）；生产构建走同源相对路径。
- 不注册 Windows 服务/开机自启；用户可自行创建启动快捷方式。
- 应用必须保持运行才会定时同步；关闭即停止检查。

### 10.3 依赖与许可

- `requirements.txt` 固定版本；BIT-Login-Python 使用固定 commit。
- 不复制 BIT-Login 源码；README 注明依赖来源与原作者。
- 前端锁定 `package-lock.json`。
- 所有第三方依赖需在 README 中列出。

### 10.4 Pages 部署

- 仓库公开；Pages 来源选 GitHub Actions。
- `pages.yml` 在 push 到 `main` 或手动触发时：
  - `npm ci`
  - `VITE_APP_MODE=cloud VITE_BASE_PATH=/${{ github.event.repository.name }}/ npm run build:cloud`
  - 上传 `frontend/dist-cloud` 并部署。
- 本地设置中的 Pages URL 应与实际部署一致；变更后重新生成二维码。

### 10.5 实施阶段

1. **本地数据基础**：SQLite、BIT-Login 适配、归一化、日历切片、快照/变动单元测试。
2. **同步与提醒**：调度、冷却与退避、变动检测、PushPlus、失败保护。
3. **本地 UI**：首次配置、今天/周课表/变动、5 种布局、设置页与二维码展示。
4. **云端只读**：AES-GCM、Gist 发布、Pages 构建、云端 PWA、缓存/过期/错误页。
5. **硬化与交付**：日志脱敏、CSP、启动脚本、Pages workflow、README、端到端验收。

## 11. 风险与限制

- **GitHub 可达性**：手机访问 GitHub Pages/Gist 可能受网络环境影响；V1 按用户选择使用 GitHub，若不可用则后续替换静态托管，不改加密/快照协议。
- **Gist raw CORS**：若 raw 不可用，PWA 回退到 Gist API；仍不可用则显示缓存/错误。
- **同步延迟**：1–3 天间隔意味着提醒可能滞后；用户可通过手动同步立即检查。电脑关机期间完全不检查。
- **教务系统变更**：接口或登录流程变化可能导致同步失败；保留旧数据并明确报错。
- **验证码/短信**：V1 不支持交互式挑战；遇到时提示用户改用密码登录或稍后重试。
- **PushPlus**：第三方配额/可用性；失败不影响课表数据。
- **密钥丢失**：手机清除浏览器数据后需重新扫码；本地清除云端设置会生成新密钥。
- **时间准确性**：倒计时依赖设备时钟；设备时区异常会导致显示偏差。
- **单用户**：不做多账号、多学生、共享。

## 12. 决策记录

| 决策 | 结果 |
|---|---|
| 项目方向 | 校内课表，不做 QQ/游戏/签到 |
| 数据源 | jxzxehall，通过 BIT-Login-Python（固定 commit） |
| 运行时 | 仅笔记本；无 LAN/PIN；本地管理端只监听 localhost，启动器自动选择端口 |
| 同步 | 默认 1 天，可 1/2/3 天；启动补同步；每小时到期检查；手动 5 分钟冷却 |
| 变动提醒 | PushPlus → 微信；一条合并摘要；失败首次提醒 |
| 云端 | GitHub secret Gist 存 AES-GCM 密文；GitHub Pages 只读 PWA |
| 手机访问 | 二维码导入快照地址 + 密钥；电脑关机仍可看上次快照 |
| 布局 | 今天页 3 种、周课表 2 种，用户切换，按设备记忆 |
| 主题 | 暖纸/雾蓝两套可切换；深色跟随系统；按设备记忆，无手动深浅开关 |
| 前端 | React + Vite + TypeScript，自定义 CSS，无 UI 框架 |
| 后端 | Python 3.13 + FastAPI + SQLite + BIT-Login-Python |

## 13. 后续候选（不属于 V1）

- Server酱/其他通知渠道。
- 服务端推送失败后的自动补偿队列。
- 手动深色开关、自定义主题编辑器、Service Worker 离线应用壳。
- 多设备密钥管理与自动轮换。
- 静态托管从 GitHub Pages 切换到国内可达方案。
- 从 QQ 群公告补充教务系统尚未更新的临时变动（需解决消息获取方式与隐私问题）。

## 附录：原始字段与周次解析注意

- `SKZC` 是 `1/0` 字符串，不是区间描述；第 n 位对应第 n 周。
- `SKXQ` 为 1–7；`KSJC`/`JSJC` 为 1–13。
- 教务系统返回的学期代码示例：`2025-2026-1`；拆分为 `XN=2025-2026`、`XQ=1`。
- 日期→周次接口返回的 `ZC` 可能是数字或字符串；`XQJ` 为 1–7，优先用它处理调休。
- 课表接口的 `data` 可能包含同一课程的多条排课行；每行独立归一化，不做课程级合并。
- 任何字段类型异常都应使本次归一化失败并保留旧快照，不能静默跳过导致“课程消失”。
