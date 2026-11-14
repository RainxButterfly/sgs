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
  it('0.9 整段合并为一个分组，并保留各版本明细', () => {
    expect(CHANGELOG[0].version).toBe('0.9.0~0.9.19');
    const versions = (CHANGELOG[0].versions ?? []).map((entry) => entry.version);
    expect(versions).toContain('0.9.19');
    expect(versions).toContain('0.9.16');
    expect(versions).toContain('0.9.15');
    expect(versions).toContain('0.9.14');
    expect(versions).toContain('0.9.13');
    expect(versions).toContain('0.9.0');
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
    const first = CHANGELOG[0].versions?.map((entry) => entry.version) ?? [];
    expect(first).toContain('0.9.10');
    expect(first).toContain('0.9.9');
    expect(CHANGELOG.map((entry) => entry.version).some((v) => v.startsWith('0.8'))).toBe(true);
  });
});