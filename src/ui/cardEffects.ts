import type { Card } from '../core/types';
import { EQUIP_DESC, equipSkillId } from '../core/equipment';
import { SKILL_MAP } from '../core/skills';

const EFFECTS: Record<string, string> = {
  杀: '出牌阶段对攻击范围内一名角色使用，造成 1 点伤害。',
  闪: '当你成为【杀】的目标时打出，抵消这张【杀】。',
  桃: '回复 1 点体力；自己濒死时可以用来自救。',
  酒: '本回合下一张【杀】伤害 +1；自己濒死时可以用来回复 1 点体力。',
  火杀: '火属性的【杀】，可触发藤甲、铁索等火属性效果。',
  雷杀: '雷属性的【杀】，可触发铁索等雷属性效果。',
  决斗: '指定一名角色，双方轮流打出【杀】，先不出的一方受到 1 点伤害。',
  过河拆桥: '弃置目标角色的一张牌。',
  顺手牵羊: '获得距离 1 以内一名角色的一张牌。',
  无中生有: '摸两张牌。',
  南蛮入侵: '所有其他角色依次打出一张【杀】，否则受到 1 点伤害。',
  万箭齐发: '所有其他角色依次打出一张【闪】，否则受到 1 点伤害。',
  桃园结义: '所有角色各回复 1 点体力。',
  五谷丰登: '亮出牌堆顶与存活人数相同数量的牌，每名角色依次获得其中一张。',
  无懈可击: '抵消一张锦囊牌的效果，也可以抵消另一张【无懈可击】。',
  借刀杀人: '指定一名有武器的角色，令其对另一名角色使用【杀】，否则把武器交给你。',
  铁索连环: '横置或重置 1–2 名角色；横置角色受到属性伤害时会传导给其他横置角色。',
  兵粮寸断: '延时锦囊。目标判定不为梅花时，跳过摸牌阶段。',
  乐不思蜀: '延时锦囊。目标判定不为红桃时，跳过出牌阶段。',
  闪电: '延时锦囊。判定为黑桃 2–9 时，目标受到 3 点雷电伤害。',
};

export function cardEffectText(card: Card): string {
  if (card.equipSlot) {
    if (EQUIP_DESC[card.name]) return EQUIP_DESC[card.name];
    const skill = SKILL_MAP.get(equipSkillId(card.name) ?? '');
    if (skill?.desc) return skill.desc;
    return card.equipSlot === 'horsePlus'
      ? '防御马（+1 马）：其他角色计算与你的距离时 +1。'
      : card.equipSlot === 'horseMinus'
        ? '进攻马（-1 马）：你计算与其他角色的距离时 -1。'
        : '装备牌。';
  }
  return EFFECTS[card.name] ?? '';
}
