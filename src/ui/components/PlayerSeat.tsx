import { HERO_MAP } from '../../core/deck';
import { SKILL_MAP } from '../../core/skills';
import { FACTION_NAME, ROLE_NAME, type PlayerState } from '../../core/types';
import { rankText, shortCardName } from '../labels';

interface Flash {
  id: number;
  playerId: number;
  kind: 'damage' | 'heal';
  amount: number;
}

interface Props {
  player: PlayerState;
  current: boolean;
  targetable?: boolean;
  selected?: boolean;
  clickable?: boolean;
  flash?: Flash | null;
  style?: React.CSSProperties;
  onDetail?: () => void;
  onClick?: () => void;
}

export function PlayerSeat({ player, current, targetable, selected, clickable, flash, style, onDetail, onClick }: Props) {
  const hero = HERO_MAP.get(player.heroId);
  const roleLabel =
    player.roleRevealed || !player.alive ? ROLE_NAME[player.role] : player.role === 'lord' ? '主公' : '';
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
        {player.isBot && <span className="ai-badge">AI</span>}
        {onDetail && (
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
            <span key={c.id} className="mini-equip" title={c.name}>
              {shortCardName(c.name)}
            </span>
          ))
        )}
      </div>
      {player.judgeZone.length > 0 && (
        <div className="seat-judge">
          {player.judgeZone.map((c) => (
            <span key={c.id} className="mini-judge" title={c.name}>
              {shortCardName(c.name)}
            </span>
          ))}
        </div>
      )}
      {(player.flipped || player.unyu.length > 0) && (
        <div className="seat-status-row">
          {player.flipped && <span className="mini-status flipped">翻面</span>}
          {player.unyu.map((c) => (
            <span key={c.id} className="mini-unyu" title={`不屈：${c.name}`}>
              创{rankText(c.rank)}
            </span>
          ))}
        </div>
      )}
      <div className="seat-skills">
        {player.skills.map((id) => {
          const skill = SKILL_MAP.get(id);
          return skill ? (
            <span key={id} className={`mini-skill ${skill.lord ? 'lord' : ''}`} title={skill.desc}>
              {skill.name}
            </span>
          ) : null;
        })}
      </div>
      {!player.alive && <div className="dead-mask">阵亡</div>}
    </div>
  );
}
