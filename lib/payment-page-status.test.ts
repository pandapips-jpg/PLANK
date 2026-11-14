import { describe, expect, it } from 'vitest'
import { getPaymentPageState } from './payment-page-status'
import type { Charge } from './types'

const today = new Date('2026-11-14T12:00:00')
const schedule = {
  amount: 5000,
  frequency: 'monthly' as const,
  due_rule: 'month_end' as const,
  due_day: 5,
  first_due_date: '2026-12-01',
  group_first_due_date: '2026-12-01',
}

function charge(due_date: string, amount: number, paid_amount = 0): Charge {
  return { member_id: 'member-1', due_date, amount, paid_amount }
}

describe('payment page state', () => {
  it('treats overdue and current-month charges as due', () => {
    expect(getPaymentPageState({
      ...schedule,
      charges: [charge('2026-10-01', 1000), charge('2026-11-01', 2000, 500), charge('2026-12-01', 5000)],
    }, today)).toEqual({ kind: 'due', amount: 2500 })
  })

  it('shows the next open charge and month-end deadline as upcoming', () => {
    expect(getPaymentPageState({ ...schedule, charges: [charge('2026-12-01', 5000)] }, today))
      .toEqual({ kind: 'upcoming', amount: 5000, dueDate: '2026-12-31' })
  })

  it('keeps a fixed upcoming charge date', () => {
    expect(getPaymentPageState({
      ...schedule,
      due_rule: 'fixed',
      charges: [charge('2026-12-15', 5000)],
    }, today)).toEqual({ kind: 'upcoming', amount: 5000, dueDate: '2026-12-15' })
  })

  it('distinguishes no configured start date from a future first bill', () => {
    expect(getPaymentPageState({ ...schedule, first_due_date: null, group_first_due_date: null, charges: [] }, today))
      .toEqual({ kind: 'first_bill_not_set_up' })
    expect(getPaymentPageState({ ...schedule, charges: [] }, today))
      .toEqual({ kind: 'upcoming', amount: 5000, dueDate: '2026-12-31' })
  })

  it('does not show the missing-first-bill state when only the group start date exists', () => {
    expect(getPaymentPageState({ ...schedule, first_due_date: null, charges: [] }, today))
      .toEqual({ kind: 'upcoming', amount: 5000, dueDate: '2026-12-31' })
  })

  it('shows all paid when there are bills but no open amount', () => {
    expect(getPaymentPageState({ ...schedule, charges: [charge('2026-11-01', 5000, 5000)] }, today))
      .toEqual({ kind: 'paid' })
  })

  it('treats a weekly bill due later in the current week as due', () => {
    expect(getPaymentPageState({
      ...schedule,
      frequency: 'weekly',
      due_rule: 'fixed',
      first_due_date: '2026-11-20',
      group_first_due_date: '2026-11-20',
      charges: [charge('2026-11-20', 5000)],
    }, new Date('2026-11-18T12:00:00'))).toEqual({ kind: 'due', amount: 5000 })
  })

  it('shows the next weekly charge as upcoming when it is in the following week', () => {
    expect(getPaymentPageState({
      ...schedule,
      frequency: 'weekly',
      due_rule: 'fixed',
      first_due_date: '2026-11-20',
      group_first_due_date: '2026-11-20',
      charges: [charge('2026-11-20', 5000)],
    }, today)).toEqual({ kind: 'upcoming', amount: 5000, dueDate: '2026-11-20' })
  })

  it('calculates the next biweekly bill when no charges exist yet', () => {
    expect(getPaymentPageState({
      ...schedule,
      frequency: 'biweekly',
      due_rule: 'fixed',
      first_due_date: '2026-11-13',
      group_first_due_date: '2026-11-13',
      charges: [],
    }, today)).toEqual({ kind: 'upcoming', amount: 5000, dueDate: '2026-11-27' })
  })
})
