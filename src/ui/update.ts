import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isAndroidApp, isTauri } from '../net/lan';

export function manualUpdateUrl(): string {
  return isAndroidApp()
    ? 'https://fastly.jsdelivr.net/gh/RainxButterfly/sgs@main/updates/siguoshan-xinghe-arm64.apk'
    : 'https://ghfast.top/https://raw.githubusercontent.com/RainxButterfly/sgs/main/updates/siguoshan-xinghe-setup.exe';
}

export interface PortableUpdateInfo {
  version: string;
  notes: string;
  url: string;
  urls?: string[];
  sha256: string;
}

export interface AppUpdateInfo {
  version: string;
  currentVersion: string;
  notes: string;
  date?: string;
  android?: boolean;
  raw: PortableUpdateInfo;
}

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.1.0';

export function compareVersion(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function manifestMirrors(name: string): string[] {
  const stamp = Date.now();
  const bases = [
    `https://fastly.jsdelivr.net/gh/RainxButterfly/sgs@main/${name}`,
    `https://jsd.onmicrosoft.cn/gh/RainxButterfly/sgs@main/${name}`,
    `https://cdn.jsdelivr.net/gh/RainxButterfly/sgs@main/${name}`,
    `https://testingcf.jsdelivr.net/gh/RainxButterfly/sgs@main/${name}`,
    `https://gcore.jsdelivr.net/gh/RainxButterfly/sgs@main/${name}`,
    `https://raw.githubusercontent.com/RainxButterfly/sgs/main/${name}`,
    `https://ghfast.top/https://raw.githubusercontent.com/RainxButterfly/sgs/main/${name}`,
    `https://ghproxy.net/https://raw.githubusercontent.com/RainxButterfly/sgs/main/${name}`,
    `https://gh-proxy.com/https://raw.githubusercontent.com/RainxButterfly/sgs/main/${name}`,
    `https://cdn.statically.io/gh/RainxButterfly/sgs/main/${name}`,
  ];
  return bases.map((url) => `${url}${url.includes('?') ? '&' : '?'}t=${stamp}`);
}

async function fetchManifest(url: string): Promise<PortableUpdateInfo | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return null;
    const info = (await response.json()) as PortableUpdateInfo;
    return info?.version ? info : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchManifestFromWeb(name: string): Promise<PortableUpdateInfo | null> {
  const results = await Promise.all(manifestMirrors(name).map((url) => fetchManifest(url)));
  const valid = results.filter((info): info is PortableUpdateInfo => !!info);
  if (!valid.length) throw new Error('网页通道无法连接更新镜像');
  const newer = valid
    .filter((info) => compareVersion(info.version, APP_VERSION) > 0)
    .sort((a, b) => compareVersion(b.version, a.version));
  return newer[0] ?? null;
}

export async function checkAndroidUpdateFromWeb(): Promise<AppUpdateInfo | null> {
  const info = await fetchManifestFromWeb('latest-android.json');
  if (!info) return null;
  return {
    version: info.version,
    currentVersion: APP_VERSION,
    notes: info.notes,
    android: true,
    raw: info,
  };
}

export async function checkAppUpdateFromWeb(): Promise<AppUpdateInfo | null> {
  const info = await fetchManifestFromWeb('latest-portable.json');
  if (!info) return null;
  return {
    version: info.version,
    currentVersion: APP_VERSION,
    notes: info.notes,
    raw: info,
  };
}

export async function checkAppUpdate(): Promise<AppUpdateInfo | null> {
  if (!isTauri()) return null;
  const info = await invoke<PortableUpdateInfo | null>('check_portable_update');
  if (!info) return null;
  return {
    version: info.version,
    currentVersion: APP_VERSION,
    notes: info.notes,
    raw: info,
  };
}

export async function checkAndroidUpdate(): Promise<AppUpdateInfo | null> {
  if (!isTauri()) return null;
  const info = await invoke<PortableUpdateInfo | null>('check_android_update');
  if (!info) return null;
  return {
    version: info.version,
    currentVersion: APP_VERSION,
    notes: info.notes,
    android: true,
    raw: info,
  };
}

export async function openUpdateUrl(url: string): Promise<void> {
  if (!isTauri() || !isAndroidApp()) throw new Error('仅安卓版支持浏览器下载');
  await invoke('open_update_url', { url });
}

const CHUNK_SIZE = 256 * 1024;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export async function installAndroidUpdateFromWeb(
  info: AppUpdateInfo,
  onProgress: (downloaded: number, total: number) => void,
  onMirror?: (mirror: UpdateMirrorInfo) => void,
): Promise<void> {
  const urls = info.raw.urls?.length ? info.raw.urls : [info.raw.url];
  let lastError = '';
  for (let index = 0; index < urls.length; index += 1) {
    onMirror?.({ index: index + 1, total: urls.length });
    const controller = new AbortController();
    let hardTimer = window.setTimeout(() => controller.abort(), 180000);
    try {
      const response = await fetch(urls[index], {
        cache: 'no-store',
        redirect: 'follow',
        signal: controller.signal,
      });
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }
      const total = Number(response.headers.get('content-length') ?? 0);
      let downloaded = 0;
      let reset = true;
      onProgress(0, total);
      const write = async (bytes: Uint8Array) => {
        for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
          const slice = bytes.subarray(offset, offset + CHUNK_SIZE);
          await invoke('append_android_web_update', {
            data: bytesToBase64(slice),
            reset,
          });
          reset = false;
        }
        downloaded += bytes.length;
        onProgress(downloaded, total);
      };
      if (response.body) {
        const reader = response.body.getReader();
        let lastPacket = Date.now();
        const stallTimer = window.setInterval(() => {
          if (Date.now() - lastPacket > 25000) controller.abort();
        }, 5000);
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value || value.length === 0) continue;
            lastPacket = Date.now();
            await write(value);
          }
        } finally {
          window.clearInterval(stallTimer);
        }
      } else {
        const buffer = new Uint8Array(await response.arrayBuffer());
        await write(buffer);
      }
      window.clearTimeout(hardTimer);
      await invoke('finish_android_web_update', { sha256: info.raw.sha256 });
      return;
    } catch (error) {
      lastError = (error as Error).message || '下载中断';
      // 换下一个镜像，下一次写入会 truncate
    } finally {
      window.clearTimeout(hardTimer);
    }
  }
  throw new Error(`网页通道下载失败（${lastError || '所有镜像不可用'}），请改用浏览器下载`);
}

