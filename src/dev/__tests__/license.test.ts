import { describe, expect, it } from 'vitest';
import {
  compareVersion,
  licenseAllowsLan,
  licenseProblem,
  parseLicense,
  signLicense,
  verifyLicense,
  type LicenseFields,
} from '../license';

const base: LicenseFields = {
  created: '20261111',
  batch: '武器专项',
  serial: 'a3f2c1',
  scope: 'solo',
  anyVersion: false,
  toolMin: 1,
  toolMax: 2,
  gameMin: '0.9.10',
  gameMax: '0.9.12',
  expires: '20261211',
};

const env = {
  gameVersion: '0.9.10',
  toolVersion: 1,
  revoked: [] as string[],
  revokedSerials: [] as string[],
  today: '20261111',
};

describe('测试授权码（一人一码 XH3）', () => {
  it('签名后可校验，且明文段可读', async () => {
    const code = await signLicense(base);
    expect(code.startsWith('XH3.20261111.武器专项.a3f2c1.solo.fixed.1-2.0.9.10~0.9.12.20261211.')).toBe(true);
    const parsed = parseLicense(code);
    expect(parsed?.fields).toEqual(base);
    expect(await verifyLicense(code)).toEqual(base);
  });

  it('不同编号生成不同的码，编号纳入签名', async () => {
    const a = await signLicense(base);
    const b = await signLicense({ ...base, serial: 'b7c1d9' });
    expect(a).not.toBe(b);
    expect(parseLicense(b)?.fields.serial).toBe('b7c1d9');
    const swapped = a.replace('a3f2c1', 'b7c1d9');
    expect(await verifyLicense(swapped)).toBeNull();
  });

  it('篡改用途批次、编号或有效期后签名失效', async () => {
    const code = await signLicense(base);
    expect(await verifyLicense(code.replace('武器专项', '全部解锁'))).toBeNull();
    expect(await verifyLicense(code.replace('a3f2c1', 'ffffff'))).toBeNull();
    expect(await verifyLicense(code.replace('.20261211.', '.20271211.'))).toBeNull();
  });

  it('格式错误或旧版 XH1 授权码直接拒绝', async () => {
    expect(await verifyLicense('随便输入的码')).toBeNull();
    expect(await verifyLicense('XH3.20261111.QA.a3f2c1.solo.fixed.1-1.0.9.10~0.9.12.long.zzzzzzzzzzzz')).toBeNull();
    expect(parseLicense('XH3.20261111.QA.a3f2c1.solo.fixed.2-1.0.9.10~0.9.12.long.abcdefabcdef')).toBeNull();
    expect(parseLicense('XH1.20261111.QA.1-1.0.9.10~0.9.12.long.abcdefabcdef')).toBeNull();
  });

  it('联机授权与任意版本授权：标记纳入签名且不会被版本区间拦截', async () => {
    const lan = { ...base, scope: 'lan' as const };
    const code = await signLicense(lan);
    expect(code).toContain('.lan.fixed.');
    const verified = await verifyLicense(code);
    expect(verified?.scope).toBe('lan');
    expect(licenseAllowsLan(verified!)).toBe(true);
    expect(licenseAllowsLan((await verifyLicense(await signLicense(base)))!)).toBe(false);

    const any = { ...base, anyVersion: true };
    const anyCode = await signLicense(any);
    expect(anyCode).toContain('.any.');
    const anyVerified = await verifyLicense(anyCode);
    expect(anyVerified?.anyVersion).toBe(true);
    expect(licenseProblem(anyVerified!, { ...env, gameVersion: '9.9.9' })).toBeNull();

    // 篡改权限位会让签名失效
    expect(await verifyLicense(code.replace('.lan.', '.solo.'))).toBeNull();
    expect(await verifyLicense(anyCode.replace('.any.', '.fixed.'))).toBeNull();
  });

  it('版本区间、工具版本、批次/编号吊销与过期都会拦截', async () => {
    const fields = await verifyLicense(await signLicense(base));
    expect(fields).toBeTruthy();
    expect(licenseProblem(fields!, env)).toBeNull();
    expect(licenseProblem(fields!, { ...env, gameVersion: '0.9.13' })).toContain('游戏');
    expect(licenseProblem(fields!, { ...env, gameVersion: '0.9.9' })).toContain('游戏');
    expect(licenseProblem(fields!, { ...env, toolVersion: 3 })).toContain('工具');
    expect(licenseProblem(fields!, { ...env, revoked: ['武器专项'] })).toContain('批次');
    expect(licenseProblem(fields!, { ...env, revokedSerials: ['a3f2c1'] })).toContain('编号');
    expect(licenseProblem(fields!, { ...env, revokedSerials: ['other'] })).toBeNull();
    expect(licenseProblem(fields!, { ...env, today: '20261212' })).toContain('过期');
  });

  it('长期授权不检查过期', async () => {
    const fields = { ...base, expires: '' };
    const code = await signLicense(fields);
    expect(code).toContain('.long.');
    const verified = await verifyLicense(code);
    expect(licenseProblem(verified!, { ...env, today: '20991231' })).toBeNull();
  });

  it('版本号比较正确', () => {
    expect(compareVersion('0.9.10', '0.9.9')).toBe(1);
    expect(compareVersion('0.10.0', '0.9.12')).toBe(1);
    expect(compareVersion('1.0.0', '1.0.0')).toBe(0);
  });
});