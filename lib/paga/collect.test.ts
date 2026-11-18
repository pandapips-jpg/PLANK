import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('../env', () => ({
  getPagaEnv: () => ({
    pagaPublicKey: '',
    pagaSecretKey: '',
    pagaHashKey: '',
    pagaBaseUrl: 'https://beta-collect.paga.com',
    pagaRequestExpiryMinutes: 60,
    publicAppUrl: 'https://example.test',
  }),
}))

import { createPaymentRequest, formatPagaExpiry } from './collect'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('formatPagaExpiry', () => {
  it('formats the UTC instant without milliseconds or a timezone suffix', () => {
    expect(formatPagaExpiry(new Date('2021-09-29T23:00:00.987Z')))
      .toBe('2021-09-29T23:00:00')
    expect(formatPagaExpiry(new Date('2021-09-29T23:00:00-04:00')))
      .toBe('2021-09-30T03:00:00')
  })
})

describe('createPaymentRequest', () => {
  it('reads object-shaped transfer properties and logs only masked BANK_TRANSFER details', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      JSON.stringify({
        statusCode: '0',
        statusMessage: 'Success',
        totalPaymentAmount: 103,
        paymentMethods: [
          {
            name: 'AGENT_DEPOSIT',
            properties: { accountNumber: '1122334455' },
          },
          {
            name: 'BANK_TRANSFER',
            properties: {
              Account_Number: '1234567890',
              bankName: 'Test Bank',
              accountName: 'Test Account',
              expiry: '2026-11-18T16:00:00Z',
              diagnosticId: '12345678',
            },
          },
          {
            name: 'MONEY_TRANSFER',
            properties: { accountNumber: '9988776655' },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    const result = await createPaymentRequest({
      referenceNumber: 'PLKTEST123',
      amount: 100,
      phoneNumber: '08012345678',
      payerName: 'Plank Test',
      callbackUrl: 'https://example.test/api/paga/payment-callback',
      expiresAt: new Date('2026-11-15T16:00:00Z'),
    })

    const requestInit = fetchMock.mock.calls[0][1]
    expect(requestInit?.headers).toMatchObject({
      'Accept-Language': 'en',
      Accept: 'application/json',
    })
    const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>
    expect(body.callBackUrl).toBe('https://example.test/api/paga/payment-callback')
    expect(body).not.toHaveProperty('callbackUrl')
    expect(body.paymentMethods).toEqual(['BANK_TRANSFER'])
    expect(body.payerCollectionFeeShare).toBe(1)
    expect(body.payeeCollectionFeeShare).toBe(0)
    expect(Number(body.payerCollectionFeeShare) + Number(body.payeeCollectionFeeShare)).toBe(1)
    expect(body.isSuppressMessages).toBe(true)
    expect(body.isAllowPartialPayments).toBe(false)
    expect(result).toMatchObject({
      ok: true,
      accountNumber: '1234567890',
      accountName: 'Test Account',
      bankName: 'Test Bank',
      totalAmount: 103,
      expiresAt: '2026-11-18T16:00:00.000Z',
    })
    expect(infoSpy).toHaveBeenCalledWith(
      'Paga BANK_TRANSFER payment details',
      JSON.stringify({
        name: 'BANK_TRANSFER',
        properties: {
          Account_Number: '***7890',
          bankName: 'Test Bank',
          accountName: 'Test Account',
          expiry: '2026-11-18T16:00:00Z',
          diagnosticId: '***5678',
        },
      }, null, 2),
    )
  })

  it('reads array-shaped transfer properties using name, key, or label', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      JSON.stringify({
        statusCode: '0',
        statusMessage: 'Success',
        totalPaymentAmount: 100,
        paymentMethods: [
          {
            name: 'BANK_TRANSFER',
            properties: [
              { name: 'ACCOUNT_NO', value: '0987654321' },
              { key: 'Bank', value: 'Array Bank' },
              { label: 'AccountName', value: 'Array Account' },
              { name: 'Expiry', value: '2026-11-19T16:00:00Z' },
            ],
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'info').mockImplementation(() => {})

    const result = await createPaymentRequest({
      referenceNumber: 'PLKTESTARRAY',
      amount: 100,
      phoneNumber: '08012345678',
      callbackUrl: 'https://example.test/api/paga/payment-callback',
      expiresAt: new Date('2026-11-15T16:00:00Z'),
    })

    expect(result).toMatchObject({
      ok: true,
      accountNumber: '0987654321',
      accountName: 'Array Account',
      bankName: 'Array Bank',
      expiresAt: '2026-11-19T16:00:00.000Z',
    })
  })

  it('falls back to top-level bank transfer details and logs property names when account number is missing', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      JSON.stringify({
        statusCode: '0',
        statusMessage: 'Success',
        account_number: '1234567890',
        bank: 'Fallback Bank',
        expiryDateTimeUTC: '2026-11-20T16:00:00Z',
        paymentMethods: [
          {
            name: 'BANK_TRANSFER',
            properties: { bankName: 'Properties Bank' },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await createPaymentRequest({
      referenceNumber: 'PLKTESTFALLBACK',
      amount: 100,
      phoneNumber: '08012345678',
      callbackUrl: 'https://example.test/api/paga/payment-callback',
      expiresAt: new Date('2026-11-15T16:00:00Z'),
    })

    expect(result).toMatchObject({
      ok: true,
      accountNumber: '1234567890',
      bankName: 'Properties Bank',
      expiresAt: '2026-11-20T16:00:00.000Z',
    })

    const missingAccountResponse = {
      statusCode: '0',
      statusMessage: 'Success',
      paymentMethods: [
        {
          name: 'BANK_TRANSFER',
          properties: { bankName: 'Name must not be logged as a value' },
        },
      ],
    }
    fetchMock.mockImplementationOnce(async () => new Response(
      JSON.stringify(missingAccountResponse),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))

    const invalidResult = await createPaymentRequest({
      referenceNumber: 'PLKTESTMISSING',
      amount: 100,
      phoneNumber: '08012345678',
      callbackUrl: 'https://example.test/api/paga/payment-callback',
      expiresAt: new Date('2026-11-15T16:00:00Z'),
    })

    expect(invalidResult).toMatchObject({
      ok: false,
      statusCode: 'INVALID_RESPONSE',
    })
    expect(warnSpy).toHaveBeenCalledWith('Paga BANK_TRANSFER property keys', ['bankName'])
  })
})
