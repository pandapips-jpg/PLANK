import { redirect } from 'next/navigation'
import { StartForm } from '@/components/start-form'
import { createClient } from '@/lib/supabase/server'

export default async function NewGroupPage() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError && userError.name !== 'AuthSessionMissingError') throw userError
  if (!user) redirect('/login')

  const { data: groups, error: groupsError } = await supabase
    .from('groups')
    .select('id')
    .eq('owner_id', user.id)
  if (groupsError) throw groupsError

  return <StartForm initialStep={2} hasGroups={Boolean(groups?.length)} isAuthenticated />
}
