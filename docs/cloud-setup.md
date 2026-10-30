# 云端快照与手机端部署指引

本文是「下一节」云端只读快照的手动部署与验收步骤。完成后，电脑关机时手机仍可通过 GitHub Pages 查看当前和历史学期；首次在线加载后，断网也能打开只读课表。电脑端只负责同步和发布加密快照。

> 仓库已创建并推送：<https://github.com/MiniKirinCat/BIT_Class_Schedule>。Pages 已启用并完成首次部署，站点 <https://minikirincat.github.io/BIT_Class_Schedule/> 已可访问。第 1–4 节保留为重建和排错参考；当前可直接从第 5 节开始。不要把 token、二维码或解密密钥发到聊天、issue 或公开仓库里。

## 0. 先理解三类凭据

| 凭据 | 用途 | 权限 | 存放位置 |
|---|---|---|---|
| GitHub 登录凭据 / Git PAT | 把代码推送到 GitHub | 仓库写入权限 | Git Credential Manager |
| 云端快照 token | 本地应用创建和更新 secret Gist | **只勾选 `gist`** 的 classic token | Windows 凭据管理器，键名 `github_token` |
| 快照密钥 | 加密/解密课表快照 | 32 字节随机值 | Windows 凭据管理器 + 手机 localStorage；二维码中包含 |

这三个东西用途不同。**不要把只勾选 `gist` 的 token 当成 Git 推送密码使用**；它没有仓库写权限。

## 1. 确认本地仓库与远程

仓库已经配置好 `origin`，`master` 也已包含云端改动：

```powershell
cd D:\Qoder\Vibe_Coding
git remote -v
git status --short --branch
git log --oneline -3
```

预期：

- `origin` 指向 `https://github.com/MiniKirinCat/BIT_Class_Schedule.git`；
- 当前分支是 `master`，与 `origin/master` 同步；
- 最新提交包含云端快照与 Pages 工作流。

以后修改代码后，用仓库约定的身份推送：

```powershell
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" push origin master
```

Git Credential Manager 可能会打开浏览器要求登录 GitHub。不要把 PAT 拼进 remote URL。

## 2. GitHub 仓库状态

仓库已经存在：

```text
https://github.com/MiniKirinCat/BIT_Class_Schedule
```

它是 public 仓库，默认分支是 `master`，不需要重复创建。如果你在另一台机器上重做这套部署，才需要新建一个**空的 public 仓库**（不要初始化 README、.gitignore 或 license），然后设置 remote：

```powershell
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
```

## 3. 推送 master

当前 `master` 已经推送。只有在提交了新改动后才需要再次推送：

```powershell
git status --short --branch
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" push origin master
```

如果提示 `origin` 已存在但地址不对：

```powershell
git remote set-url origin https://github.com/MiniKirinCat/BIT_Class_Schedule.git
```

> 如果 Git 要求输入密码，请使用有仓库写权限的 GitHub PAT（不是只勾选 `gist` 的云端 token），或使用 Git Credential Manager / `gh auth login` 的浏览器登录。

## 4. 启用 GitHub Pages（必须手动一次）

> 当前仓库已完成本节：Pages 的 Source 是 **GitHub Actions**，首次部署成功。以下步骤用于重建仓库或排错。

GitHub 不允许 Actions 自带的 `GITHUB_TOKEN` 创建 Pages 站点。工作流尝试自动启用时会失败：

```text
Resource not accessible by integration
https://docs.github.com/rest/pages/pages#create-a-apiname-pages-site
```

所以首次启用必须由仓库管理员在网页上完成：

1. 打开 <https://github.com/MiniKirinCat/BIT_Class_Schedule/settings/pages>。
2. 在 **Build and deployment → Source** 中选择 **GitHub Actions**。
3. 如果页面出现 **Save**，点击保存；没有 Save 按钮说明选择已立即生效。
4. 打开 <https://github.com/MiniKirinCat/BIT_Class_Schedule/actions/workflows/pages.yml>。
5. 选择最新的 **Deploy cloud PWA** 运行，点击 **Re-run all jobs**；如果列表为空，点击 **Run workflow**，分支选 `master`。

