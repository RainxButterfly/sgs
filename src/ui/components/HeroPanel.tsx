import { HERO_MAP } from '../../core/deck';
import { SKILL_MAP } from '../../core/skills';
import { FACTION_NAME, ROLE_NAME, type GameMode, type PlayerState } from '../../core/types';
import { equipSlotText, shortCardName } from '../labels';
import { EquipHover, HoverInfo, SkillHover } from './HoverInfo';

interface Flash {
  id: number;
  playerId: number;
  kind: 'damage' | 'heal';
  amount: number;
}

interface Props {
  player: PlayerState;
  mode?: GameMode;
  current: boolean;
  flash?: Flash | null;
  handLimitModifier?: number;
  onDetail?: () => void;
}

export function HeroPanel({ player, mode = 'identity', current, flash, handLimitModifier = 0, onDetail }: Props) {
  const hero = HERO_MAP.get(player.heroId);
  const roleLabel =
    mode === 'guozhan'
      ? `${FACTION_NAME[player.faction]}势力`
      : mode === 'landlord'
        ? player.role === 'lord'
          ? '地主'
          : '农民'
        : ROLE_NAME[player.role];
  const pips = Array.from({ length: Math.max(player.maxHp, player.hp) }, (_, i) => i < player.hp);
  const showFlash = flash && flash.playerId === player.id ? flash : null;
  const slots = [
    { key: 'weapon', label: '武器' },
    { key: 'armor', label: '防具' },
    { key: 'horsePlus', label: '+1 马' },
    { key: 'horseMinus', label: '-1 马' },
  ] as const;

  return (
    <div className={`hero-panel faction-${player.faction} ${current ? 'hero-current' : ''}`}>
      {showFlash && (
        <span key={showFlash.id} className={`float-number big ${showFlash.kind}`}>
          {showFlash.kind === 'damage' ? '−' : '+'}
          {showFlash.amount}
        </span>
      )}
      <div className="hero-main">
        <div className="hero-emblem">{FACTION_NAME[player.faction]}</div>
        <div className="hero-identity">
          <div className="hero-name-row">
            <span className="hero-name">{hero?.name ?? player.heroName}</span>
            <span className={`role-tag role-${player.role}`}>{roleLabel}</span>
            {onDetail && (
              <button type="button" className="hero-detail-btn" onClick={onDetail}>
                详情
              </button>
            )}
          </div>
          <div className="hero-title">{hero?.title ?? '无名之辈'}</div>
          <div className="hp-row big">
            {pips.map((filled, i) => (
              <span key={i} className={`hp-pip ${filled ? 'hp-on' : 'hp-off'}`} />
            ))}
            <span className="hp-text">
              {Math.max(0, player.hp)}/{player.maxHp}
            </span>
          </div>
          <div className="hero-skills">
            {[...new Set([...player.skills, ...player.extraSkills])].map((id) => {
              const skill = SKILL_MAP.get(id);
              return skill ? (
                <HoverInfo
                  as="div"
                  key={id}
                  className={`skill-chip ${skill.lord ? 'lord' : ''}`}
                  content={<SkillHover skillId={id} />}
                >
                  <span className="skill-name">{skill.name}</span>
                  <span className="skill-desc">{skill.desc}</span>
                </HoverInfo>
              ) : null;
            })}
          </div>
        </div>
      </div>
      <div className="hero-equips">
        {slots.map(({ key, label }) => {
          const card = player.equips[key];
          const body = (
            <>
              <span className="equip-label">{label}</span>
              <span className="equip-name">{card ? shortCardName(card.name) : '—'}</span>
              {card && <span className="equip-slot-hint">{equipSlotText(card.equipSlot)}</span>}
            </>
          );
          return card ? (
            <HoverInfo key={key} as="div" className="equip-slot filled" content={<EquipHover name={card.name} />}>
              {body}
            </HoverInfo>
          ) : (
            <div key={key} className="equip-slot">
              {body}
            </div>
          );
        })}
      </div>
      {player.judgeZone.length > 0 && (
        <div className="hero-judge">
          <span className="hero-judge-label">判定区</span>
          {player.judgeZone.map((c) => (
            <span key={c.id} className="mini-judge">
              {shortCardName(c.name)}
            </span>
          ))}
        </div>
      )}
      {(player.flipped || player.unyu.length > 0 || player.chained || player.fields.length > 0) && (
        <div className="hero-status-row">
          {player.flipped && <span className="mini-status flipped">翻面</span>}
          {player.chained && <span className="mini-status chained">横置</span>}
          {player.fields.map((c) => (
            <span key={c.id} className="mini-unyu" title={`田：${c.name}`}>
              田 {c.name}
            </span>
          ))}
          {player.unyu.map((c) => (
            <span key={c.id} className="mini-unyu">
              创 {c.name}
            </span>
          ))}
        </div>
      )}
      <div className="hero-foot">
        <span>手牌 {player.hand.length}</span>
        <span>手牌上限 {Math.max(0, player.hp + handLimitModifier)}</span>
        {current && <span className="turn-tag">你的回合</span>}
      </div>
    </div>
  );
}
