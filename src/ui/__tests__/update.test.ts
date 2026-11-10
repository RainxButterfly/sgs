import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkAndroidUpdateFromWeb } from '../update';

describe('移动端更新清单', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('并行尝试镜像并取最高版本', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      if (url.includes('fastly')) {
        return { ok: true, json: async () => ({ version: '0.9.9', notes: '', url: 'a', sha256: 's' }) };
      }
      if (url.includes('jsd.onmicrosoft')) {
        return { ok: true, json: async () => ({ version: '1.0.0', notes: '', url: 'b', sha256: 't' }) };
      }
      throw new Error('blocked');
    });

    const info = await checkAndroidUpdateFromWeb();
    expect(info?.version).toBe('1.0.0');
    expect(info?.android).toBe(true);
    expect(urls.length).toBeGreaterThanOrEqual(3);
  });

  it('所有镜像失败时抛出可读错误', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('blocked');
    });
    await expect(checkAndroidUpdateFromWeb()).rejects.toThrow('网页通道无法连接更新镜像');
  });

  it('清单没有更高版本时返回 null', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({ version: '0.0.1', notes: '', url: 'a', sha256: 's' }),
    }));
    await expect(checkAndroidUpdateFromWeb()).resolves.toBeNull();
  });
});
