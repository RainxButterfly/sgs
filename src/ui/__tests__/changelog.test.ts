import { describe, expect, it } from 'vitest';
import { CHANGELOG, type ChangelogEntry } from '../changelog';

function allItems(entries: ChangelogEntry[]): string[] {
  const items: string[] = [];
  for (const entry of entries) {
    for (const section of entry.sections) items.push(...section.items);
    if (entry.versions) items.push(...allItems(entry.versions));
  }
  return items;
}

describe('更新日志', () => {
  it('最新版本为 0.9.14 且包含武将牌版式改动', () => {
    expect(CHANGELOG[0].version).toBe('0.9.14');
    expect(allItems([CHANGELOG[0]]).some((item) => item.includes('武将牌'))).toBe(true);
  });

  it('不暴露测试工具/授权码等内部能力，防止滥用', () => {
    const banned = ['测试工具', '授权码', '测试武将', '测试授权', 'Ctrl+Shift+D', 'devtool', '一人一码'];
    for (const item of allItems(CHANGELOG)) {
      for (const word of banned) {
        expect(item.includes(word), `更新日志不应出现「${word}」：${item}`).toBe(false);
      }
    }
  });

  it('历史版本未丢失', () => {
    const versions = CHANGELOG.map((entry) => entry.version);
    expect(versions).toContain('0.9.10');
    expect(versions).toContain('0.9.9');
    expect(versions.some((v) => v.startsWith('0.8'))).toBe(true);
  });
});