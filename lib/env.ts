import 'server-only'

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

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`Missing ${name}`)
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function getPagaHashKey() {
  return required('PAGA_HASH_KEY')
}

export function getPagaEnv(): Pick<ServerEnv, 'pagaPublicKey' | 'pagaSecretKey' | 'pagaHashKey' | 'pagaBaseUrl' | 'pagaRequestExpiryMinutes' | 'publicAppUrl'> {
  const expiryValue = process.env.PAGA_REQUEST_EXPIRY_MINUTES?.trim()
  const expiryMinutes = expiryValue ? Number(expiryValue) : 360
  if (!Number.isInteger(expiryMinutes) || expiryMinutes <= 0 || expiryMinutes > 7 * 24 * 60) {
    throw new Error('PAGA_REQUEST_EXPIRY_MINUTES must be a whole number between 1 and 10080.')
  }
  const publicAppUrl = required('NEXT_PUBLIC_APP_URL')
  try {
    const parsed = new URL(publicAppUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error()
  } catch {
    throw new Error('NEXT_PUBLIC_APP_URL must be a full HTTP or HTTPS URL.')
  }
  const pagaBaseUrl = required('PAGA_BASE_URL')
  try {
    const parsed = new URL(pagaBaseUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error()
  } catch {
    throw new Error('PAGA_BASE_URL must be a full HTTP or HTTPS URL.')
  }
  return {
    pagaPublicKey: required('PAGA_PUBLIC_KEY'),
    pagaSecretKey: required('PAGA_SECRET_KEY'),
    pagaHashKey: required('PAGA_HASH_KEY'),
    pagaBaseUrl: pagaBaseUrl.replace(/\/+$/, ''),
    pagaRequestExpiryMinutes: expiryMinutes,
    publicAppUrl: publicAppUrl.replace(/\/+$/, ''),
  }
}

export function getAdminEnv(): Pick<ServerEnv, 'supabaseServiceRoleKey' | 'supabaseUrl'> {
  return {
    supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL'),
  }
}

export function getServerEnv(): ServerEnv {
  return { ...getPagaEnv(), ...getAdminEnv() }
}
