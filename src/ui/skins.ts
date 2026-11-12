/**
 * 皮肤包 v2：每位武将可有多套皮肤，第一套为「默认」（打包内置立绘）。
 * 用户导入的图片成为额外皮肤，可随时切换；选择保存在本机。
 */

import { HERO_MAP, HEROES } from '../core/deck';
import { defaultHeroArtUrl } from './heroArt';

const DB_NAME = 'sgs-skins';
const DB_VERSION = 2;
const STORE_SKINS = 'skins';
const STORE_LEGACY = 'portraits';

const SELECT_KEY = 'sgk-hero-skin-v1';

export interface HeroSkin {
  id: string;
  name: string;
  /** 皮肤图片地址；「默认」在内置图缺失时为 null（用生成牌面） */
  url: string | null;
  builtin: boolean;
}

interface SkinRecord {
  key: string;
  heroId: string;
  skinId: string;
  name: string;
  /** 原文件名，便于排查 */
  source: string;
  at: number;
  blob: Blob;
}

interface Snapshot {
  /** heroId → 已导入皮肤（含 objectURL） */
  skins: Map<string, HeroSkin[]>;
  count: number;
}

let snapshot: Snapshot = { skins: new Map(), count: 0 };
const listeners = new Set<() => void>();
let loaded = false;
let loading: Promise<void> | null = null;

let selection: Record<string, string> = {};
try {
  selection = JSON.parse(localStorage.getItem(SELECT_KEY) ?? '{}');
} catch {
  selection = {};
}

function notify() {
  for (const fn of listeners) fn();
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SKINS)) db.createObjectStore(STORE_SKINS, { keyPath: 'key' });
      // v1 的 portraits 表（每武将一张）由 ensureSkins 迁移后删除
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

/** 由文件名推导皮肤显示名：caocao_少年 → 少年；曹操-经典 → 经典 */
function skinNameFromFile(fileName: string): string | null {
  const stem = fileName.replace(/\.[^.]+$/, '');
  const parts = stem.split(/[-_·\s]+/).filter(Boolean);
  if (parts.length < 2) return null;
  const tail = parts.slice(1).join('');
  if (!tail || tail.length > 12) return null;
  if (/^\d+$/.test(tail)) return `皮肤 ${tail}`;
  return tail;
}

async function readAllSkins(): Promise<SkinRecord[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_SKINS, 'readonly');
    const req = tx.objectStore(STORE_SKINS).getAll();
    req.onsuccess = () => resolve((req.result as SkinRecord[]) ?? []);
    req.onerror = () => resolve([]);
  });
}

