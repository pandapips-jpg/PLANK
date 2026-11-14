import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LoginForm } from '@/components/login-form'

export default async function LoginPage() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError && userError.name !== 'AuthSessionMissingError') throw userError
  if (user) {
    const { data: groups, error } = await supabase
      .from('groups')
      .select('id')
      .eq('owner_id', user.id)
    if (error) throw error
    redirect(groups?.length ? '/app' : '/app/new')
  }
  return <LoginForm />
}
