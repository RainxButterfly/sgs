import { useEffect, useState } from 'react';
import { useGameSnapshot, useGameStore } from '../store';

interface Point {
  x: number;
  y: number;
}

interface Arrow {
  id: string;
  d: string;
  target: Point;
  delay: number;
}

function center(element: Element): Point {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function curve(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const midX = (from.x + to.x) / 2 - dy * 0.12;
  const midY = (from.y + to.y) / 2 + dx * 0.12;
  return `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`;
}

export function PlayArrowLayer() {
  const { game } = useGameSnapshot();
  const lastPlay = useGameStore((s) => s.lastPlay);
  const [arrows, setArrows] = useState<Arrow[]>([]);

  useEffect(() => {
    const root = document.querySelector('.mobile-game') ?? document.querySelector('.game-screen');
    if (!root || !lastPlay || !game) {
      setArrows([]);
      return;
    }
    const find = (id: number) => root.querySelector(`[data-player-id="${id}"]`);
    const build = () => {
      const sourceId = lastPlay.playerId;
      const targets = lastPlay.targets ?? [];
      if (!targets.length) {
        setArrows([]);
        return;
      }
      const segments: [number, number][] = [];
      if (lastPlay.as === '借刀杀人' && targets.length >= 2) {
        segments.push([sourceId, targets[0]], [targets[0], targets[1]]);
      } else {
        for (const target of targets) segments.push([sourceId, target]);
      }
      const next: Arrow[] = [];
      segments.forEach(([fromId, toId], index) => {
        if (fromId === toId) return;
        const fromEl = find(fromId);
        const toEl = find(toId);
        if (!fromEl || !toEl) return;
        const from = center(fromEl);
        const to = center(toEl);
        next.push({
          id: `${lastPlay.id}-${index}`,
          d: curve(from, to),
          target: to,
          delay: index * 0.18,
        });
      });
      setArrows(next);
    };
    const frame = window.requestAnimationFrame(build);
    window.addEventListener('resize', build);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', build);
    };
  }, [game, lastPlay]);

  if (!arrows.length) return null;

  return (
    <svg className="play-arrow-layer" aria-hidden="true">
      <defs>
        <linearGradient id="play-arrow-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ffd36e" />
          <stop offset="55%" stopColor="#ff8fd8" />
          <stop offset="100%" stopColor="#64f4ff" />
        </linearGradient>
        <marker id="play-arrow-head" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
          <path d="M 0 0 L 9 4.5 L 0 9 Z" fill="#fff3cf" />
        </marker>
      </defs>
      {arrows.map((arrow) => (
        <g key={arrow.id}>
          <path
            className="play-arrow-line"
            d={arrow.d}
            pathLength={1}
            markerEnd="url(#play-arrow-head)"
            style={{ animationDelay: `${arrow.delay}s` }}
          />
          <circle
            className="play-arrow-impact"
            cx={arrow.target.x}
            cy={arrow.target.y}
            r={8}
            style={{ animationDelay: `${arrow.delay + 0.3}s` }}
          />
        </g>
      ))}
    </svg>
  );
}
