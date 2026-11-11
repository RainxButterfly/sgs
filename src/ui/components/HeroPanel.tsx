import { HERO_MAP } from '../../core/deck';
import { SKILL_MAP } from '../../core/skills';
import { FACTION_NAME, ROLE_NAME, type GameMode, type PlayerState } from '../../core/types';
import { cardSuitText, equipSlotText, factionKnown, isRedCard, shortCardName, visibleHeroNames, visibleSkillIds } from '../labels';
import { EquipHover, HoverInfo, JudgeHover, SkillHover } from './HoverInfo';

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
  flashes?: Flash[];
  speech?: { name: string; text: string } | null;
  handLimitModifier?: number;
  selfView?: boolean;
  onReveal?: (index: number) => void;
  onDetail?: () => void;
  tableNo?: string;
}

export function HeroPanel({
  player,
  mode = 'identity',
  current,
  flash,
  flashes,
  speech,
  handLimitModifier = 0,
  selfView = false,
  onReveal,
  onDetail,
  tableNo,
}: Props) {
  const hero = HERO_MAP.get(player.heroId);
  const titles = (player.heroIds?.length ? player.heroIds : [player.heroId])
    .map((id) => HERO_MAP.get(id)?.title)
    .filter(Boolean)
    .join(' · ');
  const roleLabel =
    mode === 'duel'
      ? ''
      : mode === 'guozhan'
        ? `${FACTION_NAME[player.faction]}势力`
        : mode === 'landlord'
          ? player.role === 'lord'
            ? '地主'
            : '农民'
          : ROLE_NAME[player.role];
  const pips = Array.from({ length: Math.max(player.maxHp, player.hp) }, (_, i) => i < player.hp);
  const showFlash = flash && flash.playerId === player.id ? flash : null;
  const activeFlashes = (flashes ?? []).filter((item) => item.playerId === player.id);
  const displayFlashes = activeFlashes.length ? activeFlashes : showFlash ? [showFlash] : [];
  const fields = player.fields ?? [];
  const skills = visibleSkillIds(player, mode, selfView);
  const heroLabel = visibleHeroNames(player, mode, selfView);
  const showFaction = factionKnown(player, mode, selfView);
  const slots = [
    { key: 'weapon', label: '武器' },
    { key: 'armor', label: '防具' },
    { key: 'horsePlus', label: '+1 马' },
    { key: 'horseMinus', label: '-1 马' },
  ] as const;

  return (
    <div
      className={`hero-panel faction-${player.faction} ${current ? 'hero-current' : ''} ${
        player.alive ? '' : 'hero-dead'
      }`}
      data-player-id={player.id}
    >
      {speech && <div className="seat-speech hero-speech">{speech.text}</div>}
      {!player.alive && <span className="hero-dead-badge">阵亡</span>}
      {displayFlashes.map((item, index) => (
        <span
          key={item.id}
          className={`float-number big ${item.kind}`}
          style={{ top: `${-6 - index * 24}px` }}
        >
          {item.kind === 'damage' ? '−' : '+'}
          {item.amount}
        </span>
      ))}
      <div className="hero-main">
        <div className="hero-emblem">{showFaction ? FACTION_NAME[player.faction] : '暗'}</div>
        <div className="hero-identity">
          <div className="hero-name-row">
            {tableNo && <span className="hero-table-no">{tableNo}</span>}
            <span className="hero-name">{heroLabel}</span>
            {roleLabel && <span className={`role-tag role-${player.role}`}>{roleLabel}</span>}
            {onDetail && (
              <button type="button" className="hero-detail-btn" onClick={onDetail}>
                详情
              </button>
            )}
          </div>
          <div className="hero-title">{titles || '无名之辈'}</div>
          <div className="hp-row big">
            {pips.map((filled, i) => (
              <span key={i} className={`hp-pip ${filled ? 'hp-on' : 'hp-off'}`} />
            ))}
            <span className="hp-text">
              {Math.max(0, player.hp)}/{player.maxHp}
            </span>
          </div>
          <div className="hp-meter">
            <i style={{ width: `${Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100))}%` }} />
          </div>
        </div>
      </div>
      <div className="hero-body">
        <div className="hero-skills">
          {skills.map((id) => {
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
        <div className="hero-equips">
        {slots.map(({ key, label }) => {
          const card = player.equips[key];
          const body = (
            <>
              <span className="equip-label">{label}</span>
              <span className="equip-name">
                {card && (
                  <i className={`equip-suit ${isRedCard(card) ? 'is-red' : 'is-black'}`}>
                    {cardSuitText(card)}
                  </i>
                )}
                {card ? shortCardName(card.name) : '—'}
              </span>
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
            <HoverInfo key={c.id} content={<JudgeHover name={c.name} />}>
              <span className="mini-judge">
                <i className={`equip-suit ${isRedCard(c) ? 'is-red' : 'is-black'}`}>{cardSuitText(c)}</i>
                {shortCardName(c.name)}
              </span>
            </HoverInfo>
          ))}
        </div>
      )}
      {(player.flipped ||
        player.unyu.length > 0 ||
        player.chained ||
        fields.length > 0 ||
        (player.pojun?.length ?? 0) > 0) && (
        <div className="hero-status-row">
          {player.flipped && <span className="mini-status flipped">翻面</span>}
          {player.chained && <span className="mini-status chained" title="铁索连环：横置，受到属性伤害时会传导">铁索·横置</span>}
          {(player.pojun?.length ?? 0) > 0 && (
            <span className="mini-status pojun">破军 {(player.pojun ?? []).length}</span>
          )}
          {fields.map((c) => (
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
      </div>
      {mode === 'guozhan' &&
        player.generalRevealed?.some((value) => !value) &&
        onReveal && (
          <div className="hero-reveal-bar">
            <span className="hero-reveal-label">暗将 · 明置后获得对应技能</span>
            {player.generalRevealed.map((revealed, index) =>
              revealed ? null : (
                <button
                  key={index}
                  type="button"
                  className="btn ghost small"
                  onClick={() => onReveal(index)}
                >
                  明置{index === 0 ? '主将' : '副将'}
                </button>
              ),
            )}
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
