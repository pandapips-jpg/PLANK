'use client'

import { useMemo, useState } from 'react'
import { Search, Users } from 'lucide-react'
import { money, initials } from '@/lib/format'
import { StatusBadge } from '@/components/plank-ui'
import type { MemberStatus } from '@/lib/status'
import type { Member } from '@/lib/types'

export type MemberWithStatus = Omit<Member, 'status'> & { membershipStatus: Member['status']; status: MemberStatus }

export function MemberRows({ members, amount, filter = 'All' }: { members: MemberWithStatus[]; amount: number; filter?: string }) {
  const [query, setQuery] = useState('')
  const shown = useMemo(() => members.filter((member) => {
    const matchesStatus = filter === 'All' || (filter === 'Paid' && member.status.state === 'paid') || (filter === 'Due soon' && member.status.state === 'due_soon') || (filter === 'Overdue' && member.status.state === 'overdue')
    return matchesStatus && `${member.name} ${member.house}`.toLowerCase().includes(query.toLowerCase())
  }), [filter, members, query])

  return <>
    <div className="list-tools"><div className="search"><Search size={17} /><input placeholder="Search members" value={query} onChange={(event) => setQuery(event.target.value)} /></div></div>
    <div className="member-list">{shown.map((member) => <div className="member-row" id={`member-${member.id}`} key={member.id}>
      <div className="initials">{initials(member.name)}</div>
      <div className="member-name"><b>{member.name}</b>{member.house && <span className="badge member-tag">{member.house}</span>}<small>{member.status.label}</small></div>
      <span className="amount">{money(member.amount ?? amount)}</span><StatusBadge state={member.status.state} />
    </div>)}</div>
    {shown.length === 0 && <div className="empty"><Users size={28} /><b>No members found</b><span>{members.length === 0 ? 'Add your first member to get started.' : 'Try a different search.'}</span></div>}
  </>
}
