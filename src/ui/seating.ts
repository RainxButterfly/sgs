export type SeatLayout = [number, number][];

/** 以自己为中心：右侧邻座（桌号 +1）开始，向上绕桌一圈，最后到左侧邻座。 */
export const WIDE_SEAT_LAYOUT: Record<number, SeatLayout> = {
  1: [[50, 20]],
  2: [[68, 24], [32, 24]],
  3: [[84, 62], [50, 18], [16, 62]],
  4: [[88, 64], [72, 22], [28, 22], [12, 64]],
  5: [[90, 64], [88, 28], [50, 18], [12, 28], [10, 64]],
  6: [[90, 64], [90, 36], [72, 22], [28, 22], [10, 36], [10, 64]],
  7: [[90, 64], [90, 38], [76, 22], [50, 18], [24, 22], [10, 38], [10, 64]],
};

export const COMPACT_SEAT_LAYOUT: Record<number, SeatLayout> = {
  1: [[50, 22]],
  2: [[68, 24], [32, 24]],
  3: [[84, 58], [50, 20], [16, 58]],
  4: [[86, 60], [70, 22], [30, 22], [14, 60]],
  5: [[86, 62], [80, 26], [50, 20], [20, 26], [14, 62]],
  6: [[88, 58], [86, 32], [64, 20], [36, 20], [14, 32], [12, 58]],
  7: [[88, 62], [88, 38], [72, 22], [50, 18], [28, 22], [12, 38], [12, 62]],
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