import { describe, expect, it } from 'vitest';
import { isPickHeroVisible } from '../pickReveal';

const base = { isSelf: false, revealed: false, isLord: false, landlord: false };

describe('联机选将亮将时机', () => {
  it('自己选的武将始终可见', () => {
    expect(isPickHeroVisible({ ...base, isSelf: true })).toBe(true);
    expect(isPickHeroVisible({ ...base, isSelf: true, landlord: true })).toBe(true);
  });

  it('斗地主：未全员锁定时任何人都不能提前看到别人的武将', () => {
    // 地主（isLord）也要藏着，否则会暴露身份
    expect(isPickHeroVisible({ ...base, landlord: true, isLord: true })).toBe(false);
    expect(isPickHeroVisible({ ...base, landlord: true, isLord: false })).toBe(false);
  });

  it('斗地主：全员锁定后统一亮将', () => {
    expect(isPickHeroVisible({ ...base, landlord: true, revealed: true, isLord: true })).toBe(true);
    expect(isPickHeroVisible({ ...base, landlord: true, revealed: true, isLord: false })).toBe(true);
  });

  it('身份场：主公先行亮将，其余等全员锁定', () => {
    expect(isPickHeroVisible({ ...base, isLord: true })).toBe(true);
    expect(isPickHeroVisible({ ...base, isLord: false })).toBe(false);
    expect(isPickHeroVisible({ ...base, isLord: false, revealed: true })).toBe(true);
  });

  it('2v2 / 国战 / 1v1：没有主公位，全员锁定前不亮将', () => {
    expect(isPickHeroVisible({ ...base })).toBe(false);
    expect(isPickHeroVisible({ ...base, revealed: true })).toBe(true);
  });
});
