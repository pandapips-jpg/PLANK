import { money } from './format'
import type { Charge, DueRule, PaymentFrequency } from './types'

export type MemberStatus = {
  state: 'paid' | 'due_soon' | 'overdue' | 'part_paid' | 'no_charges'
  label: string
  nextDue: string | null
  remaining: number
}

function dateOnly(value: string) {
  return value.slice(0, 10)
}

function formatDueDate(value: string) {
  return new Date(`${dateOnly(value)}T00:00:00`).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatMonthEndDate(value: string) {
  return new Date(`${dateOnly(value)}T00:00:00`).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
}

function formatDayAfter(value: string) {
  const date = new Date(`${dateOnly(value)}T00:00:00`)
  date.setDate(date.getDate() + 1)
  return date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
}

function daysBetween(later: string, earlier: string) {
  const laterTime = Date.parse(`${later}T00:00:00Z`)
  const earlierTime = Date.parse(`${earlier}T00:00:00Z`)
  return Math.floor((laterTime - earlierTime) / 86_400_000)
}

export function getMemberStatus(charges: Charge[], today: Date | string, frequency: PaymentFrequency = 'monthly', dueRule?: DueRule): MemberStatus {
  if (charges.length === 0) {
    return {
      state: 'no_charges',
      label: 'No bills yet',
      nextDue: null,
      remaining: 0,
    }
  }

  const todayDate = typeof today === 'string'
    ? today.slice(0, 10)
    : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const ordered = [...charges].sort((a, b) => dateOnly(a.due_date).localeCompare(dateOnly(b.due_date)))
  const open = ordered.filter((charge) => charge.paid_amount < charge.amount)
  const overdueCharges = open.filter((charge) => dateOnly(charge.due_date) < todayDate)
  const overdue = overdueCharges[0]

  if (overdue) {
    const daysOverdue = daysBetween(todayDate, dateOnly(overdue.due_date))
    return {
      state: 'overdue',
      label: dueRule === 'month_end'
        ? `Overdue since ${formatDayAfter(overdue.due_date)} · Overdue by ${daysOverdue} ${daysOverdue === 1 ? 'day' : 'days'}`
        : `Overdue by ${daysOverdue} ${daysOverdue === 1 ? 'day' : 'days'}`,
      nextDue: overdue.due_date,
      remaining: overdueCharges.reduce((sum, charge) => sum + charge.amount - charge.paid_amount, 0),
    }
  }

  const oldestOpen = open[0]
  if (oldestOpen?.paid_amount > 0) {
    return {
      state: 'part_paid',
      label: dueRule === 'month_end'
        ? `Part paid · Due by ${formatMonthEndDate(oldestOpen.due_date)}`
        : `Part paid ${money(oldestOpen.paid_amount)} of ${money(oldestOpen.amount)}`,
      nextDue: oldestOpen.due_date,
      remaining: oldestOpen.amount - oldestOpen.paid_amount,
    }
  }

  const soonDays = frequency === 'yearly' ? 30 : 14
  const dueSoon = open.find((charge) => {
    const daysUntil = daysBetween(dateOnly(charge.due_date), todayDate)
    const sameMonth = dateOnly(charge.due_date).slice(0, 7) === todayDate.slice(0, 7)
    return daysUntil >= 0 && (daysUntil <= soonDays || (dueRule === 'month_end' && sameMonth))
  })
  if (dueSoon) {
    const dueSoonCharges = open.filter((charge) => {
      const daysUntil = daysBetween(dateOnly(charge.due_date), todayDate)
      const sameMonth = dateOnly(charge.due_date).slice(0, 7) === todayDate.slice(0, 7)
      return daysUntil >= 0 && (daysUntil <= soonDays || (dueRule === 'month_end' && sameMonth))
    })
    return {
      state: 'due_soon',
      label: dueRule === 'month_end' ? `Due by ${formatMonthEndDate(dueSoon.due_date)}` : `Due ${formatDueDate(dueSoon.due_date)}`,
      nextDue: dueSoon.due_date,
      remaining: dueSoonCharges.reduce((sum, charge) => sum + charge.amount - charge.paid_amount, 0),
    }
  }

  const nextCharge = open.find((charge) => dateOnly(charge.due_date) >= todayDate)
  return {
    state: 'paid',
    label: nextCharge ? `Paid. Next due ${formatDueDate(nextCharge.due_date)}` : 'Paid',
    nextDue: nextCharge?.due_date ?? null,
    remaining: 0,
  }
}
