/**
 * 皮肤包：把用户自备的武将立绘存进 IndexedDB，按武将 id 对上号。
 *
 * 只存用户自己导入的文件，不内置任何第三方素材。
 */

import { HERO_MAP, HEROES } from '../core/deck';

const DB_NAME = 'sgs-skins';
const STORE = 'portraits';

export interface SkinRecord {
  heroId: string;
  /** 原文件名，便于排查 */
  source: string;
  at: number;
  blob: Blob;
}

interface Snapshot {
  /** heroId → objectURL */
  urls: Map<string, string>;
  count: number;
}

let snapshot: Snapshot = { urls: new Map(), count: 0 };
const listeners = new Set<() => void>();
let loaded = false;
let loading: Promise<void> | null = null;

function notify() {
  for (const fn of listeners) fn();
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'heroId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

/** 去掉扩展名、空格、符号，保留中文与字母数字 */
function normalize(raw: string): string {
  return raw
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
}

const byId = new Map<string, string>();
const byName = new Map<string, string>();
for (const hero of HEROES) {
  byId.set(normalize(hero.id), hero.id);
  byName.set(normalize(hero.name), hero.id);
}

/** 文件名 → 武将 id：支持 caocao.jpg / 曹操.png / caocao_皮肤1.jpg */
export function matchHero(rawName: string): string | null {
  const key = normalize(rawName);
  if (!key) return null;
  if (byId.has(key)) return byId.get(key)!;
  if (byName.has(key)) return byName.get(key)!;
  // 带前缀/后缀的情况：caocao01 / skin_caocao / 曹操-少年
  for (const [id, heroId] of byId) {
    if (id.length >= 4 && (key.startsWith(id) || key.endsWith(id))) return heroId;
  }
  for (const [name, heroId] of byName) {
    if (name.length >= 2 && key.startsWith(name)) return heroId;
  }
  return null;
}

async function readAll(): Promise<SkinRecord[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as SkinRecord[]) ?? []);
    req.onerror = () => resolve([]);
  });
}

async function put(record: SkinRecord): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

function rebuild(records: SkinRecord[]) {
  for (const url of snapshot.urls.values()) URL.revokeObjectURL(url);
  const urls = new Map<string, string>();
  for (const record of records) {
    if (!record.blob) continue;
    urls.set(record.heroId, URL.createObjectURL(record.blob));
  }
  snapshot = { urls, count: urls.size };
  notify();
}

export async function refreshSkins(): Promise<void> {
  const records = await readAll();
  rebuild(records);
}

/** 首次使用时加载一次 */
export async function ensureSkins(): Promise<void> {
  if (loaded) return;
  if (loading) return loading;
  loading = refreshSkins().then(() => {
    loaded = true;
    loading = null;
  });
  return loading;
}

export interface ImportResult {
  added: number;
  skipped: string[];
}

/** 导入一批图片，文件名即武将名/拼音 */
export async function importSkinFiles(files: File[]): Promise<ImportResult> {
  const images = files.filter((file) => file.type.startsWith('image/'));
  const skipped: string[] = [];
  let added = 0;
  for (const file of images) {
    const heroId = matchHero(file.name);
    if (!heroId) {
      skipped.push(file.name);
      continue;
    }
    await put({ heroId, source: file.name, at: Date.now(), blob: file });
    added += 1;
  }
  if (added > 0) await refreshSkins();
  loaded = true;
  return { added, skipped };
}

export async function clearSkins(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  loaded = true;
  rebuild([]);
}

export function getSkinSnapshot(): Snapshot {
  return snapshot;
}

export function subscribeSkins(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 某个武将当前的皮肤地址；没有就返回 null */
export function skinUrl(heroId: string | undefined): string | null {
  if (!heroId) return null;
  return snapshot.urls.get(heroId) ?? null;
}

/** 已载入的武将名，用于设置页展示 */
export function skinHeroNames(): string[] {
  return [...snapshot.urls.keys()]
    .map((id) => HERO_MAP.get(id)?.name ?? id)
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}
