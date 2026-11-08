# 安卓构建

手机浏览器可以直接加入电脑创建的房间，不需要安装。需要安装 APK 时，可以按下面的步骤构建。

## 需要

- Android SDK：platform `android-37.0`、build-tools `37.0.0`
- NDK：`26.1.10909125`
- JDK 21
- Rust Android 目标：`rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`
- 环境变量 `ANDROID_HOME`、`NDK_HOME`、`JAVA_HOME`

## 构建 APK

```bash
npm install
npm run release:android
```

脚本会：

1. 初始化 `src-tauri/gen/android`（如果还不存在）
2. 构建前端并复制到 Android assets
3. 编译 arm64 的 Rust 动态库
4. 运行 Gradle 打包
5. 使用 `release/android/siguoshan-release.keystore` 签名

输出：

`release/siguoshan-xinghe-arm64.apk`

签名配置在 `release/android/keystore.properties`，不要提交到仓库，也不要删除，否则后续 APK 无法覆盖安装旧版本。

## 应用内更新

打包时传入更新说明，会同时生成安卓更新清单：

```bash
npm run release:android -- RainxButterfly/sgs "更新说明"
```

输出 `release/siguoshan-xinghe-arm64.apk`、`updates/siguoshan-xinghe-arm64.apk` 和 `latest-android.json`。把清单和 APK 一起提交后，已安装的安卓版会在启动或点「检查更新」时读取清单，应用内下载 APK 并调起系统安装器。

首次更新需要允许四国闪「安装未知应用」，覆盖安装保留本地对局记录。脚本会同步修改 `tauri.properties` 里的 versionName/versionCode，发版时仍然要改 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 三处版本号。

## 说明

- APK 已开启局域网明文 HTTP/WebSocket 访问，手机和电脑在同一 WiFi 或虚拟局域网下可以直接加入房间。
- 当前发布的是 arm64 APK，覆盖绝大多数安卓手机。
- 安卓端和桌面端共用同一套 React 界面与游戏引擎，手机会自动使用触屏布局。
- 安卓版有独立的应用内更新，读取 `latest-android.json`，不会使用桌面的便携包更新。
- Windows 上如果构建时提示无法创建符号链接，可以不使用 `tauri android build`，改用上面的 `release:android` 脚本；它会直接复制 `.so` 并调用 Gradle。
- 如果 Gradle 首次构建较慢，是在下载 Android 构建依赖，属于正常现象。
