import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version;
const repo = process.env.UPDATE_REPO || 'RainxButterfly/sgs';
const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!androidHome) {
  console.error('请先设置 ANDROID_HOME 指向 Android SDK。');
  process.exit(1);
}
const ndkHome = process.env.NDK_HOME || path.join(androidHome, 'ndk', '26.1.10909125');
if (!fs.existsSync(ndkHome)) {
  console.error(`找不到 NDK：${ndkHome}`);
  process.exit(1);
}
const javaHome = process.env.JAVA_HOME;
if (!javaHome) {
  console.error('请先设置 JAVA_HOME 指向 JDK 17 或更高版本。');
  process.exit(1);
}

const androidDir = path.resolve('src-tauri/gen/android');
const buildGradle = path.join(androidDir, 'app/build.gradle.kts');
if (!fs.existsSync(buildGradle)) {
  console.log('初始化 Android 工程…');
  execFileSync('npx', ['tauri', 'android', 'init'], { stdio: 'inherit', shell: true });
}

const androidIcons = path.resolve('src-tauri/icons/android');
if (fs.existsSync(androidIcons)) {
  for (const entry of fs.readdirSync(androidIcons)) {
    fs.cpSync(
      path.join(androidIcons, entry),
      path.join(androidDir, 'app/src/main/res', entry),
      { recursive: true },
    );
  }
}

let gradle = fs.readFileSync(buildGradle, 'utf8');
gradle = gradle.replace(
  'manifestPlaceholders["usesCleartextTraffic"] = "false"',
  'manifestPlaceholders["usesCleartextTraffic"] = "true"',
);
fs.writeFileSync(buildGradle, gradle, 'utf8');
const strings = path.join(androidDir, 'app/src/main/res/values/strings.xml');
let stringsXml = fs.readFileSync(strings, 'utf8');
stringsXml = stringsXml.replace(/"sanguosha"/g, '"四国闪"');
fs.writeFileSync(strings, stringsXml, 'utf8');

const manifestPath = path.join(androidDir, 'app/src/main/AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');
if (!manifest.includes('REQUEST_INSTALL_PACKAGES')) {
  manifest = manifest.replace(
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />',
  );
}
if (manifest.includes('android:screenOrientation=')) {
  manifest = manifest.replace(
    /android:screenOrientation="[^"]*"/,
    'android:screenOrientation="sensorLandscape"',
  );
} else {
  manifest = manifest.replace(
    'android:name=".MainActivity"',
    'android:name=".MainActivity"\n            android:screenOrientation="sensorLandscape"',
  );
}
fs.writeFileSync(manifestPath, manifest, 'utf8');

const themePath = path.join(androidDir, 'app/src/main/res/values/themes.xml');
let theme = fs.readFileSync(themePath, 'utf8');
if (!theme.includes('android:windowFullscreen')) {
  theme = theme.replace(
    '</style>',
    '        <item name="android:windowFullscreen">true</item>\n        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>\n    </style>',
  );
  fs.writeFileSync(themePath, theme, 'utf8');
}

const installerDir = path.join(androidDir, 'app/src/main/java/com/rainxbutterfly/sanguosha');
fs.mkdirSync(installerDir, { recursive: true });
fs.writeFileSync(
  path.join(installerDir, 'InstallerPlugin.kt'),
  `package com.rainxbutterfly.sanguosha

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.BatteryManager
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
class InstallApkArgs {
    lateinit var path: String
}

@TauriPlugin
class InstallerPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun install(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(InstallApkArgs::class.java)
            val file = File(args.path)
            if (!file.exists()) throw IllegalStateException("安装包不存在")
            val authority = activity.packageName + ".fileprovider"
            val uri = FileProvider.getUriForFile(activity, authority, file)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(intent)
            invoke.resolve()
        } catch (ex: Exception) {
            invoke.reject(ex.message)
        }
    }

    @Command
    fun battery(invoke: Invoke) {
        try {
            val manager = activity.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
            val result = JSObject()
            result.put("level", manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY))
            invoke.resolve(result)
        } catch (ex: Exception) {
            invoke.reject(ex.message)
        }
    }
}
`,
  'utf8',
);

