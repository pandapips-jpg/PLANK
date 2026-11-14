import Link from 'next/link'
import { Plus } from 'lucide-react'
import { redirect } from 'next/navigation'
import { GroupMark } from '@/components/group-mark'
import { createClient } from '@/lib/supabase/server'
import { getMemberStatus } from '@/lib/status'
import type { Charge, Group } from '@/lib/types'

export default async function GroupsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: groups, error: groupsError } = await supabase.from('groups').select('*').eq('owner_id', user.id).order('created_at')
  if (groupsError) throw groupsError
  if (!groups?.length) redirect('/app/new')

  const summaries = await Promise.all(groups.map(async (group) => {
    const { error: refreshError } = await supabase.rpc('refresh_charges', { p_group: group.id })
    if (refreshError) throw refreshError
    const { data: members, error: memberError } = await supabase.from('members').select('id').eq('group_id', group.id).eq('status', 'active')
    if (memberError) throw memberError
    const memberIds = (members ?? []).map((member) => member.id)
    const chargeResult = memberIds.length
      ? await supabase.from('charges').select('member_id, due_date, amount, paid_amount').in('member_id', memberIds)
      : { data: [] as Charge[], error: null }
    if (chargeResult.error) throw chargeResult.error
    const byMember = new Map<string, Charge[]>()
    for (const charge of chargeResult.data ?? []) {
      const charges = byMember.get(charge.member_id) ?? []
      charges.push(charge)
      byMember.set(charge.member_id, charges)
    }
    const statuses = memberIds.map((id) => getMemberStatus(byMember.get(id) ?? [], new Date(), group.frequency, group.due_rule))
    return {
      group: group as Group,
      paid: statuses.filter((status) => status.state === 'paid').length,
      overdue: statuses.filter((status) => status.state === 'overdue').length,
    }
  }))

  return <div className="groups-page">
    <div className="page-header"><div><p className="eyebrow">Your Plank</p><h1>Your groups</h1><p className="description">Choose a group to continue.</p></div></div>
    <div className="groups-grid">
      {summaries.map(({ group, paid, overdue }) => <Link className="group-card" href={`/app/groups/${group.id}`} key={group.id}>
        <GroupMark group={group} />
        <div><h2>{group.name}</h2><p>{group.type}</p><small>{paid} paid, {overdue} overdue</small></div>
      </Link>)}
      <Link className="group-card create-group-card" href="/app/new"><span className="group-mark create-group-mark"><Plus size={21} /></span><div><h2>Create a new group</h2><p>Set up another group</p></div></Link>
    </div>
  </div>
}
