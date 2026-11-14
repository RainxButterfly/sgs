import { describe, expect, it } from 'vitest';
import { seatNumber, seatRelation, tableSeatLabel } from '../labels';
import { tableRingIndex } from '../seating';

const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八'];

describe('座次编号与牌桌一致', () => {
  it('选将页号位等于牌桌桌号（任意人数 / 方向 / 先手）', () => {
    for (const total of [2, 3, 4, 5, 6, 7, 8]) {
      for (const direction of [1, -1] as const) {
        for (let anchor = 0; anchor < total; anchor += 1) {
          for (let index = 0; index < total; index += 1) {
            const label = tableSeatLabel(anchor, direction, index, total);
            expect(label).toBe(NUMERALS[seatNumber(index, anchor, total, direction) - 1]);
          }
        }
      }
    }
  });

  it('相对位次与牌桌环序号一致', () => {
    for (const total of [2, 3, 4, 5, 8]) {
      for (const direction of [1, -1] as const) {
        for (let self = 0; self < total; self += 1) {
          for (let index = 0; index < total; index += 1) {
            expect(seatRelation(index, self, total, direction)).toBe(
              tableRingIndex(index, self, total, direction),
            );
          }
        }
      }
    }
  });

  it('逆时针（-1）时 1 号位的下家是 n 号位，不再正序递增', () => {
    const total = 4;
    const anchor = 2;
    expect(seatNumber(2, anchor, total, -1)).toBe(1);
    expect(seatNumber(1, anchor, total, -1)).toBe(2);
    expect(seatNumber(0, anchor, total, -1)).toBe(3);
    expect(seatNumber(3, anchor, total, -1)).toBe(4);
    // 顺时针（1）时按座位号正序递增
    expect(seatNumber(3, anchor, total, 1)).toBe(2);
    expect(seatNumber(0, anchor, total, 1)).toBe(3);
    expect(seatNumber(1, anchor, total, 1)).toBe(4);
  });
});
