import { useEffect } from 'react';
import { useGameStore } from '../store';

const GLYPHS = ['✦', '✧', '♡', '♪'];

export function ClickSparkles() {
  const enabled = useGameStore((s) => s.uiTheme === 'magic');

  useEffect(() => {
    if (!enabled) return;

    const onPointerDown = (event: PointerEvent) => {
      const hue = Math.random() * 360;
      const ripple = document.createElement('span');
      ripple.className = 'click-ripple';
      ripple.style.left = `${event.clientX}px`;
      ripple.style.top = `${event.clientY}px`;
      ripple.style.setProperty('--ripple-color', `hsl(${hue}, 92%, 76%)`);
      document.body.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 600);

      for (let index = 0; index < 9; index += 1) {
        const spark = document.createElement('span');
        spark.className = 'click-spark';
        spark.textContent = GLYPHS[index % GLYPHS.length];
        const size = 11 + Math.random() * 11;
        spark.style.left = `${event.clientX}px`;
        spark.style.top = `${event.clientY}px`;
        spark.style.setProperty('--spark-size', `${size}px`);
        spark.style.setProperty('--spark-color', `hsl(${(hue + index * 37) % 360}, 92%, 78%)`);
        spark.style.setProperty('--spark-x', `${(Math.random() - 0.5) * 96}px`);
        spark.style.setProperty('--spark-y', `${(Math.random() - 0.5) * 96}px`);
        spark.style.setProperty('--spark-rot', `${Math.random() * 140}deg`);
        document.body.appendChild(spark);
        requestAnimationFrame(() => spark.classList.add('is-gone'));
        window.setTimeout(() => spark.remove(), 750);
      }
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [enabled]);

  return null;
}
