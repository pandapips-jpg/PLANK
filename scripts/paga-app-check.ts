import { randomUUID } from 'node:crypto'
import createPaymentRequest from '../lib/paga/collect'

async function main() {
  const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (!publicAppUrl) {
    throw new Error('Missing NEXT_PUBLIC_APP_URL')
  }

  const referenceNumber = `PLKAPP${randomUUID().replace(/-/g, '').slice(0, 20)}`
  const sentAt = new Date().toISOString()
  const result = await createPaymentRequest({
    referenceNumber,
    amount: 100,
    phoneNumber: '08012345678',
    payerName: 'Plank Test',
    callbackUrl: `${publicAppUrl}/api/paga/payment-callback`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  })

  const hashVariant = result.ok ? result.hashVariant : 'unknown'
  const statusCode = result.ok ? result.statusCode : result.statusCode
  const statusMessage = result.ok ? result.statusMessage : result.statusMessage
  const accountSuffix = result.ok ? result.accountNumber.slice(-4) : 'unavailable'

  console.log(
    `referenceNumber=${referenceNumber} | UTC=${sentAt} | hashVariant=${hashVariant} | HTTP=${result.httpStatus} | statusCode=${statusCode} | statusMessage=${statusMessage}${result.ok ? ` | accountSuffix=${accountSuffix}` : ''}`,
  )
}

void main()
