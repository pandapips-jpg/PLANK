import 'server-only'

export type EnvProblem = {
  name: string
  problem: 'missing' | 'empty' | 'invalid'
  reason?: string
}

export class EnvValidationError extends Error {
  readonly problems: EnvProblem[]

  constructor(problems: EnvProblem[]) {
    super('Environment configuration is invalid.')
    this.name = 'EnvValidationError'
    this.problems = problems
  }
}

export type ServerEnv = {
  pagaPublicKey: string
  pagaSecretKey: string
  pagaHashKey: string
  pagaBaseUrl: string
  pagaRequestExpiryMinutes: number
  publicAppUrl: string
  supabaseServiceRoleKey: string
  supabaseUrl: string
}

type EnvReader = {
  required(name: string, validate?: (value: string) => string | undefined): string
  requestExpiryMinutes(): number
  throwIfInvalid(): void
}

function createEnvReader(): EnvReader {
  const problems: EnvProblem[] = []

  function required(name: string, validate?: (value: string) => string | undefined) {
    const rawValue = process.env[name]
    if (rawValue === undefined) {
      problems.push({ name, problem: 'missing' })
      return ''
    }

    const value = rawValue.trim()
    if (!value) {
      problems.push({ name, problem: 'empty' })
      return ''
    }

    const reason = validate?.(value)
    if (reason) problems.push({ name, problem: 'invalid', reason })
    return value
  }

  function requestExpiryMinutes() {
    const rawValue = process.env.PAGA_REQUEST_EXPIRY_MINUTES
    const value = rawValue?.trim()
    if (!value) return 360

    const minutes = Number(value)
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 7 * 24 * 60) {
      problems.push({
        name: 'PAGA_REQUEST_EXPIRY_MINUTES',
        problem: 'invalid',
        reason: 'must be a whole number between 1 and 10080',
      })
      return 360
    }
    return minutes
  }

  return {
    required,
    requestExpiryMinutes,
    throwIfInvalid() {
      if (problems.length) throw new EnvValidationError(problems)
    },
  }
}

function validateWebUrl(value: string) {
  try {
    const parsed = new URL(value)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return undefined
  } catch {
    return 'must be a full HTTP or HTTPS URL'
  }
  return 'must be a full HTTP or HTTPS URL'
}

function readPagaEnv(reader: EnvReader): Pick<
  ServerEnv,
  'pagaPublicKey' | 'pagaSecretKey' | 'pagaHashKey' | 'pagaBaseUrl' | 'pagaRequestExpiryMinutes' | 'publicAppUrl'
> {
  const pagaPublicKey = reader.required('PAGA_PUBLIC_KEY')
  const pagaSecretKey = reader.required('PAGA_SECRET_KEY')
  const pagaHashKey = reader.required('PAGA_HASH_KEY')
  const pagaBaseUrl = reader.required('PAGA_BASE_URL', validateWebUrl)
  const publicAppUrl = reader.required('NEXT_PUBLIC_APP_URL', validateWebUrl)
  const pagaRequestExpiryMinutes = reader.requestExpiryMinutes()

  return {
    pagaPublicKey,
    pagaSecretKey,
    pagaHashKey,
    pagaBaseUrl: pagaBaseUrl.replace(/\/+$/, ''),
    pagaRequestExpiryMinutes,
    publicAppUrl: publicAppUrl.replace(/\/+$/, ''),
  }
}

function readAdminEnv(reader: EnvReader): Pick<ServerEnv, 'supabaseServiceRoleKey' | 'supabaseUrl'> {
  const supabaseUrl = reader.required('NEXT_PUBLIC_SUPABASE_URL', validateWebUrl)
  const supabaseServiceRoleKey = reader.required('SUPABASE_SERVICE_ROLE_KEY')
  return { supabaseServiceRoleKey, supabaseUrl }
}

export function getPagaHashKey() {
  const reader = createEnvReader()
  const hashKey = reader.required('PAGA_HASH_KEY')
  reader.throwIfInvalid()
  return hashKey
}

export function getPagaEnv(): Pick<
  ServerEnv,
  'pagaPublicKey' | 'pagaSecretKey' | 'pagaHashKey' | 'pagaBaseUrl' | 'pagaRequestExpiryMinutes' | 'publicAppUrl'
> {
  const reader = createEnvReader()
  const env = readPagaEnv(reader)
  reader.throwIfInvalid()
  return env
}

export function getAdminEnv(): Pick<ServerEnv, 'supabaseServiceRoleKey' | 'supabaseUrl'> {
  const reader = createEnvReader()
  const env = readAdminEnv(reader)
  reader.throwIfInvalid()
  return env
}

export function getServerEnv(): ServerEnv {
  const reader = createEnvReader()
  const admin = readAdminEnv(reader)
  const paga = readPagaEnv(reader)
  reader.throwIfInvalid()
  return { ...paga, ...admin }
}
