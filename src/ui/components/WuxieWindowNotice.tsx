import { useGameStore } from '../store';

export function WuxieWindowNotice() {
  const active = useGameStore((s) => s.wuxieWindow);
  const screen = useGameStore((s) => s.screen);
  if (!active || screen !== 'game') return null;
  return (
    <div className="wuxie-window-notice">
      <span className="wuxie-window-dot" />
      无懈可击窗口 · 4 秒
    </div>
  );
}
