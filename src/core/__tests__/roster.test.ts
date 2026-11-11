import { describe, expect, it } from 'vitest';
import { HEROES, PLAYABLE_HEROES } from '../deck';

describe('武将名册', () => {
  it('不再包含孙笨测试武将（孙笨是测试组成员，不是武将）', () => {
    expect(HEROES.some((hero) => hero.id === 'sunben')).toBe(false);
    expect(HEROES.some((hero) => hero.name === '孙笨')).toBe(false);
  });

  it('没有禁用武将，全部武将都可进入正常选将池', () => {
    expect(PLAYABLE_HEROES.length).toBe(HEROES.length);
  });
});