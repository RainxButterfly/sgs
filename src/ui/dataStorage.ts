import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../net/lan';

const BACKGROUND_KEY = 'sgs-background-v1';
const HISTORY_KEY = 'sgs-match-history-v1';
const SESSION_KEY = 'sgk-lan-session';
const NAME_KEY = 'sgk-name';

export interface DataDirInfo {
  path: string;
  defaultPath: string;
}

interface Snapshot {
  version?: number;
  savedAt?: string;
  background?: string | null;
  history?: string | null;
  lanSession?: string | null;
  playerName?: string | null;
}

let timer: number | null = null;
let applying = false;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null | undefined): void {
  try {
    if (typeof value === 'string') localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

export function buildSnapshot(): string {
  const snapshot: Snapshot = {
    version: 1,
    savedAt: new Date().toISOString(),
    background: read(BACKGROUND_KEY),
    history: read(HISTORY_KEY),
    lanSession: read(SESSION_KEY),
    playerName: read(NAME_KEY),
  };
  return JSON.stringify(snapshot);
}

export async function writeDataSnapshot(): Promise<void> {
  if (!isTauri()) return;
  await invoke('write_data_snapshot', { contents: buildSnapshot() });
}

export function scheduleDataSnapshot(): void {
  if (!isTauri() || applying) return;
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    void writeDataSnapshot().catch(() => undefined);
  }, 600);
}

export async function readDataDirInfo(): Promise<DataDirInfo | null> {
  if (!isTauri()) return null;
  return await invoke<DataDirInfo>('data_dir_info');
}

export async function pickDataDir(): Promise<string | null> {
  if (!isTauri()) return null;
  return await invoke<string | null>('pick_data_dir');
}

export async function applyDataDir(path: string): Promise<DataDirInfo> {
  if (!isTauri()) throw new Error('当前版本不支持修改数据目录');
  const info = await invoke<DataDirInfo>('set_data_dir', { path });
  await writeDataSnapshot();
  return info;
}

export async function initDataStorage(): Promise<boolean> {
  if (!isTauri()) return false;
  applying = true;
  try {
    const raw = await invoke<string | null>('read_data_snapshot');
    if (!raw) return false;
    const snapshot = JSON.parse(raw) as Snapshot;
    write(BACKGROUND_KEY, snapshot.background);
    write(HISTORY_KEY, snapshot.history);
    write(SESSION_KEY, snapshot.lanSession);
    write(NAME_KEY, snapshot.playerName);
    return true;
  } catch {
    return false;
  } finally {
    applying = false;
  }
}
