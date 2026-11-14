import type { PaymentAttempt } from '@/lib/types'

export function findReusablePaymentAttempt(
  attempts: readonly PaymentAttempt[],
  amount: number,
  now: Date,
): PaymentAttempt | null {
  const reusableAfter = now.getTime() + 10 * 60 * 1000
  return attempts.find((attempt) =>
    attempt.status === 'open'
    && attempt.account_number !== null
    && attempt.bank_name !== null
    && attempt.total_amount !== null
    && attempt.expires_at !== null
    && Math.abs(Number(attempt.amount) - amount) < 0.01
    && new Date(attempt.expires_at).getTime() > reusableAfter,
  ) ?? null
}
