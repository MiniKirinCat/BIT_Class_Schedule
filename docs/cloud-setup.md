# 云端快照与手机端部署指引

本文是「下一节」云端只读快照的手动部署与验收步骤。完成后，电脑关机时手机仍可通过 GitHub Pages 打开只读课表；电脑端只负责同步和发布加密快照。

> 当前仓库还没有 Git 远程地址。下面所有 GitHub 用户名、仓库名、Pages 地址和 token 都需要替换成你自己的值。不要把 token、二维码或解密密钥发到聊天、issue 或公开仓库里。

## 0. 先理解两套凭据

| 凭据 | 用途 | 权限 | 存放位置 |
|---|---|---|---|
| GitHub 登录凭据 / Git PAT | 把代码推送到 GitHub | 仓库写入权限 | Git Credential Manager |
| 云端快照 token | 本地应用创建和更新 secret Gist | **只勾选 `gist`** 的 classic token | Windows 凭据管理器，键名 `github_token` |
| 快照密钥 | 加密/解密课表快照 | 32 字节随机值 | Windows 凭据管理器 + 手机 localStorage；二维码中包含 |

这三个东西用途不同。**不要把只勾选 `gist` 的 token 当成 Git 推送密码使用**；它没有仓库写权限。

## 1. 准备本地仓库

在 PowerShell 中进入项目目录：

```powershell
cd D:\Qoder\Vibe_Coding
git status
```

要求工作区干净。当前开发分支是 `feat/local-core`，`master` 还没有包含这次云端改动。先把 `master` 快进到最新提交：

```powershell
git switch master
git merge --ff-only feat/local-core
git log --oneline -3
```

如果 `git switch master` 提示分支不存在，先执行：

```powershell
git branch --list
```

确认实际主分支名称，再按同样方式合并。

## 2. 创建 GitHub 仓库

推荐在 GitHub 网页创建一个**空仓库**：

1. 登录 GitHub。
2. 点击右上角 **+ → New repository**。
3. 填写仓库名，例如 `next-class`。
4. 选择 **Public**。GitHub Free 的 GitHub Pages 通常要求 public 仓库；私有仓库请先确认你的账号/组织是否有 Pages 权限。
5. **不要**勾选 “Add a README file”“Add .gitignore”“Choose a license”。空仓库可以避免第一次推送时产生 unrelated histories。
6. 点击 **Create repository**。

如果已经创建了带 README 的仓库，最省事的做法是删除该空仓库后重新创建；否则需要先合并远程提交，容易把本地历史弄乱。

### 可选：使用 GitHub CLI 创建

如果你已安装并登录 `gh`：

```powershell
gh auth login
gh repo create next-class --public --source=. --remote=origin
```

这只会创建远程仓库，不会自动推送。继续执行下面的推送步骤。

## 3. 推送 master

当前仓库还没有 `origin`。添加远程地址：

```powershell
git remote add origin https://github.com/<你的用户名>/next-class.git
```

如果提示 `remote origin already exists`，改用：

```powershell
git remote set-url origin https://github.com/<你的用户名>/next-class.git
```

推送分支。Git Credential Manager 可能会打开浏览器要求登录 GitHub：

```powershell
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" push -u origin master
```

> 如果 Git 要求输入密码，请使用有仓库写权限的 GitHub PAT（不是只勾选 `gist` 的云端 token），或使用 Git Credential Manager / `gh auth login` 的浏览器登录。不要把 PAT 拼进 remote URL。

推送后，如果 GitHub 仓库默认分支是 `main`：

1. 打开仓库 **Settings → General → Default branch**。
2. 把默认分支改为 `master`。
3. 保存。

## 4. 启用 GitHub Pages

1. 打开仓库 **Settings → Pages**。
2. 在 **Build and deployment → Source** 中选择 **GitHub Actions**。
3. 不要选择 “Deploy from a branch”；本项目的 Pages 由 `.github/workflows/pages.yml` 构建。

工作流位于：

```text
.github/workflows/pages.yml
```

