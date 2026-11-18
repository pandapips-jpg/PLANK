'use client'

import { useEffect, useState } from 'react'
import { Bell, Copy, MessageCircle } from 'lucide-react'
import { PageHeader } from '@/components/plank-ui'
import { useAppInfo } from '@/components/app-shell'
import { recordReminderSent } from '@/app/actions/reminders'
import { createClient } from '@/lib/supabase/client'
import { groupLabels } from '@/lib/labels'
import { getMemberStatus, type MemberStatus } from '@/lib/status'
import { money, scheduleDate } from '@/lib/format'
import { normalizeNgPhone } from '@/lib/phone'
import type { Charge, DueRule, Member, PaymentFrequency } from '@/lib/types'

type Language = 'English' | 'Pidgin'
type OwingMember = Omit<Member, 'status'> & { membershipStatus: Member['status']; status: MemberStatus }

function reminderMessage(member: OwingMember, paymentLabel: string, link: string, language: Language, dueRule: DueRule, frequency: PaymentFrequency) {
  const dateValue = member.status.nextDue ? new Date(`${member.status.nextDue.slice(0, 10)}T00:00:00`) : null
  const weekly = frequency === 'weekly' || frequency === 'biweekly'
  if (dateValue && member.status.state === 'overdue' && (dueRule === 'month_end' || weekly)) dateValue.setDate(dateValue.getDate() + 1)
  const date = dateValue
    ? weekly
      ? scheduleDate(`${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, '0')}-${String(dateValue.getDate()).padStart(2, '0')}`, frequency)
      : dateValue.toLocaleDateString('en-NG', { day: 'numeric', month: 'long' })
    : ''
  const late = member.status.state === 'overdue'
  const amountText = money(member.status.remaining)

  if (language === 'Pidgin') {
    const body = late
      ? `Your ${amountText} ${paymentLabel} for ${date} never enter yet. Abeg pay when you fit.`
      : `Your ${amountText} ${paymentLabel} dey come up on ${date}. Abeg plan for am.`
    return `Good afternoon ${member.name}, small reminder o. ${body} Check your payment details here: ${link}. Thank you!`
  }
  const body = late
    ? dueRule === 'month_end' || weekly
      ? `Your ${amountText} ${paymentLabel} is overdue since ${date}. Please pay when you can.`
      : `Your ${amountText} ${paymentLabel} due on ${date} is overdue. Please pay when you can.`
    : `Your ${amountText} ${paymentLabel} is due ${dueRule === 'month_end' ? 'by' : 'on'} ${date}. Please plan for it.`
  return `Hello ${member.name}, ${body} You can see your payment details here: ${link}. Thank you!`
}