fs.writeFileSync(
  path.join(installerDir, 'MainActivity.kt'),
  `package com.rainxbutterfly.sanguosha

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        hideSystemBars()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }
}
`,
  'utf8',
);

const tauriPropsPath = path.join(androidDir, 'app/tauri.properties');
let tauriProps = fs.readFileSync(tauriPropsPath, 'utf8');
const [major, minor, patch] = version.split('.').map((part) => Number(part) || 0);
const versionCode = major * 1000000 + minor * 1000 + patch;
tauriProps = tauriProps
  .replace(/tauri\.android\.versionName=.*/g, `tauri.android.versionName=${version}`)
  .replace(/tauri\.android\.versionCode=.*/g, `tauri.android.versionCode=${versionCode}`);
fs.writeFileSync(tauriPropsPath, tauriProps, 'utf8');

const proguardPath = path.join(androidDir, 'app/proguard-rules.pro');
let proguard = fs.existsSync(proguardPath) ? fs.readFileSync(proguardPath, 'utf8') : '';
if (!proguard.includes('InstallerPlugin')) {
  fs.writeFileSync(
    proguardPath,
    `${proguard}\n-keep class com.rainxbutterfly.sanguosha.InstallerPlugin { *; }\n-keep class com.rainxbutterfly.sanguosha.InstallApkArgs { *; }\n`,
    'utf8',
  );
}

console.log('构建前端…');
execSync('npm run build', { stdio: 'inherit', shell: true });

const assets = path.join(androidDir, 'app/src/main/assets');
fs.rmSync(assets, { recursive: true, force: true });
fs.mkdirSync(assets, { recursive: true });
fs.cpSync('dist', assets, { recursive: true });
fs.copyFileSync('src-tauri/tauri.conf.json', path.join(assets, 'tauri.conf.json'));

const bin = path.join(ndkHome, 'toolchains/llvm/prebuilt/windows-x86_64/bin');
const cc = path.join(bin, 'aarch64-linux-android21-clang.cmd');
const cxx = path.join(bin, 'aarch64-linux-android21-clang++.cmd');
const ar = path.join(bin, 'llvm-ar.exe');
const env = {
  ...process.env,
  ANDROID_HOME: androidHome,
  ANDROID_SDK_ROOT: androidHome,
  NDK_HOME: ndkHome,
  JAVA_HOME: javaHome,
  CC_aarch64_linux_android: cc,
  CXX_aarch64_linux_android: cxx,
  AR_aarch64_linux_android: ar,
  CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER: cc,
};
console.log('编译 Android Rust 动态库…');
execFileSync(
  'cargo',
  [
    'build',
    '--package',
    'sanguosha',
    '--manifest-path',
    'src-tauri/Cargo.toml',
    '--target',
    'aarch64-linux-android',
    '--features',
    'tauri/custom-protocol',
    '--release',
    '--lib',
  ],
  { stdio: 'inherit', env, shell: true },
);

const so = path.resolve('src-tauri/target/aarch64-linux-android/release/libapp_lib.so');
const strip = path.join(bin, 'llvm-strip.exe');
if (fs.existsSync(strip)) {
  console.log('裁剪 Android 动态库符号…');
  execFileSync(strip, ['--strip-unneeded', so], { stdio: 'inherit' });
}
const jniDir = path.join(androidDir, 'app/src/main/jniLibs/arm64-v8a');
fs.mkdirSync(jniDir, { recursive: true });
fs.copyFileSync(so, path.join(jniDir, 'libapp_lib.so'));

