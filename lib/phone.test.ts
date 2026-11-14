import { describe, expect, it } from 'vitest'
import { normalizeNgPhone, toLocalNg } from './phone'

describe('normalizeNgPhone', () => {
  it('normalizes a Nigerian local number for WhatsApp', () => {
    expect(normalizeNgPhone('0803 123 4567')).toBe('2348031234567')
  })

  it('accepts a Nigerian international number', () => {
    expect(normalizeNgPhone('+234 803-123-4567')).toBe('2348031234567')
  })

  it('rejects invalid numbers', () => {
    expect(normalizeNgPhone('12345')).toBeNull()
  })
})

describe('toLocalNg', () => {
  it('converts valid international Nigerian numbers to Paga local format', () => {
    expect(toLocalNg('+234 801 234 5678')).toBe('08012345678')
    expect(toLocalNg('08012345678')).toBe('08012345678')
  })

  it('rejects invalid Nigerian numbers', () => {
    expect(toLocalNg('12345')).toBeNull()
  })
})
