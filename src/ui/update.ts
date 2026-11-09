import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isAndroidApp, isTauri } from '../net/lan';

export const MANUAL_UPDATE_URL = isAndroidApp()
  ? 'https://ghfast.top/https://raw.githubusercontent.com/RainxButterfly/sgs/main/updates/siguoshan-xinghe-arm64.apk'
  : 'https://ghfast.top/https://raw.githubusercontent.com/RainxButterfly/sgs/main/updates/siguoshan-xinghe-setup.exe';

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

function compareVersion(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

async function fetchLatestTag(): Promise<string | null> {
  const urls = [
    'https://api.github.com/repos/RainxButterfly/sgs/tags?per_page=20',
    'https://ghfast.top/https://api.github.com/repos/RainxButterfly/sgs/tags?per_page=20',
    'https://ghproxy.net/https://api.github.com/repos/RainxButterfly/sgs/tags?per_page=20',
  ];
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 7000);
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      window.clearTimeout(timer);
      if (!response.ok) continue;
      const tags = (await response.json()) as { name?: string }[];
      const versions = tags
        .map((tag) => tag.name?.replace(/^v/i, ''))
        .filter((version): version is string => !!version && /^\d+(\.\d+)+$/.test(version))
        .sort((a, b) => compareVersion(b, a));
      if (versions.length) return versions[0];
    } catch {
      // try the next tag source
    }
  }
  return null;
}

async function fetchManifestFromWeb(name: string): Promise<PortableUpdateInfo | null> {
  const stamp = Date.now();
  const tag = await fetchLatestTag();
  if (tag) {
    for (const base of [
      `https://ghfast.top/https://raw.githubusercontent.com/RainxButterfly/sgs/v${tag}/${name}`,
      `https://raw.githubusercontent.com/RainxButterfly/sgs/v${tag}/${name}`,
    ]) {
      try {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 9000);
        const response = await fetch(base, { cache: 'no-store', signal: controller.signal });
        window.clearTimeout(timer);
        if (!response.ok) continue;
        const info = (await response.json()) as PortableUpdateInfo;
        if (info?.version && compareVersion(info.version, APP_VERSION) > 0) return info;
      } catch {
        // try the next tag mirror
      }
    }
  }
  const urls = [
    `https://ghfast.top/https://raw.githubusercontent.com/RainxButterfly/sgs/main/${name}?t=${stamp}`,
    `https://ghproxy.net/https://raw.githubusercontent.com/RainxButterfly/sgs/main/${name}?t=${stamp}`,
    `https://raw.githubusercontent.com/RainxButterfly/sgs/main/${name}?t=${stamp}`,
    `https://cdn.jsdelivr.net/gh/RainxButterfly/sgs@main/${name}?t=${stamp}`,
  ];
  let success = false;
  let best: PortableUpdateInfo | null = null;
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 9000);
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      window.clearTimeout(timer);
      if (!response.ok) continue;
      const info = (await response.json()) as PortableUpdateInfo;
      success = true;
      if (info?.version && compareVersion(info.version, APP_VERSION) > 0) {
        if (!best || compareVersion(info.version, best.version) > 0) best = info;
      }
    } catch {
      // try the next mirror
    }
  }
  if (!success) throw new Error('网页通道无法连接更新镜像');
  return null;
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
