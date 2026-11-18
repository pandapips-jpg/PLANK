import 'server-only'

import { getPagaEnv } from '../env'
import { javaStyleAmountText, paymentRequestHash, paymentStatusHash } from './collect-hashes'

export { javaStyleAmountText, paymentRequestHash, paymentStatusHash } from './collect-hashes'
type PagaResponse = Record<string, unknown> & {
  statusCode?: string | number
  statusMessage?: string
  httpStatus?: number
}

type PaymentRequestHashVariant = 'plain' | 'java-one-decimal' | 'fixed-2'

const PAGA_CALL_TIMEOUT_MS = 15_000
const STATUS_POLL_TIMEOUT_MS = 45_000

export type PaymentRequestInput = {
  referenceNumber: string
  amount: number
  phoneNumber: string
  payerName?: string
  callbackUrl: string
  expiresAt: Date
}

export type PaymentRequestResult =
  | {
      ok: true
      statusCode: string
      statusMessage: string
      httpStatus: number
      accountNumber: string
      accountName?: string
      bankName: string
      totalAmount: number
      expiresAt: string
      hashVariant: PaymentRequestHashVariant
    }
  | { ok: false; statusCode: string; statusMessage: string; httpStatus: number }

type PaymentRequestBody = {
  referenceNumber: string
  amount: number
  currency: 'NGN'
  payer: {
    name: string
    phoneNumber: string
  }
  callBackUrl: string
  paymentMethods: ['BANK_TRANSFER']
  expiryDateTimeUTC: string
  payerCollectionFeeShare: 1
  payeeCollectionFeeShare: 0
  isSuppressMessages: true
  isAllowPartialPayments: false
}

let hasLoggedSuccessfulPaymentResponse = false

function responseObject(value: unknown): PagaResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as PagaResponse
}

function maskLongDigitStrings(value: unknown): unknown {
  if (typeof value === 'string' && /^\d{8,}$/.test(value)) return `***${value.slice(-4)}`
  if (Array.isArray(value)) return value.map(maskLongDigitStrings)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        maskLongDigitStrings(childValue),
      ]),
    )
  }
  return value
}

function text(value: unknown) {
  return value === null || value === undefined ? '' : String(value)
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const candidate = text(value).trim()
    if (candidate) return candidate
  }
  return ''
}

function bankTransferEntry(response: PagaResponse): PagaResponse | null {
  if (!Array.isArray(response.paymentMethods)) return null
  const bankTransfer = response.paymentMethods.find((method) => {
    const entry = responseObject(method)
    return text(entry.name).trim().toUpperCase() === 'BANK_TRANSFER'
  })
  return bankTransfer ? responseObject(bankTransfer) : null
}

function normalizedPropertyName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function propertyEntries(properties: unknown): Array<[string, unknown]> {
  if (Array.isArray(properties)) {
    return properties.flatMap((item): Array<[string, unknown]> => {
      const property = responseObject(item)
      const name = firstText(property.name, property.key, property.label)
      return name ? [[name, property.value]] : []
    })
  }
  if (properties && typeof properties === 'object') {
    return Object.entries(properties)
  }
  return []
}

function propertyValue(properties: unknown, names: string[]) {
  const normalizedNames = new Set(names.map(normalizedPropertyName))
  return propertyEntries(properties).find(([name]) =>
    normalizedNames.has(normalizedPropertyName(name)),
  )?.[1]
}

