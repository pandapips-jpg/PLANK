import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'

export default async function ProfileLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: groups, error } = await supabase.from('groups').select('*').eq('owner_id', user.id).order('created_at')
  if (error) throw error
  const lastGroup = (await cookies()).get('plank_last_group')?.value
  const group = groups?.find((item) => item.id === lastGroup) ?? groups?.[0]
  if (!group) redirect('/app/new')
  const name = typeof user.user_metadata.full_name === 'string'
    ? user.user_metadata.full_name
    : user.email?.split('@')[0] ?? 'Treasurer'
  const phone = typeof user.user_metadata.phone === 'string' ? user.user_metadata.phone : ''
  return <AppShell info={{ group, groups, name, phone }}>{children}</AppShell>
}
