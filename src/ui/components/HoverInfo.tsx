import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { HeroData, PlayerState } from '../../core/types';
import { FACTION_NAME } from '../../core/types';
import { SKILL_MAP } from '../../core/skills';
import { EQUIP_DESC, EQUIP_SKILL_ID } from '../../core/equipment';
import { HERO_MAP } from '../../core/deck';
import { playerHeroNames } from '../labels';

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
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
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

export function HeroDataHover({ hero }: { hero: HeroData }) {
  const ids = [...hero.skillIds, ...(hero.lordSkillId ? [hero.lordSkillId] : [])];
  return (
    <div className="hover-hero">
      <div className="hover-hero-head">
        <span className={`faction-badge faction-${hero.faction}`}>{FACTION_NAME[hero.faction]}</span>
        <b>{hero.name}</b>
        <span className="hover-hero-title">{hero.title}</span>
      </div>
      <div className="hover-hero-meta">
        <span>体力 {hero.hp}</span>
        <span>{hero.gender === 'male' ? '男' : '女'}</span>
        <span>{hero.quote ? `「${hero.quote}」` : ''}</span>
      </div>
      <div className="hover-skills">
        {ids.map((id) => (
          <SkillHover key={id} skillId={id} />
        ))}
      </div>
      <div className="hover-foot">点击选择该武将</div>
    </div>
  );
}

export function HeroHover({ hero, player }: { hero?: HeroData; player: PlayerState }) {
  const ids = [...new Set([...player.skills, ...(player.extraSkills ?? [])])];
  const heroIds = player.heroIds?.length ? player.heroIds : [player.heroId];
  const titles = heroIds.map((id) => HERO_MAP.get(id)?.title).filter(Boolean).join(' · ');
  return (
    <div className="hover-hero">
      <div className="hover-hero-head">
        <span className={`faction-badge faction-${player.faction}`}>{FACTION_NAME[player.faction]}</span>
        <b>{playerHeroNames(player)}</b>
        <span className="hover-hero-title">{titles || hero?.title || ''}</span>
      </div>
      <div className="hover-hero-meta">
        <span>体力 {Math.max(0, player.hp)}/{player.maxHp}</span>
        <span>手牌 {player.hand.length}</span>
        {player.chained && <span title="横置角色受到属性伤害时会传导给其他横置角色">铁索·横置</span>}
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

const JUDGE_DESC: Record<string, string> = {
  乐不思蜀: '判定阶段进行判定：若结果不为红桃，跳过出牌阶段。',
  兵粮寸断: '判定阶段进行判定：若结果不为梅花，跳过摸牌阶段。',
  闪电: '判定阶段进行判定：若为黑桃 2–9，受到 3 点雷电伤害；否则移动到下一名角色的判定区。',
};

export function JudgeHover({ name }: { name: string }) {
  return (
    <div className="hover-skill">
      <div className="hover-skill-head">
        <b>{name}</b>
        <span className="hover-tag">延时锦囊</span>
      </div>
      <p>{JUDGE_DESC[name] ?? '判定区里的延时锦囊。'}</p>
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
      <p>{EQUIP_DESC[name] ?? skill?.desc ?? '装备牌'}</p>
    </div>
  );
}
