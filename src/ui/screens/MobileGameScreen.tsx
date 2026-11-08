import { useState } from 'react';
import defaultBg from '../../assets/bg-default.jpg';
import { HERO_MAP } from '../../core/deck';
import { SKILL_MAP } from '../../core/skills';
import { FACTION_NAME, PHASE_NAME, ROLE_NAME, type PlayerState } from '../../core/types';
import { CardView } from '../components/CardView';
import { HeroDetailModal } from '../components/HeroDetail';
import { Hand } from '../components/Hand';
import { LogPanel } from '../components/LogPanel';
import { GameModals } from '../components/Modals';
import { PromptBar } from '../components/PromptBar';
import { useGameSnapshot, useGameStore } from '../store';

function roleText(player: PlayerState, mode: string, self = false): string {
  if (mode === 'duel' || mode === 'guozhan') return '';
  if (mode === 'landlord') return player.role === 'lord' ? '地主' : '农民';
  if (self || player.roleRevealed || !player.alive || player.role === 'lord') return ROLE_NAME[player.role];
  return '';
}

export function MobileGameScreen() {
  const { game } = useGameSnapshot();
  const humanId = useGameStore((s) => s.humanId);
  const pending = useGameStore((s) => s.pending);
  const selected = useGameStore((s) => s.selected);
  const selectedTargets = useGameStore((s) => s.selectedTargets);
  const lastPlay = useGameStore((s) => s.lastPlay);
  const lastJudge = useGameStore((s) => s.lastJudge);
  const cardHistory = useGameStore((s) => s.cardHistory);
  const bgImage = useGameStore((s) => s.bgImage);
  const bgDim = useGameStore((s) => s.bgDim);
  const [logOpen, setLogOpen] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState<number | null>(null);

  if (!game) {
    return (
      <div className="fatal-error">
        <div className="fatal-card">
          <h1>对局状态丢失</h1>
          <p>房间可能已经关闭或连接中断。</p>
          <div className="fatal-actions">
            <button type="button" className="btn primary" onClick={() => useGameStore.getState().backToMenu()}>
              返回主菜单
            </button>
          </div>
        </div>
      </div>
    );
  }
  const human = game.state.players[humanId];
  if (!human) {
    return (
      <div className="fatal-error">
        <div className="fatal-card">
          <h1>找不到你的座位</h1>
          <p>对局数据不完整，请返回主菜单重开。</p>
          <div className="fatal-actions">
            <button type="button" className="btn primary" onClick={() => useGameStore.getState().backToMenu()}>
              返回主菜单
            </button>
          </div>
        </div>
      </div>
    );
  }

  const mode = game.state.players.length === 2 ? 'duel' : (game.state.rules?.mode ?? 'identity');
  const currentId = game.state.current;
  const current = game.state.players[currentId];
  const mine = currentId === humanId;
  const selectedOption =
    pending?.kind === 'play' && selected
      ? pending.cardOptions?.find(
          (o) =>
            o.cardId === selected.cardId &&
            o.as === selected.as &&
            (o.skillId ?? '') === (selected.skillId ?? ''),
        )
      : undefined;
  const targetable = new Set<number>();
  if (pending) {
    if (pending.kind === 'choosePlayer') (pending.players ?? []).forEach((id) => targetable.add(id));
    else if (pending.kind === 'play' && selectedOption) selectedOption.validTargets.forEach((id) => targetable.add(id));
  }
  const opponents = game.state.players.filter((p) => p.id !== humanId);
  const handLimit = Math.max(0, human.hp + (game.state.rules?.handLimitModifier ?? 0));
  const humanSkills = [...new Set([...human.skills, ...(human.extraSkills ?? [])])]
    .map((id) => SKILL_MAP.get(id)?.name)
    .filter(Boolean);
  const recent = cardHistory.slice(-2);
  const targetName = (id: number) => game.state.players[id]?.name ?? '';

  const exit = () => {
    const state = useGameStore.getState();
    if (state.lanRole === 'client' && !game.state.over) {
      if (!window.confirm('退出后对局仍会继续，你可以从主菜单重新回归。确定退出吗？')) return;
      state.suspendGame();
      return;
    }
    if (!game.state.over && !window.confirm('确定要退出本局吗？')) return;
    state.backToMenu();
  };

  return (
    <div className="mobile-game">
      <div className="game-bg" style={{ backgroundImage: `url(${bgImage ?? defaultBg})` }} />
      <div className="game-bg-shade" style={{ opacity: bgDim / 100 }} />

      <header className="m-topbar">
        <span className="m-brand">闪</span>
        <span className="m-turn">
          <b>{mine ? '轮到你' : `等待 ${current?.name ?? ''}`}</b>
          <em>
            第 {game.state.turn} 回合 · {current?.heroName ?? ''} · {PHASE_NAME[game.state.phase]}
          </em>
        </span>
        <div className="m-top-actions">
          <button type="button" onClick={() => setLogOpen(true)}>
            战报
          </button>
          <button type="button" onClick={() => useGameStore.getState().openSettings()}>
            设置
          </button>
          <button type="button" onClick={exit}>
            退出
          </button>
        </div>
      </header>

      <div className="m-seats">
        {opponents.map((player) => {
          const hero = HERO_MAP.get(player.heroId);
          const canTarget = targetable.has(player.id);
          const selectedTarget = selectedTargets.includes(player.id);
          const role = roleText(player, mode);
          const skills = player.skills
            .map((id) => SKILL_MAP.get(id)?.name)
            .filter(Boolean)
            .slice(0, 3);
          return (
            <div
              key={player.id}
              className={[
                'm-seat',
                `faction-${player.faction}`,
                player.id === currentId ? 'is-current' : '',
                canTarget ? 'is-target' : '',
                selectedTarget ? 'is-selected' : '',
                player.alive ? '' : 'is-dead',
              ].join(' ')}
              data-player-id={player.id}
              onClick={() => useGameStore.getState().seatClick(player.id)}
            >
              <div className="m-seat-head">
                <span className="faction-badge">{FACTION_NAME[player.faction]}</span>
                <b>{hero?.name ?? player.heroName}</b>
                {role && <span className={`m-role role-${player.role}`}>{role}</span>}
                <button
                  type="button"
                  className="m-seat-info"
                  onClick={(event) => {
                    event.stopPropagation();
                    setDetailPlayer(player.id);
                  }}
                >
                  i
                </button>
              </div>
              <div className="m-seat-name">{player.name}</div>
              <div className="m-seat-stats">
                <span className="m-hp">
                  {Math.max(0, player.hp)}/{player.maxHp}
                </span>
                <span>手牌 {player.hand.length}</span>
                {player.chained && <span className="m-tag">横置</span>}
                {player.flipped && <span className="m-tag">翻面</span>}
              </div>
              <div className="m-seat-skills">{skills.join(' · ') || '无技能'}</div>
              {player.id === currentId && <span className="m-current">行动中</span>}
              {canTarget && <span className="m-target-hint">可选中</span>}
              {!player.alive && <span className="m-dead">阵亡</span>}
            </div>
          );
        })}
      </div>

      <div className="m-table">
        <div className="m-piles">
          <span>牌堆 {game.state.deckCount ?? game.state.deck.length}</span>
          <span>弃牌 {game.state.discardCount ?? game.state.discard.length}</span>
          {lastJudge && (
            <span className="m-judge">
              {targetName(lastJudge.playerId)} {lastJudge.reason} · {lastJudge.card.name} {lastJudge.success ? '生效' : '未生效'}
            </span>
          )}
        </div>
        <div className="m-stage">
          {lastPlay ? (
            <div className="m-last-play">
              <CardView card={lastPlay.card} size="sm" />
              <span>
                <b>{targetName(lastPlay.playerId)}</b>
                {lastPlay.as === lastPlay.card.name ? ` 使用【${lastPlay.card.name}】` : ` 将【${lastPlay.card.name}】当【${lastPlay.as}】`}
                {lastPlay.targets.length > 0 && ` → ${lastPlay.targets.map(targetName).join('、')}`}
              </span>
            </div>
          ) : (
            <span className="m-stage-empty">牌桌暂无声响</span>
          )}
          <div className="m-history">
            {recent.map((entry) => (
              <div key={entry.id} className="m-history-item">
                <em>
                  {entry.playerId !== undefined ? targetName(entry.playerId) : '牌堆'} · {entry.label}
                </em>
                {entry.cards.slice(0, 3).map((card) => (
                  <span key={card.id}>{card.name}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="m-self">
        <button type="button" className="m-self-main" onClick={() => setDetailPlayer(human.id)}>
          <span className={`faction-badge faction-${human.faction}`}>{FACTION_NAME[human.faction]}</span>
          <b>{HERO_MAP.get(human.heroId)?.name ?? human.heroName}</b>
          {roleText(human, mode, true) && <span className="m-self-role">{roleText(human, mode, true)}</span>}
          <span className="m-self-hp">
            {Math.max(0, human.hp)}/{human.maxHp}
          </span>
          <span className="m-self-limit">手牌上限 {handLimit}</span>
          <span className="m-self-skills">{humanSkills.join(' · ') || '无技能'}</span>
        </button>
        <button type="button" className="m-detail-btn" onClick={() => setDetailPlayer(human.id)}>
          详情
        </button>
      </div>

      <div className="m-prompt">
        <PromptBar />
      </div>

      <div className="m-hand">
        <Hand
          player={human}
          pending={pending}
          selectedCardId={selected?.cardId}
          onSelect={(id) => useGameStore.getState().selectCard(id)}
        />
      </div>

      <LogPanel open={logOpen} onClose={() => setLogOpen(false)} />
      <GameModals />
      {detailPlayer !== null && game.state.players[detailPlayer] && (
        <HeroDetailModal
          heroId={game.state.players[detailPlayer].heroId}
          player={game.state.players[detailPlayer]}
          showRole={
            detailPlayer === humanId ||
            game.state.players[detailPlayer].roleRevealed ||
            !game.state.players[detailPlayer].alive
          }
          onClose={() => setDetailPlayer(null)}
        />
      )}
    </div>
  );
}
