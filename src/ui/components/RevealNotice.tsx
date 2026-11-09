import { cardDisplayName, rankText, shortCardName, SUIT_CHAR } from '../labels';
import { useGameSnapshot, useGameStore } from '../store';

export function RevealNotice() {
  const { game } = useGameSnapshot();
  const notice = useGameStore((s) => s.revealNotice);
  const screen = useGameStore((s) => s.screen);
  if (!game || !notice || screen !== 'game') return null;
  const player = notice.playerId !== undefined ? game.state.players[notice.playerId] : undefined;
  return (
    <div key={`reveal-${notice.id}`} className="reveal-notice">
      <div className="reveal-notice-head">
        <span>{notice.label ?? '展示'}</span>
        {player && <b>{player.name}</b>}
      </div>
      <div className="reveal-notice-cards">
        {notice.cards.map((card) => (
          <span key={card.id} className="reveal-card">
            <em>
              {SUIT_CHAR[card.suit]}
              {rankText(card.rank)}
            </em>
            <b>{shortCardName(cardDisplayName(card))}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
