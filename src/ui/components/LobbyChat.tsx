import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store';
import { CHAT_STICKERS, isSticker } from '../stickers';

export function LobbyChat() {
  const messages = useGameStore((s) => s.chatMessages);
  const lanRole = useGameStore((s) => s.lanRole);
  const profile = useGameStore((s) => s.profile);
  const send = useGameStore((s) => s.sendChat);
  const [text, setText] = useState('');
  const [stickers, setStickers] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const online = lanRole === 'host' || lanRole === 'client';

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    send(value);
    setText('');
    setStickers(false);
  };

  return (
    <section className="lobby-chat">
      <div className="lobby-chat-head">
        <b>房间聊天</b>
        <span>{online ? '和房间里的人聊聊' : '联机时可用'}</span>
      </div>
      <div className="lobby-chat-list" ref={listRef}>
        {messages.length === 0 && <div className="chat-empty">还没有人说话，打个招呼吧。</div>}
        {messages.slice(-40).map((message) => {
          const mine = message.name === profile.name;
          return (
            <div key={message.id} className={`chat-message ${mine ? 'is-mine' : ''}`}>
              <span className="chat-name">{mine ? '你' : message.name}</span>
              <div className={`chat-bubble ${isSticker(message.text) ? 'is-sticker' : ''}`}>{message.text}</div>
            </div>
          );
        })}
      </div>
      {stickers && (
        <div className="lobby-chat-stickers">
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
      <div className="lobby-chat-input">
        <button
          type="button"
          className="btn ghost small"
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
        <button type="button" className="btn primary small" disabled={!online || !text.trim()} onClick={submit}>
          发送
        </button>
      </div>
    </section>
  );
}
