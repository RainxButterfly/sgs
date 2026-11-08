import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import './ui/styles.css';

window.addEventListener('error', (event) => {
  console.error('未捕获错误', event.error ?? event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('未处理的 Promise 异常', event.reason);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
