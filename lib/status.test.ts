import { describe, expect, it } from 'vitest'
import { getMemberStatus } from './status'

describe('member status', () => {
  it('does not mark a member paid when there are no charges', () => {
    expect(getMemberStatus([], '2026-11-07')).toEqual({
      state: 'no_charges',
      label: 'No bills yet',
      nextDue: null,
      remaining: 0,
    })
  })

  it('marks weekly bills due within three days with a weekday label', () => {
    expect(getMemberStatus([
      { member_id: 'm1', due_date: '2026-11-20', amount: 5000, paid_amount: 0 },
    ], '2026-11-17', 'weekly', 'fixed')).toMatchObject({
      state: 'due_soon',
      label: 'Due Fri 20 Nov',
      nextDue: '2026-11-20',
    })
  })

  it('shows the day after a weekly deadline when overdue', () => {
    expect(getMemberStatus([
      { member_id: 'm1', due_date: '2026-11-20', amount: 5000, paid_amount: 0 },
    ], '2026-11-21', 'biweekly', 'fixed')).toMatchObject({
      state: 'overdue',
      label: 'Overdue since Sat 21 Nov',
      nextDue: '2026-11-20',
    })
  })

  it('does not mark a weekly bill due soon when it is more than three days away', () => {
    expect(getMemberStatus([
      { member_id: 'm1', due_date: '2026-11-22', amount: 5000, paid_amount: 0 },
    ], '2026-11-17', 'weekly', 'fixed').state).toBe('paid')
  })
})
