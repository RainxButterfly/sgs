import { useEffect, useRef, useState } from 'react';
import type { Card } from '../../core/types';
import { cardArtUrl } from '../cardArt';
import { cardDisplayName, rankText, SUIT_CHAR } from '../labels';
import { useGameStore } from '../store';
import { CardView } from './CardView';

interface Fly {
  id: number;
  fromX: number;
  fromY: number;
  dx: number;
  dy: number;
  card: Card;
  rot: number;
}

/** 出牌动画：牌从座位飞向桌心，放大成完整卡面停留片刻后淡出 */
export function PlayFly() {
  const lastPlay = useGameStore((s) => s.lastPlay);
  const screen = useGameStore((s) => s.screen);
  const [fly, setFly] = useState<Fly | null>(null);
  const lastId = useRef(0);

  useEffect(() => {
    if (!lastPlay || screen !== 'game') return;
    if (lastPlay.id === lastId.current) return;
    lastId.current = lastPlay.id;

    const seat = document.querySelector(`[data-player-id="${lastPlay.playerId}"]`);
    if (!seat) return;
    const rect = seat.getBoundingClientRect();
    const center = document.querySelector('.table-center, .table-main, .game-table');
    const target = center ? center.getBoundingClientRect() : null;
    const toX = target ? target.left + target.width / 2 : window.innerWidth / 2;
    const toY = target ? target.top + target.height / 2 : window.innerHeight * 0.42;
    const fromX = rect.left + rect.width / 2;
    const fromY = rect.top + rect.height / 2;

    setFly({
      id: lastPlay.id,
      fromX,
      fromY,
      dx: toX - fromX,
      dy: toY - fromY,
      card: lastPlay.card,
      rot: (lastPlay.id % 7) - 3,
    });
    const timer = window.setTimeout(() => setFly(null), 1560);
    return () => window.clearTimeout(timer);
  }, [lastPlay, screen]);

  if (!fly) return null;
  const red = fly.card.suit === 'heart' || fly.card.suit === 'diamond';
  const art = cardArtUrl(fly.card.name);
  return (
    <>
      <div
        key={fly.id}
        className={`play-stage ${art ? 'has-art' : ''} ${red ? 'is-red' : ''}`}
        style={{
          left: `${fly.fromX + fly.dx}px`,
          top: `${fly.fromY + fly.dy}px`,
          ['--fx-dx' as string]: `${-fly.dx}px`,
          ['--fx-dy' as string]: `${-fly.dy}px`,
          ['--fx-rot' as string]: `${fly.rot}deg`,
        }}
        aria-hidden="true"
      >
        {art ? (
          <CardView card={fly.card} size="lg" className="play-stage-card" />
        ) : (
          <span className="play-fly-text">
            <span className="play-fly-suit">{SUIT_CHAR[fly.card.suit] ?? ''}</span>
            <span className="play-fly-rank">{rankText(fly.card.rank)}</span>
            <span className="play-fly-name">{cardDisplayName(fly.card)}</span>
          </span>
        )}
      </div>
    </>
  );
}

/** 受伤震屏 + 红闪 */
export function TablePulse() {
  const damage = useGameStore((s) => s.damageNotice);
  const screen = useGameStore((s) => s.screen);
  const lastId = useRef(0);

  useEffect(() => {
    if (!damage || screen !== 'game') return;
    if (damage.id === lastId.current) return;
    lastId.current = damage.id;
    if (damage.kind !== 'damage') return;
    const root = document.documentElement;
    root.classList.remove('fx-hit');
    void root.offsetWidth;
    root.classList.add('fx-hit');
    const timer = window.setTimeout(() => root.classList.remove('fx-hit'), 440);
    return () => window.clearTimeout(timer);
  }, [damage, screen]);

  return null;
}

/** 弃牌动画：被拆掉 / 弃置的牌从座位飞向弃牌堆 */
export function DiscardFly() {
  const lastDiscard = useGameStore((s) => s.lastDiscard);
  const screen = useGameStore((s) => s.screen);
  const [flies, setFlies] = useState<Fly[]>([]);
  const lastId = useRef(0);

  useEffect(() => {
    if (!lastDiscard || screen !== 'game') return;
    if (lastDiscard.id === lastId.current) return;
    lastId.current = lastDiscard.id;

    const seat = document.querySelector(`[data-player-id="${lastDiscard.playerId}"]`);
    const pile = document.querySelector('.table-piles');
    const fromRect = seat?.getBoundingClientRect();
    const toRect = pile?.getBoundingClientRect();
    const fromX = fromRect ? fromRect.left + fromRect.width / 2 : window.innerWidth / 2;
    const fromY = fromRect ? fromRect.top + fromRect.height / 2 : window.innerHeight * 0.42;
    const toX = toRect ? toRect.left + toRect.width / 2 : window.innerWidth / 2;
    const toY = toRect ? toRect.top + toRect.height / 2 : window.innerHeight * 0.55;

    const cards = lastDiscard.cards.slice(0, 4);
    setFlies(
      cards.map((card, i) => ({
        id: lastDiscard.id * 10 + i,
        fromX: fromX + (i - (cards.length - 1) / 2) * 16,
        fromY,
        dx: toX - fromX,
        dy: toY - fromY,
        card,
        rot: ((i * 41) % 50) - 25,
      })),
    );
    const timer = window.setTimeout(() => setFlies([]), 1100);
    return () => window.clearTimeout(timer);
  }, [lastDiscard, screen]);

  if (flies.length === 0) return null;
  return (
    <>
      {flies.map((fly) => (
        <div
          key={fly.id}
          className="discard-stage"
          style={{
            left: `${fly.fromX + fly.dx}px`,
            top: `${fly.fromY + fly.dy}px`,
            ['--fx-dx' as string]: `${-fly.dx}px`,
            ['--fx-dy' as string]: `${-fly.dy}px`,
            ['--fx-rot' as string]: `${fly.rot}deg`,
          }}
          aria-hidden="true"
        >
          <CardView card={fly.card} size="sm" />
        </div>
      ))}
    </>
  );
}
