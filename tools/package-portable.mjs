import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version;
const repo = process.env.UPDATE_REPO || process.argv[2] || 'RainxButterfly/sgs';
const notes = process.env.UPDATE_NOTES || process.argv[3] || `四国闪 · 星河 v${version}`;

const releaseExe = 'src-tauri/target/release/sanguosha.exe';
const releaseDll = 'src-tauri/target/release/WebView2Loader.dll';
if (!fs.existsSync(releaseExe)) {
  console.error('找不到构建产物，请先运行 npm run desktop:build:portable');
  process.exit(1);
}

const folder = 'release/siguoshan-xinghe-win64';
fs.mkdirSync(folder, { recursive: true });
fs.copyFileSync(releaseExe, path.join(folder, 'sanguosha.exe'));
if (fs.existsSync(releaseDll)) fs.copyFileSync(releaseDll, path.join(folder, 'WebView2Loader.dll'));
fs.writeFileSync(
  path.join(folder, 'README.txt'),
  `四国闪 · 星河 v${version}\n\n作者：星河一叶Roxy\n\n解压后双击 四国闪.bat 启动（也可以直接运行 sanguosha.exe）。\n首次创建房间若出现 Windows 防火墙提示，请允许专用网络访问。\n手机与电脑连接同一 WiFi 后，可扫描大厅二维码加入。\n`,
  'utf8',
);
fs.writeFileSync(
  path.join(folder, '四国闪.bat'),
  '@echo off\r\nstart "" "%~dp0sanguosha.exe"\r\n',
  'utf8',
);

const zipName = 'siguoshan-xinghe-win64.zip';
const zipPath = path.join('release', zipName);
const zip = new AdmZip();
zip.addLocalFile(path.join(folder, 'sanguosha.exe'), '', 'sanguosha.exe');
if (fs.existsSync(path.join(folder, 'WebView2Loader.dll'))) {
  zip.addLocalFile(path.join(folder, 'WebView2Loader.dll'), '', 'WebView2Loader.dll');
}
zip.addLocalFile(path.join(folder, 'README.txt'), '', 'README.txt');
zip.addLocalFile(path.join(folder, '四国闪.bat'), '', '四国闪.bat');
zip.writeZip(zipPath);

const sha256 = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
const tag = process.env.UPDATE_TAG || `v${version}`;
const assetBase = `https://cdn.jsdelivr.net/gh/${repo}@${tag}/updates/${zipName}`;
const rawBase = `https://raw.githubusercontent.com/${repo}/${tag}/updates/${zipName}`;
const jsdelivr = assetBase;
const gcore = `https://gcore.jsdelivr.net/gh/${repo}@${tag}/updates/${zipName}`;
const fastly = `https://fastly.jsdelivr.net/gh/${repo}@${tag}/updates/${zipName}`;
const manifest = {
  version,
  notes,
  url: jsdelivr,
  urls: [
    jsdelivr,
    `https://testingcf.jsdelivr.net/gh/${repo}@${tag}/updates/${zipName}`,
    gcore,
    fastly,
    `https://jsd.onmicrosoft.cn/gh/${repo}@${tag}/updates/${zipName}`,
    `https://ghfast.top/${rawBase}`,
    `https://ghproxy.net/${rawBase}`,
    `https://gh-proxy.com/${rawBase}`,
    rawBase,
  ],
  sha256,
};

fs.mkdirSync('updates', { recursive: true });
fs.copyFileSync(zipPath, path.join('updates', zipName));
fs.writeFileSync('latest-portable.json', `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`打包完成：${zipPath}`);
console.log(`更新清单：latest-portable.json`);
console.log(`更新包副本：updates/${zipName}`);
console.log('请把 latest-portable.json 和 updates/ 里的 zip 一起提交到 GitHub 公共仓库。');
console.log('注意：更新包的 version 必须高于已发布版本，jsDelivr 才会检测到新版本。');