它会在推送到 `master` 时自动运行，也可以在 **Actions → Deploy cloud PWA → Run workflow** 手动运行。运行内容：

- `npm ci`
- `npm run build:cloud`
- 上传 `frontend/dist-cloud` 到 Pages

### 第一次运行失败怎么办

如果第一次自动运行在 `configure-pages` 步骤失败，通常是因为 Pages 还没有设置为 GitHub Actions：

1. 回到 **Settings → Pages**，确认 Source 是 **GitHub Actions**。
2. 打开 **Actions → Deploy cloud PWA**。
3. 点击 **Re-run all jobs**，或 **Run workflow** 选择 `master` 重新运行。

等待 `build` 和 `deploy` 两个 job 都变绿。成功后：

- **Settings → Pages** 会显示 “Your site is live at ...”。
- `deploy` job 的日志里会有 `page_url`。
- 地址通常是：

```text
https://<你的用户名>.github.io/next-class/
```

如果是 `<用户名>.github.io` 仓库，则是 `https://<用户名>.github.io/`。

在电脑浏览器打开这个地址。新浏览器应看到 **“连接快照”** 页面，而不是本地课表页。看到它说明 Pages 静态页面已经部署成功；此时还没有配置快照，所以不会显示课程。

## 5. 创建云端快照 token

1. 打开 GitHub 右上角头像 → **Settings**。
2. 左侧最下方 **Developer settings**。
3. **Personal access tokens → Tokens (classic)**。
4. **Generate new token (classic)**。
5. Note 填 `next-class gist`，Expiration 按你的习惯选择（建议 90 天，并设日历提醒）。
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
2. **GitHub Pages 地址**：填写第 4 步得到的 HTTPS 地址，例如 `https://alice.github.io/next-class/`。
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

如果能看到明文课程，立刻停止使用、删除该 Gist 并告诉我；正常实现不应出现这种情况。

## 8. 用二维码配对手机

1. 在本地设置页找到二维码卡片。
2. 手机用系统相机或可信二维码扫描器扫描。扫描屏幕时把手机对准完整二维码，必要时放大浏览器页面；不要使用截图分享。
3. 如果用微信扫码，选择 **在浏览器中打开**，不要停留在微信内置页面。
4. 页面会短暂显示“正在解密快照…”，随后进入今天页。
5. 检查顶部显示 **最后同步于 ...**，并确认能看到刚才的真实课程。

二维码 URL 的 fragment 会在导入后被清除；手机只保存快照地址、密钥和最后一次快照缓存。浏览器地址栏里不应长期保留 `key=`。

### 添加到主屏幕

- **Android Chrome**：右上角菜单 → **添加到主屏幕**。
- **iPhone Safari**：分享按钮 → **添加到主屏幕**。建议使用 Safari 添加。

本项目按设计没有 Service Worker，所以：

- 手机和 GitHub 都联网时，打开图标会拉取 Gist 最新快照。
- 手机断网且页面还没有加载时，不能打开完整应用壳；如果页面已经加载过，会尝试使用本机缓存。
- 电脑关机不影响手机从 GitHub 拉取快照；电脑不运行时只是不会再产生新快照。

## 9. 验收清单

### 本地

- [ ] 设置页云端状态为已配置。
- [ ] Gist ID、Pages 地址和上次发布时间可见。
- [ ] 二维码可见，扫码后手机能显示真实课程。
- [ ] Gist 文件是密文，不是明文课表。
- [ ] 点击“立即重新发布”后，上次发布时间更新。
- [ ] 手机页面顶部能看到最后同步时间。
- [ ] 手机 **设备 → 重新拉取** 能正常刷新。
- [ ] 手机 **设备** 能切换今天页布局、周课表布局和暖纸/雾蓝主题。
- [ ] 把本地应用停掉后，手机仍能打开 Pages 地址并看到最后一次快照（手机需能访问 GitHub）。
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
- 确认地址末尾有仓库名和斜杠，例如 `https://<用户名>.github.io/next-class/`。
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
