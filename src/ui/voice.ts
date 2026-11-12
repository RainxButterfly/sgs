/**
 * 武将/卡牌语音包：播放打包进客户端的默认语音。
 * 技能语音、阵亡语音、卡牌语音（男女声按武将性别选择）。
 */

import { getSoundSettings } from './sound';
import { SKILL_VOICES, DIE_VOICES, CARD_VOICES } from './voiceManifest';
import { HERO_MAP } from '../core/deck';

const VOICE_DIR = '/assets/audio';

let voiceEnabled = true;
let voiceVolume = 1;

function refreshSettings() {
  const s = getSoundSettings();
  voiceEnabled = s.enabled;
  voiceVolume = s.volume;
}

function play(url: string): void {
  refreshSettings();
  if (!voiceEnabled || voiceVolume <= 0) return;
  try {
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, voiceVolume));
    void audio.play().catch(() => {
      // 语音缺失或被浏览器拦截时静默忽略
    });
  } catch {
    // ignore
  }
}

function pick<T>(list: T[]): T | undefined {
  if (!list.length) return undefined;
  return list[Math.floor(Math.random() * list.length)];
}

/** 技能语音：同一技能有多个配音时随机挑一个 */
export function playSkillVoice(skillId: string | undefined): void {
  if (!skillId) return;
  const list = SKILL_VOICES[skillId];
  const name = list && pick(list);
  if (!name) return;
  play(`${VOICE_DIR}/skill/${name}.mp3`);
}

/** 阵亡语音 */
export function playDieVoice(heroId: string | undefined): void {
  if (!heroId) return;
  const name = DIE_VOICES[heroId];
  if (!name) return;
  play(`${VOICE_DIR}/die/${name}.mp3`);
}

/** 卡牌语音：按武将性别选男/女声 */
export function playCardVoice(pinyin: string | undefined, gender: 'male' | 'female' = 'male'): void {
  if (!pinyin) return;
  const entry = CARD_VOICES[pinyin];
  if (!entry) return;
  const name = gender === 'female' ? entry.female : entry.male;
  if (!name) return;
  play(`${VOICE_DIR}/card/${gender}/${name}.mp3`);
}

/** 该武将是否有语音（有阵亡语音或任一技能语音） */
export function heroHasVoice(heroId: string | undefined): boolean {
  if (!heroId) return false;
  if (DIE_VOICES[heroId]) return true;
  const hero = HERO_MAP.get(heroId);
  return (hero?.skillIds ?? []).some((id) => (SKILL_VOICES[id]?.length ?? 0) > 0);
}

/** 试听武将语音：优先阵亡语音，其次第一个有配音的技能 */
export function playHeroVoicePreview(heroId: string | undefined): void {
  if (!heroId) return;
  if (DIE_VOICES[heroId]) {
    playDieVoice(heroId);
    return;
  }
  const hero = HERO_MAP.get(heroId);
  for (const id of hero?.skillIds ?? []) {
    const list = SKILL_VOICES[id];
    const name = list && pick(list);
    if (name) {
      play(`${VOICE_DIR}/skill/${name}.mp3`);
      return;
    }
  }
}
