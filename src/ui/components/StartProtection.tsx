import { useEffect, useState } from 'react';
import { useGameStore } from '../store';

export function StartProtection() {
  const protectionUntil = useGameStore((s) => s.protectionUntil);
  const screen = useGameStore((s) => s.screen);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!protectionUntil) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [protectionUntil]);

  if (screen !== 'game' || !protectionUntil || now >= protectionUntil) return null;
  const remain = Math.max(1, Math.ceil((protectionUntil - now) / 1000));

  return (
    <div className="start-protection" role="alert" aria-live="assertive">
      <div className="start-protection-card">
        <span className="start-protection-ring">{remain}</span>
        <b>开局保护</b>
        <small>{remain} 秒后可操作 · 先看清座次与武将</small>
      </div>
    </div>
  );
}