工作流位于：

```text
.github/workflows/pages.yml
```

以后推送到 `master`（涉及 `frontend/**` 或工作流）会自动运行：

- `npm ci`
- `npm run build:cloud`
- 上传 `frontend/dist-cloud` 到 Pages

`build` 和 `deploy` 两个 job 都变绿后：

- **Settings → Pages** 会显示 “Your site is live at ...”；
- `deploy` job 的日志里会有 `page_url`；
- 地址是：

```text
https://minikirincat.github.io/BIT_Class_Schedule/
```

在电脑浏览器打开这个地址。新浏览器应看到 **“连接快照”** 页面，而不是本地课表页。看到它说明 Pages 静态页面已经部署成功；此时还没有配置快照，所以不会显示课程。

> 如果 `configure-pages` 报 `HttpError: Not Found`、`Get Pages site failed` 或 `Resource not accessible by integration`，说明 Pages 还没有开启，或 Source 没有保存成 **GitHub Actions**。按上面第 1–3 步处理，然后重新运行工作流。

## 5. 创建云端快照 token

1. 打开 GitHub 右上角头像 → **Settings**。
2. 左侧最下方 **Developer settings**。
3. **Personal access tokens → Tokens (classic)**。
4. **Generate new token (classic)**。
5. Note 填 `BIT_Class_Schedule gist`，Expiration 按你的习惯选择（建议 90 天，并设日历提醒）。
6. 只勾选 **`gist`**。不要勾选 `repo`、`workflow`、`admin` 等权限。
7. 点击 **Generate token**，立即复制以 `ghp_` 开头的值。

这个 token 只用于创建/更新 secret Gist，不用于 Git push，也不要写进 `.env`、README、截图或聊天。GitHub 的 fine-grained token 对 Gist 的支持可能有限，优先使用 classic token。

## 6. 本地完成一次真实课表同步

云端快照需要先有一份课表快照。请先启动本地应用并完成教务连接：

1. 如果应用正在运行，先停止：

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\stop.ps1
   ```

2. 安装/更新依赖并构建本地页面：

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
   ```

3. 启动：

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\start.ps1
   ```

4. 使用启动器打开的实际地址（通常是 `http://127.0.0.1:17800`，被占用时会换端口；以 `data\runtime.json` 为准）。
5. 完成学号/密码登录并等待第一次课表同步成功。需要校园网或 WebVPN。
6. 确认今天页有真实课程，并且 **设置 → 同步 → 上次成功同步** 有时间。

> 如果你还没有准备真实账号，可以先把云端配置填好，但二维码要等第一次成功的教务同步才会出现。没有课表快照时，设置页会提示“下次同步后会发布首个快照”。

## 7. 在本地设置页配置云端

进入 **设置 → 云端快照**：

1. **GitHub token**：粘贴第 5 步复制的 `ghp_...` token。
2. **GitHub Pages 地址**：填写 `https://minikirincat.github.io/BIT_Class_Schedule/`。如果你 fork 了仓库，换成自己的 Pages 地址。
3. **已有 Gist ID**：第一次留空。应用会自动创建一个 **secret Gist**。
4. 点击 **保存并发布**。

预期结果：

- 页面提示“云端配置已保存并发布”。
- Gist 栏出现一串 ID。
- **上次发布** 出现时间。
- 二维码卡片出现。
- 右上角/设置页的云端状态显示已配置。

### 检查 Gist

打开：

```text
https://gist.github.com/<你的用户名>/<Gist ID>
```

确认：

- 页面标注 **Secret gist**，不是 Public。
- 文件名是 `snapshot.enc.json`。
- 内容只有 `format`、`version`、`alg`、`nonce`、`ciphertext`、`created_at` 等字段；**不应看到课程名、学号、姓名、密码或 token**。
- 解密后的快照 v2 在一个信封中包含所有学期；旧学期不会因为新学期同步而丢失。

