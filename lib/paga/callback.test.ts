import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  MAX_CALLBACK_BODY_BYTES,
  processPagaCallback,
  readCallbackRequestBody,
  redactCallbackAuditBody,
  verifyPagaCallbackHash,
  type CallbackPayment,
  type PagaCallback,
  type PagaCallbackStore,
} from './callback'
import type { PaymentAttempt } from '@/lib/types'

const hashKey = 'test-hash-key'

function hash(value: string) {
  return createHash('sha512').update(value, 'utf8').digest('hex')
}

function callback(overrides: Partial<PagaCallback> = {}): PagaCallback {
  return {
    notificationId: 'notification-1',
    statusCode: '0',
    event: 'PAYMENT_COMPLETE',
    totalPaymentAmount: '103',
    outstandingBalance: '0.50',
    payerName: 'Ada Member',
    referenceNumber: 'PLK-reference',
    paymentMethod: 'BANK_TRANSFER',
    phoneNumber: '08012345678',
    callbackReferenceNumber: 'PAGA-transaction-1',
    hash: '',
    paidAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function callbackHash(value: PagaCallback, balance = value.outstandingBalance) {
  return hash([
    value.notificationId,
    value.statusCode,
    value.event,
    value.totalPaymentAmount,
    balance,
    value.payerName,
    value.referenceNumber,
    value.paymentMethod,
    value.phoneNumber,
    value.callbackReferenceNumber,
    hashKey,
  ].join(''))
}

function bodyFor(value: PagaCallback) {
  return JSON.stringify({ ...value, hash: callbackHash(value) })
}

function makeAttempt(): PaymentAttempt {
  return {
    id: 'attempt-1',
    group_id: 'group-1',
    member_id: 'member-1',
    amount: 100,
    status: 'open',
    reference_number: 'PLK-reference',
    account_number: '1234567890',
    bank_name: 'Paga',
    total_amount: 103,
    expires_at: '2026-01-01T01:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

function memoryStore(): PagaCallbackStore & {
  payments: CallbackPayment[]
  notifications: Array<{ group_id: string; member_id: string; kind: string; title: string; body: string }>
  attempt: PaymentAttempt
  outcomes: Map<string, string | null>
} {
  const events = new Map<string, { eventId: string; outcome: string | null }>()
  const payments: CallbackPayment[] = []
  const notifications: Array<{ group_id: string; member_id: string; kind: string; title: string; body: string }> = []
  const currentAttempt = makeAttempt()
  const outcomes = new Map<string, string | null>()
  return {
    payments,
    notifications,
    attempt: currentAttempt,
    outcomes,
    async saveReceived() {
      const id = `event-${events.size + 1}`
      events.set(id, { eventId: `pending-${id}`, outcome: null })
      return id
    },
    async claimNotification(eventRecordId, notificationId) {
      const existing = [...events.entries()].find(([, event]) => event.eventId === notificationId)
      if (existing) {
        return {
          recordId: existing[0],
          duplicateRecordId: eventRecordId,
          alreadyProcessed: existing[1].outcome?.startsWith('processed') === true
            || existing[1].outcome?.startsWith('amount_mismatch') === true,
        }
      }
      const event = events.get(eventRecordId)
      if (event) event.eventId = notificationId
      return { recordId: eventRecordId, duplicateRecordId: null, alreadyProcessed: false }
    },
    async finish(eventRecordId, _hashOk, outcome) {
      const event = events.get(eventRecordId)
      if (event) event.outcome = outcome
      outcomes.set(eventRecordId, outcome)
    },
    async findAttempt(referenceNumber) {
      return referenceNumber === currentAttempt.reference_number ? currentAttempt : null
    },
    async insertPayment(payment) {
      if (payments.some((saved) => saved.provider_reference === payment.provider_reference)) return 'duplicate'
      payments.push(payment)
      return 'inserted'
    },
    async markAttemptPaid() {
      currentAttempt.status = 'paid'
    },
    async markAttemptExpired() {
      currentAttempt.status = 'expired'
    },
    async getMemberName() {
      return 'Ada Member'
    },
    async insertNotification(input) {
      notifications.push(input)
    },
  }
}

describe('Paga callback verification and processing', () => {
  it('reads a callback body within the byte limit', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"event":"PAYMENT_COMPLETE"}'))
        controller.close()
      },
    })
    await expect(readCallbackRequestBody(body, '1')).resolves.toBe('{"event":"PAYMENT_COMPLETE"}')
  })

  it('limits streamed callback bodies before assembling them', async () => {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('x'.repeat(MAX_CALLBACK_BODY_BYTES / 2)))
        controller.enqueue(encoder.encode('x'.repeat(MAX_CALLBACK_BODY_BYTES / 2 + 1)))
        controller.close()
      },
    })
    await expect(readCallbackRequestBody(body, '1')).resolves.toBeNull()
  })

  it('keeps sensitive callback values out of the audit body', () => {
    const result = redactCallbackAuditBody(JSON.stringify({
      notificationId: 'notification-1',
      statusCode: '0',
      payerName: 'Ada Member',
      phoneNumber: '08012345678',
      hash: 'full-secret-hash',
      referenceNumber: 'PLK-reference',
    }))
    expect(result).toContain('notificationId')
    expect(result).not.toContain('Ada Member')
    expect(result).not.toContain('08012345678')
    expect(result).not.toContain('full-secret-hash')
  })

  it('verifies raw, plain-number, and fixed-two-decimal balance variants', () => {
    const value = callback()
    expect(verifyPagaCallbackHash(value, callbackHash(value), hashKey)).toEqual({ ok: true, variant: 'raw' })
    expect(verifyPagaCallbackHash(value, callbackHash(value, '0.5'), hashKey)).toEqual({ ok: true, variant: 'plain-number' })
    expect(verifyPagaCallbackHash(value, callbackHash(value, '0.50'), hashKey)).toEqual({ ok: true, variant: 'raw' })
    expect(verifyPagaCallbackHash(value, 'bad', hashKey)).toEqual({ ok: false })
  })

  it('records a payment and notification once when the same notification is delivered twice', async () => {
    const store = memoryStore()
    const body = bodyFor(callback())
    const first = await processPagaCallback(body, {}, hashKey, store)
    const duplicate = await processPagaCallback(body, {}, hashKey, store)
    expect(first.status).toBe(200)
    expect(duplicate.status).toBe(200)
    expect(store.payments).toHaveLength(1)
    expect(store.payments[0].amount).toBe(100)
    expect(store.notifications).toHaveLength(1)
    expect([...store.outcomes.values()].some((outcome) => outcome?.startsWith('processed; hash='))).toBe(true)
  })

  it('records the actual contribution amount and marks a total mismatch', async () => {
    const store = memoryStore()
    const value = callback({ totalPaymentAmount: '53' })
    await processPagaCallback(bodyFor(value), {}, hashKey, store)
    expect(store.payments[0].amount).toBe(50)
    expect([...store.outcomes.values()].some((outcome) => outcome?.startsWith('amount_mismatch; hash='))).toBe(true)
  })

  it('does not insert payments for an unknown reference', async () => {
    const store = memoryStore()
    const value = callback({ referenceNumber: 'missing-reference' })
    const result = await processPagaCallback(bodyFor(value), {}, hashKey, store)
    expect(result.status).toBe(200)
    expect(store.payments).toHaveLength(0)
    expect([...store.outcomes.values()].some((outcome) => outcome?.startsWith('unknown_reference; hash='))).toBe(true)
  })

  it('expires an open request on a verified expiry callback', async () => {
    const store = memoryStore()
    const value = callback({ event: 'PAYMENT_EXPIRED' })
    const result = await processPagaCallback(bodyFor(value), {}, hashKey, store)
    expect(result.status).toBe(200)
    expect(store.attempt.status).toBe('expired')
    expect(store.payments).toHaveLength(0)
  })
})
