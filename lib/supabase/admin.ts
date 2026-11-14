import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types'
import { getAdminEnv } from '@/lib/env'

export function createAdminClient() {
  const env = getAdminEnv()
  return createSupabaseClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
