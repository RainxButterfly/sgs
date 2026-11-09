export const EQUIP_SKILL_ID: Record<string, string> = {
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
  古锭刀: 'guding',
  朱雀羽扇: 'zhuque',
  藤甲: 'tengjia',
  白银狮子: 'baiyin',
  骅骝: 'hualiu',
};

export function equipSkillId(cardName: string): string | undefined {
  return EQUIP_SKILL_ID[cardName];
}

export const EQUIP_DESC: Record<string, string> = {
  的卢: '防御马（+1 马）：其他角色计算与你的距离时 +1。',
  绝影: '防御马（+1 马）：其他角色计算与你的距离时 +1。',
  爪黄飞电: '防御马（+1 马）：其他角色计算与你的距离时 +1。',
  骅骝: '防御马（+1 马）：其他角色计算与你的距离时 +1。',
  赤兔: '进攻马（-1 马）：你计算与其他角色的距离时 -1。',
  大宛: '进攻马（-1 马）：你计算与其他角色的距离时 -1。',
  紫骍: '进攻马（-1 马）：你计算与其他角色的距离时 -1。',
};
