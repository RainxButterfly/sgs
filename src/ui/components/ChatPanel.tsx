import { useEffect, useRef, useState } from 'react';
import { useGameSnapshot, useGameStore } from '../store';
import { CHAT_STICKERS, isSticker } from '../stickers';

export function ChatPanel() {
  const open = useGameStore((s) => s.chatOpen);
  const messages = useGameStore((s) => s.chatMessages);
  const lanRole = useGameStore((s) => s.lanRole);
  const humanId = useGameStore((s) => s.humanId);
  const { game } = useGameSnapshot();
  const close = useGameStore((s) => s.closeChat);
  const send = useGameStore((s) => s.sendChat);
  const [text, setText] = useState('');
  const [stickers, setStickers] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const online = lanRole === 'host' || lanRole === 'client';
  const selfName = game?.state.players[humanId]?.name ?? '';

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, open]);

  if (!open) return null;

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    send(value);
    setText('');
    setStickers(false);
  };

  return (
    <>
      <button type="button" className="chat-scrim" aria-label="关闭聊天" onClick={close} />
      <aside className="chat-panel open">
      <div className="chat-head">
        <span>房间聊天</span>
        <button type="button" className="btn ghost small" onClick={close}>
          收起
        </button>
      </div>
      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && (
          <div className="chat-empty">{online ? '还没有人说话，打个招呼吧。' : '单机模式没有其他玩家，联机时可以使用聊天。'}</div>
        )}
        {messages.map((message) => {
          const mine = !!selfName && message.name === selfName;
          return (
            <div key={message.id} className={`chat-message ${mine ? 'is-mine' : ''}`}>
              <span className="chat-name">{mine ? '你' : message.name}</span>
              <div className={`chat-bubble ${isSticker(message.text) ? 'is-sticker' : ''}`}>{message.text}</div>
            </div>
          );
        })}
      </div>
      {stickers && (
        <div className="chat-stickers">
          {CHAT_STICKERS.map((sticker) => (
            <button
              key={sticker}
              type="button"
              className="chat-sticker"
              onClick={() => {
                send(sticker);
                setStickers(false);
              }}
            >
              {sticker}
            </button>
          ))}
        </div>
      )}
      <div className="chat-input-row">
        <button
          type="button"
          className="btn ghost chat-sticker-btn"
          disabled={!online}
          onClick={() => setStickers((value) => !value)}
        >
          表情
        </button>
        <input
          value={text}
          maxLength={200}
          placeholder={online ? '输入消息…' : '联机时才能聊天'}
          disabled={!online}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" className="btn primary" disabled={!online || !text.trim()} onClick={submit}>
          发送
        </button>
      </div>
      </aside>
    </>
  );
}
