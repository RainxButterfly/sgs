import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { HeroData, PlayerState } from '../../core/types';
import { FACTION_NAME } from '../../core/types';
import { SKILL_MAP } from '../../core/skills';
import { EQUIP_SKILL_ID } from '../../core/equipment';

interface Props {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  as?: 'span' | 'div';
}

export function HoverInfo({ content, children, className, as = 'span' }: Props) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const Tag = as;

  const show = (event: React.SyntheticEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 330;
    const left =
      rect.left > window.innerWidth / 2
        ? Math.max(8, rect.left - width - 12)
        : Math.min(window.innerWidth - width - 8, rect.right + 12);
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - 300));
    setPos({ left, top });
  };

  return (
    <Tag
      className={className}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
      onFocus={show}
      onBlur={() => setPos(null)}
    >
      {children}
      {pos &&
        createPortal(
          <div className="hover-card" style={{ left: pos.left, top: pos.top }}>
            {content}
          </div>,
          document.body,
        )}
    </Tag>
  );
}

export function SkillHover({ skillId }: { skillId: string }) {
  const skill = SKILL_MAP.get(skillId);
  if (!skill) return <span>{skillId}</span>;
  return (
    <div className="hover-skill">
      <div className="hover-skill-head">
        <b>{skill.name}</b>
        {skill.lord && <span className="hover-tag">主公技</span>}
        {skill.locked && <span className="hover-tag">锁定技</span>}
      </div>
      <p>{skill.desc}</p>
    </div>
  );
}

export function HeroHover({ hero, player }: { hero?: HeroData; player: PlayerState }) {
  const ids = [...new Set([...player.skills, ...player.extraSkills])];
  return (
    <div className="hover-hero">
      <div className="hover-hero-head">
        <span className={`faction-badge faction-${player.faction}`}>{FACTION_NAME[player.faction]}</span>
        <b>{hero?.name ?? player.heroName}</b>
        <span className="hover-hero-title">{hero?.title ?? ''}</span>
      </div>
      <div className="hover-hero-meta">
        <span>体力 {Math.max(0, player.hp)}/{player.maxHp}</span>
        <span>手牌 {player.hand.length}</span>
        {player.chained && <span>横置</span>}
        {player.flipped && <span>翻面</span>}
      </div>
      <div className="hover-skills">
        {ids.map((id) => (
          <SkillHover key={id} skillId={id} />
        ))}
      </div>
      <div className="hover-foot">点击「i」查看完整武将详情</div>
    </div>
  );
}

export function EquipHover({ name }: { name: string }) {
  const skill = SKILL_MAP.get(EQUIP_SKILL_ID[name] ?? '');
  return (
    <div className="hover-skill">
      <div className="hover-skill-head">
        <b>{name}</b>
        <span className="hover-tag">装备</span>
      </div>
      <p>{skill?.desc ?? '装备牌'}</p>
    </div>
  );
}
