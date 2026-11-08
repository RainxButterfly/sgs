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
  "version": "0.5.0",
  "notes": "更新说明",
  "url": "https://cdn.jsdelivr.net/gh/RainxButterfly/sgs@main/updates/siguoshan-xinghe-win64-0.5.0.zip",
  "urls": [
    "https://cdn.jsdelivr.net/gh/RainxButterfly/sgs@main/updates/siguoshan-xinghe-win64-0.5.0.zip",
    "https://gcore.jsdelivr.net/gh/RainxButterfly/sgs@main/updates/siguoshan-xinghe-win64-0.5.0.zip",
    "https://fastly.jsdelivr.net/gh/RainxButterfly/sgs@main/updates/siguoshan-xinghe-win64-0.5.0.zip",
    "https://ghfast.top/https://raw.githubusercontent.com/RainxButterfly/sgs/main/updates/siguoshan-xinghe-win64-0.5.0.zip",
    "https://ghproxy.net/https://raw.githubusercontent.com/RainxButterfly/sgs/main/updates/siguoshan-xinghe-win64-0.5.0.zip",
    "https://raw.githubusercontent.com/RainxButterfly/sgs/main/updates/siguoshan-xinghe-win64-0.5.0.zip"
  ],
  "sha256": "更新包的 SHA-256"
}
```

`version` 必须高于当前版本。zip 根目录需要包含 `sanguosha.exe` 和 `WebView2Loader.dll`，`npm run release:portable` 会自动打包。仓库需要公开，程序放在可写目录。

## 仓库名

默认使用 `RainxButterfly/sgs`。换仓库时，修改 `src-tauri/src/lib.rs` 里的 `UPDATE_REPO`，重新构建，并在生成清单时传入新的仓库名。

## Windows 安装包

便携版构建完成后，使用本地 NSIS 生成安装程序：

```bash
npm run release:installer
```

输出 `release/siguoshan-xinghe-<版本>-setup.exe`。安装到当前用户目录，不需要管理员权限，安装后仍可使用内置自动更新。

需要本机存在 `makensis`；脚本会自动查找常见的 NSIS 安装位置，也可以用 `MAKENSIS` 环境变量指定。

Tauri 自带的 NSIS 打包会联网下载工具链，网络不通时请使用上面的本地安装包脚本。
