import { HERO_MAP } from '../../core/deck';
import { TEAM_MATE_SEAT } from '../../net/protocol';
import { SKILL_MAP } from '../../core/skills';
import { FACTION_NAME, ROLE_NAME, type GameMode, type PlayerState, type Role } from '../../core/types';
import { cardSuitText, factionKnown, isRedCard, rankText, shortCardName, visibleHeroNames, visibleSkillIds } from '../labels';
import { portraitFor } from '../portrait';
import { EquipHover, HeroHover, HoverInfo, JudgeHover, SkillHover } from './HoverInfo';
import { HeroPortrait, useSkins } from './HeroPortrait';
import { useGameStore } from '../store';

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
  acting?: boolean;
  targetable?: boolean;
  targeted?: boolean;
  selected?: boolean;
  clickable?: boolean;
  revealRoles?: boolean;
  mark?: Role | null;
  tableNo?: string;
  unavailableHint?: string;
  onMark?: () => void;
  flash?: Flash | null;
  flashes?: Flash[];
  speech?: { name: string; text: string } | null;
  style?: React.CSSProperties;
  onDetail?: () => void;
  onClick?: () => void;
}

export function PlayerSeat({
  player,
  mode = 'identity',
  current,
  acting,
  targetable,
  targeted,
  selected,
  clickable,
  revealRoles,
  mark,
  tableNo,
  unavailableHint,
  onMark,
  flash,
  flashes,
  speech,
  style,
  onDetail,
  onClick,
}: Props) {
  const selfView = !!revealRoles;
  const propThrows = useGameStore((s) => s.propThrows);
  const sendProp = useGameStore((s) => s.sendProp);
  const lastSkill = useGameStore((s) => s.lastSkill);
  const incomingProps = propThrows.filter((p) => p.targetId === player.id);
  const hero = HERO_MAP.get(player.heroId);
  const showFaction = factionKnown(player, mode, selfView);
  const heroLabel = visibleHeroNames(player, mode, selfView);
  const roleVisible = revealRoles || player.roleRevealed || !player.alive;
  const roleLabel =
    mode === '2v2'
      ? player.role === 'loyalist'
        ? '甲队'
        : '乙队'
      : mode === 'guozhan' || mode === 'duel'
      ? ''
      : mode === 'landlord'
        ? roleVisible || player.role === 'lord'
          ? player.role === 'lord'
            ? '地主'
            : '农民'
          : ''
        : roleVisible
          ? ROLE_NAME[player.role]
          : player.role === 'lord'
            ? '主公'
            : '';
  const pips = Array.from({ length: Math.max(player.maxHp, player.hp) }, (_, i) => i < player.hp);
  const equips = (['weapon', 'armor', 'horsePlus', 'horseMinus'] as const)
    .map((slot) => ({ slot, card: player.equips[slot] }))
    .filter((item): item is { slot: (typeof item)['slot']; card: NonNullable<typeof item.card> } => !!item.card);
  const fields = player.fields ?? [];
  const skills = visibleSkillIds(player, mode, selfView);
  const showFlash = flash && flash.playerId === player.id ? flash : null;
  const activeFlashes = (flashes ?? []).filter((item) => item.playerId === player.id);
  const displayFlashes = activeFlashes.length ? activeFlashes : showFlash ? [showFlash] : [];
  const canMark = !!onMark && !(mode === 'identity' && (player.role === 'lord' || roleVisible));
  useSkins();
  const hidden = !showFaction;
  const portrait = portraitFor(hero?.id, hidden);
  const humanId = useGameStore((s) => s.humanId);
  const isTeammate = mode === '2v2' && !selfView && TEAM_MATE_SEAT[player.id] === humanId;

  const art = (
    <>
      <HeroPortrait heroId={hero?.id} hidden={hidden} className="seat-art-img" />
      <span className="seat-art-shade" />
      <span className={`seat-faction-mark faction-${player.faction}`}>
        {showFaction ? FACTION_NAME[player.faction] : '暗'}
      </span>
      {tableNo && <span className="seat-table-no">{tableNo}</span>}
      {roleLabel && (
        <span className={`seat-role-chip role-${player.role} ${roleVisible ? 'is-revealed' : ''}`}>
          {roleLabel}
        </span>
      )}
      {canMark && (
        <button
          type="button"
          className={`seat-role-mark ${mark ? `role-${mark}` : ''}`}
          title={mark ? `你标记为「${ROLE_NAME[mark]}」，点击修改` : '标记你判断的身份（仅自己可见）'}
          aria-label={mark ? `已标记身份 ${ROLE_NAME[mark]}` : '标记身份'}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onMark?.();
          }}
        >
          {mark ? ROLE_NAME[mark].slice(0, 1) : '标'}
        </button>
      )}
      {current && <span className="seat-turn-tag">行动中</span>}
      {player.chained && (
        <span className="seat-chain-line" aria-hidden="true" title="铁索连环：横置" />
      )}
      {player.isBot && <span className="ai-badge">AI</span>}
      <span className="seat-plate">
        <span className="seat-hero">{heroLabel}</span>
        <span className="seat-player-name">{player.name}</span>
        {player.ambition && <span className="ambition-tag">野心家</span>}
      </span>
    </>
  );

  return (
    <div
      className={[
        'seat',
        'seat-card-v2',
        `faction-${player.faction}`,
        mode === 'guozhan' && !showFaction ? 'is-dark' : '',
        current ? 'seat-current' : '',
        acting ? 'seat-acting' : '',
        player.chained ? 'seat-chained' : '',
        player.flipped ? 'seat-flipped' : '',
        targetable ? 'seat-targetable' : '',
        targeted ? 'seat-targeted' : '',
        selected ? 'seat-selected' : '',
        player.alive ? '' : 'seat-dead',
        clickable ? 'seat-clickable' : '',
      ].join(' ')}
      style={{ ...style, ['--seat-portrait' as string]: `url("${portrait}")` }}
      data-player-id={player.id}
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
    >
      {speech && <div className="seat-speech">{speech.text}</div>}
      {lastSkill && lastSkill.playerId === player.id && (
        <span key={`skill-${lastSkill.id}`} className="seat-skill-ring" aria-hidden="true" />
      )}
      {incomingProps.map((p) => (
        <div key={p.id} className={`seat-prop seat-prop-${p.prop}`} aria-hidden="true">
          <span className="seat-prop-emoji">{p.prop === 'flower' ? '🌸' : '🥚'}</span>
          <span className="seat-prop-splat">{p.prop === 'flower' ? '✿' : '💥'}</span>
          <span className="seat-prop-from">{p.fromName}</span>
        </div>
      ))}
      {unavailableHint && <span className="seat-unavailable">{unavailableHint}</span>}
      {displayFlashes.map((item, index) => (
        <span
          key={item.id}
          className={`float-number ${item.kind}`}
          style={{ top: `${-8 - index * 22}px` }}
        >
          {item.kind === 'damage' ? '−' : '+'}
          {item.amount}
        </span>
      ))}

      {showFaction ? (
        <HoverInfo as="div" className="seat-art" content={<HeroHover hero={hero} player={player} mode={mode} self={selfView} />}>
          {art}
        </HoverInfo>
      ) : (
        <div className="seat-art">{art}</div>
      )}

      <div className="seat-detail">
        <div className="seat-vitals">
          <span className="seat-hp-strip">
            {pips.map((filled, i) => (
              <i key={i} className={`hp-pip ${filled ? 'hp-on' : 'hp-off'}`} />
            ))}
          </span>
          <span className="seat-hp-text">
            {Math.max(0, player.hp)}/{player.maxHp}
          </span>
          <span className="seat-hand-badge">手牌 {player.hand.length}</span>
        </div>
        <div className="seat-equips">
          {equips.length === 0 ? (
            <span className="seat-empty">无装备</span>
          ) : (
            equips.map(({ slot, card }) => (
              <HoverInfo key={card.id} content={<EquipHover name={card.name} />}>
                <span
                  className="mini-equip"
                  title={`${slot === 'horsePlus' ? '+1 马' : slot === 'horseMinus' ? '-1 马' : card.name} · ${cardSuitText(card)} ${card.name}`}
                >
                  <i className={`equip-suit ${isRedCard(card) ? 'is-red' : 'is-black'}`}>{cardSuitText(card)}</i>
                  {slot === 'horsePlus' ? '+1马 ' : slot === 'horseMinus' ? '-1马 ' : ''}
                  {shortCardName(card.name)}
                  {slot === 'weapon' ? ` 攻${card.range ?? 1}` : ''}
                </span>
              </HoverInfo>
            ))
          )}
        </div>
        {player.judgeZone.length > 0 && (
          <div className="seat-judge">
            {player.judgeZone.map((c) => (
              <HoverInfo key={c.id} content={<JudgeHover name={c.name} />}>
                <span className="mini-judge" title={`${cardSuitText(c)} ${c.name}`}>
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
          <div className="seat-status-row">
            {player.flipped && <span className="mini-status flipped">翻面</span>}
            {player.chained && <span className="mini-status chained" title="铁索连环：横置，受到属性伤害时会传导">铁索·横置</span>}
            {(player.pojun?.length ?? 0) > 0 && (
              <span className="mini-status pojun">破军 {(player.pojun ?? []).length}</span>
            )}
            {fields.length > 0 && <span className="mini-unyu">田 {fields.length}</span>}
            {player.unyu.map((c) => (
              <span key={c.id} className="mini-unyu" title={`不屈：${c.name}`}>
                创{rankText(c.rank)}
              </span>
            ))}
          </div>
        )}
        <div className="seat-skills">
          {skills.map((id) => {
            const skill = SKILL_MAP.get(id);
            return skill ? (
              <HoverInfo key={id} content={<SkillHover skillId={id} />}>
                <span className={`mini-skill ${skill.lord ? 'lord' : ''}`} title={skill.desc}>
                  {skill.name}
                </span>
              </HoverInfo>
            ) : null;
          })}
        </div>
        {isTeammate && (
          <div className="seat-mate-hand" title="队友手牌（2v2 互通）">
            {player.hand.map((card) => (
              <span key={card.id}>{card.name}</span>
            ))}
          </div>
        )}
      </div>

      {(canMark || (onDetail && showFaction) || player.alive) && (
        <div className="seat-actions">
          {player.alive && (
            <div className="seat-prop-row">
              <button
                type="button"
                className="seat-action seat-prop-btn"
                title="砸鸡蛋"
                aria-label="砸鸡蛋"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  sendProp(player.id, 'egg');
                }}
              >
                🥚
              </button>
              <button
                type="button"
                className="seat-action seat-prop-btn"
                title="送花"
                aria-label="送花"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  sendProp(player.id, 'flower');
                }}
              >
                🌸
              </button>
            </div>
          )}
          {onDetail && showFaction && (
            <div className="seat-action-row">
              <HoverInfo className="seat-info-wrap" content={<HeroHover hero={hero} player={player} mode={mode} self={selfView} />}>
                <button
                  type="button"
                  className="seat-action seat-info"
                  title="查看武将详情"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDetail();
                  }}
                >
                  i
                </button>
              </HoverInfo>
            </div>
          )}
        </div>
      )}
      {!player.alive && <div className="dead-mask">阵亡</div>}
    </div>
  );
}
