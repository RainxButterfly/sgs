import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  ANY_VERSION_MAX,
  ANY_VERSION_MIN,
  DEV_TOOL_VERSION,
  licenseProblem,
  parseLicense,
  signLicense,
  verifyLicense,
  type LicenseEnv,
  type LicenseFields,
} from '../license';

const html = fs.readFileSync('tools/license-generator.html', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

function loadCore() {
  const start = html.indexOf('/* ===== LICENSE-CORE-START');
  const end = html.indexOf('/* ===== LICENSE-CORE-END');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const code = html.slice(start, end);
  const sandbox: Record<string, unknown> = {
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.__LICENSE_CORE__ as {
    SECRET: string;
    DEV_TOOL_VERSION: number;
    DEFAULT_GAME_VERSION: string;
    signLicense: (f: LicenseFields) => Promise<string>;
    parseLicense: (code: string) => ReturnType<typeof parseLicense>;
    verifyLicense: (code: string) => Promise<LicenseFields | null>;
    licenseProblem: (f: LicenseFields, env: LicenseEnv) => string | null;
    hmacPure: (key: string, msg: string) => string;
    payloadOf: (f: LicenseFields) => string;
  };
}

const core = loadCore();

const vectors: LicenseFields[] = [
  { created: '20261111', batch: '武器专项', serial: 'a3f2c1', scope: 'solo', anyVersion: false, toolMin: 1, toolMax: 1, gameMin: '0.9.11', gameMax: '0.9.11', expires: '20261211' },
  { created: '20261111', batch: '国战双将', serial: 'b7e9d2', scope: 'lan', anyVersion: false, toolMin: 1, toolMax: 2, gameMin: '0.9.10', gameMax: '0.9.12', expires: '' },
  { created: '20260101', batch: '回归测试', serial: '00ff12', scope: 'lan', anyVersion: true, toolMin: 2, toolMax: 3, gameMin: '0.10.0', gameMax: '0.10.5', expires: '20270101' },
];

const env: LicenseEnv = { gameVersion: '0.9.11', toolVersion: 1, revoked: [], revokedSerials: [], today: '20261111' };

describe('本地图形生成器与游戏校验一致', () => {
  it('默认游戏版本与工具版本跟随当前 package', () => {
    expect(core.DEFAULT_GAME_VERSION).toBe(pkg.version);
    expect(core.DEV_TOOL_VERSION).toBe(DEV_TOOL_VERSION);
  });

  it('签名结果与 src/dev/license.ts 完全一致', async () => {
    for (const f of vectors) {
      expect(await core.signLicense(f)).toBe(await signLicense(f));
    }
  });

  it('纯 JS 兜底签名与 crypto.subtle 一致', async () => {
    for (const f of vectors) {
      const canonical = await signLicense(f);
      const sig = canonical.slice(canonical.lastIndexOf('.') + 1);
      // 任意版本授权会归一化成 0.0.0~99.99.99 再签名
      const normalized = f.anyVersion ? { ...f, gameMin: ANY_VERSION_MIN, gameMax: ANY_VERSION_MAX } : f;
      expect(core.hmacPure(core.SECRET, core.payloadOf(normalized)).slice(0, 12)).toBe(sig);
    }
  });

  it('解析与校验结果一致', async () => {
    for (const f of vectors) {
      const code = await signLicense(f);
      expect(core.parseLicense(code)).toEqual(parseLicense(code));
      expect(await core.verifyLicense(code)).toEqual(await verifyLicense(code));
    }
  });

  it('范围与吊销判断一致', async () => {
    const f = vectors[0];
    const cases: LicenseEnv[] = [
      env,
      { ...env, gameVersion: '0.9.12' },
      { ...env, gameVersion: '0.9.9' },
      { ...env, toolVersion: 3 },
      { ...env, revoked: ['武器专项'] },
      { ...env, revokedSerials: ['a3f2c1'] },
      { ...env, today: '20261212' },
    ];
    for (const e of cases) {
      expect(core.licenseProblem(f, e)).toBe(licenseProblem(f, e));
    }
  });

  it('生成器不打包进发布产物', () => {
    const vite = fs.readFileSync('vite.config.ts', 'utf8');
    expect(vite.includes('license-generator')).toBe(false);
    expect(html.includes('仅供开发者本地使用')).toBe(true);
  });
});