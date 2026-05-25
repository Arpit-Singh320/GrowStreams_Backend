export const REWARDS_FROZEN = false;

export function shouldFreezeReward(delta) {
  return REWARDS_FROZEN && Number(delta) > 0;
}
