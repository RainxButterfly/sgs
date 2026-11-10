import { useEffect, useState } from 'react';
import defaultBg from '../../assets/bg-default.jpg';
import { HERO_MAP } from '../../core/deck';
import { SKILL_MAP } from '../../core/skills';
import { FACTION_NAME, PHASE_NAME, ROLE_NAME } from '../../core/types';
import { HeroDetailModal } from '../components/HeroDetail';
import { HeroPanel } from '../components/HeroPanel';
import { Hand } from '../components/Hand';
import { LogPanel } from '../components/LogPanel';
import { PlayerSeat } from '../components/PlayerSeat';
import { TableCenter } from '../components/TableCenter';
import { TablePiles } from '../components/TablePiles';
import { TopBar } from '../components/TopBar';
import { tableSeatLabel, visibleSkillIds } from '../labels';
import { useGameSnapshot, useGameStore } from '../store';

const SEAT_LAYOUT: Record<number, [number, number][]> = {
  1: [[50, 20]],
  2: [[32, 24], [68, 24]],
  3: [[50, 20], [10, 60], [90, 60]],
  4: [[30, 24], [70, 24], [10, 56], [90, 56]],
  5: [[30, 20], [50, 18], [70, 20], [10, 47], [90, 47]],
  6: [[35, 20], [65, 20], [10, 40], [90, 40], [25, 80], [75, 80]],
  7: [[30, 20], [50, 18], [70, 20], [10, 36], [90, 36], [10, 68], [90, 68]],
  8: [[35, 20], [65, 20], [10, 36], [90, 36], [10, 68], [90, 68], [30, 82], [70, 82]],
};

const COMPACT_SEAT_LAYOUT: Record<number, [number, number][]> = {
  1: [[50, 22]],
  2: [[35, 24], [65, 24]],
  3: [[50, 20], [13, 58], [87, 58]],
  4: [[30, 22], [70, 22], [13, 60], [87, 60]],
  5: [[22, 20], [50, 18], [78, 20], [13, 58], [87, 58]],
  6: [[12, 20], [37, 18], [63, 18], [88, 20], [13, 52], [87, 52]],
  7: [[22, 20], [50, 18], [78, 20], [12, 44], [88, 44], [12, 72], [88, 72]],
  8: [[12, 20], [37, 18], [63, 18], [88, 20], [12, 46], [88, 46], [12, 72], [88, 72]],
};

