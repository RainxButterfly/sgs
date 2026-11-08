import { scheduleDataSnapshot } from './dataStorage';

const STORAGE_KEY = 'sgs-background-v1';
const MAX_EDGE = 1920;

export interface BackgroundSettings {
  image: string | null;
  dim: number;
}

export const DEFAULT_BACKGROUND: BackgroundSettings = {
  image: null,
  dim: 52,
};

export function loadBackgroundSettings(): BackgroundSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_BACKGROUND;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BACKGROUND;
    const parsed = JSON.parse(raw) as Partial<BackgroundSettings>;
    const dim = typeof parsed.dim === 'number' ? Math.min(90, Math.max(0, parsed.dim)) : DEFAULT_BACKGROUND.dim;
    const image = typeof parsed.image === 'string' && parsed.image.startsWith('data:image/') ? parsed.image : null;
    return { image, dim };
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
