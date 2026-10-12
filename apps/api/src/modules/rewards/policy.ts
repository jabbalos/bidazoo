/**
 * Reward policy: pure functions from a gameplay outcome to the grants the server will commit.
 * Numbers are placeholders for the vertical slice; correctness and auditability are the point.
 */
export type RewardKind = 'xp' | 'coins';

export interface Grant {
  kind: RewardKind;
  amount: number;
  /** Stable reason code. Together with the source event it makes the grant unique. */
  reason: string;
}

export const REWARD_POLICY = {
  correctAnswer: { xp: 10, coins: 2 },
  sessionCompletion: { xp: 25, coins: 10 },
} as const;

export function grantsForAttempt(outcome: { correct: boolean }): Grant[] {
  if (!outcome.correct) return [];
  return [
    { kind: 'xp', amount: REWARD_POLICY.correctAnswer.xp, reason: 'correct_answer' },
    { kind: 'coins', amount: REWARD_POLICY.correctAnswer.coins, reason: 'correct_answer' },
  ];
}

export function grantsForCompletion(): Grant[] {
  return [
    { kind: 'xp', amount: REWARD_POLICY.sessionCompletion.xp, reason: 'session_completion' },
    { kind: 'coins', amount: REWARD_POLICY.sessionCompletion.coins, reason: 'session_completion' },
  ];
}
