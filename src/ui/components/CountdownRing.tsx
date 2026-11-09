import { useEffect, useState } from 'react';

interface Props {
  deadline: number;
  totalMs: number;
  size?: number;
  className?: string;
}

const RADIUS = 15.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function CountdownRing({ deadline, totalMs, size = 24, className }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [deadline]);

  const remain = Math.max(0, deadline - now);
  const ratio = Math.max(0, Math.min(1, remain / Math.max(1, totalMs)));
  const seconds = Math.ceil(remain / 1000);

  return (
    <span
      className={`countdown-ring${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      title={`剩余 ${seconds} 秒`}
    >
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="countdown-track" cx="18" cy="18" r={RADIUS} />
        <circle
          className="countdown-value"
          cx="18"
          cy="18"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
        />
      </svg>
      <b>{seconds}</b>
    </span>
  );
}
