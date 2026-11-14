'use client'

import { useEffect, useState } from 'react'
import { Pencil, Plus, X } from 'lucide-react'
import { PageHeader, StatusBadge } from '@/components/plank-ui'
import { useAppInfo } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/client'
import { groupLabels } from '@/lib/labels'
import { getMemberStatus, type MemberStatus } from '@/lib/status'
import { initials, money } from '@/lib/format'
import { PaymentLinkActions } from '@/components/payment-links'
import { normalizeNgPhone } from '@/lib/phone'
import { firstContributionDate } from '@/lib/schedule'
import type { Charge, Member } from '@/lib/types'

type MemberForm = { name: string; house: string; phone: string; amount: string; first_due_date: string; active: boolean }
type DisplayMember = Omit<Member, 'status'> & { membershipStatus: Member['status']; status: MemberStatus }

const emptyForm: MemberForm = { name: '', house: '', phone: '', amount: '', first_due_date: '', active: true }

export default function MembersPage() {
  const { group } = useAppInfo()
  const labels = groupLabels(group.type)
  const [members, setMembers] = useState<DisplayMember[]>([])
  const [pendingMembers, setPendingMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState<DisplayMember | null>(null)
  const [form, setForm] = useState<MemberForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [chargeFromStart, setChargeFromStart] = useState(false)

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
    setChargeFromStart(false)
    setForm({ ...emptyForm, first_due_date: firstContributionDate(group, new Date()) })
    setError('')
    setErrorCode('')
    setShow(true)
  }

  function openEdit(member: DisplayMember) {
    setEditing(member)
    setForm({
      name: member.name,
      house: member.house,
      phone: member.phone,
      amount: member.amount?.toString() ?? '',
      first_due_date: member.first_due_date ?? '',
      active: member.membershipStatus === 'active',
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
    const memberAmount = form.amount.trim() ? Number(form.amount.trim().replace(/[₦,\s]/g, '')) : null
    if (memberAmount !== null && (!Number.isFinite(memberAmount) || memberAmount <= 0)) {
      setError('Enter an amount above zero, or leave it blank.')
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
      phone_normalized: normalizeNgPhone(form.phone),
      first_due_date: editing
        ? form.first_due_date || null
        : chargeFromStart && group.first_due_date
          ? group.first_due_date
          : firstContributionDate(group, new Date()),
      status: membershipStatus,
      joined_via: editing?.joined_via ?? 'treasurer',
      joined_at: editing?.joined_at ?? new Date().toISOString(),
    }
    const result = editing
      ? await supabase.from('members').update(values).eq('id', editing.id).select('*').single()
      : await supabase.from('members').insert({ ...values, group_id: group.id }).select('*').single()
    if (result.error) {
      if (!editing) {
        console.error('Failed to insert member', {
          code: result.error.code,
          message: result.error.message,
          details: result.error.details,
          hint: result.error.hint,
        })
        setErrorCode(result.error.code)
      }
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
    const { error: updateError } = await createClient().from('members')
      .update({ status })
      .eq('group_id', group.id)
      .eq('id', memberId)
    if (updateError) {
      setError('We could not update this join request. Please try again.')
      return
    }
    const member = pendingMembers.find((item) => item.id === memberId)
    setPendingMembers((current) => current.filter((item) => item.id !== memberId))
    if (status === 'active' && member) {
      setMembers((current) => [...current, {
        ...member,
        membershipStatus: 'active',
        status: getMemberStatus([], new Date(), group.frequency, group.due_rule),
      }])
    }
  }

  return <>
    <PageHeader group={group} eyebrow={group.name} title={labels.people[0]?.toUpperCase() + labels.people.slice(1)} description={`${members.length} ${labels.people} in ${group.name}`} action={<button className="button primary" onClick={openAdd}><Plus size={17} />Add {labels.people.slice(0, -1)}</button>} />
    {pendingMembers.length > 0 && <div className="content-card full pending-members-card"><div className="card-head"><div><h2>Waiting for approval</h2><p>{pendingMembers.length} requests to join</p></div></div>
      <div className="member-card-list">{pendingMembers.map((member) => <article className="member-card" key={member.id}>
        <div className="member-card-main"><div className="member-name"><b>{member.name}</b><span>{member.phone_normalized ? `+${member.phone_normalized}` : member.phone}</span></div></div>
        <div className="member-card-actions"><button type="button" className="button primary" onClick={() => reviewRequest(member.id, 'active')}>Approve</button><button type="button" className="button secondary" onClick={() => reviewRequest(member.id, 'removed')}>Decline</button></div>
      </article>)}</div>
    </div>}
    <div className="content-card full members-card"><div className="card-head members-card-head"><div><h2>All {labels.people}</h2><p>{members.length} {labels.people} · Payment status and payment links</p></div></div>
    {loading ? <div className="empty">Loading members...</div> : error && members.length === 0 ? <div className="empty" role="alert">{error}</div> : members.length === 0 ? <div className="empty"><b>No {labels.people} yet</b><span>Add the first person to get started.</span></div> : <div className="member-card-list">{members.map((member) => <article className="member-card" id={`member-${member.id}`} key={member.id}>
      <div className="member-card-main">
        <div className="initials">{initials(member.name)}</div>
        <div className="member-name"><b>{member.name}{member.joined_via === 'link' && member.joined_at && Date.now() - new Date(member.joined_at).getTime() < 7 * 86400000 && <span className="new-badge">New</span>}</b><span>{member.house || `No ${labels.unit.toLowerCase()} listed`} · {member.phone_normalized ? `+${member.phone_normalized}` : member.phone || 'No phone number'}</span><small>{member.status?.label ?? 'No bills yet'}</small></div>
        <div className="member-card-summary">{member.status && <StatusBadge state={member.status.state} />}<div><small>Amount</small><b>{money(member.amount ?? group.amount)}</b></div></div>
      </div>
      <div className="member-card-tools">
        <div className="member-card-actions">
          <PaymentLinkActions member={member} groupName={group.name} />
          <button className="icon-button member-edit-button" aria-label={`Edit ${member.name}`} onClick={() => openEdit(member)}><Pencil size={15} /></button>
        </div>
      </div>
    </article>)}</div>}
      {error && members.length > 0 && !show && <p className="form-error" role="alert">{error}{errorCode && <small className="form-error-code">Code {errorCode}</small>}</p>}
    </div>
    {show && <div className="modal-backdrop" onClick={() => setShow(false)}><form className="sheet" onClick={(event) => event.stopPropagation()} onSubmit={saveMember}>
      <button type="button" className="close" onClick={() => setShow(false)} aria-label="Close"><X size={18} /></button><p className="eyebrow">{editing ? 'Edit person' : `New ${labels.people.slice(0, -1)}`}</p><h2>{editing ? 'Update their details' : 'Add someone to the group'}</h2><p className="description">Add or change their payment details.</p>
      <label>Full name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Enter a name" /></label>
      <label>{labels.unit}<input value={form.house} onChange={(event) => setForm({ ...form, house: event.target.value })} placeholder={`Enter ${labels.unit.toLowerCase()}`} /></label>
      <label>Phone number<input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
      <label>Amount (blank uses group amount)<input inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
      {!editing && <label className="active-switch"><input type="checkbox" checked={chargeFromStart} onChange={(event) => setChargeFromStart(event.target.checked)} />Charge from the start of the group</label>}
      {(editing || group.due_mode === 'per_member') && <label>First due date<input type="date" required={!editing && group.due_mode === 'per_member'} value={form.first_due_date} onChange={(event) => setForm({ ...form, first_due_date: event.target.value })} /></label>}
      <label className="active-switch"><input type="checkbox" checked={!form.active} onChange={(event) => setForm({ ...form, active: !event.target.checked })} />Moved out or stopped paying</label>
      {error && <p className="form-error" role="alert">{error}{errorCode && <small className="form-error-code">Code {errorCode}</small>}</p>}
      <button className="button primary wide" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save changes' : 'Add person'}</button>
    </form></div>}
  </>
}