function propertyNames(properties: unknown) {
  return propertyEntries(properties).map(([name]) => name)
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function formatPagaExpiry(expiresAt: Date) {
  return expiresAt.toISOString().slice(0, 19)
}

function serializePaymentRequestBody(body: PaymentRequestBody, amountText: string) {
  return `{"referenceNumber":${JSON.stringify(body.referenceNumber)},"amount":${amountText},"currency":${JSON.stringify(body.currency)},"payer":{"name":${JSON.stringify(body.payer.name)},"phoneNumber":${JSON.stringify(body.payer.phoneNumber)}},"callBackUrl":${JSON.stringify(body.callBackUrl)},"paymentMethods":["BANK_TRANSFER"],"expiryDateTimeUTC":${JSON.stringify(body.expiryDateTimeUTC)},"payerCollectionFeeShare":${JSON.stringify(body.payerCollectionFeeShare)},"payeeCollectionFeeShare":${JSON.stringify(body.payeeCollectionFeeShare)},"isSuppressMessages":${JSON.stringify(body.isSuppressMessages)},"isAllowPartialPayments":${JSON.stringify(body.isAllowPartialPayments)}}`
}

function phoneSuffix(phoneNumber: string) {
  return phoneNumber.replace(/\D/g, '').slice(-3)
}

function maskPhoneInRequestBody(body: Record<string, unknown> | string) {
  const serializedBody = typeof body === 'string' ? body : JSON.stringify(body)
  return serializedBody.replace(/("phoneNumber"\s*:\s*")([^"]*)(")/g, (_match, prefix: string, phone: string, suffix: string) =>
    `${prefix}***${phone.replace(/\D/g, '').slice(-3)}${suffix}`,
  )
}

function logPaymentRequestFailure(
  body: PaymentRequestBody,
  amountText: string,
  variant: PaymentRequestHashVariant,
) {
  const hashFields = [
    { name: 'referenceNumber', length: body.referenceNumber.length, value: body.referenceNumber },
    { name: 'amount', length: amountText.length },
    { name: 'currency', length: body.currency.length },
    { name: 'payer.phoneNumber', length: body.payer.phoneNumber.length },
    { name: 'payer.email', length: 0 },
    { name: 'payee.accountNumber', length: 0 },
    { name: 'payee.phoneNumber', length: 0 },
    { name: 'payee.bankId', length: 0 },
    { name: 'payee.bankAccountNumber', length: 0 },
  ]
  console.warn('Paga payment request hash diagnostics', {
    topLevelBodyKeys: Object.keys(body),
    payerKeys: Object.keys(body.payer),
    hashFields,
    variant,
  })
}

function timeoutResponse(overallSignal?: AbortSignal): PagaResponse {
  return overallSignal?.aborted
    ? {
        statusCode: 'TIMEOUT',
        statusMessage: 'Paga status polling exceeded 45 seconds.',
        httpStatus: 0,
      }
    : {
        statusCode: 'TIMEOUT',
        statusMessage: 'Paga did not respond within 15 seconds.',
        httpStatus: 0,
      }
}

async function post(
  path: string,
  body: Record<string, unknown> | string,
  hash: string,
  overallSignal?: AbortSignal,
): Promise<PagaResponse> {
  const env = getPagaEnv()
  const authorization = Buffer.from(`${env.pagaPublicKey}:${env.pagaSecretKey}`).toString('base64')
  const startedAt = Date.now()
  const callTimeoutSignal = AbortSignal.timeout(PAGA_CALL_TIMEOUT_MS)
  const signal = overallSignal
    ? AbortSignal.any([callTimeoutSignal, overallSignal])
    : callTimeoutSignal
  try {
    const response = await fetch(`${env.pagaBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authorization}`,
        'Accept-Language': 'en',
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Hash: hash,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
      cache: 'no-store',
      signal,
    })

    let result: PagaResponse
    let parsedResponseBody: unknown
    try {
      parsedResponseBody = await response.json()
      result = responseObject(parsedResponseBody)
    } catch {
      if (signal.aborted) return timeoutResponse(overallSignal)
      result = { statusCode: String(response.status), statusMessage: 'Paga returned an unreadable response.' }
      parsedResponseBody = result
    }
    const status = {
      statusCode: text(result.statusCode) || String(response.status),
      statusMessage: text(result.statusMessage),
    }
    if (!response.ok || status.statusCode !== '0') {
      console.error('Paga API returned a non-success response', {
        path,
        responseBody: parsedResponseBody,
        requestBody: maskPhoneInRequestBody(body),
      })
    }
    return { ...result, ...status, httpStatus: response.status }
  } catch (error) {
    if (signal.aborted) return timeoutResponse(overallSignal)
    throw error
  } finally {
    console.info('Paga API call duration', { path, durationMs: Date.now() - startedAt })
  }
}

function isInvalidHash(response: PagaResponse) {
  const code = text(response.statusCode).toLowerCase()
  const message = text(response.statusMessage).toLowerCase()
  return code.includes('hash') || message.includes('hash')
}

function waitForPollingInterval(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, milliseconds)
    signal.addEventListener('abort', finish, { once: true })
  })
}

async function pollPaymentRequestStatus(referenceNumber: string, hashKey: string) {
  const pollingSignal = AbortSignal.timeout(STATUS_POLL_TIMEOUT_MS)
  let response: PagaResponse = { statusCode: '102', statusMessage: 'Request is still processing.' }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (pollingSignal.aborted) return timeoutResponse(pollingSignal)
    if (attempt > 0) {
      await waitForPollingInterval(1000, pollingSignal)
      if (pollingSignal.aborted) return timeoutResponse(pollingSignal)
    }
    response = await post(
      '/status',
      { referenceNumber },
      paymentStatusHash(referenceNumber, hashKey),
      pollingSignal,
    )
    if (text(response.statusCode) !== '102') return response
  }
  return response
}

