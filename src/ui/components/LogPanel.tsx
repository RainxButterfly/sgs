import { useEffect, useRef } from 'react';
import { useGameSnapshot } from '../store';

export function LogPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { game } = useGameSnapshot();
  const ref = useRef<HTMLDivElement>(null);
  const lastLogId = game?.state.log[game.state.log.length - 1]?.id ?? 0;
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lastLogId, open]);
  if (!game) return null;
  return (
    <aside className={`log-panel ${open ? 'open' : ''}`}>
      <div className="log-head">
        <span>战报</span>
        <button type="button" className="btn ghost small" onClick={onClose}>
          收起
        </button>
      </div>
      <div className="log-list" ref={ref}>
        {[...game.state.log].sort((a, b) => a.id - b.id).map((entry) => (
          <div key={entry.id} className={`log-line log-${entry.kind}`}>
            {entry.text}
          </div>
        ))}
      </div>
    </aside>
  );
}
