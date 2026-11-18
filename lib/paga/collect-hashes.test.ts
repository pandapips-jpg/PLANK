import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { javaStyleAmountText, paymentRequestHash, paymentStatusHash } from './collect-hashes'

function sha512(value: string) {
  return createHash('sha512').update(value, 'utf8').digest('hex')
}

describe('Paga Collect hashes', () => {
  it('uses the documented nested payer phone field order and empty optional values', () => {
    const reference = 'PLK-reference'
    const amount = '5000'
    const payerPhone = '08012345678'
    const key = 'test-hash-key'
    const fields = [
      { name: 'referenceNumber', value: reference },
      { name: 'amount', value: amount },
      { name: 'currency', value: 'NGN' },
      { name: 'payer.phoneNumber', value: payerPhone },
      { name: 'payer.email', value: '' },
      { name: 'payee.accountNumber', value: '' },
      { name: 'payee.phoneNumber', value: '' },
      { name: 'payee.bankId', value: '' },
      { name: 'payee.bankAccountNumber', value: '' },
    ]
    expect(fields.map(({ name }) => name)).toEqual([
      'referenceNumber',
      'amount',
      'currency',
      'payer.phoneNumber',
      'payer.email',
      'payee.accountNumber',
      'payee.phoneNumber',
      'payee.bankId',
      'payee.bankAccountNumber',
    ])
    expect(paymentRequestHash(reference, amount, payerPhone, key)).toBe(
      sha512(`${fields.map(({ value }) => value).join('')}${key}`),
    )
  })

  it('formats whole-number amounts like Java doubles', () => {
    expect(javaStyleAmountText(5000)).toBe('5000.0')
    expect(paymentRequestHash('PLK-reference', javaStyleAmountText(5000), '08012345678', 'test-hash-key'))
      .toBe(sha512(`PLK-reference5000.0NGN08012345678${''.repeat(5)}test-hash-key`))
  })

  it('keeps decimal amounts in plain-number format', () => {
    expect(javaStyleAmountText(5000.5)).toBe('5000.5')
    expect(javaStyleAmountText(5000.25)).toBe('5000.25')
    expect(paymentRequestHash('PLK-reference', javaStyleAmountText(5000.25), '08012345678', 'test-hash-key'))
      .toBe(sha512(`PLK-reference5000.25NGN08012345678${''.repeat(5)}test-hash-key`))
  })

  it('hashes a payment status reference with the hash key', () => {
    expect(paymentStatusHash('PLK-reference', 'test-hash-key'))
      .toBe(sha512('PLK-referencetest-hash-key'))
  })
})
