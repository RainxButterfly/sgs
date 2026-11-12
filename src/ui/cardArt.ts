/**
 * 卡牌图片牌面：按牌名映射到打包进客户端的本地美术资源。
 * 每张卡支持多套牌面，第一套为「默认」。
 */
import type { Card } from '../core/types';

export interface CardSkin {
  id: string;
  name: string;
  url: string;
}

const ART_DIR = '/assets/card';

/** 牌名 → 默认牌面文件（不含扩展名） */
const CARD_ART: Record<string, string> = {
  杀: 'sha',
  闪: 'shan',
  桃: 'tao',
  酒: 'jiu',
  决斗: 'juedou',
  过河拆桥: 'guohe',
  顺手牵羊: 'shunshou',
  万箭齐发: 'wanjian',
  桃园结义: 'taoyuan',
  五谷丰登: 'wugu',
  南蛮入侵: 'nanman',
  借刀杀人: 'jiedao',
  无中生有: 'wuzhong',
  无懈可击: 'wuxie',
  乐不思蜀: 'lebu',
  闪电: 'shandian',
  火攻: 'huogong',
  兵粮寸断: 'bingliang',
  铁索连环: 'tiesuo',
  诸葛连弩: 'zhuge',
  青釭剑: 'qinggang',
  雌雄双股剑: 'cixiong',
  寒冰剑: 'hanbing',
  贯石斧: 'guanshi',
  青龙偃月刀: 'qinglong',
  丈八蛇矛: 'zhangba',
  方天画戟: 'fangtian',
  麒麟弓: 'qilin',
  八卦阵: 'bagua',
  仁王盾: 'renwang',
  的卢: 'dilu',
  绝影: 'jueying',
  爪黄飞电: 'zhuahuang',
  赤兔: 'chitu',
  大宛: 'dawan',
  紫骍: 'zixin',
  藤甲: 'tengjia',
  白银狮子: 'baiyin',
  骅骝: 'hualiu',
  古锭刀: 'guding',
  朱雀羽扇: 'zhuque',
};

/** 当前卡面选择（牌名 → 皮肤 id），默认 'default' */
const CARD_SKIN_KEY = 'sgk-card-skin-v1';
let cardSkinChoice: Record<string, string> = {};
try {
  cardSkinChoice = JSON.parse(localStorage.getItem(CARD_SKIN_KEY) ?? '{}');
} catch {
  cardSkinChoice = {};
}

const listeners = new Set<() => void>();

export function subscribeCardSkins(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((fn) => fn());
}

/** 某张牌可选的皮肤列表（当前只有「默认」，未来可扩展多套） */
export function cardSkinList(cardName: string): CardSkin[] {
  const art = CARD_ART[cardName];
  if (!art) return [];
  return [{ id: 'default', name: '默认', url: `${ART_DIR}/${art}.png` }];
}

export function selectCardSkin(cardName: string, skinId: string) {
  if (skinId === 'default') delete cardSkinChoice[cardName];
  else cardSkinChoice[cardName] = skinId;
  localStorage.setItem(CARD_SKIN_KEY, JSON.stringify(cardSkinChoice));
  emit();
}

/** 牌面地址：没有美术的牌返回 null（渲染文字牌面） */
export function cardArtUrl(cardName: string): string | null {
  const art = CARD_ART[cardName];
  if (!art) return null;
  return `${ART_DIR}/${art}.png`;
}

/** 卡牌语音拼音文件名（用于语音包），无对应语音返回 null */
export function cardVoicePinyin(cardName: string): string | null {
  return CARD_ART[cardName] ?? null;
}

/** 卡牌右下角距离/范围标记：马匹「+1 / -1」、武器攻击范围数字（与参考仓库一致） */
export function cardRangeText(card: Card): string | null {
  if (card.equipSlot === 'horsePlus') return '+1';
  if (card.equipSlot === 'horseMinus') return '-1';
  if (card.equipSlot === 'weapon') return String(card.range ?? 1);
  return null;
}
