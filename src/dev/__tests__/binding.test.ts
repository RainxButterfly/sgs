import { beforeEach, describe, expect, it } from 'vitest';
import { DEV_BINDING_KEY, getDeviceId, readBinding, resolveBinding } from '../binding';
import { signLicense, type LicenseEnv, type LicenseFields } from '../license';

const memory = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => (memory.has(key) ? memory.get(key)! : null),
  setItem: (key: string, value: string) => {
    memory.set(key, String(value));
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
  clear: () => memory.clear(),
};

beforeEach(() => {
  memory.clear();
  (globalThis as unknown as { localStorage: typeof localStorageMock }).localStorage = localStorageMock;
});

const env: LicenseEnv = {
  gameVersion: '0.9.10',
  toolVersion: 1,
  revoked: [],
  revokedSerials: [],
  today: '20261111',
};

async function makeLicense(serial: string, over: Partial<LicenseFields> = {}) {
  const fields: LicenseFields = {
    created: '20261111',
    batch: '武器专项',
    serial,
    scope: 'solo',
    anyVersion: false,
    toolMin: 1,
    toolMax: 2,
    gameMin: '0.9.10',
    gameMax: '0.9.12',
    expires: '20261211',
    ...over,
  };
  return { fields, code: await signLicense(fields) };
}

describe('一人一码本机绑定', () => {
  it('首次解锁创建绑定，设备号稳定', async () => {
    const a = await makeLicense('aaa111');
    const result = await resolveBinding(a.code, a.fields, env);
    expect(result.ok).toBe(true);
    const binding = readBinding();
    expect(binding?.serial).toBe('aaa111');
    expect(binding?.code).toBe(a.code);
    const device = getDeviceId();
    expect(device).toBeTruthy();
    expect(getDeviceId()).toBe(device);
  });

  it('同一编号重复解锁不改变绑定', async () => {
    const a = await makeLicense('aaa111');
    await resolveBinding(a.code, a.fields, env);
    const first = readBinding();
    const again = await resolveBinding(a.code, a.fields, env);
    expect(again.ok).toBe(true);
    expect(readBinding()?.activatedAt).toBe(first?.activatedAt);
  });

  it('本机已绑定有效码时拒绝改用其它码', async () => {
    const a = await makeLicense('aaa111');
    const b = await makeLicense('bbb222');
    await resolveBinding(a.code, a.fields, env);
    const result = await resolveBinding(b.code, b.fields, env);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('aaa111');
    expect(readBinding()?.serial).toBe('aaa111');
  });

  it('旧码被单独吊销后自动解绑，可换新码', async () => {
    const a = await makeLicense('aaa111');
    const b = await makeLicense('bbb222');
    await resolveBinding(a.code, a.fields, env);
    const result = await resolveBinding(b.code, b.fields, { ...env, revokedSerials: ['aaa111'] });
    expect(result.ok).toBe(true);
    expect(readBinding()?.serial).toBe('bbb222');
  });

  it('旧码超出版本范围后自动解绑（版本更新换码）', async () => {
    const a = await makeLicense('aaa111');
    const b = await makeLicense('bbb222', { gameMin: '0.9.13', gameMax: '0.9.15' });
    await resolveBinding(a.code, a.fields, env);
    const result = await resolveBinding(b.code, b.fields, { ...env, gameVersion: '0.9.13' });
    expect(result.ok).toBe(true);
    expect(readBinding()?.serial).toBe('bbb222');
  });

  it('绑定记录损坏时视为未绑定', async () => {
    memory.set(DEV_BINDING_KEY, '{bad json');
    expect(readBinding()).toBeNull();
    const a = await makeLicense('aaa111');
    const result = await resolveBinding(a.code, a.fields, env);
    expect(result.ok).toBe(true);
  });
});