export default function RemindPage() {
  const { group } = useAppInfo()
  const labels = groupLabels(group.type)
  const [members, setMembers] = useState<OwingMember[]>([])
  const [language, setLanguage] = useState<Language>('English')
  const [origin, setOrigin] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rowMessage, setRowMessage] = useState<Record<string, string>>({})
  const [openedMembers, setOpenedMembers] = useState<Record<string, boolean>>({})
  const [remindedMembers, setRemindedMembers] = useState<Record<string, boolean>>({})
  const [recordingMembers, setRecordingMembers] = useState<Record<string, boolean>>({})
  const [copiedMembers, setCopiedMembers] = useState<Record<string, boolean>>({})
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [bulkIndex, setBulkIndex] = useState<number | null>(null)
  const [bulkCompleted, setBulkCompleted] = useState(false)

  useEffect(() => { setOrigin(window.location.origin) }, [])

  useEffect(() => {
    let active = true
    async function loadOwingMembers() {
      const supabase = createClient()
      const { error: refreshError } = await supabase.rpc('refresh_charges', { p_group: group.id })
      if (refreshError) {
        if (active) {
          setError('We could not refresh payment details. Please refresh and try again.')
          setLoading(false)
        }
        return
      }
      const { data: memberData, error: memberError } = await supabase.from('members').select('*').eq('group_id', group.id).eq('status', 'active')
      if (!active) return
      if (memberError) {
        setError('We could not load your group details. Please refresh and try again.')
        setLoading(false)
        return
      }
      const rows = memberData ?? []
      const chargeResult = rows.length
        ? await supabase.from('charges').select('member_id, due_date, amount, paid_amount').in('member_id', rows.map((member) => member.id))
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
      const withStatus = rows.map((member) => ({
        ...member,
        membershipStatus: member.status,
        status: getMemberStatus(chargesByMember.get(member.id) ?? [], new Date(), group.frequency, group.due_rule),
      }))
      const owing = withStatus.filter((member) => member.status.state === 'overdue' || member.status.state === 'due_soon')
      owing.sort((a, b) => {
        const priority = (state: MemberStatus['state']) => state === 'overdue' ? 0 : 1
        return priority(a.status.state) - priority(b.status.state)
          || (a.status.nextDue ?? '').localeCompare(b.status.nextDue ?? '')
      })
      setMembers(owing)
      setSelectedMemberId((current) => current && owing.some((member) => member.id === current) ? current : owing[0]?.id ?? '')
      setError('')
      setLoading(false)
    }

    void loadOwingMembers()
    return () => { active = false }
  }, [group.id, group.frequency])

  function getMessage(member: OwingMember) {
    return reminderMessage(member, labels.payment, `${origin}/pay/${member.pay_token}`, language, group.due_rule, group.frequency)
  }

  async function copyMessage(member: OwingMember) {
    try {
      await navigator.clipboard.writeText(getMessage(member))
      setCopiedMembers((current) => ({ ...current, [member.id]: true }))
      setRowMessage((current) => ({ ...current, [member.id]: '' }))
    } catch {
      setRowMessage((current) => ({ ...current, [member.id]: 'We could not copy the message. Please try again.' }))
    }
  }

  async function openWhatsApp(member: OwingMember) {
    const number = member.phone_normalized ?? normalizeNgPhone(member.phone)
    if (!number) {
      setRowMessage((current) => ({ ...current, [member.id]: 'Add a valid WhatsApp number first.' }))
      return
    }
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(getMessage(member))}`, '_blank', 'noopener,noreferrer')
    setOpenedMembers((current) => ({ ...current, [member.id]: true }))
    setRowMessage((current) => ({ ...current, [member.id]: '' }))
    if (remindedMembers[member.id] || recordingMembers[member.id]) return

    setRecordingMembers((current) => ({ ...current, [member.id]: true }))
    try {
      const result = await recordReminderSent(group.id, member.id)
      if (!result.ok) {
        setRowMessage((current) => ({ ...current, [member.id]: result.error }))
        return
      }
      setRemindedMembers((current) => ({ ...current, [member.id]: true }))
    } catch {
      setRowMessage((current) => ({ ...current, [member.id]: 'WhatsApp opened, but we could not record the reminder. Please try again.' }))
    } finally {
      setRecordingMembers((current) => ({ ...current, [member.id]: false }))
    }
  }

  const overdueMembers = members.filter((member) => member.status.state === 'overdue')
  const selectedMember = (bulkIndex === null ? null : overdueMembers[bulkIndex])
    ?? members.find((member) => member.id === selectedMemberId)
    ?? members[0]

  function startRemindingOverdue() {
    if (overdueMembers.length === 0) return
    setBulkIndex(0)
    setBulkCompleted(false)
    setSelectedMemberId(overdueMembers[0].id)
  }

  function nextOverdueMember() {
    if (bulkIndex === null) return
    const nextIndex = bulkIndex + 1
    if (nextIndex >= overdueMembers.length) {
      setBulkIndex(null)
      setBulkCompleted(true)
      return
    }
    setBulkIndex(nextIndex)
    setSelectedMemberId(overdueMembers[nextIndex].id)
  }

  return <>
    <PageHeader group={group} eyebrow={group.name} title="Reminders" description="Send a friendly reminder to people who have a bill due." />
    {loading ? <div className="list-skeleton" aria-label="Loading payment details"><span /><span /><span /></div> : error ? <div className="empty" role="alert">{error}</div> : members.length === 0
      ? <div className="content-card"><div className="empty">Everyone is up to date. Nice one.</div></div>
      : <div className="remind-grid">
        <div className="content-card">
          <div className="card-head">
            <div><h2>Message preview</h2><p>{selectedMember ? `For ${selectedMember.name}` : ''}</p></div>
            <div className="toggle" aria-label="Message language">
              {(['English', 'Pidgin'] as const).map((value) => <button key={value} type="button" className={language === value ? 'selected' : ''} aria-pressed={language === value} onClick={() => setLanguage(value)}>{value}</button>)}
            </div>
          </div>
          <div className="reminder-bulk-controls">
            {overdueMembers.length > 0 && <button type="button" className="button secondary" onClick={startRemindingOverdue}>Remind all overdue</button>}
            {bulkIndex !== null && <><span>Overdue reminder {bulkIndex + 1} of {overdueMembers.length}</span><button type="button" className="button secondary" onClick={nextOverdueMember}>Next</button></>}
            {bulkCompleted && <span role="status">All overdue members reviewed.</span>}
          </div>
          {selectedMember && <div className="whatsapp-phone-frame" aria-label={`WhatsApp preview for ${selectedMember.name}`}>
            <div className="whatsapp-preview-header">
              <span className="whatsapp-preview-avatar" aria-hidden="true">{selectedMember.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
              <div><b>{selectedMember.name}</b><small>Message preview</small></div>
            </div>
            <div className="whatsapp-preview-chat">
              <span className="whatsapp-preview-day">Today</span>
              <div className="whatsapp-preview-bubble">
                <p>{getMessage(selectedMember)}</p>
                <time>{new Intl.DateTimeFormat('en-NG', { hour: 'numeric', minute: '2-digit' }).format(new Date())}</time>
              </div>
            </div>
            <button type="button" className="button primary whatsapp-preview-open" disabled={recordingMembers[selectedMember.id]} onClick={() => void openWhatsApp(selectedMember)}>
              <MessageCircle size={15} />{recordingMembers[selectedMember.id] ? 'Recording reminder...' : 'Open in WhatsApp'}
            </button>
          </div>}
          <div className="card-head"><div><h2>People with bills due</h2><p>{members.length} {members.length === 1 ? 'person' : 'people'} have a bill due.</p></div></div>
          <div className="member-list">
            {members.map((member) => {
              const phone = member.phone_normalized ?? normalizeNgPhone(member.phone)
              return <div className={`member-row reminder-member-row${selectedMember?.id === member.id ? ' reminder-member-selected' : ''}`} key={member.id}>
                <div className="member-name"><b>{member.name}</b><span>{member.status.label} · {member.phone_normalized ? `+${member.phone_normalized}` : normalizeNgPhone(member.phone) ? `+${normalizeNgPhone(member.phone)}` : member.phone || 'No phone number'}</span>
                  {remindedMembers[member.id] && <span className="reminded-status" role="status">Reminded</span>}
                  {openedMembers[member.id] && !remindedMembers[member.id] && <span role="status">Opened WhatsApp</span>}
                  {copiedMembers[member.id] && <span role="status">Message copied</span>}
                  {rowMessage[member.id] && <span role="alert">{rowMessage[member.id]}</span>}
                </div>
                <div className="reminder-row-actions">
                  <button type="button" className="reminder-preview-button" aria-pressed={selectedMember?.id === member.id} onClick={() => { setSelectedMemberId(member.id); setBulkIndex(null); setBulkCompleted(false) }}>Preview</button>
                  <button type="button" className="button secondary" disabled={!phone || recordingMembers[member.id]} onClick={() => void openWhatsApp(member)}><MessageCircle size={15} />Send on WhatsApp</button>
                  <button type="button" className="copy-button" onClick={() => copyMessage(member)}><Copy size={15} />Copy message</button>
                </div>
              </div>
            })}
          </div>
        </div>
        <div className="tip-card"><span className="tip-icon"><Bell size={18} /></span><h3>Keep it friendly</h3><p>Most people just need a small reminder. Plank keeps the message clear and respectful.</p></div>
      </div>}
  </>
}
