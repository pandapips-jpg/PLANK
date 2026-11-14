import type { DueRule } from './types'

type ContributionSchedule = {
  due_rule: DueRule
  first_due_date: string | null
  due_day: number | null
}

function dateString(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function firstContributionDate(group: ContributionSchedule, joinedAt: Date | string): string {
  const joined = typeof joinedAt === 'string' ? new Date(`${joinedAt.slice(0, 10)}T00:00:00`) : joinedAt
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
