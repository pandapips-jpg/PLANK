import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { StartForm } from '@/components/start-form'

export default async function StartPage() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError && userError.name !== 'AuthSessionMissingError') throw userError

  let initialStep = 1
  if (user) {
    const { data: groups, error } = await supabase
      .from('groups')
      .select('id')
      .eq('owner_id', user.id)
    if (error) throw error
    if (groups?.length) redirect('/app')
    initialStep = 2
  }

  return <StartForm initialStep={initialStep} hasGroups={false} isAuthenticated={Boolean(user)} />
}
