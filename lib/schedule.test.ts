import { describe, expect, it } from 'vitest'
import { firstContributionDate } from './schedule'

describe('firstContributionDate', () => {
  it('starts month-end contributions in the next month', () => {
    expect(firstContributionDate({
      due_rule: 'month_end',
      first_due_date: null,
      due_day: null,
    }, '2026-11-13')).toBe('2026-12-01')
  })

  it('uses the fixed day in the next contribution month', () => {
    expect(firstContributionDate({
      due_rule: 'fixed',
      first_due_date: null,
      due_day: 15,
    }, '2026-11-13')).toBe('2026-12-15')
  })

  it('does not start before the group start month', () => {
    expect(firstContributionDate({
      due_rule: 'month_end',
      first_due_date: '2027-03-01',
      due_day: null,
    }, '2026-11-13')).toBe('2027-03-01')
  })
})
