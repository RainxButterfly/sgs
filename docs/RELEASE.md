# 发布流程

自动更新使用便携版自更新。更新清单和更新包放在仓库里，通过 jsDelivr、ghfast、ghproxy 等地址获取。

## 发版

1. 修改版本号，三处保持一致：

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

2. 构建便携版：

```bash
npm run desktop:build:portable
```

3. 打包并生成更新清单：

```bash
npm run release:portable -- RainxButterfly/sgs "更新说明"
```

会生成：

- `release/sanguosha-xinghe-win64-<版本>.zip`
- `updates/sanguosha-xinghe-win64-<版本>.zip`
- `latest-portable.json`

4. 提交并推送：

```bash
git add latest-portable.json updates/
git commit -m "release: v<版本>"
git push
```

旧版本应用在启动或点击「检查更新」时读取 `latest-portable.json`，下载更新包，校验 SHA-256，替换程序并重启。

## 更新清单

```json
{
  "version": "0.2.0",
  "notes": "更新说明",
  "url": "https://cdn.jsdelivr.net/gh/RainxButterfly/sgs@main/updates/sanguosha-xinghe-win64-0.2.0.zip",
  "urls": [
    "https://cdn.jsdelivr.net/gh/RainxButterfly/sgs@main/updates/sanguosha-xinghe-win64-0.2.0.zip",
    "https://ghfast.top/https://raw.githubusercontent.com/RainxButterfly/sgs/main/updates/sanguosha-xinghe-win64-0.2.0.zip",
    "https://ghproxy.net/https://raw.githubusercontent.com/RainxButterfly/sgs/main/updates/sanguosha-xinghe-win64-0.2.0.zip",
    "https://raw.githubusercontent.com/RainxButterfly/sgs/main/updates/sanguosha-xinghe-win64-0.2.0.zip"
  ],
  "sha256": "更新包的 SHA-256"
}
```

`version` 必须高于当前版本。zip 根目录需要包含 `sanguosha.exe` 和 `WebView2Loader.dll`，`npm run release:portable` 会自动打包。仓库需要公开，程序放在可写目录。

## 仓库名

默认使用 `RainxButterfly/sgs`。换仓库时，修改 `src-tauri/src/lib.rs` 里的 `UPDATE_REPO`，重新构建，并在生成清单时传入新的仓库名。

## NSIS 安装包

需要能访问 GitHub 的 NSIS 工具链：

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(pwd)/src-tauri/updater.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npm run desktop:build
```

签名私钥在 `src-tauri/updater.key`，不提交到仓库。
