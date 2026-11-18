import { describe, expect, it } from 'vitest'
import { createDemoPaymentMatcher } from './demo-ledger'

describe('demo ledger payment matching', () => {
  it('marks each matching ledger row once, including duplicate amounts and timestamps', () => {
    const isDemoEntry = createDemoPaymentMatcher([
      { amount: 25, paid_at: '2026-01-02T03:04:05.000Z' },
      { amount: 25, paid_at: '2026-01-02T03:04:05.000Z' },
    ])

    expect(isDemoEntry({ amount: 25, at: '2026-01-02T03:04:05.000Z' })).toBe(true)
    expect(isDemoEntry({ amount: 25, at: '2026-01-02T03:04:05.000Z' })).toBe(true)
    expect(isDemoEntry({ amount: 25, at: '2026-01-02T03:04:05.000Z' })).toBe(false)
    expect(isDemoEntry({ amount: 30, at: '2026-01-02T03:04:05.000Z' })).toBe(false)
  })
})
