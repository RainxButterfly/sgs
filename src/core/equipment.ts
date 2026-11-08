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
