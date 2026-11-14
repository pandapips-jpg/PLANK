import Link from 'next/link'
import { ArrowRight, Plus } from 'lucide-react'
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
      members: memberIds.length,
      paid: statuses.filter((status) => status.state === 'paid').length,
      overdue: statuses.filter((status) => status.state === 'overdue').length,
    }
  }))

  return <div className="groups-page">
    <div className="page-header groups-page-header"><div><p className="eyebrow">Your Plank</p><h1>Your groups</h1><p className="description">Choose a group to continue.</p></div><Link className="button primary groups-new-button" href="/app/new"><Plus size={17} />New group</Link></div>
    <div className="groups-grid">
      {summaries.map(({ group, members, overdue }) => <Link className="group-card" href={`/app/groups/${group.id}`} key={group.id}>
        <div className="group-card-head"><GroupMark group={group} /><div className="group-card-title"><h2 title={group.name}>{group.name}</h2><span className="group-type-pill">{group.type}</span></div></div>
        <div className="group-card-stats">
          <div><small>Members</small><b>{members}</b></div>
          <div><small>Collected this month</small><b aria-label="Not available">—</b></div>
          <div><small>Overdue</small><b>{overdue}</b></div>
        </div>
        <span className="group-card-open">Open <ArrowRight size={15} aria-hidden="true" /></span>
      </Link>)}
    </div>
  </div>
}
