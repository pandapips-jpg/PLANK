import { createClient } from '@/lib/supabase/client'

export function signUpWithEmailPassword(email: string, password: string, fullName: string, phone: string) {
  return createClient().auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone },
    },
  })
}

export function signInWithEmailPassword(email: string, password: string) {
  return createClient().auth.signInWithPassword({ email, password })
}
