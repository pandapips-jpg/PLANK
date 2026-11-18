import { createHash, timingSafeEqual } from 'node:crypto'
import { LosslessNumber, parse } from 'lossless-json'
import type { PaymentAttempt, PaymentProviderName } from '@/lib/types'

export const MAX_CALLBACK_BODY_BYTES = 32 * 1024

const callbackAuditFields = new Set([
  'notificationId',
  'statusCode',
  'event',
  'totalPaymentAmount',
  'outstandingBalance',
  'referenceNumber',
  'paymentMethod',
  'callbackReferenceNumber',
  'paidAt',
  'transactionDate',
  'timestamp',
  'state',
  'status',
])

export async function readCallbackRequestBody(
  body: ReadableStream<Uint8Array> | null,
  contentLength?: string | null,
): Promise<string | null> {
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_CALLBACK_BODY_BYTES) {
    return null
  }
  if (!body) return ''

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > MAX_CALLBACK_BODY_BYTES) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

export function redactCallbackAuditBody(rawBody: string) {
  try {
    const body: unknown = JSON.parse(rawBody)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return '[callback body redacted]'
    }
    const safeBody: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(body)) {
      if (callbackAuditFields.has(key)) safeBody[key] = value
    }
    return JSON.stringify(safeBody)
  } catch {
    return '[unparseable callback body redacted]'
  }
}

export type PagaCallback = {
  notificationId: string
  statusCode: string
  event: string
  totalPaymentAmount: string
  outstandingBalance: string
  payerName: string
  referenceNumber: string
  paymentMethod: string
  phoneNumber: string
  callbackReferenceNumber: string
  hash: string
  paidAt: string
}

export type CallbackPayment = {
  group_id: string
  member_id: string
  amount: number
  provider_reference: string
  provider: PaymentProviderName
  provider_fee: number
  payer_name: string | null
  paid_at: string
}

export type PaymentRecorderStore = {
  insertPayment(payment: CallbackPayment): Promise<'inserted' | 'duplicate'>
  markAttemptPaid(attemptId: string): Promise<void>
  getMemberName(memberId: string): Promise<string>
  insertNotification(input: {
    group_id: string
    member_id: string
    kind: string
    title: string
    body: string
  }): Promise<void>
}

export type PagaCallbackStore = PaymentRecorderStore & {
  saveReceived(headers: Record<string, string>, rawBody: string): Promise<string>
  claimNotification(
    eventRecordId: string,
    notificationId: string,
    eventType: string,
  ): Promise<{ recordId: string; duplicateRecordId: string | null; alreadyProcessed: boolean }>
  finish(eventRecordId: string, hashOk: boolean | null, outcome: string): Promise<void>
  findAttempt(referenceNumber: string): Promise<PaymentAttempt | null>
  markAttemptExpired(attemptId: string): Promise<void>
}

type ParsedCallback = {
  body: Record<string, unknown>
  callback: PagaCallback
}

function fieldText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof LosslessNumber) return value.toString()
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function parseCallback(rawBody: string): ParsedCallback {
  const parsed: unknown = parse(rawBody)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid callback body.')
  }
  const body = parsed as Record<string, unknown>
  return {
    body,
    callback: {
      notificationId: fieldText(body.notificationId),
      statusCode: fieldText(body.statusCode),
      event: fieldText(body.event),
      totalPaymentAmount: fieldText(body.totalPaymentAmount),
      outstandingBalance: fieldText(body.outstandingBalance),
      payerName: fieldText(body.payerName),
      referenceNumber: fieldText(body.referenceNumber),
      paymentMethod: fieldText(body.paymentMethod),
      phoneNumber: fieldText(body.phoneNumber),
      callbackReferenceNumber: fieldText(body.callbackReferenceNumber),
      hash: fieldText(body.hash ?? body.Hash),
      paidAt: fieldText(body.paidAt ?? body.transactionDate ?? body.timestamp),
    },
  }
}

function sha512(value: string) {
  return createHash('sha512').update(value, 'utf8').digest()
}

function safeHashEqual(expected: Buffer, providedText: string) {
  if (!/^[\da-f]{128}$/i.test(providedText)) return false
  const provided = Buffer.from(providedText, 'hex')
  return provided.length === expected.length && timingSafeEqual(expected, provided)
}

export function verifyPagaCallbackHash(
  callback: PagaCallback,
  providedHash: string,
  hashKey: string,
): { ok: true; variant: string } | { ok: false } {
  const baseFields = [
    callback.notificationId,
    callback.statusCode,
    callback.event,
  ]
  const trailingFields = [
    callback.payerName,
    callback.referenceNumber,
    callback.paymentMethod,
    callback.phoneNumber,
    callback.callbackReferenceNumber,
  ]
  const rawBalance = callback.outstandingBalance
  const numericBalance = rawBalance === '' ? null : Number(rawBalance)
  const balanceVariants: Array<{ value: string; name: string }> = [{ value: rawBalance, name: 'raw' }]
  if (numericBalance !== null && Number.isFinite(numericBalance)) {
    balanceVariants.push(
      { value: String(numericBalance), name: 'plain-number' },
      { value: numericBalance.toFixed(2), name: 'fixed-2' },
    )
  }
  const checked = new Set<string>()
  for (const balance of balanceVariants) {
    if (checked.has(balance.value)) continue
    checked.add(balance.value)
    const expected = sha512([
      ...baseFields,
      callback.totalPaymentAmount,
      balance.value,
      ...trailingFields,
      hashKey,
    ].join(''))
    if (safeHashEqual(expected, providedHash)) return { ok: true, variant: balance.name }
  }
  return { ok: false }
}

