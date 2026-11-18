type PaymentRecord = { amount: number; paid_at: string }
type LedgerEntry = { amount: number; at: string }

function paymentKey(amount: number, at: string) {
  const timestamp = new Date(at).getTime()
  return `${Number(amount).toFixed(2)}:${Number.isFinite(timestamp) ? timestamp : at}`
}

export function createDemoPaymentMatcher(payments: readonly PaymentRecord[]) {
  const remaining = new Map<string, number>()
  for (const payment of payments) {
    const key = paymentKey(payment.amount, payment.paid_at)
    remaining.set(key, (remaining.get(key) ?? 0) + 1)
  }

  return (entry: LedgerEntry) => {
    const key = paymentKey(entry.amount, entry.at)
    const count = remaining.get(key) ?? 0
    if (count === 0) return false
    if (count === 1) remaining.delete(key)
    else remaining.set(key, count - 1)
    return true
  }
}
