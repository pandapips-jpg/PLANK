import { createHash } from 'node:crypto'

function sha512(value: string) {
  return createHash('sha512').update(value, 'utf8').digest('hex')
}

export function paymentRequestHash(
  referenceNumber: string,
  amountText: string,
  payerPhoneNumber: string,
  hashKey: string,
) {
  return sha512([
    referenceNumber,
    amountText,
    'NGN',
    payerPhoneNumber,
    '',
    '',
    '',
    '',
    '',
    hashKey,
  ].join(''))
}

export function javaStyleAmountText(amount: number) {
  const plainAmount = String(amount)
  return Number.isInteger(amount) ? `${plainAmount}.0` : plainAmount
}

export function paymentStatusHash(referenceNumber: string, hashKey: string) {
  return sha512(referenceNumber + hashKey)
}
