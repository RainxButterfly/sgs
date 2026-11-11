const CHAT_FONT_KEY = 'sgs-chat-font-scale';

export const CHAT_FONT_SCALES = [1, 1.15, 1.3, 0.9] as const;

export function chatFontLabel(scale: number): string {
  if (scale <= 0.95) return '小';
  if (scale >= 1.25) return '特大';
  if (scale >= 1.1) return '大';
  return '标准';
}

export function loadChatFontScale(): number {
  try {
    const value = Number(localStorage.getItem(CHAT_FONT_KEY));
    return CHAT_FONT_SCALES.includes(value as (typeof CHAT_FONT_SCALES)[number]) ? value : 1;
  } catch {
    return 1;
  }
}

type ChatFontListener = () => void;
const fontListeners = new Set<ChatFontListener>();

export function saveChatFontScale(value: number): void {
  try {
    localStorage.setItem(CHAT_FONT_KEY, String(value));
  } catch {
    // ignore storage failures
  }
  fontListeners.forEach((listener) => listener());
}

export function subscribeChatFontScale(listener: ChatFontListener): () => void {
  fontListeners.add(listener);
  return () => fontListeners.delete(listener);
}

export function nextChatFontScale(value: number): number {
  const index = CHAT_FONT_SCALES.indexOf(value as (typeof CHAT_FONT_SCALES)[number]);
  return CHAT_FONT_SCALES[(index + 1) % CHAT_FONT_SCALES.length] ?? 1;
}
