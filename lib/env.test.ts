import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { EnvValidationError, getServerEnv, isDemoMode, shouldUsePaga } from './env'

const envNames = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'PAGA_PUBLIC_KEY',
  'PAGA_SECRET_KEY',
  'PAGA_HASH_KEY',
  'PAGA_BASE_URL',
  'NEXT_PUBLIC_APP_URL',
  'PAGA_REQUEST_EXPIRY_MINUTES',
  'DEMO_MODE',
  'DEMO_USE_PAGA',
]

let originalEnv: Map<string, string | undefined>

beforeEach(() => {
  originalEnv = new Map(envNames.map((name) => [name, process.env[name]]))
  for (const name of envNames) delete process.env[name]
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-fixture'
  process.env.PAGA_PUBLIC_KEY = 'paga-public-fixture'
  process.env.PAGA_SECRET_KEY = 'paga-secret-fixture'
  process.env.PAGA_HASH_KEY = 'paga-hash-fixture'
  process.env.PAGA_BASE_URL = 'https://paga.example'
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example'
})

afterEach(() => {
  for (const [name, value] of originalEnv) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('environment validation', () => {
  it('keeps demo mode disabled by default and enables only the server flag', () => {
    expect(isDemoMode()).toBe(false)
    process.env.DEMO_MODE = 'true'
    expect(isDemoMode()).toBe(true)
    process.env.DEMO_MODE = 'false'
    expect(isDemoMode()).toBe(false)
  })

  it('uses Paga in normal mode, but only in demo mode with explicit opt-in', () => {
    expect(shouldUsePaga()).toBe(true)
    process.env.DEMO_MODE = 'true'
    expect(shouldUsePaga()).toBe(false)
    process.env.DEMO_USE_PAGA = 'true'
    expect(shouldUsePaga()).toBe(true)
    process.env.DEMO_USE_PAGA = 'false'
    expect(shouldUsePaga()).toBe(false)
  })

  it('collects missing, empty, and invalid problems without including values', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    process.env.PAGA_PUBLIC_KEY = '   '
    process.env.PAGA_BASE_URL = 'invalid-url-fixture'
    process.env.PAGA_REQUEST_EXPIRY_MINUTES = '1.5'

    let error: EnvValidationError | undefined
    try {
      getServerEnv()
    } catch (caught) {
      if (caught instanceof EnvValidationError) error = caught
    }

    expect(error?.problems).toEqual([
      { name: 'NEXT_PUBLIC_SUPABASE_URL', problem: 'missing' },
      { name: 'SUPABASE_SERVICE_ROLE_KEY', problem: 'missing' },
      { name: 'PAGA_PUBLIC_KEY', problem: 'empty' },
      { name: 'PAGA_BASE_URL', problem: 'invalid', reason: 'must be a full HTTP or HTTPS URL' },
      { name: 'PAGA_REQUEST_EXPIRY_MINUTES', problem: 'invalid', reason: 'must be a whole number between 1 and 10080' },
    ])
    expect(error?.message).not.toContain('service-role-fixture')
    expect(JSON.stringify(error?.problems)).not.toContain('invalid-url-fixture')
  })

  it('does not require a request expiry and defaults it to 360 minutes', () => {
    expect(getServerEnv().pagaRequestExpiryMinutes).toBe(360)
  })
})
