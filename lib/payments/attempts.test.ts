import { describe, expect, it } from 'vitest'
import { findReusablePaymentAttempt } from './attempts'
import type { PaymentAttempt } from '@/lib/types'

const now = new Date('2026-01-01T00:00:00.000Z')

function attempt(overrides: Partial<PaymentAttempt> = {}): PaymentAttempt {
  return {
    id: 'attempt-1',
    group_id: 'group-1',
    member_id: 'member-1',
    amount: 5000,
    status: 'open',
    reference_number: 'PLK-ref',
    account_number: '1234567890',
    bank_name: 'Paga',
    total_amount: 5025,
    expires_at: '2026-01-01T00:11:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('findReusablePaymentAttempt', () => {
  it('reuses only a matching open attempt that remains valid for more than ten minutes', () => {
    expect(findReusablePaymentAttempt([attempt()], 5000, now)?.id).toBe('attempt-1')
    expect(findReusablePaymentAttempt([attempt({ amount: 5001 })], 5000, now)).toBeNull()
    expect(findReusablePaymentAttempt([attempt({ status: 'expired' })], 5000, now)).toBeNull()
    expect(findReusablePaymentAttempt([attempt({ expires_at: '2026-01-01T00:10:00.000Z' })], 5000, now)).toBeNull()
  })
})
