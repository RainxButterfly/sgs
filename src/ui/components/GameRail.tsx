import { useEffect, useRef, useState } from 'react';
import { cardEffectText } from '../cardEffects';
import { cardDisplayName, cardTypeText, playTargetText } from '../labels';
import { useGameSnapshot, useGameStore } from '../store';
import { CHAT_STICKERS, isSticker } from '../stickers';
import { nameTier } from '../profile';
import { CardView } from './CardView';

interface Props {
  onShowLog: () => void;
}

export function GameRail({ onShowLog }: Props) {
  const { game } = useGameSnapshot();
  const lastPlay = useGameStore((s) => s.lastPlay);
  const messages = useGameStore((s) => s.chatMessages);
  const sendChat = useGameStore((s) => s.sendChat);
  const lanRole = useGameStore((s) => s.lanRole);
  const feedRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const [chatText, setChatText] = useState('');
  const [stickers, setStickers] = useState(false);
  const lastLogId = game?.state.log[game.state.log.length - 1]?.id;
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [lastLogId]);
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages.length]);
  if (!game) return null;

  const online = lanRole === 'host' || lanRole === 'client';
  const playerName = (id: number) => game.state.players[id]?.name ?? `座位${id}`;
  const recent = game.state.log.slice(-16);
  const recentChat = messages.slice(-6);
  const send = () => {
    const value = chatText.trim();
    if (!value) return;
    sendChat(value);
    setChatText('');
  };

  return (
    <aside className={`game-rail ${online ? 'has-chat' : ''}`}>
      <section className="rail-card rail-play">
        <div className="rail-title">
          <b>当前出牌</b>
          <span>WHO → WHOM</span>
        </div>
        {lastPlay ? (
          <>
            <div className="rail-route">
              <b>{playerName(lastPlay.playerId)}</b>
              <i>→</i>
              <span>{playTargetText(lastPlay.targets, lastPlay.card, lastPlay.as, playerName)}</span>
            </div>
            <div className="rail-play-main">
              <CardView card={lastPlay.card} size="sm" />
              <div>
                <b>
                  {lastPlay.isResponse ? '打出' : '使用'}【{cardDisplayName(lastPlay.card)}】
                </b>
                <small>{cardTypeText(lastPlay.card)}</small>
                {cardEffectText(lastPlay.card) && <p>{cardEffectText(lastPlay.card)}</p>}
              </div>
            </div>
          </>
        ) : (
          <div className="rail-empty">等待出牌</div>
        )}
      </section>

      <section className="rail-card rail-feed">
        <div className="rail-title">
          <b>最近动向</b>
          <button type="button" onClick={onShowLog}>
            完整战报
          </button>
        </div>
        <div className="rail-feed-list" ref={feedRef}>
          {recent.length === 0 && <div className="rail-empty">暂无记录</div>}
          {recent.map((entry) => (
            <div key={entry.id} className={`rail-feed-line log-${entry.kind}`}>
              <i className="rail-feed-dot" />
              <span>{entry.text}</span>
            </div>
          ))}
        </div>
      </section>

      {online && (
        <section className="rail-card rail-chat">
          <div className="rail-title">
            <b>聊天</b>
            <span>联机</span>
          </div>
          <div className="rail-chat-list" ref={chatRef}>
            {recentChat.length === 0 && <div className="rail-empty">暂无消息</div>}
            {recentChat.map((message) => (
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
          {stickers && (
            <div className="rail-chat-stickers">
              {CHAT_STICKERS.map((sticker) => (
                <button
                  key={sticker}
                  type="button"
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
          <div className="rail-chat-input">
            <button
              type="button"
              className="rail-chat-sticker-btn"
              title="表情"
              onClick={() => setStickers((v) => !v)}
            >
              😊
            </button>
            <input
              value={chatText}
              maxLength={200}
              placeholder="输入消息…"
              onChange={(event) => setChatText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <button type="button" disabled={!chatText.trim()} onClick={send}>
              发送
            </button>
          </div>
        </section>
      )}
    </aside>
  );
}
