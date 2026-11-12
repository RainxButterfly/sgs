/**
 * 打包内置的武将默认立绘清单：public/assets/character/<id>.jpg。
 * 没有内置图的武将（如双头武将）回退到程序生成的牌面。
 */

const HERO_ART_DIR = '/assets/character';

const HERO_ART_IDS = new Set<string>(['caiwenji',
  'caocao',
  'caopi',
  'caoren',
  'caozhang',
  'chengong',
  'daqiao',
  'dengai',
  'dianwei',
  'diaochan',
  'dongzhuo',
  'fazheng',
  'ganning',
  'gaoshun',
  'gongsunzan',
  'guanyu',
  'guojia',
  'handang',
  'huanggai',
  'huangyueying',
  'huangzhong',
  'huatuo',
  'huaxiong',
  'jiangwei',
  'jiaxu',
  'lidian',
  'lingtong',
  'liubei',
  'liushan',
  'lusu',
  'luxun',
  'lvbu',
  'lvmeng',
  'machao',
  'madai',
  'menghuo',
  'pangde',
  'pangtong',
  'simayi',
  'sunce',
  'sunjian',
  'sunquan',
  'sunshangxiang',
  'taishici',
  'tianfeng',
  'weiyan',
  'wolong',
  'xiahoudun',
  'xiahouyuan',
  'xiaoqiao',
  'xuchu',
  'xuhuang',
  'xunyu',
  'xusheng',
  'xushu',
  'yuanshao',
  'yuejin',
  'yuji',
  'zhangfei',
  'zhanghe',
  'zhangjiao',
  'zhangliao',
  'zhaoyun',
  'zhenji',
  'zhoutai',
  'zhouyu',
  'zhugedan',
  'zhugeliang',
  'zhurong',
  'zhangzhaozhanghong',
  'qiangniyinshou',
  'yanliangwenchou']);

/** 该武将是否有打包的默认立绘 */
export function hasDefaultHeroArt(heroId: string | undefined): boolean {
  return !!heroId && HERO_ART_IDS.has(heroId);
}

/** 默认立绘地址（第一套皮肤「默认」）；没有则返回 null */
export function defaultHeroArtUrl(heroId: string | undefined): string | null {
  if (!heroId || !HERO_ART_IDS.has(heroId)) return null;
  return `${HERO_ART_DIR}/${heroId}.jpg`;
}

/** 全部内置武将立绘地址（用于启动时预加载） */
export function allHeroArtUrls(): string[] {
  return [...HERO_ART_IDS].map((id) => `${HERO_ART_DIR}/${id}.jpg`);
}
