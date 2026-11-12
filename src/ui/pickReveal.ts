/**
 * 联机选将阶段，某个座位的武将是否应该亮出。
 *
 * - 自己选的武将始终可见；
 * - 全员锁定后（revealed）所有武将统一亮出；
 * - 身份场沿用旧习惯，主公先行亮将；
 * - 斗地主不提前亮任何人，避免通过亮将暴露地主/农民身份。
 *   2v2、国战、1v1 等模式下 isLord 恒为 false，同样不提前亮将。
 */
export function isPickHeroVisible(options: {
  isSelf: boolean;
  revealed: boolean;
  isLord: boolean;
  landlord: boolean;
}): boolean {
  const { isSelf, revealed, isLord, landlord } = options;
  if (isSelf) return true;
  if (revealed) return true;
  return !landlord && isLord;
}
