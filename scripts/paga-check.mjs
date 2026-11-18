import { randomBytes, createHash } from 'node:crypto'
import { isIP } from 'node:net'

const keyNames = ['PAGA_PUBLIC_KEY', 'PAGA_SECRET_KEY', 'PAGA_HASH_KEY', 'PAGA_BASE_URL']
const values = Object.fromEntries(keyNames.map((name) => [name, process.env[name]]))
const sensitiveValues = new Set()

async function fetchPublicIp() {
  try {
    const response = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(10000) })
    const ip = (await response.text()).trim()
    return response.ok && isIP(ip) ? ip : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function addSensitive(value) {
  if (value === undefined || value === null) return
  sensitiveValues.add(String(value))
}

function redactMessage(value) {
  let message = typeof value === 'string' ? value : ''
  for (const secret of sensitiveValues) {
    if (!secret) continue
    const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    message = message.replace(new RegExp(escaped, 'gi'), '[redacted]')
  }
  message = message.replace(/\b[a-f\d]{128}\b/gi, '[redacted]')
  return message.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240) || 'none'
}

console.log(`Public IP: ${await fetchPublicIp()}`)

for (const name of keyNames) {
  const value = values[name]
  console.log(`${name} length: ${value?.length ?? 0}`)
  if (value !== undefined && (value !== value.trim() || /^['"]|['"]$/.test(value))) {
    console.log(`Warning: ${name} has leading/trailing spaces or quote marks`)
  }
  if (value === undefined || !value.trim()) {
    console.log(`Missing: ${name}`)
    process.exit(1)
  }
  addSensitive(value)
}

const { PAGA_PUBLIC_KEY, PAGA_SECRET_KEY, PAGA_HASH_KEY, PAGA_BASE_URL } = values
const authorization = `Basic ${Buffer.from(`${PAGA_PUBLIC_KEY}:${PAGA_SECRET_KEY}`).toString('base64')}`
addSensitive(authorization)
addSensitive(authorization.slice('Basic '.length))

let baseUrl
try {
  baseUrl = new URL(PAGA_BASE_URL)
  console.log(`PAGA_BASE_URL host: ${baseUrl.host}`)
} catch {
  console.log('PAGA_BASE_URL host: invalid')
  process.exit(1)
}

const endpointBase = PAGA_BASE_URL.replace(/\/+$/, '')
const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
if (!publicAppUrl) {
  console.log('Missing: NEXT_PUBLIC_APP_URL')
  process.exit(1)
}
addSensitive(publicAppUrl)
let callbackBase
try {
  const parsed = new URL(publicAppUrl)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error()
  callbackBase = publicAppUrl.replace(/\/+$/, '')
} catch {
  console.log('Invalid: NEXT_PUBLIC_APP_URL')
  process.exit(1)
}

function sha512(value) {
  const hash = createHash('sha512').update(value, 'utf8').digest('hex')
  addSensitive(hash)
  return hash
}

function randomReference() {
  return `PLKCHK${randomBytes(7).toString('hex')}`
}

function minimalPaymentBody(referenceNumber, amount) {
  return {
    referenceNumber,
    amount,
    currency: 'NGN',
    payer: { name: 'Plank Test', phoneNumber: '08012345678' },
    payee: { name: 'Plank Test' },
    expiryDateTimeUTC: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 19),
    isSuppressMessages: true,
    payerCollectionFeeShare: 1.0,
    payeeCollectionFeeShare: 0.0,
    isAllowPartialPayments: false,
    isAllowOverPayments: false,
    callBackUrl: 'https://example.com/paga-check',
    paymentMethods: ['BANK_TRANSFER'],
    displayBankDetailToPayer: false,
  }
}

function minimalPaymentHash(referenceNumber, amount) {
  return sha512(
    referenceNumber
      + String(amount)
      + 'NGN'
      + '08012345678'
      + ''
      + ''
      + ''
      + ''
      + ''
      + PAGA_HASH_KEY,
  )
}

function documentedPaymentBody(referenceNumber) {
  return {
    referenceNumber,
    amount: 2000,
    currency: 'NGN',
    payer: {
      name: 'Example Name',
      phoneNumber: '08012386240',
      email: 'test@example.com',
      bankId: '40090E2F-7446-4217-9345-7BBAB7043C4C',
    },
    payee: {
      name: 'Profix',
      financialIdentificationNumber: '22198070425',
    },
    expiryDateTimeUTC: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 19),
    isSuppressMessages: false,
    payerCollectionFeeShare: 1.0,
    payeeCollectionFeeShare: 0.0,
    isAllowPartialPayments: true,
    isAllowOverPayments: true,
    paymentMethods: ['BANK_TRANSFER', 'FUNDING_USSD', 'REQUEST_MONEY'],
    displayBankDetailToPayer: false,
    redirectUrl: 'https://www.google.com',
    callBackUrl: `${callbackBase}/api/paga/payment-callback`,
  }
}

function documentedHash(body) {
  return sha512(
    body.referenceNumber
      + String(body.amount)
      + body.currency
      + body.payer.phoneNumber
      + body.payer.email
      + ''
      + ''
      + ''
      + ''
      + PAGA_HASH_KEY,
  )
}

