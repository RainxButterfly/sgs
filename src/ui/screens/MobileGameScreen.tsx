import { Fragment, useEffect, useRef, useState } from 'react';
import defaultBg from '../../assets/bg-default.jpg';
import { SKILL_MAP } from '../../core/skills';
import { FACTION_NAME, PHASE_NAME, ROLE_NAME, type PlayerState } from '../../core/types';
import { cardDisplayName, playerHeroNames, rankText, shortCardName, SUIT_CHAR } from '../labels';
import { compositionText } from '../composition';
import { CardView } from '../components/CardView';
import { DiscardModal } from '../components/DiscardModal';
import { HeroDetailModal } from '../components/HeroDetail';
import { Hand } from '../components/Hand';
import { LogPanel } from '../components/LogPanel';
import { GameModals } from '../components/Modals';
import { PromptBar } from '../components/PromptBar';
import { SpectatorBadge } from '../components/SpectatorBadge';
import { useGameSnapshot, useGameStore } from '../store';
import { useDeviceStatus } from '../useDeviceStatus';

function roleText(player: PlayerState, mode: string, self = false): string {
  if (mode === 'duel' || mode === 'guozhan') return '';
  if (mode === 'landlord') return player.role === 'lord' ? '地主' : '农民';
  if (self || player.roleRevealed || !player.alive || player.role === 'lord') return ROLE_NAME[player.role];
  return '';
}

const JUDGE_ICON: Record<string, string> = {
  '乐不思蜀': '乐',
  '兵粮寸断': '粮',
  '闪电': '电',
};

function judgeIcon(name: string): string {
  return JUDGE_ICON[name] ?? name.slice(0, 1);
}

function equipNames(player: PlayerState): string[] {
  return (['weapon', 'armor', 'horsePlus', 'horseMinus'] as const)
    .map((slot) => player.equips[slot]?.name)
    .filter((name): name is string => !!name);
}

