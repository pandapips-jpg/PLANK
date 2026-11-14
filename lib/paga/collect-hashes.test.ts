import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { paymentRequestHash, paymentStatusHash } from './collect-hashes'

function sha512(value: string) {
  return createHash('sha512').update(value, 'utf8').digest('hex')
}

describe('Paga Collect hashes', () => {
  it('uses the PaymentRequest field order and empty optional values', () => {
    const reference = 'PLK-reference'
    const amount = '5000'
    const phone = '08012345678'
    const key = 'test-hash-key'
    expect(paymentRequestHash(reference, amount, phone, key)).toBe(
      sha512(`${reference}${amount}NGN${phone}${''.repeat(5)}${key}`),
    )
  })

  it('hashes a payment status reference with the hash key', () => {
    expect(paymentStatusHash('PLK-reference', 'test-hash-key'))
      .toBe(sha512('PLK-referencetest-hash-key'))
  })
})
