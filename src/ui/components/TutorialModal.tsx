import { useEffect, useState } from 'react';
import { useGameStore } from '../store';

const SEEN_KEY = 'sgk-tutorial-seen';

const STEPS = [
  {
    title: '欢迎来到四国闪',
    text: '这是一个和朋友们直接联机的三国杀风格游戏。先选模式，再选武将，进入牌桌后按照回合行动。',
    points: ['单机对战：你和电脑', '局域网联机：房主创建房间，朋友用地址和房间码加入', '观战：不占座位，可以切换任意玩家视角'],
  },
  {
    title: '回合与出牌',
    text: '每名角色依次经历准备、判定、摸牌、出牌、弃牌等阶段。出牌阶段点击手牌，再点击高亮角色选择目标，最后按“确定”。',
    points: ['绿色/高亮角色表示可选目标', '结束出牌请点“结束出牌”', '响应杀、闪、无懈时会弹出确认窗口'],
  },
  {
    title: '锦囊、判定与无懈',
    text: '延时锦囊会进入判定区，下一次判定决定是否生效。无懈可击可以抵消锦囊，也可以继续抵消另一张无懈。',
    points: ['判定牌和改判技能会在顶部提示', '无中、南蛮、万箭等都可以被无懈', '横置角色受到火焰/雷电伤害时会把伤害传导给其他横置角色'],
  },
  {
    title: '装备与武将',
    text: '装备会改变攻击范围或距离。+1 马让别人计算你更远，-1 马让你计算别人更近。国战会合并两名同势力武将的体力和技能。',
    points: ['鼠标悬停在牌或装备上查看效果', '国战双将性别按主将判断', '技能发动会弹出技能名与说明，可选择发动或取消'],
  },
  {
    title: '聊天与设置',
    text: '对局右上角可以聊天、查看战报、打开设置和观战席。设置里可以调整 AI 速度、背景、数据目录和查看更新日志。',
    points: ['聊天支持内置表情和小气泡', '设置里可以查看玩法说明和关于页面', '遇到问题先看战报，里面会记录每一步结算'],
  },
];

export function TutorialModal() {
  const open = useGameStore((s) => s.tutorialOpen);
  const close = useGameStore((s) => s.closeTutorial);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);
  if (!open) return null;
  const current = STEPS[step];
  const finish = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // ignore storage failures
    }
    close();
  };
  return (
    <div className="modal-backdrop tutorial-backdrop">
      <div className="modal tutorial-modal">
        <div className="tutorial-kicker">新手教程 · {step + 1}/{STEPS.length}</div>
        <h2 className="tutorial-title">{current.title}</h2>
        <p className="tutorial-text">{current.text}</p>
        <ul className="tutorial-points">
          {current.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <div className="tutorial-progress">
          {STEPS.map((item, index) => (
            <span key={item.title} className={index === step ? 'on' : ''} />
          ))}
        </div>
        <div className="tutorial-actions">
          <button type="button" className="btn ghost" onClick={finish}>
            跳过
          </button>
          {step > 0 && (
            <button type="button" className="btn ghost" onClick={() => setStep((value) => value - 1)}>
              上一步
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn primary" onClick={() => setStep((value) => value + 1)}>
              下一步
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={finish}>
              开始游戏
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
