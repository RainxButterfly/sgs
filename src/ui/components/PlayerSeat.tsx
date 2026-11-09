import { HERO_MAP } from '../../core/deck';
import { SKILL_MAP } from '../../core/skills';
import { FACTION_NAME, ROLE_NAME, type GameMode, type PlayerState, type Role } from '../../core/types';
import { playerHeroNames, rankText, shortCardName } from '../labels';
import { EquipHover, HeroHover, HoverInfo, JudgeHover, SkillHover } from './HoverInfo';

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
  targetable?: boolean;
  targeted?: boolean;
  selected?: boolean;
  clickable?: boolean;
  revealRoles?: boolean;
  mark?: Role | null;
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
  targetable,
  targeted,
  selected,
  clickable,
  revealRoles,
  mark,
  onMark,
  flash,
  flashes,
  speech,
  style,
  onDetail,
  onClick,
}: Props) {
  const hero = HERO_MAP.get(player.heroId);
  const roleVisible = revealRoles || player.roleRevealed || !player.alive;
  const roleLabel =
    mode === 'guozhan' || mode === 'duel'
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
  const skills = [...new Set([...player.skills, ...(player.extraSkills ?? [])])];
  const showFlash = flash && flash.playerId === player.id ? flash : null;
  const activeFlashes = (flashes ?? []).filter((item) => item.playerId === player.id);
  const displayFlashes = activeFlashes.length ? activeFlashes : showFlash ? [showFlash] : [];

  return (
    <div
      className={[
        'seat',
        `faction-${player.faction}`,
        current ? 'seat-current' : '',
        targetable ? 'seat-targetable' : '',
        targeted ? 'seat-targeted' : '',
        selected ? 'seat-selected' : '',
        player.alive ? '' : 'seat-dead',
        clickable ? 'seat-clickable' : '',
      ].join(' ')}
      style={style}
      data-player-id={player.id}
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
    >
      {speech && <div className="seat-speech">{speech.text}</div>}
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
      <div className="seat-head">
        <span className="faction-badge">{FACTION_NAME[player.faction]}</span>
        <span className="seat-hero">{playerHeroNames(player)}</span>
        {roleLabel && <span className={`role-badge role-${player.role}`}>{roleLabel}</span>}
        {onMark && (
          <button
            type="button"
            className={`seat-mark ${mark ? `role-${mark}` : ''}`}
            title="标记你判断的身份（仅自己可见）"
            onClick={(event) => {
              event.stopPropagation();
              onMark();
            }}
          >
            {mark ? ROLE_NAME[mark].slice(0, 1) : '标'}
          </button>
        )}
        {current && <span className="seat-turn-tag">行动中</span>}
        {player.isBot && <span className="ai-badge">AI</span>}
        {onDetail && (
          <HoverInfo className="seat-info-wrap" content={<HeroHover hero={hero} player={player} />}>
            <button
              type="button"
              className="seat-info"
              title="查看武将详情"
              onClick={(event) => {
                event.stopPropagation();
                onDetail();
              }}
            >
              i
            </button>
          </HoverInfo>
        )}
      </div>
      <div className="seat-sub">
        <span>{player.name}</span>
        <span className="seat-hand-count">手牌 {player.hand.length}</span>
      </div>
      <div className="hp-row">
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
      <div className="seat-equips">
        {equips.length === 0 ? (
          <span className="seat-empty">无装备</span>
        ) : (
          equips.map(({ slot, card }) => (
            <HoverInfo key={card.id} content={<EquipHover name={card.name} />}>
              <span
                className="mini-equip"
                title={`${slot === 'horsePlus' ? '+1 马' : slot === 'horseMinus' ? '-1 马' : card.name} · ${card.name}`}
              >
                {slot === 'horsePlus' ? '+1马 ' : slot === 'horseMinus' ? '-1马 ' : ''}
                {shortCardName(card.name)}
              </span>
            </HoverInfo>
          ))
        )}
      </div>
      {player.judgeZone.length > 0 && (
        <div className="seat-judge">
          {player.judgeZone.map((c) => (
            <HoverInfo key={c.id} content={<JudgeHover name={c.name} />}>
              <span className="mini-judge" title={c.name}>
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
      {!player.alive && <div className="dead-mask">阵亡</div>}
    </div>
  );
}
