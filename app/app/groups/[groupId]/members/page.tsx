'use client'

import { useEffect, useState } from 'react'
import { MoreHorizontal, Pencil, Plus, Search, X } from 'lucide-react'
import { PageHeader, StatusBadge } from '@/components/plank-ui'
import { useAppInfo } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/client'
import { groupLabels } from '@/lib/labels'
import { getMemberStatus, type MemberStatus } from '@/lib/status'
import { initials, money } from '@/lib/format'
import { PaymentLinkActions } from '@/components/payment-links'
import { normalizeNgPhone } from '@/lib/phone'
import { contributionDateForPeriod, contributionPeriodChoices, periodLabels } from '@/lib/schedule'
import type { Charge, Member } from '@/lib/types'

type MemberForm = { name: string; house: string; phone: string; amount: string; first_due_date: string; active: boolean }
type DisplayMember = Omit<Member, 'status'> & { membershipStatus: Member['status']; status: MemberStatus }

const emptyForm: MemberForm = { name: '', house: '', phone: '', amount: '', first_due_date: '', active: true }

export default function MembersPage() {
  const { group } = useAppInfo()
  const labels = groupLabels(group.type)
  const startPeriodChoices = contributionPeriodChoices(group)
  const startLabels = periodLabels(group.frequency)
  const [members, setMembers] = useState<DisplayMember[]>([])
  const [pendingMembers, setPendingMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState<DisplayMember | null>(null)
  const [form, setForm] = useState<MemberForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [memberStartPeriod, setMemberStartPeriod] = useState(startPeriodChoices[1].value)
  const [billingStartChoice, setBillingStartChoice] = useState<'this' | 'next' | 'pick'>('next')
  const [memberSearch, setMemberSearch] = useState('')
  const [memberFilter, setMemberFilter] = useState<'All' | 'Paid' | 'Due soon' | 'Overdue'>('All')

  useEffect(() => {
    let active = true
    async function loadMembers() {
      const supabase = createClient()
      const { error: refreshError } = await supabase.rpc('refresh_charges', { p_group: group.id })
      if (refreshError) {
        if (active) {
          setError('We could not refresh payment details. Please refresh and try again.')
          setLoading(false)
        }
        return
      }
      const { data: memberData, error: memberError } = await supabase.from('members').select('*').eq('group_id', group.id).order('created_at')
      if (!active) return
      if (memberError) {
        setError('We could not load your members. Please refresh and try again.')
        setLoading(false)
        return
      }
      const activeRows = (memberData ?? []).filter((member) => member.status === 'active')
      const pendingRows = (memberData ?? []).filter((member) => member.status === 'pending')
      const chargeResult = activeRows.length
        ? await supabase.from('charges').select('member_id, due_date, amount, paid_amount').in('member_id', activeRows.map((member) => member.id))
        : { data: [], error: null }
      if (!active) return
      if (chargeResult.error) {
        setError('We could not load payment details. Please refresh and try again.')
        setLoading(false)
        return
      }
      const chargesByMember = new Map<string, Charge[]>()
      for (const charge of chargeResult.data ?? []) {
        const list = chargesByMember.get(charge.member_id) ?? []
        list.push(charge)
        chargesByMember.set(charge.member_id, list)
      }
      setPendingMembers(pendingRows)
      setMembers(activeRows.map((member) => ({
        ...member,
        membershipStatus: member.status,
        status: getMemberStatus(chargesByMember.get(member.id) ?? [], new Date(), group.frequency, group.due_rule),
      })))
      setError('')
      setLoading(false)
    }
    void loadMembers()
    return () => { active = false }
  }, [group.id, group.frequency])

  function openAdd() {
    setEditing(null)
    const choices = contributionPeriodChoices(group)
    const selectedPeriod = choices[1].value
    setMemberStartPeriod(selectedPeriod)
    setBillingStartChoice('next')
    setForm({ ...emptyForm, first_due_date: contributionDateForPeriod(group, selectedPeriod) })
    setError('')
    setErrorCode('')
    setShow(true)
  }

  function openEdit(member: DisplayMember, active = member.membershipStatus === 'active') {
    const choices = contributionPeriodChoices(group)
    const thisDate = contributionDateForPeriod(group, choices[0].value)
    const nextDate = contributionDateForPeriod(group, choices[1].value)
    const startChoice = member.first_due_date === thisDate
      ? 'this'
      : member.first_due_date === nextDate
        ? 'next'
        : member.first_due_date ? 'pick' : 'next'
    setEditing(member)
    setBillingStartChoice(startChoice)
    setForm({
      name: member.name,
      house: member.house,
      phone: member.phone,
      amount: member.amount?.toString() ?? '',
      first_due_date: member.first_due_date ?? nextDate,
      active,
    })
    setError('')
    setErrorCode('')
    setShow(true)
  }

  async function saveMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorCode('')
    if (!form.name.trim()) {
      setError("Enter this person's name.")
      return
    }
    if (form.house.trim().length > 30) {
      setError('Tag must be 30 characters or fewer.')
      return
    }
    const memberAmount = form.amount.trim() ? Number(form.amount.trim().replace(/[₦,\s]/g, '')) : null
    if (memberAmount !== null && (!Number.isFinite(memberAmount) || memberAmount <= 0)) {
      setError('Enter an amount above zero, or leave it blank.')
      return
    }
    const phoneNormalized = normalizeNgPhone(form.phone)
    if (form.phone.trim() && !phoneNormalized) {
      setError('Enter a valid Nigerian number like 0803 123 4567.')
      return
    }
    if (!editing && group.due_mode === 'per_member' && !form.first_due_date) {
      setError('Choose a due date for this person.')
      return
    }
    setSaving(true)
    setError('')
    const supabase = createClient()
    const membershipStatus: Member['status'] = editing ? (form.active ? 'active' : 'removed') : 'active'
    const values = {
      name: form.name.trim(),
      house: form.house.trim(),
      phone: form.phone.trim(),
      amount: memberAmount,
      phone_normalized: phoneNormalized,
      first_due_date: editing
        ? form.first_due_date || null
        : form.first_due_date || contributionDateForPeriod(group, memberStartPeriod),
      status: membershipStatus,
      joined_via: editing?.joined_via ?? 'treasurer',
      joined_at: editing?.joined_at ?? new Date().toISOString(),
    }
    const result = editing
      ? await supabase.from('members').update(values).eq('id', editing.id).select('*').single()
      : await supabase.from('members').insert({ ...values, group_id: group.id }).select('*').single()
    if (result.error) {
      if (result.error.code === '23505' && phoneNormalized) {
        let existingQuery = supabase.from('members').select('name')
          .eq('group_id', group.id)
          .eq('phone_normalized', phoneNormalized)
          .neq('status', 'removed')
        if (editing) existingQuery = existingQuery.neq('id', editing.id)
        const { data: existingMember, error: lookupError } = await existingQuery.limit(1).maybeSingle()
        if (lookupError) console.error('Could not look up the member with the duplicate phone number', { code: lookupError.code })
        if (existingMember) {
          setError(`${existingMember.name} already has this phone number in this group. Use a different number or leave it empty.`)
          setSaving(false)
          return
        }
      }
      console.error('Failed to save member', { code: result.error.code })
      setErrorCode(result.error.code)
      setSaving(false)
      setError(editing ? 'We could not save these changes. Please try again.' : 'We could not add this person. Please try again.')
      return
    }
    const savedMember = result.data
    if (!editing) {
      const newMember = { ...savedMember, membershipStatus: savedMember.status, status: getMemberStatus([], new Date(), group.frequency, group.due_rule) }
      setMembers((current) => [...current, newMember])
    }
    const { error: refreshError } = await supabase.rpc('refresh_charges', { p_group: group.id })
    if (refreshError) {
      setSaving(false)
      if (editing) {
        setMembers((current) => current.map((member) => member.id === savedMember.id
          ? { ...savedMember, membershipStatus: savedMember.status, status: member.status }
          : member))
      }
      setShow(false)
      setError('Your changes were saved, but we could not refresh payment details. Please refresh the page.')
      return
    }
    const { data: charges, error: chargeError } = await supabase.from('charges').select('member_id, due_date, amount, paid_amount').eq('member_id', savedMember.id)
    setSaving(false)
    if (chargeError) {
      setError('Your changes were saved, but we could not load payment details. Please refresh the page.')
      setShow(false)
      return
    }
    const saved = { ...savedMember, membershipStatus: savedMember.status, status: getMemberStatus(charges ?? [], new Date(), group.frequency, group.due_rule) }
    setMembers((current) => current.flatMap((member) => {
      if (member.id !== saved.id) return [member]
      if (saved.membershipStatus !== 'active') return []
      return [saved]
    }))
    setShow(false)
  }

  async function reviewRequest(memberId: string, status: 'active' | 'removed') {
    setError('')
    setErrorCode('')
    const supabase = createClient()
    const member = pendingMembers.find((item) => item.id === memberId)
    const { error: updateError } = await supabase.from('members')
      .update({ status })
      .eq('group_id', group.id)
      .eq('id', memberId)
    if (updateError) {
      if (updateError.code === '23505' && member?.phone_normalized) {
        const { data: existingMember, error: lookupError } = await supabase.from('members').select('name')
          .eq('group_id', group.id)
          .eq('phone_normalized', member.phone_normalized)
          .neq('status', 'removed')
          .neq('id', memberId)
          .limit(1)
          .maybeSingle()
        if (lookupError) console.error('Could not look up the member with the duplicate phone number', { code: lookupError.code })
        if (existingMember) {
          setError(`${existingMember.name} already has this phone number in this group. Use a different number or leave it empty.`)
          return
        }
      }
      console.error('Failed to update join request', { code: updateError.code })
      setErrorCode(updateError.code)
      setError('We could not update this join request. Please try again.')
      return
    }
    setPendingMembers((current) => current.filter((item) => item.id !== memberId))
    if (status === 'active' && member) {
      setMembers((current) => [...current, {
        ...member,
        membershipStatus: 'active',
        status: getMemberStatus([], new Date(), group.frequency, group.due_rule),
      }])
    }
  }

  const memberFilterCounts = {
    All: members.length,
    Paid: members.filter((member) => member.status.state === 'paid').length,
    'Due soon': members.filter((member) => member.status.state === 'due_soon').length,
    Overdue: members.filter((member) => member.status.state === 'overdue').length,
  }
  const visibleMembers = members.filter((member) => {
    const query = memberSearch.trim().toLowerCase()
    const matchesSearch = !query || [member.name, member.house, member.phone, member.phone_normalized ?? ''].some((value) => value.toLowerCase().includes(query))
    const filterState = memberFilter === 'Paid' ? 'paid' : memberFilter === 'Due soon' ? 'due_soon' : memberFilter === 'Overdue' ? 'overdue' : null
    return matchesSearch && (!filterState || member.status.state === filterState)
  })

  function moreActions(member: DisplayMember) {
    return <details className="member-more">
      <summary><MoreHorizontal size={17} />More</summary>
      <div className="member-more-menu">
        <PaymentLinkActions member={member} groupName={group.name} showPreview />
        <button type="button" onClick={() => openEdit(member)}><Pencil size={15} />Edit</button>
        <button type="button" onClick={() => openEdit(member, false)}>Remove</button>
      </div>
    </details>
  }

  return <>
    <PageHeader group={group} eyebrow={group.name} title={labels.people[0]?.toUpperCase() + labels.people.slice(1)} description={`${members.length} ${labels.people} in ${group.name}`} action={<button className="button primary" onClick={openAdd}><Plus size={17} />Add {labels.people.slice(0, -1)}</button>} />
    {pendingMembers.length > 0 && <div className="content-card full pending-members-card"><div className="card-head"><div><h2>Waiting for approval</h2><p>{pendingMembers.length} requests to join</p></div></div>
      <div className="member-card-list">{pendingMembers.map((member) => <article className="member-card" key={member.id}>
        <div className="member-card-main">        <div className="member-name"><b>{member.name}</b>{member.house && <span className="badge member-tag">{member.house}</span>}<span>{member.phone_normalized ? `+${member.phone_normalized}` : 'No phone yet'}</span>{!member.phone_normalized && <small className="phone-missing-hint">They can&apos;t pay until they join by link or you add a number.</small>}</div></div>
        <div className="member-card-actions"><button type="button" className="button primary" onClick={() => reviewRequest(member.id, 'active')}>Approve</button><button type="button" className="button secondary" onClick={() => reviewRequest(member.id, 'removed')}>Decline</button></div>
      </article>)}</div>
    </div>}
    <div className="content-card full members-card"><div className="card-head members-card-head"><div><h2>All {labels.people}</h2><p>{members.length} {labels.people} · Payment status and payment links</p></div></div>
    {loading ? <div className="list-skeleton" aria-label="Loading members"><span /><span /><span /></div> : error && members.length === 0 ? <div className="empty" role="alert">{error}</div> : members.length === 0 ? <div className="empty"><b>No {labels.people} yet</b><span>Add the first person to get started.</span></div> : <>
      <div className="member-list-tools">
        <label className="members-search"><Search size={17} aria-hidden="true" /><input type="search" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder={`Search ${labels.people.toLowerCase()}`} aria-label={`Search ${labels.people.toLowerCase()}`} /></label>
        <div className="member-filter-chips" aria-label="Filter by payment status">
          {(['All', 'Paid', 'Due soon', 'Overdue'] as const).map((value) => <button type="button" key={value} className={memberFilter === value ? 'selected' : ''} aria-pressed={memberFilter === value} onClick={() => setMemberFilter(value)}>{value}<span>{memberFilterCounts[value]}</span></button>)}
        </div>
      </div>
      {visibleMembers.length === 0 ? <div className="empty"><b>No people match this search.</b><button type="button" className="text-button" onClick={() => { setMemberSearch(''); setMemberFilter('All') }}>Clear search and filters</button></div> : <>
        <div className="member-card-list member-cards">
          {visibleMembers.map((member) => <article className="member-card" id={`member-${member.id}`} key={member.id}>
            <div className="member-card-main">
              <div className="initials">{initials(member.name)}</div>
              <div className="member-name"><b>{member.name}{member.joined_via === 'link' && member.joined_at && Date.now() - new Date(member.joined_at).getTime() < 7 * 86400000 && <span className="new-badge">New</span>}</b>{member.house && <span className="badge member-tag">{member.house}</span>}<small>{member.phone_normalized ? `+${member.phone_normalized}` : 'No phone yet'}</small>{!member.phone_normalized && <small className="phone-missing-hint">They can&apos;t pay until they join by link or you add a number.</small>}</div>
              <div className="member-card-summary">{member.status && <StatusBadge state={member.status.state} />}<div><small>Amount</small><b>{money(member.amount ?? group.amount)}</b></div></div>
            </div>
            <div className="member-card-due">{member.status?.label ?? 'No bills yet'}</div>
            {moreActions(member)}
          </article>)}
        </div>
        <div className="members-table-wrap">
          <table className="members-table">
            <thead><tr><th>Name</th><th>{labels.tag}</th><th>Phone</th><th>Status</th><th>Due</th><th>Actions</th></tr></thead>
            <tbody>{visibleMembers.map((member) => <tr id={`member-table-${member.id}`} key={member.id}>
              <td><span className="member-table-name"><span className="initials">{initials(member.name)}</span><b>{member.name}</b></span></td>
              <td>{member.house}</td>
              <td>{member.phone_normalized ? `+${member.phone_normalized}` : 'No phone yet'}</td>
              <td><StatusBadge state={member.status.state} /></td>
              <td>{member.status?.label ?? 'No bills yet'}</td>
              <td>{moreActions(member)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </>}
    </>}
      {error && members.length > 0 && !show && <p className="form-error" role="alert">{error}{errorCode && <small className="form-error-code">Code {errorCode}</small>}</p>}
    </div>
    {show && <div className="modal-backdrop" onClick={() => setShow(false)}><form className="sheet" onClick={(event) => event.stopPropagation()} onSubmit={saveMember}>
      <button type="button" className="close" onClick={() => setShow(false)} aria-label="Close"><X size={18} /></button><p className="eyebrow">{editing ? 'Edit person' : `New ${labels.people.slice(0, -1)}`}</p><h2>{editing ? form.active ? 'Update their details' : 'Remove this person?' : 'Add someone to the group'}</h2><p className="description">Add or change their payment details.</p>
      <label>Full name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Enter a name" /></label>
      <label>{labels.tag}<input maxLength={30} value={form.house} onChange={(event) => setForm({ ...form, house: event.target.value })} placeholder={labels.tagPlaceholder} /></label>
      <label>Phone number<input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
      <label>Amount (blank uses group amount)<input inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
      {!editing && <label>Starts<select value={memberStartPeriod} onChange={(event) => {
        setMemberStartPeriod(event.target.value)
        setForm((current) => ({ ...current, first_due_date: contributionDateForPeriod(group, event.target.value) }))
      }}>{startPeriodChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>}
      {editing
        ? <label>Billing starts<select value={billingStartChoice} onChange={(event) => {
          const value = event.target.value as 'this' | 'next' | 'pick'
          setBillingStartChoice(value)
          if (value !== 'pick') {
            const choices = contributionPeriodChoices(group)
            setForm((current) => ({ ...current, first_due_date: contributionDateForPeriod(group, choices[value === 'this' ? 0 : 1].value) }))
          }
        }}><option value="this">{startLabels.thisPeriod}</option><option value="next">{startLabels.nextPeriod}</option><option value="pick">Pick a date</option></select><small>Pick &apos;{startLabels.thisPeriod}&apos; if this person should pay from now.</small></label>
        : null}
      {(editing && billingStartChoice === 'pick' || !editing && group.due_mode === 'per_member') && <label>{editing ? 'Billing starts' : 'First due date'}<input type="date" required value={form.first_due_date} onChange={(event) => setForm({ ...form, first_due_date: event.target.value })} /></label>}
      <label className="active-switch"><input type="checkbox" checked={!form.active} onChange={(event) => setForm({ ...form, active: !event.target.checked })} />Moved out or stopped paying</label>
      {error && <p className="form-error" role="alert">{error}{errorCode && <small className="form-error-code">Code {errorCode}</small>}</p>}
      <button className="button primary wide" disabled={saving}>{saving ? 'Saving...' : editing ? form.active ? 'Save changes' : 'Remove person' : 'Add person'}</button>
    </form></div>}
  </>
}
