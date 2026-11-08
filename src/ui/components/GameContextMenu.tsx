import { useEffect, useState } from 'react';
import { useGameStore } from '../store';

interface Props {
  onShowLog: () => void;
  onExit: () => void;
  onViewPlayer: (playerId: number) => void;
}

interface MenuState {
  x: number;
  y: number;
  playerId: number | null;
}

export function GameContextMenu({ onShowLog, onExit, onViewPlayer }: Props) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const selected = useGameStore((s) => s.selected);
  const pending = useGameStore((s) => s.pending);

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const seat = element?.closest<HTMLElement>('[data-player-id]');
      const playerId = seat ? Number(seat.dataset.playerId) : null;
      setMenu({
        x: Math.min(event.clientX, window.innerWidth - 190),
        y: Math.min(event.clientY, window.innerHeight - 230),
        playerId: Number.isFinite(playerId) ? playerId : null,
      });
    };
    const close = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!menu) return null;
  const act = (callback: () => void) => {
    setMenu(null);
    callback();
  };

  return (
    <div className="game-context-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(event) => event.stopPropagation()}>
      {menu.playerId !== null && (
        <button type="button" onClick={() => act(() => onViewPlayer(menu.playerId!))}>
          查看武将详情
        </button>
      )}
      {selected && (
        <button type="button" onClick={() => act(() => useGameStore.getState().clearSelection())}>
          取消选择
        </button>
      )}
      {pending?.kind === 'play' && (
        <button type="button" onClick={() => act(() => useGameStore.getState().endPlay())}>
          结束出牌
        </button>
      )}
      <button type="button" onClick={() => act(onShowLog)}>
        查看战报
      </button>
      <button type="button" onClick={() => act(() => useGameStore.getState().openSettings())}>
        设置
      </button>
      <div className="context-sep" />
      <button type="button" className="danger" onClick={() => act(onExit)}>
        退出对局
      </button>
    </div>
  );
}
