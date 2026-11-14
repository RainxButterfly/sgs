import { useState } from 'react';
import defaultBg from '../../assets/bg-default.jpg';
import { effectiveBackground } from '../background';
import { HERO_MAP } from '../../core/deck';
import { SKILL_MAP } from '../../core/skills';
import { FACTION_NAME, PHASE_NAME, ROLE_NAME, type PlayerState } from '../../core/types';
import { cardDisplayName, cardSuitText, factionKnown, isRedCard, playerHeroNames, rankText, shortCardName, visibleHeroNames, visibleSkillIds, SUIT_CHAR } from '../labels';
import { compositionText } from '../composition';
import { tableSeatLabel } from '../labels';
import { CardView } from '../components/CardView';
import { CountdownRing } from '../components/CountdownRing';
import { DiscardModal } from '../components/DiscardModal';
import { HeroDetailModal } from '../components/HeroDetail';
import { HeroHover, HoverInfo } from '../components/HoverInfo';
import { HeroPortrait } from '../components/HeroPortrait';
import { Hand } from '../components/Hand';
import { LogPanel } from '../components/LogPanel';
import { GameModals } from '../components/Modals';
import { PromptBar } from '../components/PromptBar';
import { SpectatorBadge } from '../components/SpectatorBadge';
import { useGameSnapshot, useGameStore } from '../store';
import { PlayArrowLayer } from '../components/PlayArrowLayer';
import { useDeviceStatus } from '../useDeviceStatus';