export function SpectatorScreen() {
  const { game } = useGameSnapshot();
  const bgImage = useGameStore((s) => s.bgImage);
  const bgDim = useGameStore((s) => s.bgDim);
  const openChat = useGameStore((s) => s.openChat);
  const chatUnread = useGameStore((s) => s.chatUnread);
  const flashes = useGameStore((s) => s.flashes);
  const speechBubbles = useGameStore((s) => s.speechBubbles);
  const result = useGameStore((s) => s.result);
  const [logOpen, setLogOpen] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState<number | null>(null);
  const [focusId, setFocusId] = useState(0);
  const [followCurrent, setFollowCurrent] = useState(true);
  const [compactRing, setCompactRing] = useState(() => window.innerWidth < 1360);

  useEffect(() => {
    const onResize = () => setCompactRing(window.innerWidth < 1360);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!game) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === ' ') {
        event.preventDefault();
        setFollowCurrent((value) => !value);
        return;
      }
      const index = Number(event.key) - 1;
      const player = game.state.players[index];
      if (player) {
        setFollowCurrent(false);
        setFocusId(player.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [game]);

  const exit = () => {
    if (!window.confirm('确定退出观战吗？')) return;
    useGameStore.getState().leaveLan();
  };

  if (!game) {
    return (
      <div className="spectator-screen spectator-loading">
        <div className="game-bg" style={{ backgroundImage: `url(${bgImage ?? defaultBg})` }} />
        <div className="game-bg-shade" style={{ opacity: bgDim / 100 }} />
        <div className="fatal-card">
          <h1>正在接入观战</h1>
          <p>已连接房间，等待房主同步对局画面。</p>
          <div className="fatal-actions">
            <button type="button" className="btn ghost" onClick={exit}>
              退出观战
            </button>
          </div>
        </div>
      </div>
    );
  }

  const n = Math.max(1, game.state.players.length);
  const currentId = game.state.current;
  const mode = n === 2 ? 'duel' : (game.state.rules?.mode ?? 'identity');
  const focus = followCurrent
    ? game.state.players[currentId] ?? game.state.players[focusId] ?? game.state.players[0]
    : game.state.players[focusId] ?? game.state.players[0];
  const current = game.state.players[currentId] ?? game.state.players[0];
  const latestEvent = [...game.state.log].reverse().find((entry) => entry.kind !== 'system');
  const recent = [...game.state.log].reverse().slice(0, 8);
  const layout =
    (compactRing ? COMPACT_SEAT_LAYOUT : SEAT_LAYOUT)[Math.max(1, Math.min(8, n))] ?? SEAT_LAYOUT[8];
  const focusHero = HERO_MAP.get(focus.heroId);
  const focusSkills = visibleSkillIds(focus, mode, true)
    .map((id) => SKILL_MAP.get(id)?.name)
    .filter((name): name is string => !!name);
  const roleLabel =
    mode === 'guozhan' || mode === 'duel'
      ? ''
      : mode === 'landlord'
        ? focus.role === 'lord'
          ? '地主'
          : '农民'
        : ROLE_NAME[focus.role];
  const alive = game.state.players.filter((player) => player.alive).length;

  return (
    <div className="spectator-screen">
      <div className="game-bg" style={{ backgroundImage: `url(${bgImage ?? defaultBg})` }} />
      <div className="game-bg-shade" style={{ opacity: bgDim / 100 }} />
      <TopBar logOpen={logOpen} onToggleLog={() => setLogOpen((v) => !v)} onExit={exit} />
      <div className="spectator-stage spectator-stage-v2">
        <div className="spectator-board">
          <div className="spectator-ring">
            {game.state.players.map((player, index) => {
              const [x, y] = layout[index] ?? [50, 50];
              return (
                <PlayerSeat
                  key={player.id}
                  player={player}
                  mode={mode}
                  current={player.id === currentId}
                  clickable
                  revealRoles
                  selected={player.id === focus.id}
                  tableNo={tableSeatLabel(game.state.startPlayer, game.state.direction, player.id, n)}
                  flashes={flashes}
                  speech={speechBubbles.find((bubble) => bubble.playerId === player.id) ?? null}
                  style={{ left: `${x}%`, top: `${y}%` }}
                  onClick={() => {
                    setFollowCurrent(false);
                    setFocusId(player.id);
                  }}
                  onDetail={() => setDetailPlayer(player.id)}
                />
              );
            })}
          </div>
          <div className="seat-position" style={{ left: '50%', top: '52%' }}>
            <TableCenter />
          </div>
          <TablePiles />
        </div>
        <aside className="game-rail spectator-rail">
          <section className="rail-card rail-live">
            <div className="rail-title">
              <b>牌局状态</b>
              <span>LIVE</span>
            </div>
            <div className="spectator-live-grid">
              <span>回合 <b>{game.state.turn}</b></span>
              <span>{game.state.direction === 1 ? '顺时针' : '逆时针'}</span>
              <span>阶段 <b>{PHASE_NAME[game.state.phase]}</b></span>
              <span>存活 <b>{alive}/{n}</b></span>
            </div>
            <div className="spectator-current">
              <span>当前</span>
              <b>{current?.name ?? '等待开始'}</b>
              <em>{current ? HERO_MAP.get(current.heroId)?.name ?? '' : ''}</em>
            </div>
            {latestEvent && <div className="spectator-live-event">{latestEvent.text}</div>}
          </section>

          <section className="rail-card spectator-focus-card">
            <div className="rail-title">
              <b>观战焦点</b>
              <span>FOCUS</span>
            </div>
            <div className="spectator-focus-line">
              <span className={`faction-badge faction-${focus.faction}`}>{FACTION_NAME[focus.faction]}</span>
              <b>{focusHero?.name ?? focus.heroName}</b>
              {roleLabel && <em>{roleLabel}</em>}
            </div>
            <div className="spectator-focus-stats">
              <span>体力 <b>{Math.max(0, focus.hp)}/{focus.maxHp}</b></span>
              <span>手牌 <b>{focus.hand.length}</b></span>
              <span className={focus.alive ? '' : 'is-dead'}>{focus.alive ? '存活' : '阵亡'}</span>
            </div>
            {focusSkills.length > 0 && (
              <div className="spectator-focus-skills">
                {focusSkills.map((name) => (
                  <span key={name}>{name}</span>
                ))}
              </div>
            )}
            <button
              type="button"
              className="spectator-focus-detail"
              onClick={() => setDetailPlayer(focus.id)}
            >
              查看武将详情
            </button>
          </section>

          <section className="rail-card rail-feed">
            <div className="rail-title">
              <b>最近动向</b>
              <span>FEED</span>
            </div>
            <div className="rail-feed-list">
              {recent.length === 0 && <div className="rail-empty">暂无记录</div>}
              {recent.map((entry) => (
                <div key={entry.id} className={`rail-feed-line log-${entry.kind}`}>
                  <i className="rail-feed-dot" />
                  <span>{entry.text}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
      <div className="own-area spectator-own">
        <HeroPanel
          player={focus}
          mode={mode}
          current={focus.id === currentId}
          flashes={flashes}
          speech={speechBubbles.find((bubble) => bubble.playerId === focus.id) ?? null}
          handLimitModifier={game.state.rules?.handLimitModifier ?? 0}
          selfView
          tableNo={tableSeatLabel(game.state.startPlayer, game.state.direction, focus.id, n)}
          onDetail={() => setDetailPlayer(focus.id)}
        />
        <div className="play-column">
          <div className="spectator-focus-head">
            <span>
              正在查看 <b>{focus.name}</b> 的手牌 · 第 {game.state.turn} 回合
            </span>
            <div className="spectator-switch">
              <button
                type="button"
                className={`spectator-switch-btn ${followCurrent ? 'on' : ''}`}
                onClick={() => setFollowCurrent((value) => !value)}
              >
                {followCurrent ? '跟随牌局' : '自由视角'}
              </button>
              {game.state.players.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  className={`spectator-switch-btn ${player.id === focus.id ? 'on' : ''}`}
                  onClick={() => {
                    setFollowCurrent(false);
                    setFocusId(player.id);
                  }}
                  title={`切换到 ${player.name} 的视角`}
                >
                  {player.name}
                </button>
              ))}
              <button type="button" className="btn ghost small" onClick={openChat}>
                聊天{chatUnread > 0 && <span className="chat-badge">{chatUnread > 9 ? '9+' : chatUnread}</span>}
              </button>
            </div>
          </div>
          <Hand player={focus} pending={null} onSelect={() => undefined} />
        </div>
      </div>
      {result && (
        <div className="spectator-result-backdrop">
          <div className="spectator-result">
            <div className="spectator-result-kicker">观战结束</div>
            <h2>对局结束</h2>
            <p>{result.text}</p>
            <div className="spectator-result-actions">
              <button type="button" className="btn primary" onClick={exit}>
                退出观战
              </button>
            </div>
          </div>
        </div>
      )}
      <LogPanel open={logOpen} onClose={() => setLogOpen(false)} />
      {detailPlayer !== null && game.state.players[detailPlayer] && (
        <HeroDetailModal
          heroId={game.state.players[detailPlayer].heroId}
          player={game.state.players[detailPlayer]}
          mode={mode}
          showRole
          onClose={() => setDetailPlayer(null)}
        />
      )}
    </div>
  );
}
