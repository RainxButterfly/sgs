import { useEffect, useMemo, useRef, useState } from 'react';
import '../guandan.css';
import { LEVEL_NAME } from '../../core/guandan-match';
import type { GdView } from '../../core/guandan-view';
import { beats, enumerateCombos, type GdCard } from '../../core/guandan';
import { useGameStore } from '../store';
import { CHAT_STICKERS, isSticker } from '../stickers';
import { nameTier } from '../profile';

interface Face {
  rank: string;
  suit: string;
  red: boolean;
}

function faceOf(card: GdCard): Face {
  if (card.joker) {
    return { rank: card.joker === 'big' ? '大' : '小', suit: '王', red: card.joker === 'big' };
  }
  const rank =
    card.rank === 1 ? 'A' : card.rank <= 10 ? String(card.rank) : ['J', 'Q', 'K'][card.rank - 11];
  const suit = ({ spade: '♠', heart: '♥', club: '♣', diamond: '♦' } as Record<string, string>)[
    card.suit
  ];
  return { rank, suit, red: card.suit === 'heart' || card.suit === 'diamond' };
}

function CardFace({
  card,
  selected,
  small,
  onClick,
  disabled,
}: {
  card: GdCard;
  selected?: boolean;
  small?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const face = faceOf(card);
  return (
    <button
      type="button"
      className={['gd-card', small ? 'is-small' : '', selected ? 'is-selected' : '', face.red ? 'is-red' : '']
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      title={`${face.rank}${face.suit}`}
    >
      <span className="gd-card-corner">
        <b>{face.rank}</b>
        <i>{face.suit}</i>
      </span>
      <span className="gd-card-pip" aria-hidden="true">
        {face.suit}
      </span>
    </button>
  );
}

interface Props {
  view: GdView;
  onPlay: (ids: string[]) => void;
  onPass: () => void;
  onExit: () => void;
  /** 有值才显示「下一局」（房主 / 本地） */
  onNextRound?: () => void;
  onRestart?: () => void;
  /** 结算面板里的补充说明，比如等待房主 */
  waitingText?: string;
  /** 顶部副标题，联机时显示房间码 */
  subtitle?: string;
}

export function GuandanBoard({
  view,
  onPlay,
  onPass,
  onExit,
  onNextRound,
  onRestart,
  waitingText,
  subtitle,
}: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [hintIndex, setHintIndex] = useState(0);
  const [toast, setToast] = useState('');
  const lastTurnKey = useRef('');

  const [showLog, setShowLog] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatText, setChatText] = useState('');
  const [stickers, setStickers] = useState(false);
  const [dockStickers, setDockStickers] = useState(false);
  const chatListRef = useRef<HTMLDivElement>(null);
  const chatDockRef = useRef<HTMLDivElement>(null);
  const chatMessages = useGameStore((s) => s.chatMessages);
  const sendChat = useGameStore((s) => s.sendChat);
  const lanRole = useGameStore((s) => s.lanRole);
  const online = lanRole === 'host' || lanRole === 'client';

  useEffect(() => {
    if (chatListRef.current) chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
    if (chatDockRef.current) chatDockRef.current.scrollTop = chatDockRef.current.scrollHeight;
  }, [chatMessages.length, showChat]);

  const myTurn = view.phase === 'play' && view.turn === view.yourSeat && view.yourSeat >= 0;
  const hand = view.hand;

  /* 局面推进后清空选牌 */
  useEffect(() => {
    const key = `${view.round}-${view.turn}-${view.phase}-${hand.length}`;
    if (lastTurnKey.current !== key) {
      lastTurnKey.current = key;
      setSelected([]);
      setHintIndex(0);
    }
  }, [view.round, view.turn, view.phase, hand.length]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const playable = useMemo(() => {
    if (!myTurn) return [];
    return enumerateCombos(hand, view.roundLevel).filter(
      (combo) => !view.trick || beats(combo, view.trick),
    );
  }, [hand, view.roundLevel, view.trick, myTurn]);

  const selectedCards = hand.filter((card) => selected.includes(card.id));

  const toggle = (card: GdCard) => {
    if (!myTurn) return;
    setSelected((prev) =>
      prev.includes(card.id) ? prev.filter((id) => id !== card.id) : [...prev, card.id],
    );
  };

  const submit = () => {
    if (!selectedCards.length) {
      setToast('先选牌');
      return;
    }
    onPlay(selectedCards.map((card) => card.id));
  };

  const hint = () => {
    if (!playable.length) {
      setToast('没有能压过的牌');
      return;
    }
    const combo = playable[hintIndex % playable.length];
    setSelected(combo.cards.map((card) => card.id));
    setHintIndex((index) => index + 1);
  };

  const submitChat = () => {
    const value = chatText.trim();
    if (!value || !online) return;
    sendChat(value);
    setChatText('');
  };

  const seatAt = (seat: number) => view.seats.find((item) => item.seat === seat);
  const seatBox = (seat: number, cls: string) => {
    const info = seatAt(seat);
    if (!info) return null;
    return (
      <div
        className={['gd-seat', cls, view.turn === seat && view.phase === 'play' ? 'is-turn' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <div className="gd-seat-name">
          {info.name}
          <i className={info.team === 0 ? 'gd-team-a' : 'gd-team-b'}>
            {info.team === 0 ? '甲' : '乙'}
          </i>
        </div>
        <div className="gd-seat-cards">
          <b>{info.count}</b> 张
          {info.place !== null && <span className="gd-place">第 {info.place} 名</span>}
        </div>
        <div className="gd-seat-mini" aria-hidden="true">
          {Array.from({ length: Math.min(5, info.count) }).map((_, i) => (
            <i key={i} />
          ))}
        </div>
      </div>
    );
  };

  const me = seatAt(view.yourSeat);
  const topSeat = (view.yourSeat + 2) % 4;
  const leftSeat = (view.yourSeat + 1) % 4;
  const rightSeat = (view.yourSeat + 3) % 4;
  const lastLog = view.log.slice(-3);

  return (
    <div className="gd-root">
      <div className="gd-topbar">
        <button type="button" className="gd-back" onClick={onExit}>
          ← 退出
        </button>
        <div className="gd-title">掼蛋 · 2v2{subtitle ? <em>{subtitle}</em> : null}</div>
        <button
          type="button"
          className={`gd-top-btn ${showLog ? 'on' : ''}`}
          onClick={() => {
            setShowLog((v) => !v);
            setShowChat(false);
          }}
        >
          战报
        </button>
        <button
          type="button"
          className={`gd-top-btn ${showChat ? 'on' : ''}`}
          onClick={() => {
            setShowChat((v) => !v);
            setShowLog(false);
          }}
        >
          聊天
        </button>
        <div className="gd-levels">
          <span className="gd-round">本局打 {LEVEL_NAME[view.roundLevel]}</span>
          <span className="gd-team-a">甲队 {LEVEL_NAME[view.levels[0]]}</span>
          <span className="gd-team-b">乙队 {LEVEL_NAME[view.levels[1]]}</span>
        </div>
      </div>

      <div className="gd-table">
        {view.yourSeat >= 0 ? (
          <>
            <div className="gd-seat-top">{seatBox(topSeat, 'is-top')}</div>
            <div className="gd-seat-left">{seatBox(leftSeat, 'is-left')}</div>
            <div className="gd-seat-right">{seatBox(rightSeat, 'is-right')}</div>
          </>
        ) : (
          <>
            <div className="gd-seat-top">
              {seatBox(2, 'is-top')}
            </div>
            <div className="gd-seat-left">{seatBox(1, 'is-left')}</div>
            <div className="gd-seat-right">{seatBox(3, 'is-right')}</div>
          </>
        )}

        <div className="gd-center">
          {view.trick ? (
            <>
              <div className="gd-combo-label">
                {view.trickOwner !== null ? seatAt(view.trickOwner)?.name : ''} 出了
              </div>
              <div className="gd-combo-cards">
                {view.trick.cards.map((card) => (
                  <CardFace key={card.id} card={card} small />
                ))}
              </div>
            </>
          ) : (
            <div className="gd-center-idle">
              {view.phase === 'play'
                ? `${seatAt(view.turn)?.name ?? ''} 领出`
                : view.phase === 'matchOver'
                  ? '整场结束'
                  : '本局结束'}
            </div>
          )}
          {myTurn && <div className="gd-you-turn">轮到你</div>}
        </div>

        <div className="gd-logbox">
          {lastLog.map((line, i) => (
            <div key={`${i}-${line}`}>{line}</div>
          ))}
        </div>

        <div className="gd-chat-dock">
          <div className="gd-chat-dock-list" ref={chatDockRef}>
            {chatMessages.length === 0 && (
              <div className="gd-chat-dock-empty">
                {online ? '暂无消息，打个招呼吧' : '单机模式无聊天'}
              </div>
            )}
            {chatMessages.slice(-30).map((message) => (
              <div key={message.id} className={`chat-message tier-${nameTier(message.level ?? 1)}`}>
                <span className="chat-name">
                  {message.name} · Lv.{message.level ?? 1}
                </span>
                <div className={`chat-bubble ${isSticker(message.text) ? 'is-sticker' : ''}`}>
                  {message.text}
                </div>
              </div>
            ))}
          </div>
          {dockStickers && (
            <div className="gd-chat-dock-stickers">
              {CHAT_STICKERS.map((sticker) => (
                <button
                  key={sticker}
                  type="button"
                  onClick={() => {
                    sendChat(sticker);
                    setDockStickers(false);
                  }}
                >
                  {sticker}
                </button>
              ))}
            </div>
          )}
          <div className="gd-chat-dock-input">
            <button
              type="button"
              className="gd-chat-dock-sticker-btn"
              disabled={!online}
              title="表情"
              onClick={() => setDockStickers((v) => !v)}
            >
              😊
            </button>
            <input
              value={chatText}
              maxLength={200}
              placeholder={online ? '说点什么…' : '联机时才能聊天'}
              disabled={!online}
              onChange={(event) => setChatText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitChat();
                }
              }}
            />
            <button type="button" disabled={!online || !chatText.trim()} onClick={submitChat}>
              发送
            </button>
          </div>
        </div>
      </div>

      <div className="gd-bottom">
        <div className="gd-me">
          <span>{me ? me.name : '观战'}</span>
          {me && (
            <i className={me.team === 0 ? 'gd-team-a' : 'gd-team-b'}>
              {me.team === 0 ? '甲队' : '乙队'}
            </i>
          )}
          {me && me.place !== null && <b>第 {me.place} 名</b>}
          <em>{hand.length} 张</em>
        </div>
        <div className="gd-actions">
          <button
            type="button"
            className="gd-btn primary"
            onClick={submit}
            disabled={!myTurn || !selected.length}
          >
            出牌
          </button>
          <button type="button" className="gd-btn" onClick={onPass} disabled={!view.canPass}>
            不要
          </button>
          <button type="button" className="gd-btn" onClick={hint} disabled={!myTurn}>
            提示
          </button>
          <button
            type="button"
            className="gd-btn ghost"
            onClick={() => setSelected([])}
            disabled={!selected.length}
          >
            重选
          </button>
        </div>
        <div className="gd-hand">
          {hand.map((card) => (
            <CardFace
              key={card.id}
              card={card}
              selected={selected.includes(card.id)}
              onClick={() => toggle(card)}
              disabled={!myTurn}
            />
          ))}
        </div>
      </div>

      {toast && <div className="gd-toast">{toast}</div>}

      {(showLog || showChat) && (
        <button
          type="button"
          className="gd-scrim"
          aria-label="收起面板"
          onClick={() => {
            setShowLog(false);
            setShowChat(false);
          }}
        />
      )}

      {view.phase === 'roundOver' && view.lastResult && (
        <div className="gd-overlay">
          <div className="gd-dialog">
            <h2>本局结束</h2>
            <div className="gd-result-list">
              {view.lastResult.places.map((seat, i) => {
                const info = seatAt(seat);
                return (
                  <div key={seat} className={info?.team === 0 ? 'is-a' : 'is-b'}>
                    <span>{i + 1}</span>
                    <b>{info?.name}</b>
                    <em>{info?.team === 0 ? '甲队' : '乙队'}</em>
                  </div>
                );
              })}
            </div>
            <p className="gd-result-line">
              {view.lastResult.winnerTeam === 0 ? '甲队' : '乙队'}头游
              {view.lastResult.doubleDown ? '，双下' : ''}，升 {view.lastResult.up} 级
            </p>
            {view.tributes.length > 0 && (
              <p className="gd-result-line">
                {view.tributes
                  .map((t) =>
                    t.resisted
                      ? `${seatAt(t.from)?.name ?? ''} 抗贡`
                      : `${seatAt(t.from)?.name ?? ''} 向 ${seatAt(t.to)?.name ?? ''} 进贡 ${t.card ?? ''}`,
                  )
                  .join('；')}
              </p>
            )}
            {onNextRound ? (
              <button type="button" className="gd-btn primary" onClick={onNextRound}>
                下一局
              </button>
            ) : (
              <p className="gd-result-line">{waitingText ?? '等待房主开始下一局…'}</p>
            )}
          </div>
        </div>
      )}

      {view.phase === 'matchOver' && (
        <div className="gd-overlay">
          <div className="gd-dialog">
            <h2>{view.matchWinner === 0 ? '甲队获胜' : '乙队获胜'}</h2>
            <p className="gd-result-line">打 A 双下成功，整场结束。</p>
            <div className="gd-dialog-actions">
              {onRestart && (
                <button type="button" className="gd-btn primary" onClick={onRestart}>
                  再来一场
                </button>
              )}
              <button type="button" className="gd-btn ghost" onClick={onExit}>
                返回
              </button>
            </div>
          </div>
        </div>
      )}

      {showLog && (
        <aside className="gd-sidepanel">
          <div className="gd-sidepanel-head">
            <span>战报</span>
            <button type="button" className="gd-sidepanel-close" onClick={() => setShowLog(false)}>
              ×
            </button>
          </div>
          <div className="gd-sidepanel-body gd-log-list">
            {view.log.length === 0 && <div className="gd-log-empty">暂无记录</div>}
            {view.log.map((line, i) => (
              <div key={`${i}-${line}`} className="gd-log-line">
                {line}
              </div>
            ))}
          </div>
        </aside>
      )}

      {showChat && (
        <aside className="gd-sidepanel">
          <div className="gd-sidepanel-head">
            <span>房间聊天</span>
            <button type="button" className="gd-sidepanel-close" onClick={() => setShowChat(false)}>
              ×
            </button>
          </div>
          <div className="gd-sidepanel-body gd-chat-list" ref={chatListRef}>
            {chatMessages.length === 0 && (
              <div className="gd-log-empty">
                {online ? '还没有人说话，打个招呼吧。' : '单机模式没有其他玩家，联机时可以使用聊天。'}
              </div>
            )}
            {chatMessages.map((message) => (
              <div key={message.id} className="gd-chat-line">
                <span className="gd-chat-name">
                  {message.name} · Lv.{message.level ?? 1}
                </span>
                <span className={`gd-chat-bubble ${isSticker(message.text) ? 'is-sticker' : ''}`}>
                  {message.text}
                </span>
              </div>
            ))}
          </div>
          {stickers && online && (
            <div className="gd-chat-stickers">
              {CHAT_STICKERS.map((sticker) => (
                <button
                  key={sticker}
                  type="button"
                  className="gd-chat-sticker"
                  onClick={() => {
                    sendChat(sticker);
                    setStickers(false);
                  }}
                >
                  {sticker}
                </button>
              ))}
            </div>
          )}
          <div className="gd-chat-input">
            <button
              type="button"
              className="gd-sticker-btn"
              disabled={!online}
              title="表情"
              onClick={() => setStickers((v) => !v)}
            >
              表情
            </button>
            <input
              value={chatText}
              maxLength={200}
              placeholder={online ? '输入消息…' : '联机时才能聊天'}
              disabled={!online}
              onChange={(event) => setChatText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitChat();
                }
              }}
            />
            <button
              type="button"
              className="gd-btn primary"
              disabled={!online || !chatText.trim()}
              onClick={submitChat}
            >
              发送
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