function roleText(player: PlayerState, mode: string, self = false, myRole?: string): string {
  if (mode === 'duel' || mode === 'guozhan') return '';
  if (mode === '2v2') return player.role === myRole ? '我方' : '敌方';
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


const EQUIP_ICON: Record<'weapon' | 'armor' | 'horsePlus' | 'horseMinus', string> = {
  weapon: '武',
  armor: '防',
  horsePlus: '+',
  horseMinus: '−',
};

function equipTokens(player: PlayerState) {
  return (['weapon', 'armor', 'horsePlus', 'horseMinus'] as const).map((slot) => {
    const card = player.equips[slot];
    if (!card) return null;
    const prefix = slot === 'horsePlus' ? '+1 ' : slot === 'horseMinus' ? '-1 ' : slot === 'weapon' ? `攻${card.range ?? 1} ` : '';
    return (
      <span key={slot} className={`m-gear-token equip-${slot}`} title={`${EQUIP_ICON[slot]} ${cardSuitText(card)} ${card.name}`}>
        <i className={`equip-suit ${isRedCard(card) ? 'is-red' : 'is-black'}`}>{cardSuitText(card)}</i>
        {prefix}
        {card.name}
      </span>
    );
  });
}

export function MobileGameScreen() {
  const { game } = useGameSnapshot();
  const humanId = useGameStore((s) => s.humanId);
  const selfCardSide = useGameStore((s) => s.selfCardSide);
  const pending = useGameStore((s) => s.pending);
  const selected = useGameStore((s) => s.selected);
  const selectedTargets = useGameStore((s) => s.selectedTargets);
  const lastJudge = useGameStore((s) => s.lastJudge);
  const lastPlay = useGameStore((s) => s.lastPlay);
  const flashes = useGameStore((s) => s.flashes);
  const speechBubbles = useGameStore((s) => s.speechBubbles);
  const propThrows = useGameStore((s) => s.propThrows);
  const sendProp = useGameStore((s) => s.sendProp);
  const cardHistory = useGameStore((s) => s.cardHistory);
  const wuxieWindow = useGameStore((s) => s.wuxieWindow);
  const wuxieDeadline = useGameStore((s) => s.wuxieDeadline);
  const promptDeadline = useGameStore((s) => s.promptDeadline);
  const identityMarks = useGameStore((s) => s.identityMarks);
  const openIdentityMark = useGameStore((s) => s.openIdentityMark);
  const revealGeneral = useGameStore((s) => s.revealGeneral);
  const bgImage = useGameStore((s) => s.bgImage);
  const bgScope = useGameStore((s) => s.bgScope);
  const bgKind = useGameStore((s) => s.bgKind);
  const bgVideoUrl = useGameStore((s) => s.bgVideoUrl);
  const bgDim = useGameStore((s) => s.bgDim);
  const openChat = useGameStore((s) => s.openChat);
  const chatUnread = useGameStore((s) => s.chatUnread);
  const autoPlay = useGameStore((s) => s.autoPlay);
  const setAutoPlay = useGameStore((s) => s.setAutoPlay);
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
    else if (pending.kind === 'play' && selectedOption) {
      const pool = selectedOption.targetAfter
        ? selectedTargets.length === 0
          ? selectedOption.validTargets
          : selectedOption.targetAfter[selectedTargets[0]] ?? []
        : selectedOption.validTargets;
      pool.forEach((id) => targetable.add(id));
      if (selectedOption.targetAfter) selectedTargets.forEach((id) => targetable.add(id));
    }
  }
  const targeting = pending?.kind === 'play' && !!selectedOption && selectedOption.targetMax > 0;
  const unavailableHint = (id: number) =>
    targeting && !targetable.has(id)
      ? selectedOption?.invalidTargets?.[id] ?? '不可选择'
      : undefined;
  const opponents = game.state.players
    .filter((p) => p.id !== humanId)
    .sort((a, b) => {
      const n = game.state.players.length;
      const ra = ((a.seat - human.seat) * game.state.direction + n) % n;
      const rb = ((b.seat - human.seat) * game.state.direction + n) % n;
      return ((n - ra) % n) - ((n - rb) % n);
    });
  const handLimit = Math.max(0, human.hp + (game.state.rules?.handLimitModifier ?? 0));
  const humanSkills = visibleSkillIds(human, mode, true)
    .map((id) => SKILL_MAP.get(id)?.name)
    .filter(Boolean);
  const actionHistory = cardHistory.filter((entry) => entry.kind !== 'gain');
  const latest = actionHistory[actionHistory.length - 1];
  const earlier = actionHistory.slice(-4, -1);
  const recentDiscard = game.state.discard.slice(-3);
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
    if (entry.kind === 'skill') return `发动【${entry.as ?? ''}】`;
    return `${entry.label} ${entry.cards.map((item) => `【${cardDisplayName(item)}】`).join('')}`;
  };
  const shortActionText = (entry: (typeof cardHistory)[number]) => {
    const card = entry.cards[0];
    if (entry.kind === 'play' || entry.kind === 'respond') {
      const as = entry.as ?? (card ? cardDisplayName(card) : '');
      return `${entry.kind === 'respond' ? '打出' : '使用'}【${as}】`;
    }
    if (entry.kind === 'discard') {
      return `弃置${entry.cards.map((item) => `【${cardDisplayName(item)}】`).join('')}`;
    }
    if (entry.kind === 'judge') return `判定【${card ? cardDisplayName(card) : ''}】`;
    if (entry.kind === 'gain') return '获得牌';
    if (entry.kind === 'skill') return `发动【${entry.as ?? ''}】`;
    return actionText(entry);
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

  const humanTableNo = tableSeatLabel(
    game.state.startPlayer,
    game.state.direction,
    human.id,
    game.state.players.length,
  );

  return (
    <div
      className={`mobile-game self-card-${selfCardSide} ${prompting ? 'is-prompting' : ''} ${mine ? 'is-my-turn' : ''}`}
    >
      {bgKind === 'video' && bgVideoUrl && (bgScope === 'all' || bgScope === 'game') ? (
        <video className="game-bg game-bg-video" src={bgVideoUrl} autoPlay loop muted playsInline />
      ) : (
        <div className="game-bg" style={{ backgroundImage: `url(${effectiveBackground(bgImage, bgScope, 'game') ?? defaultBg})` }} />
      )}
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
            第 {game.state.turn} 回合 · {game.state.direction === 1 ? '顺时针' : '逆时针'} · {current ? visibleHeroNames(current, mode, current.id === humanId) : ''} · {PHASE_NAME[game.state.phase]}
          </em>
          {composition && <span className="m-composition">{composition}</span>}
        </span>
        <div className="m-top-actions">
          <SpectatorBadge compact />
          <button
            type="button"
            className={`m-top-auto auto-play-btn ${autoPlay ? 'on' : ''}`}
            onClick={() => setAutoPlay()}
          >
            {autoPlay ? '托管中' : '托管'}
          </button>
          <button type="button" className="m-top-chat" onClick={openChat}>
            聊天{chatUnread > 0 && <span className="chat-badge">{chatUnread > 9 ? '9+' : chatUnread}</span>}
          </button>
          <button type="button" className="m-top-log" onClick={() => setLogOpen(true)}>
            战报
          </button>
          <button type="button" className="m-top-settings" onClick={() => useGameStore.getState().openSettings()}>
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
          const role = roleText(player, mode, false, human.role);
          const skills = visibleSkillIds(player, mode)
            .map((id) => SKILL_MAP.get(id)?.name)
            .filter(Boolean)
            .slice(0, 3);
          const tableNo = tableSeatLabel(
            game.state.startPlayer,
            game.state.direction,
            player.id,
            game.state.players.length,
          );
          const seatTimer =
            wuxieWindow && wuxieDeadline
              ? { deadline: wuxieDeadline, totalMs: 3000 }
              : pending?.playerId === player.id && pending.timeout && promptDeadline
                ? { deadline: promptDeadline, totalMs: pending.timeout }
                : null;
          const canMark =
            mode === 'identity' && player.role !== 'lord' && !player.roleRevealed && player.alive;
          const hero = HERO_MAP.get(player.heroId);
          const seatHead = (
            <>
              <span className="m-seat-no">{tableNo}</span>
              <span className="faction-badge">
                {factionKnown(player, mode) ? FACTION_NAME[player.faction] : '暗'}
              </span>
              <b title={visibleHeroNames(player, mode)}>{visibleHeroNames(player, mode)}</b>
              {player.ambition && <span className="ambition-tag">野心家</span>}
              {role && <span className={`m-role role-${player.role}`}>{role}</span>}
              {seatTimer && player.alive && (
                <CountdownRing
                  deadline={seatTimer.deadline}
                  totalMs={seatTimer.totalMs}
                  size={18}
                  className="m-seat-timer"
                />
              )}
            </>
          );
          return (
            <div
              key={player.id}
              className={[
                'm-seat',
                `faction-${player.faction}`,
                mode === 'guozhan' && !factionKnown(player, mode) ? 'is-dark' : '',
                player.id === currentId ? 'is-current' : '',
                lastPlay?.playerId === player.id ? 'is-acting' : '',
                canTarget ? 'is-target' : '',
                lastPlay?.targets.includes(player.id) ? 'is-targeted' : '',
                selectedTarget ? 'is-selected' : '',
                player.alive ? '' : 'is-dead',
              ].join(' ')}
              data-player-id={player.id}
              onClick={() => useGameStore.getState().seatClick(player.id)}
            >
              <HeroPortrait
                heroId={hero?.id}
                hidden={!factionKnown(player, mode)}
                className="m-seat-portrait"
              />
              {(() => {
                const bubble = speechBubbles.find((item) => item.playerId === player.id);
                return bubble ? <div className="m-seat-speech">{bubble.text}</div> : null;
              })()}
              {propThrows
                .filter((p) => p.targetId === player.id)
                .map((p) => (
                  <div key={p.id} className={`seat-prop seat-prop-${p.prop}`} aria-hidden="true">
                    <span className="seat-prop-emoji">{p.prop === 'flower' ? '🌸' : '🥚'}</span>
                    <span className="seat-prop-splat">{p.prop === 'flower' ? '✿' : '💥'}</span>
                  </div>
                ))}
              {unavailableHint(player.id) && (
                <span className="m-seat-unavailable">{unavailableHint(player.id)}</span>
              )}
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
              {factionKnown(player, mode) ? (
                <HoverInfo as="div" className="m-seat-head" content={<HeroHover hero={hero} player={player} mode={mode} />}>
                  {seatHead}
                </HoverInfo>
              ) : (
                <div className="m-seat-head">{seatHead}</div>
              )}
              <div className="m-seat-name">{player.name}</div>
              <div className="m-seat-stats">
                <span className="m-hp">
                  {Math.max(0, player.hp)}/{player.maxHp}
                </span>
                <span className="m-hand-count" title={`手牌 ${player.hand.length} 张`}>牌 {player.hand.length}</span>
                {player.chained && <span className="m-tag m-chain" title="铁索连环：横置">横置</span>}
                {(player.pojun?.length ?? 0) > 0 && <span className="m-tag">破军 {(player.pojun ?? []).length}</span>}
                {player.flipped && <span className="m-tag">翻面</span>}
              </div>
              <div className="m-seat-gear">
                {equipTokens(player)}
                {player.judgeZone.map((card) => (
                  <span key={card.id} className={`m-judge-icon judge-${card.name}`} title={card.name}>
                    {judgeIcon(card.name)}
                  </span>
                ))}
              </div>
              <div className="m-hp-meter">
                <i style={{ width: `${Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100))}%` }} />
              </div>
              <div className="m-seat-skills">{skills.join(' · ') || '无技能'}</div>
              {(mode === 'identity' || factionKnown(player, mode) || player.alive) && (
                <div className="m-seat-actions">
                  {player.alive && (
                    <div className="m-seat-prop-row">
                      <button
                        type="button"
                        className="m-seat-mark m-seat-prop"
                        title="砸鸡蛋"
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
                        className="m-seat-mark m-seat-prop"
                        title="送花"
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
                  {(canMark || factionKnown(player, mode)) && (
                    <div className="m-seat-action-row">
                      {canMark && (
                        <button
                          type="button"
                          className={`m-seat-mark ${identityMarks[player.id] ? `role-${identityMarks[player.id]}` : ''}`}
                          title="标记你判断的身份（仅自己可见）"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            openIdentityMark(player.id);
                          }}
                        >
                          {identityMarks[player.id]
                            ? ROLE_NAME[identityMarks[player.id]!].slice(0, 1)
                            : '标'}
                        </button>
                      )}
                      {factionKnown(player, mode) && (
                        <button
                          type="button"
                          className="m-seat-info"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            setDetailPlayer(player.id);
                          }}
                        >
                          i
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
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
          {composition && <span className="m-table-composition">{composition}</span>}
        </div>
        {recentDiscard.length > 0 && (
          <div className="m-discard-line">
            <b>弃牌堆</b>
            {recentDiscard.map((card) => (
              <span key={card.id} className="discard-chip">
                <em>
                  {SUIT_CHAR[card.suit]}
                  {rankText(card.rank)}
                </em>
                {shortCardName(cardDisplayName(card))}
              </span>
            ))}
            <button type="button" className="m-discard-all" onClick={() => setDiscardOpen(true)}>
              查看全部
            </button>
          </div>
        )}
        {latest ? (
          <div className={`m-last-play${latest.kind === 'respond' ? ' is-response' : ''}`}>
            {latest.cards[0] && <CardView card={latest.cards[0]} size="sm" />}
            <div className="m-last-play-copy">
              <b>{latest.playerId !== undefined ? targetName(latest.playerId) : '牌堆'}</b>
              <span title={actionText(latest)}>{actionText(latest)}</span>
              {latest.targets && latest.targets.length > 0 && (
                <i>→ {latest.targets.map(targetName).join('、')}</i>
              )}
            </div>
            <div className="m-recent-actions">
              <b>出牌顺序</b>
              {earlier.length > 0 ? (
                earlier.map((entry, index) => {
                  const line = `${shortActionText(entry)}${entry.targets?.length ? ` → ${entry.targets.map(targetName).join('、')}` : ''}`;
                  return (
                    <span key={entry.id} title={`${targetName(entry.playerId ?? -1)} ${line}`}>
                      <em>{index + 1}</em>
                      <strong>{entry.playerId !== undefined ? targetName(entry.playerId) : '牌堆'}</strong>
                      <i>{line}</i>
                    </span>
                  );
                })
              ) : (
                <span className="m-recent-empty">暂无更多动向</span>
              )}
            </div>
          </div>
        ) : (
          <div className="m-feed-empty">牌桌暂无声响</div>
        )}
      </div>

      <div className="m-prompt">
        <PromptBar />
      </div>

      <div className="m-bottom">
        <aside className="m-quick-actions">
          <button
            type="button"
            className={`auto-play-btn ${autoPlay ? 'on' : ''}`}
            onClick={() => setAutoPlay()}
          >
            {autoPlay ? '托管中' : '托管'}
          </button>
          <button type="button" onClick={() => setLogOpen(true)}>
            战报
          </button>
          <button type="button" onClick={openChat}>
            聊天{chatUnread > 0 && <span className="chat-badge">{chatUnread > 9 ? '9+' : chatUnread}</span>}
          </button>
          <button type="button" onClick={() => useGameStore.getState().openSettings()}>
            设置
          </button>
        </aside>
      {mine && (
        <div className="m-turn-banner" role="status">
          {prompting ? '轮到你出牌 · 请选择动作' : '你的回合'}
        </div>
      )}
      <div className="m-hand">
        <Hand
          player={human}
          pending={pending}
          selectedCardId={selected?.cardId}
          onSelect={(id) => useGameStore.getState().selectCard(id)}
          onClearSelection={() => useGameStore.getState().clearSelection()}
        />
      </div>

      <div className={`m-self ${human.alive ? '' : 'is-dead'}`} data-player-id={human.id}>
        {!human.alive && <span className="m-self-dead">阵亡</span>}
        {(() => {
          const bubble = speechBubbles.find((item) => item.playerId === human.id);
          return bubble ? <div className="m-self-speech">{bubble.text}</div> : null;
        })()}
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
        <div className="m-self-head">
          <span className="m-self-table-no">{humanTableNo}</span>
          <span className={`faction-badge faction-${human.faction}`}>{FACTION_NAME[human.faction]}</span>
          <b title={visibleHeroNames(human, mode, true)}>{visibleHeroNames(human, mode, true)}</b>
          {roleText(human, mode, true, human.role) && (
            <span className="m-self-role">{roleText(human, mode, true, human.role)}</span>
          )}
          {human.ambition && <span className="ambition-tag">野心家</span>}
          <button
            type="button"
            className="m-self-info"
            aria-label="查看武将详细"
            title="查看详细"
            onClick={() => setDetailPlayer(human.id)}
          >
            i
          </button>
        </div>
        {mode === 'guozhan' && human.generalRevealed?.some((value) => !value) && (
          <div className="m-reveal-row">
            <span className="m-reveal-label">暗将</span>
            {human.generalRevealed.map((revealed, index) =>
              revealed ? null : (
                <button
                  key={index}
                  type="button"
                  className="m-reveal-btn"
                  onClick={() => revealGeneral(index)}
                >
                  明置{index === 0 ? '主将' : '副将'}
                </button>
              ),
            )}
          </div>
        )}
        <div className="m-self-stats">
          <span className="m-self-hp">{Math.max(0, human.hp)}/{human.maxHp}</span>
          <span className="m-self-limit">手牌 {human.hand.length}/{handLimit}</span>
          {human.chained && <span className="m-tag m-chain" title="铁索连环：横置">横置</span>}
          {(human.pojun?.length ?? 0) > 0 && <span className="m-tag">破军 {(human.pojun ?? []).length}</span>}
          {human.flipped && <span className="m-tag">翻面</span>}
        </div>
        <div className="m-self-gear">
          {equipTokens(human)}
          {human.judgeZone.map((card) => (
            <span key={card.id} className={`m-judge-icon judge-${card.name}`} title={card.name}>
              {judgeIcon(card.name)}
            </span>
          ))}
          {equipTokens(human).every((item) => !item) && human.judgeZone.length === 0 && (
            <span className="m-self-empty">无装备/判定</span>
          )}
        </div>
        <div className="m-self-skill-list">
          {humanSkills.length > 0 ? humanSkills.map((skill) => <span key={skill}>{skill}</span>) : <em>无技能</em>}
        </div>
        {((wuxieWindow && wuxieDeadline) ||
          (pending?.playerId === human.id && pending.timeout && promptDeadline)) && (
          <CountdownRing
            deadline={(wuxieWindow && wuxieDeadline ? wuxieDeadline : promptDeadline) as number}
            totalMs={wuxieWindow ? 3000 : pending?.timeout ?? 1}
            size={20}
            className="m-self-timer"
          />
        )}
      </div>

      </div>

      <PlayArrowLayer />
      <LogPanel open={logOpen} onClose={() => setLogOpen(false)} />
      {discardOpen && (
        <DiscardModal cards={game.state.discard} onClose={() => setDiscardOpen(false)} />
      )}
      <GameModals />
      {detailPlayer !== null && game.state.players[detailPlayer] && (
        <HeroDetailModal
          heroId={game.state.players[detailPlayer].heroId}
          player={game.state.players[detailPlayer]}
          mode={mode}
          selfView={detailPlayer === humanId}
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
