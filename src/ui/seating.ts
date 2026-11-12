export type SeatLayout = [number, number][];

/**
 * 武将牌围桌位置（牌桌区百分比，座位以中心点定位）。
 * 顺序：自己右手第一位开始，沿右侧向上、越过桌顶、再由左侧回到自己左手边。
 * 顶排保持 20%+ 距离以避开顶栏与圆角，底部不超过 78% 以避开牌堆条，
 * 中间 40%~75% / 20%~80% 的矩形留给中央出牌区。
 */
export const WIDE_SEAT_LAYOUT: Record<number, SeatLayout> = {
  1: [[50, 24]],
  2: [[68, 24], [32, 24]],
  3: [[88, 52], [50, 22], [12, 52]],
  4: [[88, 72], [74, 22], [26, 22], [12, 72]],
  5: [[88, 76], [88, 40], [50, 21], [12, 40], [12, 76]],
  6: [[88, 76], [88, 40], [72, 21], [28, 21], [12, 40], [12, 76]],
  7: [[88, 78], [88, 38], [76, 21], [50, 20], [24, 21], [12, 38], [12, 78]],
};

export const COMPACT_SEAT_LAYOUT: Record<number, SeatLayout> = {
  1: [[50, 24]],
  2: [[66, 24], [34, 24]],
  3: [[86, 52], [50, 22], [14, 52]],
  4: [[86, 70], [72, 22], [28, 22], [14, 70]],
  5: [[86, 76], [86, 40], [50, 21], [14, 40], [14, 76]],
  6: [[86, 76], [86, 40], [70, 21], [30, 21], [14, 40], [14, 76]],
  7: [[86, 78], [86, 38], [74, 21], [50, 20], [26, 21], [14, 38], [14, 78]],
};

/** 座位相对自己的偏移，不随回合方向翻转。 */
export function seatRingIndex(playerSeat: number, humanSeat: number, total: number): number {
  if (total <= 0) return 0;
  return ((playerSeat - humanSeat) % total + total) % total;
}

/** 桌号相对自己的偏移：桌号 +1 落在右侧第一个位置，方向只改变编号走向。 */
export function tableRingIndex(
  playerSeat: number,
  humanSeat: number,
  total: number,
  direction: 1 | -1,
): number {
  if (total <= 0) return 0;
  return (((playerSeat - humanSeat) * direction) % total + total) % total;
}
