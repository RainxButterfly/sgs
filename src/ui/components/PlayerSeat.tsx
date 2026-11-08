import { HERO_MAP } from '../../core/deck';
import { SKILL_MAP } from '../../core/skills';
import { FACTION_NAME, ROLE_NAME, type GameMode, type PlayerState } from '../../core/types';
import { rankText, shortCardName } from '../labels';
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
  selected?: boolean;
  clickable?: boolean;
  flash?: Flash | null;
  style?: React.CSSProperties;
  onDetail?: () => void;
  onClick?: () => void;
}

export function PlayerSeat({
  player,
  mode = 'identity',
  current,
  targetable,
  selected,
  clickable,
  flash,
  style,
  onDetail,
  onClick,
}: Props) {
  const hero = HERO_MAP.get(player.heroId);
  const roleLabel =
    mode === 'guozhan' || mode === 'duel'
      ? ''
      : mode === 'landlord'
        ? player.roleRevealed || !player.alive || player.role === 'lord'
          ? player.role === 'lord'
            ? '地主'
            : '农民'
          : ''
        : player.roleRevealed || !player.alive
          ? ROLE_NAME[player.role]
          : player.role === 'lord'
            ? '主公'
            : '';
  const pips = Array.from({ length: Math.max(player.maxHp, player.hp) }, (_, i) => i < player.hp);
  const equips = (['weapon', 'armor', 'horsePlus', 'horseMinus'] as const)
    .map((slot) => player.equips[slot])
    .filter((c): c is NonNullable<typeof c> => !!c);
  const showFlash = flash && flash.playerId === player.id ? flash : null;

  return (
    <div
      className={[
        'seat',
        `faction-${player.faction}`,
        current ? 'seat-current' : '',
        targetable ? 'seat-targetable' : '',
        selected ? 'seat-selected' : '',
        player.alive ? '' : 'seat-dead',
        clickable ? 'seat-clickable' : '',
      ].join(' ')}
      style={style}
      data-player-id={player.id}
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
    >
      {showFlash && (
        <span key={showFlash.id} className={`float-number ${showFlash.kind}`}>
          {showFlash.kind === 'damage' ? '−' : '+'}
          {showFlash.amount}
        </span>
      )}
      <div className="seat-head">
        <span className="faction-badge">{FACTION_NAME[player.faction]}</span>
        <span className="seat-hero">{hero?.name ?? player.heroName}</span>
        {roleLabel && <span className={`role-badge role-${player.role}`}>{roleLabel}</span>}
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
      <div className="seat-equips">
        {equips.length === 0 ? (
          <span className="seat-empty">无装备</span>
        ) : (
          equips.map((c) => (
            <HoverInfo key={c.id} content={<EquipHover name={c.name} />}>
              <span className="mini-equip" title={c.name}>
                {shortCardName(c.name)}
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
      {(player.flipped || player.unyu.length > 0 || player.chained || player.fields.length > 0) && (
        <div className="seat-status-row">
          {player.flipped && <span className="mini-status flipped">翻面</span>}
          {player.chained && <span className="mini-status chained">横置</span>}
          {player.fields.length > 0 && <span className="mini-unyu">田 {player.fields.length}</span>}
          {player.unyu.map((c) => (
            <span key={c.id} className="mini-unyu" title={`不屈：${c.name}`}>
              创{rankText(c.rank)}
            </span>
          ))}
        </div>
      )}
      <div className="seat-skills">
        {[...new Set([...player.skills, ...player.extraSkills])].map((id) => {
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
