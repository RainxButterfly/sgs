# 发布与自动更新

当前默认使用**便携版自更新**：不需要服务器，更新清单和更新包都放在 GitHub 仓库里，通过 jsDelivr / ghfast / ghproxy 等镜像获取。

## 工作方式

1. 应用读取仓库根目录的 `latest-portable.json`，依次尝试 jsDelivr、ghfast、ghproxy、raw.githubusercontent。
2. 比较清单里的 `version` 与当前程序版本。
3. 下载清单 `urls` 中任一可用的 zip，校验 `sha256`。
4. 解压后用 PowerShell 替换同目录的 `sanguosha.exe` 与 `WebView2Loader.dll`，重新启动应用。

应用目录必须可写。建议解压到桌面、文档等用户目录，不要放在 `Program Files`。

## 仓库约定

默认仓库名写在 `src-tauri/src/lib.rs` 的 `UPDATE_REPO`：

```rust
const UPDATE_REPO: &str = "RainxButterfly/sgs";
```

如果你的 GitHub 用户名或仓库名不同：

1. 修改这个常量。
2. 重新构建 exe。
3. 生成清单时传入同样的仓库名：

   ```bash
   npm run release:portable -- 你的GitHub用户名/仓库名 "更新说明"
   ```

仓库需要是**公开仓库**，否则 jsDelivr 无法读取。

## 发布新版本

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
   npm run release:portable -- RainxButterfly/sgs "新增武将、修复问题"
   ```

   会生成：
   - `release/sanguosha-xinghe-win64-<版本>.zip`
   - `updates/sanguosha-xinghe-win64-<版本>.zip`
   - `latest-portable.json`

4. 把 `latest-portable.json` 和 `updates/` 里的新 zip 提交并推送到 GitHub。
5. 旧版本应用下次启动或点击「检查更新」即可下载并自动替换。

清单示例：

```json
{
  "version": "0.2.0",
  "notes": "新增手机扫码加入、自定义规则与扩展武将。",
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

注意：

- zip 内的 `sanguosha.exe` 与 `WebView2Loader.dll` 必须在压缩包根目录，`npm run release:portable` 会自动处理。
- 每次发版使用带版本号的文件名，避免 CDN 缓存旧包。
- 清单本身可能被 jsDelivr 缓存；应用会同时尝试多个镜像并取最高版本，必要时可以等待缓存刷新或改用一个新文件名。
- 仓库每发一版会多出约 6–7MB；旧版本 zip 可以定期清理，只要当前版本仍可用。

## 安全说明

- 清单和更新包都通过 HTTPS 获取，更新包会校验 SHA-256。
- 清单与更新包来自同一个公开仓库。若仓库或镜像被篡改，仍存在风险；请不要把仓库权限交给不可信的人。
- 应用不会静默执行任意命令，更新脚本只负责替换当前目录下的两个文件并重启。

## NSIS 安装包（可选）

项目同时保留了 Tauri 官方 updater + minisign 签名 + NSIS 的配置：

- 签名公钥在 `src-tauri/tauri.conf.json`。
- 私钥在 `src-tauri/updater.key`（已 gitignore，务必自行备份，丢失后旧版本无法验证新的 NSIS 更新包）。
- 在能访问 GitHub 工具链的网络下执行：

  ```bash
  export TAURI_SIGNING_PRIVATE_KEY="$(pwd)/src-tauri/updater.key"
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
  npm run desktop:build
  ```

当前自动更新界面走的是便携版自更新；NSIS 安装包主要用于首次分发。如果希望 NSIS 版本也自动更新，需要在能访问 GitHub 的环境构建，并把 `latest.json` 和签名 updater 包发布到 GitHub Releases。
