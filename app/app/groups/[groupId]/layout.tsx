import { notFound, redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'

export default async function GroupLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ groupId: string }> }>) {
  const { groupId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: groups, error: groupsError } = await supabase.from('groups').select('*').eq('owner_id', user.id).order('created_at')
  if (groupsError) throw groupsError
  const group = groups?.find((item) => item.id === groupId)
  if (!group) notFound()

  const name = typeof user.user_metadata.full_name === 'string'
    ? user.user_metadata.full_name
    : user.email?.split('@')[0] ?? 'Treasurer'
  const phone = typeof user.user_metadata.phone === 'string' ? user.user_metadata.phone : ''
  return <AppShell info={{ group, groups: groups ?? [], name, phone }}>{children}</AppShell>
}
