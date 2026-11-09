export type ChangeKind = 'feature' | 'fix' | 'polish';

export interface ChangeSection {
  kind: ChangeKind;
  items: string[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  sections: ChangeSection[];
}

export const CHANGE_LABEL: Record<ChangeKind, string> = {
  feature: '新增功能',
  fix: '问题修复',
  polish: '体验优化',
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.6.3',
    date: '2026-11-09',
    title: '群体锦囊结算与规则修正',
    sections: [
      {
        kind: 'feature',
        items: [
          '南蛮入侵、万箭齐发新增结算面板，逐人显示打出的杀或闪、无懈可击、免疫与受伤结果。',
          '身份场和国战的人数显示改为存活人数，阵亡后立即减少。',
          '设置中新增更新日志，按版本查看新增、修复和优化内容。',
        ],
      },
      {
        kind: 'fix',
        items: [
          '修正乐不思蜀、兵粮寸断判定“生效/未生效”显示相反的问题。',
          '兵粮寸断视为使用后，判定区改为显示兵粮寸断，不再显示原来的杀。',
          '同一角色不能被重复指定兵粮寸断。',
          '铁索连环的横置状态不再被普通伤害或 AI 错误重置。',
          '战报超过 300 条后序号重复，导致长局排序错乱和滚动异常。',
          '局域网对局没有写入战绩，以及数据目录旧快照覆盖新战绩。',
          '限定技和觉醒技标记被每回合清空、闪电传到已有闪电的判定区、借刀杀人目标限制不完整。',
        ],
      },
      {
        kind: 'polish',
        items: [
          '移动端自己的横置、翻面状态直接显示；战报自动滚动到最新一条。',
          '判定区图标保持显示在角色卡右上角，不再需要点开详情查看。',
        ],
      },
    ],
  },
  {
    version: '0.6.2',
    date: '2026-11-03',
    title: '观战席与五谷结算',
    sections: [
      {
        kind: 'feature',
        items: [
          '局域网观战系统：可主动以观战身份加入，对局中也能进入；观战席显示昵称和 IP。',
          '五谷丰登结算窗口保留到所有人选完，逐张标注获得者。',
          '对局内聊天和内置表情面板。',
          '弃牌堆查看、手牌悬停说明、身份与国战人数统计。',
          '判定区图标、移动端横向出牌序列与回合标记。',
        ],
      },
      {
        kind: 'fix',
        items: [
          '兵粮寸断、乐不思蜀通过技能转化后，判定区名称与效果错误。',
          '重复挂载同名延时锦囊；借刀杀人把自己作为被杀目标。',
          'AI 不同阵营互相帮助；战报顺序错乱；身份场规则沿用自定义公开身份。',
          '出牌、响应和选择锦囊时误触自动提交。',
          '更新镜像全部等待导致检查超时，CDN 命中旧更新包。',
        ],
      },
      {
        kind: 'polish',
        items: [
          '移动版对局布局、手牌扇形排列和牌桌信息密度。',
          '更新检测改为多镜像并行、超时兜底，APK 体积优化到 16.9MB 左右。',
        ],
      },
    ],
  },
  {
    version: '0.6.1',
    date: '2026-10-30',
    title: '横向出牌序列',
    sections: [
      {
        kind: 'feature',
        items: ['出牌记录改为从左到右按时间排列，最新牌在最右侧，并显示回合分隔。'],
      },
      {
        kind: 'fix',
        items: ['更新包改用版本标签地址，避免 jsDelivr 命中 main 分支旧缓存。'],
      },
    ],
  },
  {
    version: '0.6.0',
    date: '2026-10-27',
    title: '移动端交互与数据目录',
    sections: [
      {
        kind: 'feature',
        items: [
          '移动版固定横屏布局，隐藏系统状态栏，并在游戏内显示时间与电量。',
          '出牌确认、无懈可击辅助和五谷丰登选择窗口。',
          '可自定义数据保存目录，支持浏览文件夹、切换和备份。',
        ],
      },
      {
        kind: 'fix',
        items: ['网页端弹窗被牌桌遮挡、触屏误触和自动出牌问题。'],
      },
    ],
  },
  {
    version: '0.5.9',
    date: '2026-10-24',
    title: '锦囊结算与出牌顺序',
    sections: [
      {
        kind: 'fix',
        items: [
          '延时锦囊判定区显示原始牌名、效果不生效。',
          '战报和出牌记录顺序错乱。',
          '安卓更新镜像选择与安装包下载失败。',
        ],
      },
      {
        kind: 'polish',
        items: ['出牌记录补充目标与回合信息，弃牌堆可完整查看。'],
      },
    ],
  },
  {
    version: '0.5.8',
    date: '2026-10-22',
    title: '移动版对局布局',
    sections: [
      {
        kind: 'feature',
        items: ['移动版牌桌重新排版，自己的信息固定在左下角，装备和判定区可见。'],
      },
      {
        kind: 'fix',
        items: ['手机端牌桌溢出、手牌被遮挡、横屏按钮过小。'],
      },
    ],
  },
  {
    version: '0.5.7',
    date: '2026-10-20',
    title: '目录浏览与选将详情',
    sections: [
      {
        kind: 'feature',
        items: ['数据目录浏览与地址切换，选将界面武将详情。'],
      },
      {
        kind: 'fix',
        items: ['房主地址列表、更新兜底和菜单布局。'],
      },
    ],
  },
  {
    version: '0.5.6',
    date: '2026-10-18',
    title: '移动端牌面信息',
    sections: [
      {
        kind: 'feature',
        items: ['移动端显示装备、判定区和出牌信息，联机地址选择更清晰。'],
      },
    ],
  },
  {
    version: '0.5.5',
    date: '2026-10-16',
    title: '移动端与网页端修复',
    sections: [
      {
        kind: 'fix',
        items: ['手机端布局、网页端扫码联机和基础交互问题。'],
      },
    ],
  },
];