如果能看到明文课程，立刻停止使用、删除该 Gist 并告诉我；正常实现不应出现这种情况。

## 8. 用二维码配对手机

1. 在本地设置页找到二维码卡片。
2. 手机用系统相机或可信二维码扫描器扫描。扫描屏幕时把手机对准完整二维码，必要时放大浏览器页面；不要使用截图分享。
3. 如果用微信扫码，选择 **在浏览器中打开**，不要停留在微信内置页面。
4. 页面会短暂显示“正在解密快照…”，随后进入今天页。
5. 检查顶部显示 **最后同步于 ...**，并确认能看到刚才的真实课程。
6. 点顶栏的学期按钮，应能切换到历史学期并查看学期回顾、课表和变动；手机云端与本地使用同一套学期归档。

二维码 URL 的 fragment 会在导入后被清除；手机只保存快照地址、密钥和最后一次快照缓存。浏览器地址栏里不应长期保留 `key=`。

### 添加到主屏幕

- **Android Chrome**：右上角菜单 → **添加到主屏幕**。
- **iPhone Safari**：分享按钮 → **添加到主屏幕**。建议使用 Safari 添加。

云端页面注册了 Service Worker 离线应用壳：

- 首次在线打开时，会缓存页面代码、样式和图标；上课时断网也能从主屏幕打开应用。
- 断网时显示 localStorage 中最后一次成功解密的快照；应用代码缓存不包含课表明文、密钥或 token。
- 手机和 GitHub 都联网时，打开图标会拉取 Gist 最新快照；电脑关机不影响已发布快照，只是不会再产生新快照。
- 浏览器的“清除站点数据”会同时移除离线壳和本机快照，需要联网并重新扫码；应用内“清除本机数据”只移除配对和快照，离线壳仍在，但要有数据仍需重新扫码。

## 9. 验收清单

### 本地

- [ ] 设置页云端状态为已配置。
- [ ] Gist ID、Pages 地址和上次发布时间可见。
- [ ] 二维码可见，扫码后手机能显示真实课程。
- [ ] Gist 文件是密文，不是明文课表。
- [ ] 点击“立即重新发布”后，上次发布时间更新。
- [ ] 手机页面顶部能看到最后同步时间。
- [ ] 手机顶栏可以切换当前学期和历史学期，历史学期能查看学期回顾、课表和变动。
- [ ] 手机 **设备 → 重新拉取** 能正常刷新，并显示学期归档数量。
- [ ] 手机 **设备** 能切换工作台/专注和周课表布局。
- [ ] 把本地应用停掉后，手机仍能打开 Pages 地址并看到最后一次快照（手机需能访问 GitHub）。
- [ ] 首次在线加载并添加到主屏幕后，开飞行模式重新打开图标，仍能看到离线应用壳和本机缓存快照。
- [ ] 手机清缓存或点击“清除本机数据”后需要重新扫码。

### 云端行为

- [ ] 本地成功同步后，Gist 内容会自动更新，无需手动点发布。
- [ ] 手机重新打开或回到前台会尝试拉取；也可以手动重新拉取。
- [ ] 超过同步间隔 + 24 小时，手机会显示数据可能已过期。
- [ ] 网络失败时优先显示本机缓存；密钥错误时不会显示旧缓存，而是提示重新扫码。

## 10. 常见问题

### Actions 里没有 Deploy cloud PWA

- 确认 `.github/workflows/pages.yml` 已经推送到 `master`。
- 确认仓库 **Actions** 已启用。
- 在 **Actions** 页面手动运行一次 **Deploy cloud PWA**，分支选 `master`。

### Pages 404 或页面空白

- 确认 **Settings → Pages → Source** 是 **GitHub Actions**。
- 确认最新一次 `deploy` job 成功。
- GitHub Pages 第一次部署可能需要 1–3 分钟。
- 确认地址末尾有仓库名和斜杠：`https://minikirincat.github.io/BIT_Class_Schedule/`。
- 如果资源 404，检查工作流是否构建的是 `dist-cloud`，而不是本地 `dist-local`。

