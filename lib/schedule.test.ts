import { describe, expect, it } from 'vitest'
import {
  contributionDateForMonth,
  contributionDateForPeriod,
  contributionMonthChoices,
  contributionPeriodChoices,
  firstContributionDate,
  nextWeekdayDate,
} from './schedule'

describe('firstContributionDate', () => {
  it('offers the current and next month as start choices', () => {
    expect(contributionMonthChoices(new Date('2026-11-14T12:00:00'))).toEqual([
      { value: '2026-11', label: 'This month' },
      { value: '2026-12', label: 'Next month' },
    ])
  })

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

  it('uses the selected start month for fixed and month-end groups', () => {
    expect(contributionDateForMonth({ due_rule: 'fixed', first_due_date: null, due_day: 15 }, '2026-11'))
      .toBe('2026-11-15')
    expect(contributionDateForMonth({ due_rule: 'month_end', first_due_date: null, due_day: 5 }, '2026-11'))
      .toBe('2026-11-01')
  })

  it('uses the next matching weekday strictly after today', () => {
    expect(nextWeekdayDate('2026-11-20', 5)).toBe('2026-11-27')
    expect(firstContributionDate({
      frequency: 'weekly',
      due_rule: 'fixed',
      first_due_date: null,
      due_day: 5,
      due_weekday: 5,
    }, '2026-11-20')).toBe('2026-11-27')
  })

  it('keeps biweekly member dates aligned to the group start date', () => {
    expect(firstContributionDate({
      frequency: 'biweekly',
      due_rule: 'fixed',
      first_due_date: '2026-11-20',
      due_day: 5,
    }, '2026-11-21')).toBe('2026-12-04')
  })

  it('offers the next scheduled date and the following cadence for weekly starts', () => {
    const schedule = {
      frequency: 'weekly' as const,
      due_rule: 'fixed' as const,
      first_due_date: null,
      due_day: 5,
      due_weekday: 5,
    }
    const choices = contributionPeriodChoices(schedule, new Date('2026-11-18T12:00:00'))
    expect(choices).toEqual([
      { value: '2026-11-20', label: 'This week' },
      { value: '2026-11-27', label: 'Next week' },
    ])
    expect(contributionDateForPeriod(schedule, choices[1].value)).toBe('2026-11-27')
  })

  it('uses the full two-week cadence for biweekly start choices', () => {
    expect(contributionPeriodChoices({
      frequency: 'biweekly',
      due_rule: 'fixed',
      first_due_date: null,
      due_day: 5,
      due_weekday: 5,
    }, new Date('2026-11-18T12:00:00'))).toEqual([
      { value: '2026-11-20', label: 'This week' },
      { value: '2026-12-04', label: 'Next week' },
    ])
  })
})