export async function createPaymentRequest(input: PaymentRequestInput): Promise<PaymentRequestResult> {
  const env = getPagaEnv()
  const amount = Number(input.amount.toFixed(2))
  const body: PaymentRequestBody = {
    referenceNumber: input.referenceNumber,
    amount,
    currency: 'NGN',
    payer: {
      name: input.payerName?.trim() || 'Plank Member',
      phoneNumber: input.phoneNumber,
    },
    callBackUrl: input.callbackUrl,
    paymentMethods: ['BANK_TRANSFER'],
    expiryDateTimeUTC: formatPagaExpiry(input.expiresAt),
    payerCollectionFeeShare: 1,
    payeeCollectionFeeShare: 0,
    isSuppressMessages: true,
    isAllowPartialPayments: false,
  }

  const variantCandidates: Array<{ name: PaymentRequestHashVariant; amountText: string }> = [
    { name: 'plain', amountText: String(amount) },
    { name: 'java-one-decimal', amountText: javaStyleAmountText(amount) },
    { name: 'fixed-2', amountText: amount.toFixed(2) },
  ]
  const variants = variantCandidates.filter((variant, index, all) =>
    all.findIndex((candidate) => candidate.amountText === variant.amountText) === index,
  )

  let hashVariant = variants[0].name
  let amountTextUsed = variants[0].amountText
  let response: PagaResponse = {}
  for (const variant of variants) {
    hashVariant = variant.name
    amountTextUsed = variant.amountText
    try {
      response = await post(
        '/paymentRequest',
        serializePaymentRequestBody(body, variant.amountText),
        paymentRequestHash(input.referenceNumber, variant.amountText, body.payer.phoneNumber, env.pagaHashKey),
      )
    } catch (error) {
      logPaymentRequestFailure(body, variant.amountText, variant.name)
      console.error('Paga payment request failed', {
        referenceNumber: input.referenceNumber,
        amountText: variant.amountText,
        phoneSuffix: phoneSuffix(input.phoneNumber),
        variant: variant.name,
      })
      throw error
    }

    const logData = {
      referenceNumber: input.referenceNumber,
      amountText: variant.amountText,
      phoneSuffix: phoneSuffix(input.phoneNumber),
      variant: variant.name,
      statusCode: text(response.statusCode),
      httpStatus: response.httpStatus,
    }
    if (isInvalidHash(response)) {
      console.warn('Paga payment request hash rejected', logData)
      continue
    }

    hashVariant = variant.name
    if (text(response.statusCode) === '0' || text(response.statusCode) === '102') {
      console.info('Paga payment request hash variant succeeded', logData)
    } else {
      console.warn('Paga payment request failed', logData)
    }
    break
  }

  if (text(response.statusCode) === '102') {
    response = await pollPaymentRequestStatus(input.referenceNumber, env.pagaHashKey)
  }

  const statusCode = text(response.statusCode)
  const statusMessage = text(response.statusMessage)
  const httpStatus = Number(response.httpStatus ?? 0)
  if (statusCode !== '0') {
    logPaymentRequestFailure(body, amountTextUsed, hashVariant)
    return { ok: false, statusCode, statusMessage, httpStatus }
  }

  const transferEntry = bankTransferEntry(response)
  const transferProperties = transferEntry?.properties
  if (!hasLoggedSuccessfulPaymentResponse && transferEntry) {
    hasLoggedSuccessfulPaymentResponse = true
    console.info(
      'Paga BANK_TRANSFER payment details',
      JSON.stringify(maskLongDigitStrings(transferEntry), null, 2),
    )
  }
  const accountNumberNames = ['accountNumber', 'account_number', 'accountNo', 'bankAccountNumber']
  const accountNumber = firstText(
    propertyValue(transferProperties, accountNumberNames),
    propertyValue(response, accountNumberNames),
  )
  const accountName = firstText(
    propertyValue(transferProperties, ['accountName']),
    propertyValue(response, ['accountName']),
  )
  const bankName = firstText(
    propertyValue(transferProperties, ['bankName', 'bank']),
    propertyValue(response, ['bankName', 'bank']),
  )
  const totalAmount = numberValue(response.totalPaymentAmount) ?? amount
  if (!accountNumber) {
    console.warn('Paga BANK_TRANSFER property keys', propertyNames(transferProperties))
  }
  if (!accountNumber || totalAmount < amount) {
    logPaymentRequestFailure(body, amountTextUsed, hashVariant)
    return {
      ok: false,
      statusCode: 'INVALID_RESPONSE',
      statusMessage: 'Paga did not return valid bank transfer details.',
      httpStatus,
    }
  }
  const expiryNames = ['expiry', 'expiryDate', 'expiryDateTimeUTC', 'expiresAt']
  const returnedExpiry = firstText(
    propertyValue(transferProperties, expiryNames),
    propertyValue(response, expiryNames),
  )
  const parsedExpiry = returnedExpiry ? new Date(returnedExpiry) : input.expiresAt
  return {
    ok: true,
    statusCode,
    statusMessage,
    httpStatus,
    accountNumber,
    ...(accountName ? { accountName } : {}),
    bankName: bankName || 'Paga',
    totalAmount,
    expiresAt: Number.isFinite(parsedExpiry.getTime()) ? parsedExpiry.toISOString() : input.expiresAt.toISOString(),
    hashVariant,
  }
}

export default createPaymentRequest

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
