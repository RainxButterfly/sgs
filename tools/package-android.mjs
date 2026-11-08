import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version;
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
if (!manifest.includes('android:screenOrientation="portrait"')) {
  manifest = manifest.replace(
    'android:name=".MainActivity"',
    'android:name=".MainActivity"\n            android:screenOrientation="portrait"',
  );
  fs.writeFileSync(manifestPath, manifest, 'utf8');
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
const jniDir = path.join(androidDir, 'app/src/main/jniLibs/arm64-v8a');
fs.mkdirSync(jniDir, { recursive: true });
fs.copyFileSync(so, path.join(jniDir, 'libapp_lib.so'));

console.log('打包 Android APK…');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
execFileSync(
  gradlew,
  ['assembleArm64Release', '-x', 'rustBuildArm64Release', '-x', 'rustBuildUniversalRelease', '--no-daemon'],
  { cwd: androidDir, stdio: 'inherit', env },
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
const final = path.resolve(`release/siguoshan-xinghe-${version}-arm64.apk`);
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
console.log(`安卓安装包完成：${final}`);
