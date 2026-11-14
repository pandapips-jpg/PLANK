import type { Charge, DueRule, PaymentFrequency } from './types'
import { nextScheduledDate } from './schedule'

export type PaymentPageState =
  | { kind: 'due'; amount: number }
  | { kind: 'upcoming'; amount: number; dueDate: string }
  | { kind: 'paid' }
  | { kind: 'first_bill_not_set_up' }

type PaymentSchedule = {
  charges: Charge[]
  amount: number
  frequency: PaymentFrequency
  due_rule: DueRule
  due_day: number | null
  first_due_date: string | null
  group_first_due_date: string | null
}

function monthIndex(value: string) {
  const [year, month] = value.slice(0, 7).split('-').map(Number)
  return year * 12 + month - 1
}

function dateOnly(value: Date | string) {
  if (typeof value === 'string') return value.slice(0, 10)
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

function isWeekly(frequency: PaymentFrequency) {
  return frequency === 'weekly' || frequency === 'biweekly'
}

function weekEndDate(today: Date) {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  date.setDate(date.getDate() + ((7 - date.getDay()) % 7))
  return dateOnly(date)
}

function formatDueDate(monthIndexValue: number, dueRule: DueRule, dueDay: number | null, chargeDay?: number) {
  const yearValue = Math.floor(monthIndexValue / 12)
  const month = monthIndexValue % 12
  const day = dueRule === 'month_end'
    ? new Date(yearValue, month + 1, 0).getDate()
    : Math.min(Math.max(chargeDay ?? dueDay ?? 1, 1), 28)
  return `${yearValue}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function upcomingScheduleDate(schedule: PaymentSchedule, today: Date) {
  if (!schedule.first_due_date) return null
  if (isWeekly(schedule.frequency)) {
    return nextScheduledDate(schedule, today, true)
  }
  const currentMonth = today.getFullYear() * 12 + today.getMonth()
  const startMonth = monthIndex(schedule.first_due_date)
  const interval = schedule.frequency === 'quarterly' ? 3 : schedule.frequency === 'yearly' ? 12 : schedule.frequency === 'one_time' ? 0 : 1
  const nextMonth = interval > 0 && startMonth < currentMonth
    ? startMonth + Math.ceil((currentMonth - startMonth) / interval) * interval
    : startMonth
  return formatDueDate(nextMonth, schedule.due_rule, schedule.due_day)
}

export function getPaymentPageState(schedule: PaymentSchedule, today = new Date()): PaymentPageState {
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const dueThrough = isWeekly(schedule.frequency) ? weekEndDate(today) : null
  const openCharges = schedule.charges
    .filter((charge) => Number(charge.paid_amount) < Number(charge.amount))
    .sort((a, b) => a.due_date.slice(0, 10).localeCompare(b.due_date.slice(0, 10)))
  const dueAmount = openCharges
    .filter((charge) => isWeekly(schedule.frequency)
      ? charge.due_date.slice(0, 10) <= dueThrough!
      : charge.due_date.slice(0, 7) <= thisMonth)
    .reduce((sum, charge) => sum + Math.max(Number(charge.amount) - Number(charge.paid_amount), 0), 0)
  if (dueAmount > 0) return { kind: 'due', amount: Number(dueAmount.toFixed(2)) }

  const nextCharge = openCharges[0]
  if (nextCharge) {
    if (isWeekly(schedule.frequency)) {
      return {
        kind: 'upcoming',
        amount: Number((Number(nextCharge.amount) - Number(nextCharge.paid_amount)).toFixed(2)),
        dueDate: nextCharge.due_date.slice(0, 10),
      }
    }
    const dueMonth = monthIndex(nextCharge.due_date)
    const chargeDay = Number(nextCharge.due_date.slice(8, 10))
    const dueDate = formatDueDate(dueMonth, schedule.due_rule, schedule.due_day, chargeDay)
    return {
      kind: 'upcoming',
      amount: Number((Number(nextCharge.amount) - Number(nextCharge.paid_amount)).toFixed(2)),
      dueDate,
    }
  }

  if (schedule.charges.length > 0) return { kind: 'paid' }
  if (!schedule.group_first_due_date) return { kind: 'first_bill_not_set_up' }
  const scheduledDate = upcomingScheduleDate({
    ...schedule,
    first_due_date: schedule.first_due_date ?? schedule.group_first_due_date,
  }, today)
  if (!scheduledDate) return { kind: 'first_bill_not_set_up' }
  if (isWeekly(schedule.frequency)) {
    if (scheduledDate <= dueThrough!) return { kind: 'due', amount: Number(schedule.amount.toFixed(2)) }
    return { kind: 'upcoming', amount: Number(schedule.amount.toFixed(2)), dueDate: scheduledDate }
  }
  if (scheduledDate.slice(0, 7) <= thisMonth) return { kind: 'due', amount: Number(schedule.amount.toFixed(2)) }
  return { kind: 'upcoming', amount: Number(schedule.amount.toFixed(2)), dueDate: scheduledDate }
}
