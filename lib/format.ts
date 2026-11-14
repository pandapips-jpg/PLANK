import type { PaymentFrequency } from './types'

export function money(value: number): string {
  return `₦${value.toLocaleString('en-NG')}`
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase()
}

export function friendlyDate(value: string): string {
  return new Date(value).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function scheduleDate(value: string, frequency: PaymentFrequency): string {
  if (frequency !== 'weekly' && frequency !== 'biweekly') return friendlyDate(value)
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  const weekday = date.toLocaleDateString('en-NG', { weekday: 'short' })
  const day = date.toLocaleDateString('en-NG', { day: 'numeric' })
  const month = date.toLocaleDateString('en-NG', { month: 'short' })
  return `${weekday} ${day} ${month}`
}
