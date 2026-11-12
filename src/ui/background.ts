import { scheduleDataSnapshot } from './dataStorage';

const STORAGE_KEY = 'sgs-background-v1';
const MAX_EDGE = 1920;

export type BackgroundScope = 'game' | 'menu' | 'all';

export interface BackgroundSettings {
  image: string | null;
  dim: number;
  scope: BackgroundScope;
  /** 动态壁纸（视频）保存在 IndexedDB，image 为空 */
  kind?: 'image' | 'video';
}

export const DEFAULT_BACKGROUND: BackgroundSettings = {
  image: null,
  dim: 52,
  scope: 'game',
};

export function loadBackgroundSettings(): BackgroundSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_BACKGROUND;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BACKGROUND;
    const parsed = JSON.parse(raw) as Partial<BackgroundSettings>;
    const dim = typeof parsed.dim === 'number' ? Math.min(90, Math.max(0, parsed.dim)) : DEFAULT_BACKGROUND.dim;
    const image = typeof parsed.image === 'string' && parsed.image.startsWith('data:image/') ? parsed.image : null;
    const scope: BackgroundScope = parsed.scope === 'menu' || parsed.scope === 'all' ? parsed.scope : 'game';
    const kind: 'image' | 'video' = parsed.kind === 'video' ? 'video' : 'image';
    return { image, dim, scope, kind };
  } catch {
    return DEFAULT_BACKGROUND;
  }
}

export function saveBackgroundSettings(settings: BackgroundSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    scheduleDataSnapshot();
  } catch {
    // 存储空间不足时保留当前会话内的设置
  }
}

export function effectiveBackground(
  image: string | null,
  scope: BackgroundScope,
  area: 'game' | 'menu',
): string | null {
  if (!image) return null;
  if (scope === 'all') return image;
  return scope === area ? image : null;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

export async function prepareBackgroundImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
  if (file.size > 20 * 1024 * 1024) throw new Error('图片不能超过 20MB');
  if (file.type === 'image/gif') return readAsDataUrl(file); // GIF 保留动画
  const url = await readAsDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('无法解析这张图片'));
    img.src = url;
  });
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return url;
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.84);
}

/* ---------- 动态壁纸（视频） ---------- */

const VIDEO_DB = 'sgs-background';
const VIDEO_STORE = 'media';
const VIDEO_KEY = 'wallpaper';
const MAX_VIDEO = 40 * 1024 * 1024;

export type PreparedMedia = { kind: 'image'; src: string } | { kind: 'video' };

function openVideoDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const request = indexedDB.open(VIDEO_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VIDEO_STORE)) db.createObjectStore(VIDEO_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function withVideoStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openVideoDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(VIDEO_STORE, mode);
    const request = run(tx.objectStore(VIDEO_STORE));
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => resolve(null);
  });
}

export async function saveBackgroundVideo(file: File): Promise<void> {
  if (file.size > MAX_VIDEO) throw new Error('视频不能超过 40MB');
  await withVideoStore('readwrite', (store) => store.put(file, VIDEO_KEY));
}

export async function loadBackgroundVideo(): Promise<Blob | null> {
  return withVideoStore<Blob>('readonly', (store) => store.get(VIDEO_KEY) as IDBRequest<Blob>);
}

export async function clearBackgroundVideo(): Promise<void> {
  await withVideoStore('readwrite', (store) => store.delete(VIDEO_KEY));
}

export async function prepareBackgroundMedia(file: File): Promise<PreparedMedia> {
  if (file.type.startsWith('video/')) {
    await saveBackgroundVideo(file);
    return { kind: 'video' };
  }
  return { kind: 'image', src: await prepareBackgroundImage(file) };
}
