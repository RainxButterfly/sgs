const STORAGE_KEY = 'sgs-diagnostics-v1';
const SESSION_KEY = 'sgs-game-session-v1';
const MAX_ENTRIES = 100;
const MAX_MESSAGE = 400;
const MAX_DETAIL = 2400;

export interface DiagnosticEntry {
  at: string;
  kind: 'start' | 'error' | 'rejection' | 'session';
  message: string;
  detail?: string;
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function clip(value: string | undefined, limit: number): string | undefined {
  if (!value) return undefined;
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function readEntries(): DiagnosticEntry[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DiagnosticEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is DiagnosticEntry =>
        !!entry &&
        typeof entry.at === 'string' &&
        typeof entry.message === 'string' &&
        ['start', 'error', 'rejection', 'session'].includes(entry.kind),
    );
  } catch {
    return [];
  }
}

function writeEntries(entries: DiagnosticEntry[]): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // 存储空间不足时放弃日志，不影响对局
  }
}

export function recordDiagnostic(
  kind: DiagnosticEntry['kind'],
  message: string,
  detail?: string,
): void {
  const entry: DiagnosticEntry = {
    at: new Date().toISOString(),
    kind,
    message: clip(message, MAX_MESSAGE) ?? '',
    detail: clip(detail, MAX_DETAIL),
  };
  writeEntries([...readEntries(), entry]);
}

export function markGameSession(detail: string): void {
  const store = storage();
  if (!store) return;
  try {
    if (store.getItem(SESSION_KEY)) return;
    store.setItem(SESSION_KEY, JSON.stringify({ at: new Date().toISOString(), detail }));
  } catch {
    // ignore storage failures
  }
}

export function endGameSession(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(SESSION_KEY);
  } catch {
    // ignore storage failures
  }
}

function previousSession(): { at: string; detail: string } | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(SESSION_KEY);
    store.removeItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: string; detail?: string };
    return {
      at: typeof parsed.at === 'string' ? parsed.at : '',
      detail: typeof parsed.detail === 'string' ? parsed.detail : '',
    };
  } catch {
    return null;
  }
}

export function formatDiagnostics(): string {
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';
  const entries = readEntries();
  const lines = [`四国闪 · 星河 运行日志`, `版本：${version}`, `记录数：${entries.length}`, ''];
  for (const entry of entries) {
    lines.push(`[${entry.at}] ${entry.kind} ${entry.message}`);
    if (entry.detail) {
      lines.push(entry.detail);
      lines.push('');
    }
  }
  if (entries.length === 0) lines.push('（暂无记录）');
  return lines.join('\n');
}

export function hasDiagnostics(): boolean {
  return readEntries().length > 0;
}

export function installDiagnostics(): void {
  if (typeof window === 'undefined') return;
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';
  const previous = previousSession();
  if (previous) {
    recordDiagnostic(
      'session',
      '上次对局没有正常结束（可能是闪退或被系统清理）',
      `开始时间：${previous.at || '未知'}\n${previous.detail}`,
    );
  }
  recordDiagnostic('start', `启动 v${version}`);

  window.addEventListener('error', (event) => {
    const error = event.error as Error | undefined;
    recordDiagnostic('error', event.message || '未知脚本错误', error?.stack);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { message?: string; stack?: string } | undefined;
    const message = typeof reason === 'string' ? reason : reason?.message ?? '未处理的 Promise 异常';
    recordDiagnostic('rejection', message, reason?.stack);
  });
}
