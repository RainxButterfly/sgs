import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { installDiagnostics } from './ui/diagnostics';
import { bootBridge, preloadAssets } from './ui/preload';
import './ui/styles.css';
import './ui/theme-magic.css';

try {
  if ((localStorage.getItem('sgs-ui-theme') ?? 'magic') !== 'classic') {
    document.documentElement.classList.add('theme-magic');
  }
  const palette = localStorage.getItem('sgs-ui-palette');
  document.documentElement.dataset.palette =
    palette === 'rock' || palette === 'magic' ? palette : 'rainbow';
} catch {
  document.documentElement.classList.add('theme-magic');
  document.documentElement.dataset.palette = 'rainbow';
}

installDiagnostics();
window.addEventListener('contextmenu', (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, textarea, [contenteditable="true"]')) return;
  event.preventDefault();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

/* 启动预加载：驱动启动画面的进度条，加载完淡出（主界面在下方同步渲染） */
const boot = bootBridge();
void preloadAssets((pct) => boot?.setProgress(pct))
  .then(() => boot?.finish())
  .catch(() => boot?.finish());
