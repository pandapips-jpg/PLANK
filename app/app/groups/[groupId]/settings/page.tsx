'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/plank-ui'
import { useAppInfo } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/client'
import { groupLabels } from '@/lib/labels'
import { GroupLogoInput } from '@/components/group-logo-input'
import { JoinLinkActions } from '@/components/join-link-actions'
import { nextWeekdayDate } from '@/lib/schedule'
import type { Charge, DueMode, GroupType, GroupVisibility, PaymentFrequency } from '@/lib/types'

export default function SettingsPage() {
  const { group } = useAppInfo()
  const router = useRouter()
  const [name, setName] = useState(group.name)
  const [type, setType] = useState<GroupType>(group.type)
  const [amount, setAmount] = useState(String(group.amount))
  const [frequency, setFrequency] = useState<PaymentFrequency>(group.frequency)
  const [dueWeekday, setDueWeekday] = useState(() => group.first_due_date
    && (group.frequency === 'weekly' || group.frequency === 'biweekly')
    ? new Date(`${group.first_due_date.slice(0, 10)}T00:00:00Z`).getUTCDay()
    : 5)
  const [dueMode, setDueMode] = useState<DueMode>(group.due_mode)
  const [visibility, setVisibility] = useState<GroupVisibility>(group.visibility)
  const [firstDueDate, setFirstDueDate] = useState(group.first_due_date ?? '')
  const [joinToken, setJoinToken] = useState(group.join_token)
  const [joinOpen, setJoinOpen] = useState(group.join_open)
  const [joinNeedsApproval, setJoinNeedsApproval] = useState(group.join_needs_approval)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoError, setLogoError] = useState('')
  const [confirmName, setConfirmName] = useState('')
  const [chargeCount, setChargeCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const weekly = frequency === 'weekly' || frequency === 'biweekly'
  const originalWeekday = group.first_due_date && (group.frequency === 'weekly' || group.frequency === 'biweekly')
    ? new Date(`${group.first_due_date.slice(0, 10)}T00:00:00Z`).getUTCDay()
    : 5

  useEffect(() => {
    let active = true
    async function loadCharges() {
      const supabase = createClient()
      const { error: refreshError } = await supabase.rpc('refresh_charges', { p_group: group.id })
      if (refreshError) {
        if (active) {
          setError('We could not refresh payment details. Please refresh and try again.')
          setLoading(false)
        }
        return
      }
      const { data: members, error: memberError } = await supabase.from('members').select('id').eq('group_id', group.id).eq('status', 'active')
      if (!active) return
      if (memberError) {
        setError('We could not load your group details. Please refresh and try again.')
        setLoading(false)
        return
      }
      const memberIds = (members ?? []).map((member) => member.id)
      const result = memberIds.length
        ? await supabase.from('charges').select('member_id, due_date, amount, paid_amount').in('member_id', memberIds)
        : { data: [] as Charge[], error: null }
      if (!active) return
      if (result.error) setError('We could not load payment details. Please refresh and try again.')
      else setChargeCount(result.data?.length ?? 0)
      setLoading(false)
    }
    void loadCharges()
    return () => { active = false }
  }, [group.id])

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (logoError) {
      setError(logoError)
      return
    }
    const value = Number(amount.trim().replace(/[₦,\s]/g, ''))
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount above zero.')
      return
    }
    if (!weekly && dueMode === 'shared' && !firstDueDate) {
      setError('Choose the first due date.')
      return
    }
    setSaving(true)
    setError('')
    setSaved(false)
    const supabase = createClient()
    let logoUrl = group.logo_url
    if (logoFile) {
      const extension = logoFile.type === 'image/jpeg' ? 'jpg' : logoFile.type === 'image/png' ? 'png' : 'webp'
      const path = `${group.id}/logo-${Date.now()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('group-logos').upload(path, logoFile, {
        contentType: logoFile.type,
        upsert: true,
      })
      if (uploadError) {
        setSaving(false)
        setError('We could not upload the group logo. Please try again.')
        return
      }
      logoUrl = supabase.storage.from('group-logos').getPublicUrl(path).data.publicUrl
    }
    const { error: updateError } = await supabase.from('groups').update({
      name: name.trim(),
      type,
      amount: value,
      frequency,
      due_rule: weekly ? 'fixed' : group.due_rule,
      due_day: weekly ? 5 : group.due_day,
      due_mode: dueMode,
      first_due_date: weekly
        ? frequency !== group.frequency || dueWeekday !== originalWeekday || !firstDueDate
          ? nextWeekdayDate(new Date(), dueWeekday)
          : firstDueDate
        : firstDueDate || null,
      visibility,
      logo_url: logoUrl,
      join_open: joinOpen,
      join_needs_approval: joinNeedsApproval,
    }).eq('id', group.id)
    setSaving(false)
    if (updateError) {
      setError('We could not save your group settings. Please try again.')
      return
    }
    setSaved(true)
    router.refresh()
  }

  async function resetJoinLink() {
    if (!window.confirm('Reset this join link? The old link will stop working.')) return
    setSaving(true)
    setError('')
    const newToken = crypto.randomUUID()
    const { error: updateError } = await createClient().from('groups')
      .update({ join_token: newToken })
      .eq('id', group.id)
    setSaving(false)
    if (updateError) {
      setError('We could not reset the join link. Please try again.')
      return
    }
    setJoinToken(newToken)
    setSaved(true)
    router.refresh()
  }

  async function deleteGroup() {
    if (confirmName !== group.name) {
      setError('Type the group name exactly to delete it.')
      return
    }
    setSaving(true)
    setError('')
    const { error: deleteError } = await createClient().from('groups').delete().eq('id', group.id)
    setSaving(false)
    if (deleteError) {
      setError('We could not delete this group. Please try again.')
      return
    }
    router.replace('/app')
    router.refresh()
  }

  const labels = groupLabels(type)

  return <>
    <PageHeader group={group} eyebrow={group.name} title="Group settings" description="Change how your group collects money." />
    <form className="settings-form" onSubmit={saveSettings}>
      <section className="content-card settings-section join-settings">
        <h2>Join link</h2>
        <JoinLinkActions groupName={group.name} joinToken={joinToken} />
        <button type="button" className="text-button" disabled={saving} onClick={resetJoinLink}>Reset link</button>
      </section>
      <section className="content-card settings-section">
        <h2>Who can join?</h2>
        <label className="active-switch settings-switch-row"><span><b>Let people join with the link</b><small>Anyone with the join link can ask to join.</small></span><input type="checkbox" checked={joinOpen} onChange={(event) => setJoinOpen(event.target.checked)} /></label>
        <label className="active-switch settings-switch-row"><span><b>I approve new members first</b><small>Review each request before a person joins.</small></span><input type="checkbox" checked={joinNeedsApproval} onChange={(event) => setJoinNeedsApproval(event.target.checked)} /></label>
      </section>
      <section className="content-card settings-section">
        <h2>Group details</h2>
        <label>Group name<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
        <GroupLogoInput group={group} file={logoFile} onChange={(file, message) => { setLogoFile(file); setLogoError(message) }} />
        {logoError && <p className="logo-error" role="alert">{logoError}</p>}
        <label>Group type<select value={type} onChange={(event) => setType(event.target.value as GroupType)}><option>Estate</option><option>Church</option><option>Union</option><option>Age grade</option><option>Rent (property)</option><option>Other</option></select></label>
      </section>
      <section className="content-card settings-section">
        <h2>Contributions</h2>
        <label>How much? Default {labels.payment} per {labels.people.slice(0, -1)}<input inputMode="decimal" required value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <label>How often do people pay?<select value={frequency} onChange={(event) => setFrequency(event.target.value as PaymentFrequency)}><option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="monthly">Monthly</option><option value="quarterly">Every 3 months</option><option value="yearly">Yearly</option><option value="one_time">One time</option></select></label>
        <label>Does everyone pay on the same date?<select value={dueMode} onChange={(event) => setDueMode(event.target.value as DueMode)}><option value="shared">Yes</option><option value="per_member">No</option></select></label>
        {weekly
          ? <label>Which day is it due?<select value={dueWeekday} onChange={(event) => setDueWeekday(Number(event.target.value))}><option value={1}>Monday</option><option value={2}>Tuesday</option><option value={3}>Wednesday</option><option value={4}>Thursday</option><option value={5}>Friday</option><option value={6}>Saturday</option><option value={0}>Sunday</option></select></label>
          : dueMode === 'shared' && <label>First due date<input type="date" required value={firstDueDate} onChange={(event) => setFirstDueDate(event.target.value)} /><small>Pick the next date people should pay. Only pick a past date if people already owe money from then.</small></label>}
      </section>
      <section className="content-card settings-section">
        <h2>Money record</h2>
        <label>Who can see the money record?<select value={visibility} onChange={(event) => setVisibility(event.target.value as GroupVisibility)}><option value="owner">Only me</option><option value="members">Members of this group</option><option value="public">Anyone with the link</option></select><small>{visibility === 'owner' ? 'Only you can see the money record. Members see only their own payments.' : visibility === 'members' ? 'Members see every payment and payout using their own link. Nobody else can.' : 'Anyone who has the group link can see it.'}</small></label>
      </section>
      <div className="settings-save">
        <p className="description">Changes apply to new bills only.</p>
        {loading && <p className="description">Loading payment details...</p>}
        {!loading && !error && <p className="description">{chargeCount} existing bills. Changes apply to new bills only.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {saved && <p className="success"><Check size={17} />Group settings saved.</p>}
        <button className="button primary wide" disabled={saving}>{saving ? 'Saving...' : 'Save settings'}</button>
      </div>
      <section className="content-card delete-group-section"><h2>Delete group</h2><p className="description">This cannot be undone. Your group and its data will be removed.</p><label>Type {group.name} to confirm<input value={confirmName} onChange={(event) => setConfirmName(event.target.value)} /></label><button type="button" className="button secondary wide" disabled={saving || confirmName !== group.name} onClick={deleteGroup}>{saving ? 'Deleting...' : 'Delete group'}</button></section>
    </form>
  </>
}
