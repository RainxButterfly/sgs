import { HERO_MAP } from '../../core/deck';
import { SKILL_MAP } from '../../core/skills';
import { FACTION_NAME } from '../../core/types';
import type { LobbyPlayer } from '../../net/protocol';
import { HeroDataHover, HoverInfo } from './HoverInfo';

interface Props {
  players: LobbyPlayer[];
  me: LobbyPlayer;
  host: boolean;
  startCount: number;
  code: string;
  lordPlayerId?: number | null;
  lordSeat?: number;
  lordHeroId?: string;
  revealed?: boolean;
  onPick: (heroId: string) => void;
  onStart: () => void;
  onCancel: () => void;
}

export function LanPickPanel({
  players,
  me,
  host,
  startCount,
  code,
  lordPlayerId,
  lordSeat,
  lordHeroId,
  revealed,
  onPick,
  onStart,
  onCancel,
}: Props) {
  const allPicked = players.every((player) => player.heroId);
  const emptySlots = Math.max(0, startCount - players.length);
  const lordReady = !lordPlayerId || !!lordHeroId;
  const canPick = lordReady || me.playerId === lordPlayerId;
  const lordBotHero = lordPlayerId == null && lordHeroId ? HERO_MAP.get(lordHeroId) : undefined;

  return (
    <div className="lan-pick">
      <div className="lan-pick-head">
        <div>
          <div className="room-card-title">选 将</div>
          <p className="setup-hint">
            房间码 {code} · 所有人选好武将后由房主进入对局
          </p>
        </div>
        <span className={`lobby-status ${allPicked ? '' : 'waiting'}`}>
          {allPicked ? '所有人已选择' : '等待选择'}
        </span>
      </div>

      <div className="pick-layout">
        <section className="pick-seats">
          <div className="room-card-title">座次与武将</div>
          {players.map((player) => {
            const isLord = lordPlayerId != null && player.playerId === lordPlayerId;
            const showHero = isLord || revealed || player.connId === me.connId;
            const hero = player.heroId && showHero ? HERO_MAP.get(player.heroId) : undefined;
            return (
              <div
                key={player.connId}
                className={`pick-seat ${player.connId === me.connId ? 'is-human' : ''} ${isLord ? 'is-lord' : ''}`}
              >
                <span className="pick-seat-label">{isLord ? '主公' : player.isHost ? '房主' : '玩家'}</span>
                <span className="pick-seat-hero">
                  {player.heroId ? (showHero ? (hero?.name ?? '已选择') : '未亮将') : '选择中'}
                </span>
                <span className="pick-seat-tag">{player.name}</span>
              </div>
            );
          })}
          {Array.from({ length: emptySlots }, (_, index) => {
            const seatIndex = players.length + index;
            const isBotLord = !lordPlayerId && !!lordBotHero && lordSeat === seatIndex;
            return (
              <div key={`empty-${index}`} className={`pick-seat ${isBotLord ? 'is-lord' : ''}`}>
                <span className="pick-seat-label">{isBotLord ? '主公' : '电脑'}</span>
                <span className="pick-seat-hero">{isBotLord ? lordBotHero?.name : '自动补足'}</span>
                <span className="pick-seat-tag">{isBotLord ? '电脑' : '空位'}</span>
              </div>
            );
          })}
          <div className="pick-seat-note">
            {revealed ? '全部选择完成，所有武将已亮出。' : '主公武将先行亮出，其余武将等全部选择完成后亮出。'}
          </div>
        </section>

        <section className="pick-choice">
          <div className="setup-row">
            <span className="setup-label">你的候选武将</span>
            <span className="setup-hint">
              {!lordReady && me.playerId !== lordPlayerId
                ? '等待主公选择武将'
                : me.heroId
                  ? '可以重新选择'
                  : '选择一名武将'}
            </span>
          </div>
          <div className="lobby-hero-grid">
            {(me.choices ?? []).map((heroId) => {
              const hero = HERO_MAP.get(heroId);
              if (!hero) return null;
              const taken =
                (heroId === lordHeroId && me.heroId !== heroId) ||
                players.some((player) => player.connId !== me.connId && player.heroId === heroId);
              const picked = me.heroId === heroId;
              return (
                <HoverInfo key={heroId} as="div" className="lobby-hero-wrap" content={<HeroDataHover hero={hero} />}>
                <button
                  type="button"
                  className={`lobby-hero-card faction-${hero.faction} ${picked ? 'picked' : ''} ${taken ? 'taken' : ''}`}
                  disabled={taken || !canPick}
                  onClick={() => onPick(heroId)}
                >
                  <div className="lobby-hero-top">
                    <span className="faction-badge">{FACTION_NAME[hero.faction]}</span>
                    <span className="lobby-hero-name">{hero.name}</span>
                    <span className="lobby-hero-hp">♥ {hero.hp}</span>
                  </div>
                  <div className="lobby-hero-title">{hero.title}</div>
                  <div className="lobby-hero-skills">
                    {hero.skillIds.map((skillId) => SKILL_MAP.get(skillId)?.name).filter(Boolean).join(' · ')}
                  </div>
                  {taken && <span className="lobby-hero-flag">已被选择</span>}
                  {picked && <span className="lobby-hero-flag picked">已选择</span>}
                </button>
                </HoverInfo>
              );
            })}
          </div>
        </section>
      </div>

      <div className="start-row lan-pick-actions">
        {host ? (
          <>
            <span className="setup-hint">
              {allPicked ? '可以进入对局了' : '还有玩家没有选择武将'}
            </span>
            <button type="button" className="btn ghost" onClick={onCancel}>
              返回大厅
            </button>
            <button type="button" className="btn primary big" disabled={!allPicked} onClick={onStart}>
              进入对局
            </button>
          </>
        ) : (
          <div className="waiting-row">
            <span className="waiting-dot" />
            <span>选择武将后等待房主进入对局…</span>
          </div>
        )}
      </div>
    </div>
  );
}
