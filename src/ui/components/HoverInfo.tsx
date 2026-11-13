import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { GameMode, HeroData, PlayerState } from '../../core/types';
import { FACTION_NAME } from '../../core/types';
import { SKILL_MAP } from '../../core/skills';
import { EQUIP_DESC, EQUIP_SKILL_ID } from '../../core/equipment';
import { heroSkillGroups, visibleHeroNames } from '../labels';

interface Props {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  as?: 'span' | 'div';
  style?: React.CSSProperties;
}

interface CardPos {
  left: number;
  top: number;
  /** 已完成一次实测定位，不再重复测量 */
  placed?: boolean;
}

export function HoverInfo({ content, children, className, as = 'span', style }: Props) {
  const [pos, setPos] = useState<CardPos | null>(null);
  const hideTimer = useRef<number | null>(null);
  const anchor = useRef<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const Tag = as;

  const cancelHide = () => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = window.setTimeout(() => setPos(null), 140);
  };
  useEffect(() => cancelHide, []);

  // 卡片渲染后按真实高度定位：能放下就贴着触发点，放不下就翻到触发点上方
  useLayoutEffect(() => {
    if (!pos || pos.placed) return;
    const card = cardRef.current;
    const rect = anchor.current;
    if (!card || !rect) return;
    const margin = 8;
    const viewport = window.innerHeight;
    const height = Math.min(card.offsetHeight, viewport * 0.7);
    let top = rect.top;
    if (rect.top + height > viewport - margin) top = rect.top - height - 7;
    top = Math.max(margin, Math.min(top, Math.max(margin, viewport - height - margin)));
    setPos({ left: pos.left, top, placed: true });
  }, [pos]);

  const show = (event: React.SyntheticEvent<HTMLElement>) => {
    cancelHide();
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    anchor.current = rect;
    const width = Math.min(330, window.innerWidth - 16);
    const left =
      rect.left > window.innerWidth / 2
        ? Math.max(8, rect.left - width - 12)
        : Math.min(window.innerWidth - width - 8, rect.right + 12);
    setPos({ left, top: rect.top });
  };

  return (
    <Tag
      className={className}
      style={style}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onFocus={show}
      onBlur={() => setPos(null)}
    >
      {children}
      {pos &&
        createPortal(
          <div
            ref={cardRef}
            className="hover-card"
            style={{ left: pos.left, top: pos.top, width: Math.min(330, window.innerWidth - 16) }}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
          >
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

export function HeroPairHover({ heroes }: { heroes: HeroData[] }) {
  return (
    <div className="hover-hero">
      <div className="hover-hero-head">
        <span className={`faction-badge faction-${heroes[0].faction}`}>{FACTION_NAME[heroes[0].faction]}</span>
        <b>{heroes.map((hero) => hero.name).join(' / ')}</b>
        <span className="hover-hero-title">双将合计体力 {heroes.reduce((sum, hero) => sum + hero.hp, 0)}</span>
      </div>
      {heroes.map((hero, index) => (
        <div className="hover-general" key={hero.id}>
          <div className="hover-general-head">
            <span className="hover-tag">{index === 0 ? '主将' : '副将'}</span>
            <b>{hero.name}</b>
            <span className="hover-hero-title">{hero.title}</span>
          </div>
          <div className="hover-skills">
            {[...hero.skillIds, ...(hero.lordSkillId ? [hero.lordSkillId] : [])].map((id) => (
              <SkillHover key={id} skillId={id} />
            ))}
          </div>
        </div>
      ))}
      <div className="hover-foot">点击选择该组双将</div>
    </div>
  );
}

export function HeroHover({
  hero,
  player,
  mode = 'identity',
  self = false,
}: {
  hero?: HeroData;
  player: PlayerState;
  mode?: GameMode;
  self?: boolean;
}) {
  const groups = heroSkillGroups(player, mode, self);
  const dual = groups.length > 1;
  const anyRevealed = groups.some((group) => group.revealed);
  const extra = [...new Set(player.extraSkills ?? [])];
  const flatIds = [...new Set([...player.skills, ...(player.extraSkills ?? [])])];
  const titles = groups
    .filter((group) => group.revealed)
    .map((group) => group.title)
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="hover-hero">
      <div className="hover-hero-head">
        <span className={`faction-badge faction-${player.faction}`}>{FACTION_NAME[player.faction]}</span>
        <b>{visibleHeroNames(player, mode, self)}</b>
        <span className="hover-hero-title">{titles || hero?.title || ''}</span>
      </div>
      <div className="hover-hero-meta">
        <span>体力 {Math.max(0, player.hp)}/{player.maxHp}{dual ? '（双将合计）' : ''}</span>
        <span>手牌 {player.hand.length}</span>
        {dual && <span>性别：{player.gender === 'male' ? '男' : '女'}（按主将）</span>}
        {player.chained && <span title="横置角色受到属性伤害时会传导给其他横置角色">铁索·横置</span>}
        {player.flipped && <span>翻面</span>}
      </div>
      <div className="hover-skills">
        {dual ? (
          <>
            {groups.map((group) =>
              group.revealed ? (
                <div className="hover-general" key={group.heroId}>
                  <div className="hover-general-head">
                    <span className="hover-tag">{group.label}</span>
                    <b>{group.name}</b>
                  </div>
                  {group.skillIds.map((id) => (
                    <SkillHover key={id} skillId={id} />
                  ))}
                </div>
              ) : (
                <div className="hover-general is-dark" key={group.heroId}>
                  <div className="hover-general-head">
                    <span className="hover-tag">{group.label}</span>
                    <b>暗将</b>
                  </div>
                  <p className="hover-dark-note">明置后显示武将与技能</p>
                </div>
              ),
            )}
            {anyRevealed && extra.length > 0 && (
              <div className="hover-general">
                <div className="hover-general-head">
                  <span className="hover-tag">其他</span>
                </div>
                {extra.map((id) => (
                  <SkillHover key={id} skillId={id} />
                ))}
              </div>
            )}
          </>
        ) : (
          flatIds.map((id) => <SkillHover key={id} skillId={id} />)
        )}
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