export function MobileGameScreen() {
  const { game } = useGameSnapshot();
  const humanId = useGameStore((s) => s.humanId);
  const pending = useGameStore((s) => s.pending);
  const selected = useGameStore((s) => s.selected);
  const selectedTargets = useGameStore((s) => s.selectedTargets);
  const lastJudge = useGameStore((s) => s.lastJudge);
  const lastDiscard = useGameStore((s) => s.lastDiscard);
  const flashes = useGameStore((s) => s.flashes);
  const cardHistory = useGameStore((s) => s.cardHistory);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = feedRef.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [cardHistory.length]);
  const bgImage = useGameStore((s) => s.bgImage);
  const bgDim = useGameStore((s) => s.bgDim);
  const openChat = useGameStore((s) => s.openChat);
  const chatUnread = useGameStore((s) => s.chatUnread);
  const [logOpen, setLogOpen] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState<number | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const { time, battery } = useDeviceStatus();

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
  const composition = compositionText(game.state, mode);
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
  const humanEquips = equipNames(human);
  const feed = cardHistory.slice(-30);
  const targetName = (id: number) => game.state.players[id]?.name ?? '';
  const actionText = (entry: (typeof cardHistory)[number]) => {
    const card = entry.cards[0];
    if (entry.kind === 'play' || entry.kind === 'respond') {
      const verb = entry.kind === 'respond' ? '打出' : '使用';
      const as = entry.as ?? (card ? cardDisplayName(card) : '');
      if (card && as !== cardDisplayName(card)) return `将【${cardDisplayName(card)}】当【${as}】${verb}`;
      return `${verb}【${as}】`;
    }
    if (entry.kind === 'judge') return `判定【${card ? cardDisplayName(card) : ''}】`;
    if (entry.kind === 'discard') {
      const cards = entry.cards.map((item) => `【${cardDisplayName(item)}】`).join('');
      return `弃置${cards}${entry.label && entry.label !== '弃置' ? ` · ${entry.label}` : ''}`;
    }
    if (entry.kind === 'gain') {
      return `获得${entry.cards.map((item) => `【${cardDisplayName(item)}】`).join('')}`;
    }
    return `${entry.label} ${entry.cards.map((item) => `【${cardDisplayName(item)}】`).join('')}`;
  };

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

  const prompting = pending?.playerId === humanId;

  return (
    <div className={`mobile-game ${prompting ? 'is-prompting' : ''}`}>
      <div className="game-bg" style={{ backgroundImage: `url(${bgImage ?? defaultBg})` }} />
      <div className="game-bg-shade" style={{ opacity: bgDim / 100 }} />

      <header className="m-topbar">
        <div className="m-device-status">
          <b>{time}</b>
          {battery !== null && <span>{battery}%</span>}
        </div>
        <span className="m-brand">闪</span>
        <span className="m-turn">
          <b>{mine ? '轮到你' : `等待 ${current?.name ?? ''}`}</b>
          <em>
            第 {game.state.turn} 回合 · {current?.heroName ?? ''} · {PHASE_NAME[game.state.phase]}
          </em>
          {composition && <span className="m-composition">{composition}</span>}
        </span>
        <div className="m-top-actions">
          <SpectatorBadge compact />
          <button type="button" onClick={openChat}>
            聊天{chatUnread > 0 && <span className="chat-badge">{chatUnread > 9 ? '9+' : chatUnread}</span>}
          </button>
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
          
          const canTarget = targetable.has(player.id);
          const selectedTarget = selectedTargets.includes(player.id);
          const role = roleText(player, mode);
          const skills = player.skills
            .map((id) => SKILL_MAP.get(id)?.name)
            .filter(Boolean)
            .slice(0, 3);
          const equips = equipNames(player);
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
              {flashes
                .filter((item) => item.playerId === player.id)
                .map((item, index) => (
                  <span
                    key={item.id}
                    className={`float-number m-seat-float ${item.kind}`}
                    style={{ top: `${-6 - index * 18}px` }}
                  >
                    {item.kind === 'damage' ? '−' : '+'}
                    {item.amount}
                  </span>
                ))}
              <div className="m-seat-head">
                <span className="faction-badge">{FACTION_NAME[player.faction]}</span>
                <b>{playerHeroNames(player)}</b>
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
              <div className="m-hp-meter">
                <i style={{ width: `${Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100))}%` }} />
              </div>
              <div className="m-seat-equips">装备 {equips.join(' · ') || '无'}</div>
              {player.judgeZone.length > 0 && (
                <div className="m-seat-judges">
                  {player.judgeZone.map((card) => (
                    <span key={card.id} className={`m-judge-icon judge-${card.name}`} title={card.name}>
                      {judgeIcon(card.name)}
                    </span>
                  ))}
                </div>
              )}
              <div className="m-seat-skills">{skills.join(' · ') || '无技能'}</div>
              {player.id === currentId && <span className="m-current">行动中</span>}
              {selectedTarget ? (
                <span className="m-target-selected">已选目标</span>
              ) : canTarget ? (
                <span className="m-target-hint">可选中</span>
              ) : null}
              {!player.alive && <span className="m-dead">阵亡</span>}
            </div>
          );
        })}
      </div>

      <div className="m-table">
        <div className="m-piles">
          <span>牌堆 {game.state.deckCount ?? game.state.deck.length}</span>
          <button type="button" className="m-pile-button" onClick={() => setDiscardOpen(true)}>
            弃牌 {game.state.discardCount ?? game.state.discard.length}
          </button>
          {lastJudge && (
            <span className="m-judge">
              {targetName(lastJudge.playerId)} {lastJudge.reason} · {lastJudge.card.name} {lastJudge.success ? '生效' : '未生效'}
            </span>
          )}
        </div>
        {lastDiscard && (
          <div className="m-discard-strip">
            <b>{targetName(lastDiscard.playerId)}</b>
            <span>{lastDiscard.reason ?? '弃置'}</span>
            {lastDiscard.cards.map((card) => (
              <span key={card.id} className="discard-chip">
                <em>
                  {SUIT_CHAR[card.suit]}
                  {rankText(card.rank)}
                </em>
                {shortCardName(cardDisplayName(card))}
              </span>
            ))}
          </div>
        )}
        {feed.length === 0 ? (
          <div className="m-feed-empty">牌桌暂无声响</div>
        ) : (
          <div className="m-feed" ref={feedRef}>
            {feed.map((entry, index) => {
              const previous = feed[index - 1];
              const owner = entry.playerId !== undefined ? game.state.players[entry.playerId] : undefined;
              const card = entry.cards[0];
              return (
                <Fragment key={entry.id}>
                  {(!previous || previous.turn !== entry.turn) && (
                    <span className="m-round-chip">第{entry.turn ?? 0}回合</span>
                  )}
                  <div className={`m-feed-item faction-${owner?.faction ?? 'qun'}`}>
                    {card ? (
                      <CardView card={card} size="sm" />
                    ) : (
                      <span className="m-feed-card-empty">牌</span>
                    )}
                    <div className="m-feed-text">
                      <b>{entry.playerId !== undefined ? targetName(entry.playerId) : '牌堆'}</b>
                      <span>{actionText(entry)}</span>
                      {entry.targets && entry.targets.length > 0 && (
                        <i>→ {entry.targets.map(targetName).join('、')}</i>
                      )}
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      <div className="m-self">
        {flashes
          .filter((item) => item.playerId === human.id)
          .map((item, index) => (
            <span
              key={item.id}
              className={`float-number m-self-float ${item.kind}`}
              style={{ top: `${-6 - index * 18}px` }}
            >
              {item.kind === 'damage' ? '−' : '+'}
              {item.amount}
            </span>
          ))}
        <button type="button" className="m-self-main" onClick={() => setDetailPlayer(human.id)}>
          <span className={`faction-badge faction-${human.faction}`}>{FACTION_NAME[human.faction]}</span>
          <b>{playerHeroNames(human)}</b>
          {roleText(human, mode, true) && <span className="m-self-role">{roleText(human, mode, true)}</span>}
          <span className="m-self-hp">
            {Math.max(0, human.hp)}/{human.maxHp}
          </span>
          <span className="m-self-limit">手牌上限 {handLimit}</span>
          {human.chained && <span className="m-tag">横置</span>}
          {human.flipped && <span className="m-tag">翻面</span>}
          <span className="m-self-equips">装备 {humanEquips.join(' · ') || '无'}</span>
          {human.judgeZone.length > 0 && (
            <span className="m-self-judges">
              {human.judgeZone.map((card) => (
                <span key={card.id} className={`m-judge-icon judge-${card.name}`} title={card.name}>
                  {judgeIcon(card.name)}
                </span>
              ))}
            </span>
          )}
          <span className="m-hp-meter m-self-meter">
            <i style={{ width: `${Math.max(0, Math.min(100, (human.hp / human.maxHp) * 100))}%` }} />
          </span>
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
      {discardOpen && (
        <DiscardModal cards={game.state.discard} onClose={() => setDiscardOpen(false)} />
      )}
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