function completedOutcome(outcome: string | null) {
  return outcome?.startsWith('processed') === true
    || outcome?.startsWith('amount_mismatch') === true
    || outcome?.startsWith('duplicate') === true
}

function paymentDate(value: string) {
  if (!value) return new Date().toISOString()
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString()
}

function withHash(outcome: string, variant: string) {
  return `${outcome}; hash=${variant}`
}

export async function recordPayment(
  attempt: PaymentAttempt,
  payment: CallbackPayment,
  store: PaymentRecorderStore,
): Promise<'inserted' | 'duplicate'> {
  const inserted = await store.insertPayment(payment)
  await store.markAttemptPaid(attempt.id)
  if (inserted === 'duplicate') return inserted

  const memberName = await store.getMemberName(attempt.member_id)
  await store.insertNotification({
    group_id: attempt.group_id,
    member_id: attempt.member_id,
    kind: 'payment_received',
    title: 'Payment received',
    body: `${memberName} paid ${payment.amount.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}.`,
  })
  return inserted
}

export async function processPagaCallback(
  rawBody: string,
  headers: Record<string, string>,
  hashKey: string | (() => string),
  store: PagaCallbackStore,
  providedHash?: string,
): Promise<{ status: number }> {
  let eventRecordId: string
  try {
    eventRecordId = await store.saveReceived(headers, rawBody)
  } catch {
    return { status: 500 }
  }

  let parsed: ParsedCallback
  try {
    parsed = parseCallback(rawBody)
  } catch {
    await store.finish(eventRecordId, null, 'invalid_body')
    return { status: 400 }
  }

  const { body, callback } = parsed
  if (!callback.notificationId) {
    await store.finish(eventRecordId, null, 'missing_notification_id')
    return { status: 400 }
  }

  let recordId = eventRecordId
  try {
    const claim = await store.claimNotification(eventRecordId, callback.notificationId, callback.event || 'unknown')
    recordId = claim.recordId
    if (claim.duplicateRecordId) {
      await store.finish(
        claim.duplicateRecordId,
        null,
        claim.alreadyProcessed ? 'duplicate_processed' : 'duplicate_retry',
      )
    }
    if (claim.alreadyProcessed) return { status: 200 }
  } catch {
    await store.finish(eventRecordId, null, 'event_deduplication_failed')
    return { status: 500 }
  }

  let resolvedHashKey: string
  try {
    resolvedHashKey = typeof hashKey === 'function' ? hashKey() : hashKey
  } catch {
    await store.finish(recordId, null, 'hash_verification_unavailable')
    return { status: 500 }
  }
  const verification = verifyPagaCallbackHash(callback, providedHash || callback.hash, resolvedHashKey)
  if (!verification.ok) {
    await store.finish(recordId, false, 'bad_hash')
    return { status: 401 }
  }
  const outcome = async (value: string, status = 200) => {
    await store.finish(recordId, true, withHash(value, verification.variant))
    return { status }
  }

  const event = callback.event.toUpperCase()
  const state = fieldText(body.state ?? body.status).toUpperCase()
  const isExpired = /EXPIRE|CANCEL/.test(event) || /EXPIRE|CANCEL/.test(state)
  const isCompleted = callback.statusCode === '0' && (
    event === 'PAYMENT_COMPLETE' || state === 'CONSUMED'
  )
  if (!isExpired && !isCompleted) return outcome('ignored_event')

  const referenceNumber = callback.referenceNumber
  let attempt: PaymentAttempt | null
  try {
    attempt = await store.findAttempt(referenceNumber)
    if (!attempt) {
      const compactReference = referenceNumber.replace(/[^a-z0-9]/gi, '')
      if (compactReference && compactReference !== referenceNumber) {
        attempt = await store.findAttempt(compactReference)
      }
    }
  } catch {
    await store.finish(recordId, true, withHash('attempt_lookup_failed', verification.variant))
    return { status: 500 }
  }
  if (!attempt) return outcome('unknown_reference')

  try {
    if (isExpired) {
      await store.markAttemptExpired(attempt.id)
      return outcome('expired')
    }

    const totalPaymentAmount = Number(callback.totalPaymentAmount)
    if (!Number.isFinite(totalPaymentAmount) || totalPaymentAmount <= 0) {
      return outcome('invalid_payment_amount', 400)
    }
    const expectedTotal = Number(attempt.total_amount ?? attempt.amount)
    const expectedFee = Math.max(expectedTotal - Number(attempt.amount), 0)
    const providerFee = Number(Math.min(totalPaymentAmount, expectedFee).toFixed(2))
    const amount = Number(Math.max(totalPaymentAmount - providerFee, 0).toFixed(2))
    if (amount <= 0) return outcome('invalid_payment_amount', 400)

    const payment: CallbackPayment = {
      group_id: attempt.group_id,
      member_id: attempt.member_id,
      amount,
      provider_reference: callback.callbackReferenceNumber || callback.notificationId,
      provider: 'paga',
      provider_fee: providerFee,
      payer_name: callback.payerName || null,
      paid_at: paymentDate(callback.paidAt),
    }
    const inserted = await recordPayment(attempt, payment, store)
    if (inserted === 'duplicate') return outcome('duplicate')
    const matchesExpected = Math.abs(totalPaymentAmount - expectedTotal) < 0.01
    return outcome(matchesExpected ? 'processed' : 'amount_mismatch')
  } catch {
    await store.finish(recordId, true, withHash('processing_failed', verification.variant))
    return { status: 500 }
  }
}

export function isProcessedCallbackOutcome(outcome: string | null) {
  return completedOutcome(outcome)
}