### 保存云端配置报“GitHub token 无效、没有 gist 权限，或触发了速率限制”

- 重新生成 classic token，确认只勾选 `gist`。
- 检查 token 是否过期或复制时多了空格。
- 等待几分钟再试，排除 GitHub 速率限制。

### 报“Gist 不存在，或 token 无权访问”

- 确认 Gist ID 没有填错。
- 如果原来的 Gist 被删除，或旧 token 不再有权限，可以手动新建一个 secret Gist：
  1. 打开 `https://gist.github.com`。
  2. 文件名填 `snapshot.enc.json`，内容填 `{}`。
  3. 选择 **Create secret gist**。
  4. 从地址 `https://gist.github.com/<用户名>/<Gist ID>` 中复制 Gist ID。
  5. 回本地设置页，把新 Gist ID 填入“已有 Gist ID”，保存并发布。
- 新 token 仍需只勾选 `gist`。

### 二维码不出现

按顺序检查：

1. 已经完成至少一次成功的课表同步。
2. 已经填写 GitHub Pages 地址。
3. 已经点击“保存并发布”，且上次发布时间有值。
4. Gist ID 和 token 都存在。
5. 密钥没有损坏；如果怀疑损坏，点击“重置配对密钥”。

### 手机提示“密钥不匹配，请重新扫码”

通常是因为在本地重置过配对密钥。旧二维码已经失效：

1. 回本地设置页重新显示二维码。
2. 手机上点击“清除本机配对”。
3. 重新扫码。

解密失败时应用故意不回退到旧缓存，以免把旧课表当作最新数据。

### 手机显示“正在显示缓存快照”

表示手机无法从 Gist raw 地址或 GitHub API 获取最新数据。检查：

- 手机是否能访问 GitHub；
- Gist 是否仍存在；
- 是否在本地重置过密钥但手机还没重新扫码；
- 重新打开页面或在 **设备 → 重新拉取** 重试。

### 本地提示“Windows 凭据管理器不可用”

GitHub token、快照密钥或教务密码无法写入 Windows 凭据管理器。检查 Windows 凭据管理器服务，或重新运行应用；应用不会退化成明文保存。

## 11. 密钥和 token 的日常维护

### 更换 GitHub token

在 GitHub 撤销旧 token，生成新的 classic token（只勾选 `gist`），在本地 **设置 → 云端快照** 填入新 token，保存并发布。Gist 和手机配对通常不需要重新扫码。

### 重置配对密钥

本地 **设置 → 云端快照 → 重置配对密钥**，需要点击两次确认。应用会：

1. 生成新的 32 字节密钥；
2. 用新密钥重新加密并发布当前快照；
3. 让所有旧二维码失效。

之后必须在手机上清除旧配对并重新扫码。如果重置失败，应用会尽量恢复旧密钥，旧手机仍可用；以设置页显示的上次发布时间和错误信息为准。

### 删除云端数据

如果要彻底停用：

1. 在 GitHub 删除对应 secret Gist。
2. 撤销云端快照 token。
3. 在手机上点击 **设备 → 清除本机数据**。
4. 本地没有“删除云端配置”的按钮；如不再使用，可保留本地配置但撤销 token，或重新配置。

## 12. 不要做的事情

- 不要把 `ghp_...` token、二维码截图、`snapshot_key` 或含 `key=` 的完整 URL 发到聊天、群、issue 或公开仓库。
- 不要把只勾选 `gist` 的 token 用来做 Git push。
- 不要把 `data\`、`.env`、日志或数据库提交到仓库。
- 不要把 Gist 改成 Public。
- 不要在公共电脑上扫码配对；密钥会留在该浏览器的 localStorage。
- 不要把“secret Gist”理解为只有自己可见：它是不可搜索的，但拿到 URL 和密钥的人可以解密查看。
