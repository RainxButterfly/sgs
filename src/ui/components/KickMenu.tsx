import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  x: number;
  y: number;
  name: string;
  kind: 'player' | 'spectator';
  onKick: () => void;
  onPermanent: () => void;
  onClose: () => void;
}

export function KickMenu({ x, y, name, kind, onKick, onPermanent, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const left = Math.max(8, Math.min(x, window.innerWidth - 176));
  const top = Math.max(8, Math.min(y + 8, window.innerHeight - 146));

  return createPortal(
    <div
      ref={ref}
      className="kick-menu"
      style={{ left, top }}
      role="menu"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="kick-menu-title">
        移出 <b>{name}</b>
        <span>{kind === 'spectator' ? '观战席' : '玩家座位'}</span>
      </div>
      <button type="button" role="menuitem" onClick={onKick}>
        本次移出
      </button>
      <button type="button" role="menuitem" className="permanent" onClick={onPermanent}>
        永久移出
      </button>
      <button type="button" role="menuitem" className="cancel" onClick={onClose}>
        取消
      </button>
    </div>,
    document.body,
  );
}
