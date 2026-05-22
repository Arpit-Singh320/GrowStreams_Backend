export const REWARDS_FROZEN = true;

export function shouldFreezeReward(delta) {
  return REWARDS_FROZEN && Number(delta) > 0;
}
