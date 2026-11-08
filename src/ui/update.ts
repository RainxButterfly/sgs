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

export async function installAndroidUpdate(
  info: AppUpdateInfo,
  onProgress: (downloaded: number, total: number) => void,
): Promise<void> {
  const unlisten = await listen<{ downloaded: number; total: number }>(
    'portable-update-progress',
    (event) => onProgress(event.payload.downloaded, event.payload.total),
  );
  try {
    await invoke('install_android_update', {
      urls: info.raw.urls?.length ? info.raw.urls : [info.raw.url],
      sha256: info.raw.sha256,
    });
  } finally {
    unlisten();
  }
}

export async function installAppUpdate(
  info: AppUpdateInfo,
  onProgress: (downloaded: number, total: number) => void,
): Promise<void> {
  const unlisten = await listen<{ downloaded: number; total: number }>(
    'portable-update-progress',
    (event) => onProgress(event.payload.downloaded, event.payload.total),
  );
  try {
    await invoke('prepare_portable_update', {
      urls: info.raw.urls?.length ? info.raw.urls : [info.raw.url],
      sha256: info.raw.sha256,
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
  } finally {
    unlisten();
  }
}
