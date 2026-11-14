import type { DueRule, PaymentFrequency } from './types'

type ContributionSchedule = {
  due_rule: DueRule
  first_due_date: string | null
  due_day: number | null
  frequency?: PaymentFrequency
  due_weekday?: number
}

const DAY_MS = 86_400_000

function dateString(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function dateOnly(value: Date | string) {
  if (typeof value === 'string') return value.slice(0, 10)
  return dateString(value.getFullYear(), value.getMonth(), value.getDate())
}

function dateIndex(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return Date.UTC(year, month - 1, day) / DAY_MS
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function isWeekly(frequency?: PaymentFrequency) {
  return frequency === 'weekly' || frequency === 'biweekly'
}

export function periodWord(frequency?: PaymentFrequency): 'week' | 'month' {
  return isWeekly(frequency) ? 'week' : 'month'
}

export function periodLabels(frequency?: PaymentFrequency) {
  const period = periodWord(frequency)
  return { thisPeriod: `This ${period}`, nextPeriod: `Next ${period}` }
}

export function frequencyLabel(frequency: PaymentFrequency) {
  switch (frequency) {
    case 'weekly': return 'every week'
    case 'biweekly': return 'every 2 weeks'
    case 'monthly': return 'every month'
    case 'quarterly': return 'every 3 months'
    case 'yearly': return 'every year'
    case 'one_time': return 'one time'
  }
}

export function contributionMonthChoices(today = new Date()) {
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const value = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  return [
    { value: value(thisMonth), label: 'This month' },
    { value: value(nextMonth), label: 'Next month' },
  ]
}

export function nextWeekdayDate(today: Date | string, weekday: number) {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new Error('A valid weekday is required.')
  }
  const todayValue = dateOnly(today)
  const currentWeekday = new Date(`${todayValue}T00:00:00Z`).getUTCDay()
  const daysUntil = (weekday - currentWeekday + 7) % 7 || 7
  return addDays(todayValue, daysUntil)
}

export function nextScheduledDate(schedule: ContributionSchedule, from: Date | string, includeFromDate = true): string | null {
  if (!schedule.first_due_date) return null
  const anchor = schedule.first_due_date.slice(0, 10)
  const fromValue = dateOnly(from)
  const anchorIndex = dateIndex(anchor)
  const fromIndex = dateIndex(fromValue)
  const interval = schedule.frequency === 'biweekly' ? 14 : 7
  if (!isWeekly(schedule.frequency)) return null

  if (anchorIndex > fromIndex) return anchor
  const daysSinceAnchor = fromIndex - anchorIndex
  const periods = includeFromDate
    ? Math.ceil(daysSinceAnchor / interval)
    : Math.floor(daysSinceAnchor / interval) + 1
  return addDays(anchor, Math.max(periods, 0) * interval)
}

export function firstContributionDate(group: ContributionSchedule, joinedAt: Date | string): string {
  const joinedValue = dateOnly(joinedAt)
  if (Number.isNaN(dateIndex(joinedValue))) throw new Error('A valid join date is required.')

  if (isWeekly(group.frequency)) {
    const weekday = group.first_due_date
      ? new Date(`${group.first_due_date.slice(0, 10)}T00:00:00Z`).getUTCDay()
      : group.due_weekday ?? 5
    const anchor = group.first_due_date?.slice(0, 10)
    if (!anchor) return nextWeekdayDate(joinedValue, weekday)
    const anchorIndex = dateIndex(anchor)
    const joinedIndex = dateIndex(joinedValue)
    if (anchorIndex > joinedIndex) return anchor
    const interval = group.frequency === 'biweekly' ? 14 : 7
    const periods = Math.floor((joinedIndex - anchorIndex) / interval) + 1
    return addDays(anchor, periods * interval)
  }

  const joined = new Date(`${joinedValue}T00:00:00`)
  if (Number.isNaN(joined.getTime())) throw new Error('A valid join date is required.')
  const nextMonth = new Date(joined.getFullYear(), joined.getMonth() + 1, 1)
  const groupStart = group.first_due_date
    ? new Date(`${group.first_due_date.slice(0, 10)}T00:00:00`)
    : null
  const firstMonth = groupStart && groupStart > nextMonth
    ? new Date(groupStart.getFullYear(), groupStart.getMonth(), 1)
    : nextMonth

  if (group.due_rule === 'month_end') {
    return dateString(firstMonth.getFullYear(), firstMonth.getMonth(), 1)
  }
  return dateString(firstMonth.getFullYear(), firstMonth.getMonth(), Math.min(Math.max(group.due_day ?? 1, 1), 28))
}

export function contributionDateForMonth(group: ContributionSchedule, monthValue: string): string {
  const [year, month] = monthValue.split('-').map(Number)
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('A valid contribution month is required.')
  }
  const day = group.due_rule === 'month_end'
    ? 1
    : Math.min(Math.max(group.due_day ?? 1, 1), 28)
  return dateString(year, month - 1, day)
}

export function contributionPeriodChoices(group: ContributionSchedule, today = new Date()) {
  if (isWeekly(group.frequency)) {
    const first = firstContributionDate(group, today)
    const interval = group.frequency === 'biweekly' ? 14 : 7
    return [
      { value: first, label: 'This week' },
      { value: addDays(first, interval), label: 'Next week' },
    ]
  }

  return contributionMonthChoices(today)
}

export function contributionDateForPeriod(group: ContributionSchedule, periodValue: string): string {
  if (isWeekly(group.frequency)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodValue) || Number.isNaN(dateIndex(periodValue))) {
      throw new Error('A valid contribution date is required.')
    }
    return periodValue
  }
  const groupStartMonth = group.first_due_date?.slice(0, 7)
  const eligibleMonth = groupStartMonth && groupStartMonth > periodValue ? groupStartMonth : periodValue
  return contributionDateForMonth(group, eligibleMonth)
}
