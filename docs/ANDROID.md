# 安卓构建

手机浏览器已经可以直接加入电脑创建的房间，不需要安装。若要打包原生 APK，可以按下面的步骤在具备 Android 工具链的机器上构建。

## 需要

- Android Studio，安装 Android SDK 与 NDK
- JDK 17
- Rust Android 目标：`rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`
- 环境变量 `ANDROID_HOME`、`NDK_HOME`

## 初始化

```bash
npm install
npm run android:init
```

初始化会生成 `src-tauri/gen/android`。

## 构建

```bash
npm run android:build
```

生成的 APK 位于 `src-tauri/gen/android/app/build/outputs/apk/`。

## 说明

原生端与桌面端共用同一套 React 界面和游戏引擎。联机时仍然由一台设备创建房间，其他设备通过局域网地址加入，不需要额外的游戏服务器。
