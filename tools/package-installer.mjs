import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version;
const exePath = 'src-tauri/target/release/sanguosha.exe';
if (!fs.existsSync(exePath)) {
  console.error('找不到构建产物，请先运行 npm run desktop:build:portable');
  process.exit(1);
}

const stage = path.resolve('release/installer-stage');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
fs.copyFileSync(exePath, path.join(stage, 'sanguosha.exe'));
if (fs.existsSync('src-tauri/target/release/WebView2Loader.dll')) {
  fs.copyFileSync('src-tauri/target/release/WebView2Loader.dll', path.join(stage, 'WebView2Loader.dll'));
}
fs.copyFileSync('src-tauri/icons/icon.ico', path.join(stage, 'icon.ico'));
fs.writeFileSync(
  path.join(stage, 'README.txt'),
  `四国闪 · 星河 v${version}\n\n作者：星河一叶Roxy\n维护邮箱：ck_xuv@vip.qq.com\n\n安装后从桌面或开始菜单启动。\n首次创建房间若出现 Windows 防火墙提示，请允许专用网络访问。\n程序安装在当前用户目录，可直接使用内置自动更新。\n`,
  'utf8',
);

const hasDll = fs.existsSync(path.join(stage, 'WebView2Loader.dll'));
const output = path.resolve('release/siguoshan-xinghe-setup.exe');
const numeric = version.split('.').map((part) => Number(part) || 0);
while (numeric.length < 4) numeric.push(0);
const versionNum = numeric.slice(0, 4).join('.');

const script = `Unicode true
!include "MUI2.nsh"
!define APP_NAME "四国闪 · 星河"
!define APP_VERSION "${version}"
!define APP_PUBLISHER "星河一叶Roxy"
!define UNINST_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Siguoshan"
Name "\${APP_NAME}"
OutFile "${output.replaceAll('\\', '/')}"
InstallDir "$LOCALAPPDATA\\Programs\\Siguoshan"
InstallDirRegKey HKCU "Software\\Siguoshan" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ABORTWARNING
!define MUI_ICON "${path.join(stage, 'icon.ico').replaceAll('\\', '/')}"
!define MUI_UNICON "${path.join(stage, 'icon.ico').replaceAll('\\', '/')}"
!define MUI_WELCOMEPAGE_TITLE "安装 四国闪 · 星河"
!define MUI_WELCOMEPAGE_TEXT "安装到当前用户目录，不需要管理员权限。"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\\sanguosha.exe"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
VIProductVersion "${versionNum}"
VIAddVersionKey "ProductName" "\${APP_NAME}"
VIAddVersionKey "FileDescription" "\${APP_NAME}"
VIAddVersionKey "FileVersion" "\${APP_VERSION}"
VIAddVersionKey "ProductVersion" "\${APP_VERSION}"
VIAddVersionKey "LegalCopyright" "\${APP_PUBLISHER}"
BrandingText "四国闪 · 星河"

Section "Install"
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File "sanguosha.exe"
${hasDll ? '  File "WebView2Loader.dll"\n' : ''}  File "README.txt"
  WriteUninstaller "$INSTDIR\\uninstall.exe"
  CreateDirectory "$SMPROGRAMS\\四国闪"
  CreateShortcut "$SMPROGRAMS\\四国闪\\四国闪.lnk" "$INSTDIR\\sanguosha.exe" "" "$INSTDIR\\sanguosha.exe" 0
  CreateShortcut "$DESKTOP\\四国闪.lnk" "$INSTDIR\\sanguosha.exe" "" "$INSTDIR\\sanguosha.exe" 0
  WriteRegStr HKCU "Software\\Siguoshan" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "\${UNINST_KEY}" "DisplayName" "\${APP_NAME}"
  WriteRegStr HKCU "\${UNINST_KEY}" "DisplayIcon" "$INSTDIR\\sanguosha.exe"
  WriteRegStr HKCU "\${UNINST_KEY}" "DisplayVersion" "\${APP_VERSION}"
  WriteRegStr HKCU "\${UNINST_KEY}" "Publisher" "\${APP_PUBLISHER}"
  WriteRegStr HKCU "\${UNINST_KEY}" "UninstallString" '"$INSTDIR\\uninstall.exe"'
  WriteRegDWORD HKCU "\${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "\${UNINST_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$INSTDIR\\sanguosha.exe"
  Delete "$INSTDIR\\WebView2Loader.dll"
  Delete "$INSTDIR\\README.txt"
  Delete "$INSTDIR\\uninstall.exe"
  Delete "$SMPROGRAMS\\四国闪\\四国闪.lnk"
  RMDir "$SMPROGRAMS\\四国闪"
  Delete "$DESKTOP\\四国闪.lnk"
  DeleteRegKey HKCU "\${UNINST_KEY}"
  DeleteRegKey HKCU "Software\\Siguoshan"
  RMDir "$INSTDIR"
SectionEnd
`;
const scriptPath = path.join(stage, 'installer.nsi');
fs.writeFileSync(scriptPath, `\ufeff${script}`, 'utf8');

const candidates = [
  process.env.MAKENSIS,
  path.join(process.env.LOCALAPPDATA ?? '', 'electron-builder/Cache/nsis/nsis-3.0.4.1/makensis.exe'),
  'C:/Program Files (x86)/NSIS/makensis.exe',
  'C:/Program Files/NSIS/makensis.exe',
].filter(Boolean);
const makensis = candidates.find((candidate) => fs.existsSync(candidate));
if (!makensis) {
  console.error('找不到 makensis。请安装 NSIS，或设置 MAKENSIS 环境变量。');
  process.exit(1);
}

console.log(`使用 NSIS：${makensis}`);
execFileSync(makensis, [scriptPath], { stdio: 'inherit' });
console.log(`安装包完成：${output}`);
