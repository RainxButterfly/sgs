/**
 * 语音包设置：卡牌语音包（设置里切换）与武将语音包（图鉴详情里切换）。
 * 当前只有一套「默认」语音包，预留多包切换。
 */

export interface VoicePack {
  id: string;
  name: string;
}

export const VOICE_PACKS: VoicePack[] = [{ id: 'default', name: '默认语音包' }];

const CARD_KEY = 'sgk-card-voice-pack-v1';
const HERO_KEY = 'sgk-hero-voice-pack-v1';

function load(key: string): string {
  try {
    return localStorage.getItem(key) ?? 'default';
  } catch {
    return 'default';
  }
}

export function getCardVoicePack(): string {
  return load(CARD_KEY);
}

export function setCardVoicePack(id: string): void {
  try {
    localStorage.setItem(CARD_KEY, id);
  } catch {
    // ignore
  }
}

export function getHeroVoicePack(): string {
  return load(HERO_KEY);
}

export function setHeroVoicePack(id: string): void {
  try {
    localStorage.setItem(HERO_KEY, id);
  } catch {
    // ignore
  }
}