async function putSkin(record: SkinRecord): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_SKINS, 'readwrite');
    tx.objectStore(STORE_SKINS).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function deleteSkinsForHero(heroId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_SKINS, 'readwrite');
    const store = tx.objectStore(STORE_SKINS);
    const req = store.getAll();
    req.onsuccess = () => {
      for (const rec of (req.result as SkinRecord[]) ?? []) {
        if (rec.heroId === heroId) store.delete(rec.key);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** v1 迁移：把旧的「每武将一张」记录转成皮肤记录 */
async function migrateLegacy(): Promise<void> {
  const db = await openDb();
  if (!db || !db.objectStoreNames.contains(STORE_LEGACY)) return;
  const records: Array<{ heroId: string; source: string; at: number; blob: Blob }> = await new Promise((resolve) => {
    const tx = db.transaction(STORE_LEGACY, 'readonly');
    const req = tx.objectStore(STORE_LEGACY).getAll();
    req.onsuccess = () => resolve((req.result as typeof records) ?? []);
    req.onerror = () => resolve([]);
  });
  if (records.length) {
    for (const rec of records) {
      if (!rec.blob) continue;
      await putSkin({
        key: `${rec.heroId}::legacy`,
        heroId: rec.heroId,
        skinId: 'legacy',
        name: '导入',
        source: rec.source,
        at: rec.at || Date.now(),
        blob: rec.blob,
      });
    }
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_LEGACY, 'readwrite');
    tx.objectStore(STORE_LEGACY).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

function rebuild(records: SkinRecord[]) {
  for (const list of snapshot.skins.values()) {
    for (const skin of list) {
      if (skin.url?.startsWith('blob:')) URL.revokeObjectURL(skin.url);
    }
  }
  const skins = new Map<string, HeroSkin[]>();
  let count = 0;
  for (const record of records) {
    if (!record.blob) continue;
    const list = skins.get(record.heroId) ?? [];
    list.push({
      id: record.skinId,
      name: record.name || record.source || '皮肤',
      url: URL.createObjectURL(record.blob),
      builtin: false,
    });
    skins.set(record.heroId, list);
    count += 1;
  }
  snapshot = { skins, count };
  notify();
}

export async function refreshSkins(): Promise<void> {
  await migrateLegacy();
  const records = await readAllSkins();
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

/** 导入一批图片：同一武将可导入多张，各自成为一套新皮肤并自动选中 */
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
    const skinId = `u${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    const name = skinNameFromFile(file.name) ?? `皮肤 ${(snapshot.skins.get(heroId)?.length ?? 0) + 1}`;
    await putSkin({
      key: `${heroId}::${skinId}`,
      heroId,
      skinId,
      name,
      source: file.name,
      at: Date.now(),
      blob: file,
    });
    selection[heroId] = skinId;
    added += 1;
  }
  if (added > 0) {
    localStorage.setItem(SELECT_KEY, JSON.stringify(selection));
    await refreshSkins();
  }
  loaded = true;
  return { added, skipped };
}

export async function clearSkins(): Promise<void> {
  const db = await openDb();
  if (db) {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_SKINS, 'readwrite');
      tx.objectStore(STORE_SKINS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
  selection = {};
  localStorage.setItem(SELECT_KEY, JSON.stringify(selection));
  loaded = true;
  rebuild([]);
}

/** 删除某位武将的某套导入皮肤 */
export async function removeSkin(heroId: string, skinId: string): Promise<void> {
  const db = await openDb();
  if (db) {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_SKINS, 'readwrite');
      tx.objectStore(STORE_SKINS).delete(`${heroId}::${skinId}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
  if (selection[heroId] === skinId) {
    delete selection[heroId];
    localStorage.setItem(SELECT_KEY, JSON.stringify(selection));
  }
  await refreshSkins();
}

export function getSkinSnapshot(): Snapshot {
  return snapshot;
}

export function subscribeSkins(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 某武将全部皮肤：第一套永远是「默认」 */
export function heroSkinList(heroId: string | undefined): HeroSkin[] {
  if (!heroId) return [];
  const list: HeroSkin[] = [
    { id: 'default', name: '默认', url: defaultHeroArtUrl(heroId), builtin: true },
    ...(snapshot.skins.get(heroId) ?? []),
  ];
  return list;
}

/** 当前选中的皮肤 id（默认 'default'） */
export function heroSkinSelection(heroId: string | undefined): string {
  if (!heroId) return 'default';
  return selection[heroId] ?? 'default';
}

/** 切换皮肤 */
export function selectHeroSkin(heroId: string, skinId: string) {
  if (skinId === 'default') delete selection[heroId];
  else selection[heroId] = skinId;
  localStorage.setItem(SELECT_KEY, JSON.stringify(selection));
  notify();
}

/** 当前选中皮肤的地址；默认皮肤没有内置图时返回 null */
export function heroSkinUrl(heroId: string | undefined): string | null {
  const list = heroSkinList(heroId);
  const current = heroSkinSelection(heroId);
  return list.find((skin) => skin.id === current)?.url ?? null;
}

/** 当前皮肤类型：导入 / 默认 / 无（回退生成牌面） */
export function heroSkinKind(heroId: string | undefined): 'imported' | 'default' | 'none' {
  if (!heroId) return 'none';
  const current = heroSkinSelection(heroId);
  if (current === 'default') return defaultHeroArtUrl(heroId) ? 'default' : 'none';
  return 'imported';
}

/** 已载入皮肤数的武将名，用于设置页展示 */
export function skinHeroNames(): string[] {
  return skinHeroIds()
    .map((id) => HERO_MAP.get(id)?.name ?? id)
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

/** 内部用：已导入皮肤的武将 id 集合 */
export function skinHeroIds(): string[] {
  return [...snapshot.skins.keys()];
}