console.log('打包 Android APK…');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
execFileSync(
  gradlew,
  ['assembleArm64Release', '-x', 'rustBuildArm64Release', '-x', 'rustBuildUniversalRelease', '--no-daemon'],
  { cwd: androidDir, stdio: 'inherit', env, shell: process.platform === 'win32' },
);

const unsigned = path.join(androidDir, 'app/build/outputs/apk/arm64/release/app-arm64-release-unsigned.apk');
if (!fs.existsSync(unsigned)) {
  console.error(`找不到 APK：${unsigned}`);
  process.exit(1);
}
const buildTools = fs
  .readdirSync(path.join(androidHome, 'build-tools'))
  .sort()
  .pop();
if (!buildTools) {
  console.error('找不到 Android build-tools。');
  process.exit(1);
}
const tools = path.join(androidHome, 'build-tools', buildTools);
const outDir = path.resolve('release/android');
fs.mkdirSync(outDir, { recursive: true });
const aligned = path.join(outDir, 'app-arm64-release-aligned.apk');
const final = path.resolve('release/siguoshan-xinghe-arm64.apk');
const keys = fs
  .readFileSync(path.join(outDir, 'keystore.properties'), 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .reduce((result, line) => {
    const index = line.indexOf('=');
    if (index > 0) result[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    return result;
  }, {});
execFileSync(path.join(tools, 'zipalign.exe'), ['-f', '4', unsigned, aligned], { stdio: 'inherit' });
execFileSync(
  path.join(tools, 'apksigner.bat'),
  [
    'sign',
    '--ks',
    keys.storeFile,
    '--ks-key-alias',
    keys.keyAlias,
    '--ks-pass',
    `pass:${keys.storePassword}`,
    '--key-pass',
    `pass:${keys.keyPassword}`,
    '--out',
    final,
    aligned,
  ],
  { stdio: 'inherit', shell: true },
);

const sha256 = crypto.createHash('sha256').update(fs.readFileSync(final)).digest('hex');
fs.mkdirSync('updates', { recursive: true });
const updateName = 'siguoshan-xinghe-arm64.apk';
const updatePath = path.join('updates', updateName);
for (let attempt = 0; ; attempt += 1) {
  try {
    fs.copyFileSync(final, updatePath);
    break;
  } catch (error) {
    if (attempt >= 5) throw error;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}
const argNotes =
  process.argv[3] ||
  (process.argv[2] && !process.argv[2].includes('/') ? process.argv[2] : '');
const notes = process.env.UPDATE_NOTES || argNotes || `四国闪 · 星河 v${version}`;
const cacheBust = `?v=${version}`;
const urls = [
  `https://cdn.jsdelivr.net/gh/${repo}@main/updates/${updateName}${cacheBust}`,
  `https://testingcf.jsdelivr.net/gh/${repo}@main/updates/${updateName}${cacheBust}`,
  `https://gcore.jsdelivr.net/gh/${repo}@main/updates/${updateName}${cacheBust}`,
  `https://fastly.jsdelivr.net/gh/${repo}@main/updates/${updateName}${cacheBust}`,
  `https://jsd.onmicrosoft.cn/gh/${repo}@main/updates/${updateName}${cacheBust}`,
  `https://ghfast.top/https://raw.githubusercontent.com/${repo}/main/updates/${updateName}${cacheBust}`,
  `https://ghproxy.net/https://raw.githubusercontent.com/${repo}/main/updates/${updateName}${cacheBust}`,
  `https://gh-proxy.com/https://raw.githubusercontent.com/${repo}/main/updates/${updateName}${cacheBust}`,
  `https://raw.githubusercontent.com/${repo}/main/updates/${updateName}${cacheBust}`,
];
fs.writeFileSync(
  'latest-android.json',
  `${JSON.stringify({ version, notes, url: urls[0], urls, sha256 }, null, 2)}\n`,
  'utf8',
);
console.log(`安卓安装包完成：${final}`);
console.log(`安卓更新清单：latest-android.json`);
console.log(`安卓更新包副本：updates/${updateName}`);