export interface UpdateMirrorInfo {
  index: number;
  total: number;
}

export async function installAndroidUpdate(
  info: AppUpdateInfo,
  onProgress: (downloaded: number, total: number) => void,
  onMirror?: (mirror: UpdateMirrorInfo) => void,
): Promise<void> {
  const unlistenProgress = await listen<{ downloaded: number; total: number }>(
    'portable-update-progress',
    (event) => onProgress(event.payload.downloaded, event.payload.total),
  );
  const unlistenMirror = onMirror
    ? await listen<UpdateMirrorInfo>('update-mirror', (event) => onMirror(event.payload))
    : null;
  try {
    await invoke('install_android_update', {
      urls: info.raw.urls?.length ? info.raw.urls : [info.raw.url],
      sha256: info.raw.sha256,
    });
  } finally {
    unlistenProgress();
    unlistenMirror?.();
  }
}

export async function installAppUpdate(
  info: AppUpdateInfo,
  onProgress: (downloaded: number, total: number) => void,
  onMirror?: (mirror: UpdateMirrorInfo) => void,
): Promise<void> {
  const unlistenProgress = await listen<{ downloaded: number; total: number }>(
    'portable-update-progress',
    (event) => onProgress(event.payload.downloaded, event.payload.total),
  );
  const unlistenMirror = onMirror
    ? await listen<UpdateMirrorInfo>('update-mirror', (event) => onMirror(event.payload))
    : null;
  try {
    await invoke('prepare_portable_update', {
      urls: info.raw.urls?.length ? info.raw.urls : [info.raw.url],
      sha256: info.raw.sha256,
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
  } finally {
    unlistenProgress();
    unlistenMirror?.();
  }
}
