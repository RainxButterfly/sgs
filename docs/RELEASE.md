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

- `release/siguoshan-xinghe-win64.zip`
- `updates/siguoshan-xinghe-win64.zip`
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
  "version": "0.5.7",
  "notes": "更新说明",
  "url": "https://cdn.jsdelivr.net/gh/RainxButterfly/sgs@main/updates/siguoshan-xinghe-win64.zip?v=0.5.7",
  "urls": [
    "https://cdn.jsdelivr.net/gh/RainxButterfly/sgs@main/updates/siguoshan-xinghe-win64.zip?v=0.5.7",
    "https://gcore.jsdelivr.net/gh/RainxButterfly/sgs@main/updates/siguoshan-xinghe-win64.zip?v=0.5.7",
    "https://fastly.jsdelivr.net/gh/RainxButterfly/sgs@main/updates/siguoshan-xinghe-win64.zip?v=0.5.7",
    "https://ghfast.top/https://raw.githubusercontent.com/RainxButterfly/sgs/main/updates/siguoshan-xinghe-win64.zip?v=0.5.7",
    "https://ghproxy.net/https://raw.githubusercontent.com/RainxButterfly/sgs/main/updates/siguoshan-xinghe-win64.zip?v=0.5.7",
    "https://raw.githubusercontent.com/RainxButterfly/sgs/main/updates/siguoshan-xinghe-win64.zip?v=0.5.7"
  ],
  "sha256": "更新包的 SHA-256"
}
```

`version` 必须高于当前版本。zip 根目录需要包含 `sanguosha.exe` 和 `WebView2Loader.dll`，`npm run release:portable` 会自动打包。仓库需要公开，程序放在可写目录。

更新包文件名固定为 `siguoshan-xinghe-win64.zip`，清单里的 URL 带 `?v=版本号` 用来绕过镜像缓存，不要去掉。每个镜像下载后都会校验 SHA-256，缓存到旧包时会自动换下一个地址。

## 仓库名

默认使用 `RainxButterfly/sgs`。换仓库时，修改 `src-tauri/src/lib.rs` 里的 `UPDATE_REPO`，重新构建，并在生成清单时传入新的仓库名。

## 安卓安装包

安卓构建会同时生成更新清单：

```bash
npm run release:android -- RainxButterfly/sgs "更新说明"
```

生成：

- `release/siguoshan-xinghe-arm64.apk`
- `updates/siguoshan-xinghe-arm64.apk`
- `latest-android.json`

提交 `latest-android.json` 和 `updates/` 里的 APK 后，已安装的安卓版会读取清单，应用内下载并调起系统安装器。首次更新需要允许「安装未知应用」。`latest-android.json` 的 `version` 同样必须高于当前版本，APK 会校验 SHA-256。

## Windows 安装包

便携版构建完成后，使用本地 NSIS 生成安装程序：

```bash
npm run release:installer
```

输出 `release/siguoshan-xinghe-setup.exe`。安装到当前用户目录，不需要管理员权限，安装后仍可使用内置自动更新。

需要本机存在 `makensis`；脚本会自动查找常见的 NSIS 安装位置，也可以用 `MAKENSIS` 环境变量指定。

Tauri 自带的 NSIS 打包会联网下载工具链，网络不通时请使用上面的本地安装包脚本。
