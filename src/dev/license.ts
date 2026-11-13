import type { Card } from '../core/types';

export const DEV_TOOL_VERSION = 2;
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
  | 'setMaxHp'
  | 'healFull'
  | 'drawCards'
  | 'setRole'
  | 'setChained'
  | 'setFlipped'
  | 'addJudge'
  | 'clearJudges'
  | 'killSelf'
  | 'killOthers'
  | 'endGame';

export interface DevCommand {
  id: string;
  type: DevCommandType;
  cards?: DevCardSpec[];
  heroId?: string;
  heroIds?: string[];
  hp?: number;
  count?: number;
  judge?: string;
  winner?: 'loyalist' | 'rebel' | 'draw';
  role?: string;
  status: 'pending' | 'applied' | 'rejected';
  note?: string;
}

export interface DevSession {
  code: string;
  commands: DevCommand[];
  updatedAt: number;
}

/**
 * 功能权限位。每个授权码可以只解锁其中一部分，
 * 未解锁的功能在测试工具里禁用、游戏端也会拒绝对应指令。
 */
export type DevFeature = 'cards' | 'hp' | 'status' | 'hero' | 'fate' | 'lan';

export interface DevFeatureMeta {
  key: DevFeature;
  bit: number;
  label: string;
  desc: string;
  /** 高危功能，勾选时在生成器里额外提示 */
  danger?: boolean;
}

export const DEV_FEATURES: readonly DevFeatureMeta[] = [
  { key: 'cards', bit: 0x01, label: '手牌与牌堆', desc: '替换手牌、追加手牌、按顺序置顶牌堆' },
  { key: 'hp', bit: 0x02, label: '体力与摸牌', desc: '设置体力 / 上限、体力回满、额外摸牌' },
  { key: 'status', bit: 0x04, label: '状态与判定', desc: '铁索、翻面、贴判定牌、清空判定区、设置身份' },
  { key: 'hero', bit: 0x08, label: '武将', desc: '立即更换武将、指定下次选将的候选武将' },
  { key: 'fate', bit: 0x10, label: '生死与胜负', desc: '令自己阵亡、令其他角色阵亡、直接结束对局', danger: true },
  { key: 'lan', bit: 0x20, label: '局域网联机', desc: '允许在联机对局中使用，并向全场广播与记入战报' },
];

/** 全部功能开启 */
export const FEATURE_ALL = DEV_FEATURES.reduce((mask, meta) => mask | meta.bit, 0);
/** 不含联机权限（单机全功能） */
export const FEATURE_SOLO_ALL = FEATURE_ALL & ~0x20;

const FEATURE_MAP = new Map<DevFeature, DevFeatureMeta>(DEV_FEATURES.map((meta) => [meta.key, meta]));

