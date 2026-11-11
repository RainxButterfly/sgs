import type { Card } from '../core/types';

export const DEV_TOOL_VERSION = 1;
export const DEV_SESSION_KEY = 'xhs-dev-session-v1';
export const DEV_GAME_VERSION_KEY = 'xhs-dev-game-version';
export const DEV_TOOL_CODE_KEY = 'xhs-devtool-code-v1';

const SECRET = 'xinghe-sanguo-devtools-2026-rainbow';

export type DevSuit = Card['suit'];

export interface DevCardSpec {
  name: string;
  suit: DevSuit;
  rank: number;
}

export type DevCommandType =
  | 'setHand'
  | 'addCards'
  | 'stackDeck'
  | 'setHero'
  | 'setPickPool'
  | 'setHp'
  | 'setRole';

export interface DevCommand {
  id: string;
  type: DevCommandType;
  cards?: DevCardSpec[];
  heroId?: string;
  heroIds?: string[];
  hp?: number;
  role?: string;
  status: 'pending' | 'applied' | 'rejected';
  note?: string;
}

export interface DevSession {
  code: string;
  commands: DevCommand[];
  updatedAt: number;
}

export interface LicenseFields {
  created: string;
  batch: string;
  serial: string;
  toolMin: number;
  toolMax: number;
  gameMin: string;
  gameMax: string;
  expires: string;
}

export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

export function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

function payloadOf(f: LicenseFields): string {
  return `XH2|${f.created}|${f.batch}|${f.serial}|${f.toolMin}|${f.toolMax}|${f.gameMin}|${f.gameMax}|${f.expires}`;
}

async function hmac(text: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signLicense(f: LicenseFields): Promise<string> {
  const sig = (await hmac(payloadOf(f))).slice(0, 12);
  return `XH2.${f.created}.${f.batch}.${f.serial}.${f.toolMin}-${f.toolMax}.${f.gameMin}~${f.gameMax}.${f.expires || 'long'}.${sig}`;
}

export function parseLicense(code: string): { fields: LicenseFields; sig: string } | null {
  const match =
    /^XH2\.(\d{8})\.([^.]+)\.([A-Za-z0-9-]+)\.(\d+)-(\d+)\.(\d+\.\d+\.\d+)~(\d+\.\d+\.\d+)\.(\d{8}|long)\.([0-9a-f]{12})$/.exec(
      code.trim(),
    );
  if (!match) return null;
  const [, created, batch, serial, toolMinRaw, toolMaxRaw, gameMin, gameMax, expires, sig] = match;
  const toolMin = Number(toolMinRaw);
  const toolMax = Number(toolMaxRaw);
  if (toolMin > toolMax) return null;
  if (compareVersion(gameMin, gameMax) > 0) return null;
  return {
    fields: {
      created,
      batch,
      serial,
      toolMin,
      toolMax,
      gameMin,
      gameMax,
      expires: expires === 'long' ? '' : expires,
    },
    sig,
  };
}

export async function verifyLicense(code: string): Promise<LicenseFields | null> {
  const parsed = parseLicense(code);
  if (!parsed) return null;
  const expect = (await hmac(payloadOf(parsed.fields))).slice(0, 12);
  return expect === parsed.sig ? parsed.fields : null;
}

export interface LicenseEnv {
  gameVersion: string;
  toolVersion: number;
  revoked: string[];
  revokedSerials: string[];
  today: string;
}

export function licenseProblem(f: LicenseFields, env: LicenseEnv): string | null {
  if (env.revoked.includes(f.batch)) return `批次「${f.batch}」已被当前版本吊销`;
  if (env.revokedSerials.includes(f.serial)) return `授权编号「${f.serial}」已被当前版本吊销`;
  if (env.toolVersion < f.toolMin || env.toolVersion > f.toolMax) {
    return `测试工具版本 v${env.toolVersion} 不在授权范围 v${f.toolMin}–v${f.toolMax}`;
  }
  if (compareVersion(env.gameVersion, f.gameMin) < 0 || compareVersion(env.gameVersion, f.gameMax) > 0) {
    return `当前游戏 v${env.gameVersion} 不在授权范围 v${f.gameMin}–v${f.gameMax}`;
  }
  if (f.expires && env.today > f.expires) return `授权已于 ${f.expires} 过期`;
  return null;
}

export function licenseSummary(f: LicenseFields): string {
  const created = `${f.created.slice(0, 4)}-${f.created.slice(4, 6)}-${f.created.slice(6, 8)}`;
  const expires = f.expires
    ? `${f.expires.slice(0, 4)}-${f.expires.slice(4, 6)}-${f.expires.slice(6, 8)}`
    : '长期';
  return `编号 ${f.serial} · 创建于 ${created} · 用途批次「${f.batch}」 · 工具 v${f.toolMin}–v${f.toolMax} · 游戏 v${f.gameMin}–v${f.gameMax} · 有效期 ${expires}`;
}

export function readSession(): DevSession | null {
  try {
    const raw = localStorage.getItem(DEV_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as DevSession;
    if (!session || typeof session.code !== 'string' || !Array.isArray(session.commands)) return null;
    return session;
  } catch {
    return null;
  }
}

export function writeSession(session: DevSession): void {
  localStorage.setItem(DEV_SESSION_KEY, JSON.stringify(session));
}