function paymentDetails(body) {
  if (!body || typeof body !== 'object') {
    return { accountSuffix: 'unavailable', totalPaymentAmount: 'unavailable', expiryDateTimeUTC: 'unavailable' }
  }
  let accountNumber = typeof body.accountNumber === 'string' ? body.accountNumber : ''
  if (!accountNumber && Array.isArray(body.paymentMethods)) {
    const transfer = body.paymentMethods.find((method) =>
      method && typeof method === 'object'
      && (method.paymentMethod === 'BANK_TRANSFER' || method.name === 'BANK_TRANSFER' || method.type === 'BANK_TRANSFER'),
    )
    if (typeof transfer?.accountNumber === 'string') accountNumber = transfer.accountNumber
  }
  const amount = body.totalPaymentAmount
  const expiry = body.expiryDateTimeUTC
  return {
    accountSuffix: /\d{4}$/.test(accountNumber) ? accountNumber.slice(-4) : 'unavailable',
    totalPaymentAmount: (typeof amount === 'number' || typeof amount === 'string') && /^\d+(?:\.\d+)?$/.test(String(amount)) ? String(amount) : 'unavailable',
    expiryDateTimeUTC: typeof expiry === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z?$/.test(expiry) ? expiry : 'unavailable',
  }
}

async function postJson(url, body, hash, includePaymentDetails = false) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Accept-Language': 'en',
        Accept: 'application/json',
        'Content-Type': 'application/json',
        hash,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    })
    let responseBody = null
    try {
      responseBody = await response.json()
    } catch {
      responseBody = null
    }
    const statusCode = responseBody?.statusCode === undefined ? 'none' : redactMessage(String(responseBody.statusCode))
    const statusMessage = redactMessage(responseBody?.statusMessage)
    return {
      httpStatus: response.status,
      statusCode,
      statusMessage,
      paymentDetails: includePaymentDetails ? paymentDetails(responseBody) : undefined,
    }
  } catch {
    return {
      httpStatus: 'NETWORK_ERROR',
      statusCode: 'unavailable',
      statusMessage: 'Request failed',
      paymentDetails: undefined,
    }
  }
}

function printRequestResult(label, referenceNumber, sentAt, result) {
  console.log(
    `${label} | referenceNumber=${referenceNumber} | UTC=${sentAt} | HTTP=${result.httpStatus} | statusCode=${result.statusCode} | statusMessage=${result.statusMessage}`,
  )
}

function printSummaryLine(test) {
  console.log(
    `${test.label} | referenceNumber=${test.referenceNumber} | UTC=${test.sentAt} | HTTP=${test.httpStatus} | statusCode=${test.statusCode} | statusMessage=${test.statusMessage}`,
  )
}

async function runTest(label, path, body, hash, includePaymentDetails = false) {
  const sentAt = new Date().toISOString()
  const result = await postJson(`${endpointBase}${path}`, body, hash, includePaymentDetails)
  printRequestResult(label, body.referenceNumber, sentAt, result)
  if (includePaymentDetails && result.statusCode === '0') {
    console.log(`BANK_TRANSFER account ending: ${result.paymentDetails.accountSuffix}`)
    console.log(`totalPaymentAmount: ${result.paymentDetails.totalPaymentAmount}`)
    console.log(`expiryDateTimeUTC: ${result.paymentDetails.expiryDateTimeUTC}`)
  }
  return { label, referenceNumber: body.referenceNumber, sentAt, ...result }
}

async function runPagaChecks() {
  const tests = []

  const keysReference = randomReference()
  const keysResult = await runTest('Keys check', '/banks', { referenceNumber: keysReference }, sha512(keysReference + PAGA_HASH_KEY))
  tests.push(keysResult)
  if (keysResult.httpStatus === 429) {
    console.log('Rate limited, wait 15 minutes')
    process.exit(1)
  }

  await delay(3000)
  const amount100Reference = randomReference()
  const amount100Body = minimalPaymentBody(amount100Reference, 100)
  const amount100Result = await runTest('Payment request (100)', '/paymentRequest', amount100Body, minimalPaymentHash(amount100Reference, 100), true)
  tests.push(amount100Result)
  if (amount100Result.httpStatus === 429) {
    console.log('Rate limited, wait 15 minutes')
    process.exit(1)
  }

  await delay(3000)
  const amount2000Reference = randomReference()
  const amount2000Body = minimalPaymentBody(amount2000Reference, 2000)
  const amount2000Result = await runTest('Payment request (2000)', '/paymentRequest', amount2000Body, minimalPaymentHash(amount2000Reference, 2000), true)
  tests.push(amount2000Result)
  if (amount2000Result.httpStatus === 429) {
    console.log('Rate limited, wait 15 minutes')
    process.exit(1)
  }

  await delay(3000)
  const documentedReference = randomReference()
  const documentedBody = documentedPaymentBody(documentedReference)
  const documentedResult = await runTest('Documented sample', '/paymentRequest', documentedBody, documentedHash(documentedBody), true)
  tests.push(documentedResult)

  console.log('SUMMARY')
  for (const test of tests) printSummaryLine(test)
  if (documentedResult.httpStatus === 429) {
    console.log('Rate limited, wait 15 minutes')
    process.exit(1)
  }
}

await runPagaChecks()
