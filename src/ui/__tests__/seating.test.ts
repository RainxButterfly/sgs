import { describe, expect, it } from 'vitest';
import { COMPACT_SEAT_LAYOUT, WIDE_SEAT_LAYOUT, seatRingIndex, tableRingIndex } from '../seating';

const ANCHOR: [number, number] = [50, 95];

function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

describe('座位环状布局', () => {
  for (const [label, layouts] of [
    ['宽屏', WIDE_SEAT_LAYOUT],
    ['紧凑', COMPACT_SEAT_LAYOUT],
  ] as const) {
    for (let m = 1; m <= 7; m += 1) {
      it(`${label} ${m} 个对手：相邻桌号视觉相邻，首尾接自己`, () => {
        const layout = layouts[m];
        expect(layout).toHaveLength(m);
        for (const [x, y] of layout) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(100);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(100);
        }
        expect(new Set(layout.map((p) => p.join(','))).size).toBe(m);
        for (let i = 1; i < m; i += 1) {
          expect(dist(layout[i - 1], layout[i])).toBeLessThanOrEqual(60);
        }
        if (m >= 3) {
          expect(dist(ANCHOR, layout[0])).toBeLessThanOrEqual(60);
          expect(dist(layout[m - 1], ANCHOR)).toBeLessThanOrEqual(60);
          expect(layout[0][0]).toBeGreaterThan(50);
          expect(layout[m - 1][0]).toBeLessThan(50);
          expect(layout[0][1]).toBeGreaterThan(40);
          expect(layout[m - 1][1]).toBeGreaterThan(40);
        }
      });
    }
  }

  it('seatRingIndex 从右侧邻座开始绕桌一圈', () => {
    expect(seatRingIndex(3, 2, 5)).toBe(1);
    expect(seatRingIndex(1, 2, 5)).toBe(4);
    expect(seatRingIndex(2, 2, 5)).toBe(0);
    expect(seatRingIndex(0, 6, 8)).toBe(2);
    expect(seatRingIndex(7, 0, 8)).toBe(7);
  });

  it('左右邻座落在环的两端，距离 1 的座位视觉最近', () => {
    for (const layouts of [WIDE_SEAT_LAYOUT, COMPACT_SEAT_LAYOUT]) {
      for (let m = 3; m <= 7; m += 1) {
        const n = m + 1;
        const humanSeat = 2;
        const right = seatRingIndex((humanSeat + 1) % n, humanSeat, n);
        const left = seatRingIndex((humanSeat - 1 + n) % n, humanSeat, n);
        expect(right).toBe(1);
        expect(left).toBe(m);
        const layout = layouts[m];
        const dRight = dist(ANCHOR, layout[right - 1]);
        const dLeft = dist(ANCHOR, layout[left - 1]);
        for (let rel = 2; rel < m; rel += 1) {
          const seatDist = Math.min(rel, n - rel);
          if (seatDist > 1) {
            expect(dist(ANCHOR, layout[rel - 1])).toBeGreaterThanOrEqual(Math.min(dLeft, dRight) - 1);
          }
        }
      }
    }
  });

  it('tableRingIndex 桌号 +1 恒在右侧第一个位置，两种方向都成立', () => {
    for (const direction of [1, -1] as const) {
      for (const n of [2, 5, 8]) {
        const humanSeat = 3 % n;
        const next = (humanSeat + direction + n) % n;
        const prev = (humanSeat - direction + n) % n;
        expect(tableRingIndex(next, humanSeat, n, direction)).toBe(1);
        expect(tableRingIndex(prev, humanSeat, n, direction)).toBe(n - 1);
        expect(tableRingIndex(humanSeat, humanSeat, n, direction)).toBe(0);
        for (let offset = 0; offset < n; offset += 1) {
          const seat = (humanSeat + offset * direction + n * n) % n;
          expect(tableRingIndex(seat, humanSeat, n, direction)).toBe(offset);
        }
      }
    }
  });
});