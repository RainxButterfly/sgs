import { SKILL_MAP } from '../../core/skills';
import { useGameSnapshot, useGameStore } from '../store';

export function SkillNotice() {
  const { game } = useGameSnapshot();
  const notice = useGameStore((s) => s.lastSkill);
  const screen = useGameStore((s) => s.screen);
  if (!game || !notice || screen !== 'game') return null;
  const player = game.state.players[notice.playerId];
  const skill = [...SKILL_MAP.values()].find((item) => item.name === notice.name);
  return (
    <div key={`skill-notice-${notice.id}`} className="skill-notice">
      <span className="skill-notice-mark">技</span>
      <div>
        <b>
          {player?.name ?? '角色'} 发动【{notice.name}】
        </b>
        <p>{notice.text || skill?.desc || '技能已发动'}</p>
      </div>
    </div>
  );
}
