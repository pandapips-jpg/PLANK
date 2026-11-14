import { createHash } from 'node:crypto'

function sha512(value: string) {
  return createHash('sha512').update(value, 'utf8').digest('hex')
}

export function paymentRequestHash(
  referenceNumber: string,
  amountText: string,
  phoneNumber: string,
  hashKey: string,
) {
  return sha512([
    referenceNumber,
    amountText,
    'NGN',
    phoneNumber,
    '',
    '',
    '',
    '',
    '',
    hashKey,
  ].join(''))
}

export function paymentStatusHash(referenceNumber: string, hashKey: string) {
  return sha512(referenceNumber + hashKey)
}