export interface LicenseFields {
  created: string;
  batch: string;
  serial: string;
  /** 功能权限位掩码，随签名一起校验 */
  flags: number;
  /** 任意版本授权：不校验游戏版本区间 */
  anyVersion: boolean;
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

export const ANY_VERSION_MIN = '0.0.0';
export const ANY_VERSION_MAX = '99.99.99';

/** 把功能 key 集合合成为位掩码 */
export function flagsFromKeys(keys: DevFeature[]): number {
  let mask = 0;
  for (const key of keys) {
    const meta = FEATURE_MAP.get(key);
    if (meta) mask |= meta.bit;
  }
  return mask & FEATURE_ALL;
}

/** 位掩码拆成功能 key 列表（顺序固定，便于展示） */
export function featuresOf(mask: number): DevFeature[] {
  return DEV_FEATURES.filter((meta) => (mask & meta.bit) !== 0).map((meta) => meta.key);
}

export function featureMeta(key: DevFeature): DevFeatureMeta {
  return FEATURE_MAP.get(key) ?? { key, bit: 0, label: key, desc: '' };
}

export function featureLabelOfMask(mask: number): string[] {
  return featuresOf(mask).map((key) => featureMeta(key).label);
}

export function hasFeature(f: LicenseFields, key: DevFeature): boolean {
  const meta = FEATURE_MAP.get(key);
  if (!meta) return false;
  return (f.flags & meta.bit) !== 0;
}

/** 指令与功能位的映射：发指令前、执行前都按它判定 */
const COMMAND_FEATURE: Record<DevCommandType, DevFeature> = {
  setHand: 'cards',
  addCards: 'cards',
  stackDeck: 'cards',
  setHp: 'hp',
  setMaxHp: 'hp',
  healFull: 'hp',
  drawCards: 'hp',
  setChained: 'status',
  setFlipped: 'status',
  addJudge: 'status',
  clearJudges: 'status',
  setRole: 'status',
  setHero: 'hero',
  setPickPool: 'hero',
  killSelf: 'fate',
  killOthers: 'fate',
  endGame: 'fate',
};

export function featureOfCommand(type: DevCommandType): DevFeature {
  return COMMAND_FEATURE[type] ?? 'cards';
}

export function commandAllowed(f: LicenseFields, type: DevCommandType): boolean {
  return hasFeature(f, featureOfCommand(type));
}

function flagsToHex(flags: number): string {
  return (flags & FEATURE_ALL).toString(16).padStart(2, '0');
}

/** XH4（带功能权限位）签名原文 */
function payloadOf(f: LicenseFields): string {
  return `XH4|${f.created}|${f.batch}|${f.serial}|${flagsToHex(f.flags)}|${f.anyVersion ? 'any' : 'fixed'}|${f.toolMin}|${f.toolMax}|${f.gameMin}|${f.gameMax}|${f.expires}`;
}

/** XH3（带用途/任意版本、无功能位）的签名原文，保持兼容 */
function legacyPayloadOf(f: LicenseFields): string {
  const scope = hasFeature(f, 'lan') ? 'lan' : 'solo';
  return `XH3|${f.created}|${f.batch}|${f.serial}|${scope}|${f.anyVersion ? 'any' : 'fixed'}|${f.toolMin}|${f.toolMax}|${f.gameMin}|${f.gameMax}|${f.expires}`;
}

/** 旧版 XH2 授权码的签名原文（保持兼容） */
function legacyV2PayloadOf(f: LicenseFields): string {
  return `XH2|${f.created}|${f.batch}|${f.serial}|${f.toolMin}|${f.toolMax}|${f.gameMin}|${f.gameMax}|${f.expires}`;
}

async function hmac(text: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type LicenseFormat = 'XH2' | 'XH3' | 'XH4';

function parseCode(code: string): { fields: LicenseFields; sig: string; format: LicenseFormat } | null {
  const raw = code.trim();
  const v4 =
    /^XH4\.(\d{8})\.([^.]+)\.([A-Za-z0-9-]+)\.([0-9a-f]{2})\.(any|fixed)\.(\d+)-(\d+)\.(\d+\.\d+\.\d+)~(\d+\.\d+\.\d+)\.(\d{8}|long)\.([0-9a-f]{12})$/.exec(
      raw,
    );
  if (v4) {
    const [, created, batch, serial, flagsHex, ver, toolMinRaw, toolMaxRaw, gameMin, gameMax, expires, sig] = v4;
    const toolMin = Number(toolMinRaw);
    const toolMax = Number(toolMaxRaw);
    if (toolMin > toolMax) return null;
    const anyVersion = ver === 'any';
    if (!anyVersion && compareVersion(gameMin, gameMax) > 0) return null;
    return {
      format: 'XH4',
      sig,
      fields: {
        created,
        batch,
        serial,
        flags: parseInt(flagsHex, 16) & FEATURE_ALL,
        anyVersion,
        toolMin,
        toolMax,
        gameMin: anyVersion ? ANY_VERSION_MIN : gameMin,
        gameMax: anyVersion ? ANY_VERSION_MAX : gameMax,
        expires: expires === 'long' ? '' : expires,
      },
    };
  }
  const v3 =
    /^XH3\.(\d{8})\.([^.]+)\.([A-Za-z0-9-]+)\.(solo|lan)\.(any|fixed)\.(\d+)-(\d+)\.(\d+\.\d+\.\d+)~(\d+\.\d+\.\d+)\.(\d{8}|long)\.([0-9a-f]{12})$/.exec(
      raw,
    );
  if (v3) {
    const [, created, batch, serial, scope, ver, toolMinRaw, toolMaxRaw, gameMin, gameMax, expires, sig] = v3;
    const toolMin = Number(toolMinRaw);
    const toolMax = Number(toolMaxRaw);
    if (toolMin > toolMax) return null;
    const anyVersion = ver === 'any';
    if (!anyVersion && compareVersion(gameMin, gameMax) > 0) return null;
    return {
      format: 'XH3',
      sig,
      fields: {
        created,
        batch,
        serial,
        // 旧码没有功能位：视为全部功能解锁，联机位跟随原用途
        flags: scope === 'lan' ? FEATURE_ALL : FEATURE_SOLO_ALL,
        anyVersion,
        toolMin,
        toolMax,
        gameMin: anyVersion ? ANY_VERSION_MIN : gameMin,
        gameMax: anyVersion ? ANY_VERSION_MAX : gameMax,
        expires: expires === 'long' ? '' : expires,
      },
    };
  }
  const v2 =
    /^XH2\.(\d{8})\.([^.]+)\.([A-Za-z0-9-]+)\.(\d+)-(\d+)\.(\d+\.\d+\.\d+)~(\d+\.\d+\.\d+)\.(\d{8}|long)\.([0-9a-f]{12})$/.exec(
      raw,
    );
  if (!v2) return null;
  const [, created, batch, serial, toolMinRaw, toolMaxRaw, gameMin, gameMax, expires, sig] = v2;
  const toolMin = Number(toolMinRaw);
  const toolMax = Number(toolMaxRaw);
  if (toolMin > toolMax) return null;
  if (compareVersion(gameMin, gameMax) > 0) return null;
  return {
    format: 'XH2',
    sig,
    fields: {
      created,
      batch,
      serial,
      flags: FEATURE_SOLO_ALL,
      anyVersion: false,
      toolMin,
      toolMax,
      gameMin,
      gameMax,
      expires: expires === 'long' ? '' : expires,
    },
  };
}

/** 生成 XH4 授权码（含功能权限位） */
export async function signLicense(f: LicenseFields): Promise<string> {
  // 任意版本授权统一用 0.0.0~99.99.99 落码，签名原文也必须是同一份字段
  const normalized: LicenseFields = {
    ...f,
    flags: f.flags & FEATURE_ALL,
    ...(f.anyVersion ? { gameMin: ANY_VERSION_MIN, gameMax: ANY_VERSION_MAX } : {}),
  };
  const sig = (await hmac(payloadOf(normalized))).slice(0, 12);
  return `XH4.${normalized.created}.${normalized.batch}.${normalized.serial}.${flagsToHex(normalized.flags)}.${normalized.anyVersion ? 'any' : 'fixed'}.${normalized.toolMin}-${normalized.toolMax}.${normalized.gameMin}~${normalized.gameMax}.${normalized.expires || 'long'}.${sig}`;
}

export function parseLicense(code: string): { fields: LicenseFields; sig: string } | null {
  const parsed = parseCode(code);
  if (!parsed) return null;
  return { fields: parsed.fields, sig: parsed.sig };
}

export async function verifyLicense(code: string): Promise<LicenseFields | null> {
  const parsed = parseCode(code);
  if (!parsed) return null;
  const payload =
    parsed.format === 'XH4'
      ? payloadOf(parsed.fields)
      : parsed.format === 'XH3'
        ? legacyPayloadOf(parsed.fields)
        : legacyV2PayloadOf(parsed.fields);
  const expect = (await hmac(payload)).slice(0, 12);
  return expect === parsed.sig ? parsed.fields : null;
}

/** 该授权是否允许在局域网联机中使用 */
export function licenseAllowsLan(f: LicenseFields): boolean {
  return hasFeature(f, 'lan');
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
  if (
    !f.anyVersion &&
    (compareVersion(env.gameVersion, f.gameMin) < 0 || compareVersion(env.gameVersion, f.gameMax) > 0)
  ) {
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
  const scope = hasFeature(f, 'lan') ? '单机 + 联机' : '仅单机';
  const feats = featureLabelOfMask(f.flags);
  const range = f.anyVersion ? '任意版本' : `v${f.gameMin}–v${f.gameMax}`;
  return `编号 ${f.serial} · 创建于 ${created} · 批次「${f.batch}」 · ${scope} · 功能 ${feats.length}/${DEV_FEATURES.length}（${feats.join('、') || '无'}） · 工具 v${f.toolMin}–v${f.toolMax} · 游戏 ${range} · 有效期 ${expires}`;
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
