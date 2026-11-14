import 'server-only'

import { getPagaEnv } from '@/lib/env'
import { paymentRequestHash, paymentStatusHash } from '@/lib/paga/collect-hashes'

export { paymentRequestHash, paymentStatusHash } from '@/lib/paga/collect-hashes'
type PagaResponse = Record<string, unknown> & {
  statusCode?: string | number
  statusMessage?: string
}

export type PaymentRequestInput = {
  referenceNumber: string
  amount: number
  phoneNumber: string
  callbackUrl: string
  expiresAt: Date
}

export type PaymentRequestResult =
  | {
      ok: true
      statusCode: string
      statusMessage: string
      accountNumber: string
      bankName: string
      totalAmount: number
      expiresAt: string
      hashVariant: 'plain' | 'fixed-2'
    }
  | { ok: false; statusCode: string; statusMessage: string }

function responseObject(value: unknown): PagaResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as PagaResponse
}

function text(value: unknown) {
  return value === null || value === undefined ? '' : String(value)
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function post(path: string, body: Record<string, unknown>, hash: string): Promise<PagaResponse> {
  const env = getPagaEnv()
  const authorization = Buffer.from(`${env.pagaPublicKey}:${env.pagaSecretKey}`).toString('base64')
  let response: Response
  try {
    response = await fetch(`${env.pagaBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authorization}`,
        'Content-Type': 'application/json',
        Hash: hash,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
  } catch {
    const result = { statusCode: 'NETWORK_ERROR', statusMessage: 'Paga could not be reached.' }
    console.info('Paga API response', result)
    return result
  }

  let result: PagaResponse
  try {
    result = responseObject(await response.json())
  } catch {
    result = { statusCode: String(response.status), statusMessage: 'Paga returned an unreadable response.' }
  }
  const status = {
    statusCode: text(result.statusCode) || String(response.status),
    statusMessage: text(result.statusMessage),
  }
  console.info('Paga API response', status)
  return { ...result, ...status }
}

function isInvalidHash(response: PagaResponse) {
  const code = text(response.statusCode).toLowerCase()
  const message = text(response.statusMessage).toLowerCase()
  return code.includes('hash') || message.includes('hash')
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function pollPaymentRequestStatus(referenceNumber: string, hashKey: string) {
  let response: PagaResponse = { statusCode: '102', statusMessage: 'Request is still processing.' }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) await wait(1000)
    response = await post(
      '/status',
      { referenceNumber },
      paymentStatusHash(referenceNumber, hashKey),
    )
    if (text(response.statusCode) !== '102') return response
  }
  return response
}

export async function createPaymentRequest(input: PaymentRequestInput): Promise<PaymentRequestResult> {
  const env = getPagaEnv()
  const amount = Number(input.amount.toFixed(2))
  const body = {
    referenceNumber: input.referenceNumber,
    amount,
    currency: 'NGN',
    phoneNumber: input.phoneNumber,
    callbackUrl: input.callbackUrl,
    expiryDateTimeUTC: input.expiresAt.toISOString().slice(0, 19),
  }
  let hashVariant: 'plain' | 'fixed-2' = 'plain'
  let response = await post(
    '/paymentRequest',
    body,
    paymentRequestHash(input.referenceNumber, String(amount), input.phoneNumber, env.pagaHashKey),
  )
  if (isInvalidHash(response)) {
    hashVariant = 'fixed-2'
    response = await post(
      '/paymentRequest',
      body,
      paymentRequestHash(input.referenceNumber, amount.toFixed(2), input.phoneNumber, env.pagaHashKey),
    )
    console.info('Paga payment request hash variant', { statusCode: text(response.statusCode), variant: hashVariant })
  }
  if (text(response.statusCode) === '102') {
    response = await pollPaymentRequestStatus(input.referenceNumber, env.pagaHashKey)
  }

  const statusCode = text(response.statusCode)
  const statusMessage = text(response.statusMessage)
  if (statusCode !== '0') return { ok: false, statusCode, statusMessage }

  const accountNumber = text(response.accountNumber)
  const totalAmount = numberValue(response.totalPaymentAmount) ?? amount
  if (!accountNumber || totalAmount < amount) {
    return {
      ok: false,
      statusCode: 'INVALID_RESPONSE',
      statusMessage: 'Paga did not return valid bank transfer details.',
    }
  }
  const returnedExpiry = text(response.expiryDateTimeUTC)
  const parsedExpiry = returnedExpiry ? new Date(returnedExpiry) : input.expiresAt
  return {
    ok: true,
    statusCode,
    statusMessage,
    accountNumber,
    bankName: text(response.bankName) || 'Paga',
    totalAmount,
    expiresAt: Number.isFinite(parsedExpiry.getTime()) ? parsedExpiry.toISOString() : input.expiresAt.toISOString(),
    hashVariant,
  }
}

export async function getPaymentStatus(referenceNumber: string) {
  const env = getPagaEnv()
  const response = await post(
    '/status',
    { referenceNumber },
    paymentStatusHash(referenceNumber, env.pagaHashKey),
  )
  return {
    statusCode: text(response.statusCode),
    statusMessage: text(response.statusMessage),
  }
}
