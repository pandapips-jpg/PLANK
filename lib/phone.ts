export function normalizeNgPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  const international = digits.startsWith('0') ? `234${digits.slice(1)}` : digits
  if (!/^234[789]\d{9}$/.test(international)) return null
  return international
}

export function toLocalNg(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  const local = digits.startsWith('234') ? `0${digits.slice(3)}` : digits
  return /^0[789]\d{9}$/.test(local) ? local : null
}
