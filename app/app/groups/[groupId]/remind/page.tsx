'use client'

import { useEffect, useState } from 'react'
import { Bell, Copy, MessageCircle } from 'lucide-react'
import { PageHeader } from '@/components/plank-ui'
import { useAppInfo } from '@/components/app-shell'
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
  const [copiedMembers, setCopiedMembers] = useState<Record<string, boolean>>({})

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

  function openWhatsApp(member: OwingMember) {
    const number = member.phone_normalized ?? normalizeNgPhone(member.phone)
    if (!number) {
      setRowMessage((current) => ({ ...current, [member.id]: 'Add a valid WhatsApp number first.' }))
      return
    }
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(getMessage(member))}`, '_blank', 'noopener,noreferrer')
    setOpenedMembers((current) => ({ ...current, [member.id]: true }))
    setRowMessage((current) => ({ ...current, [member.id]: '' }))
  }

  const firstMember = members[0]

  return <>
    <PageHeader group={group} eyebrow={group.name} title="Reminders" description="Send a friendly reminder to people who have a bill due." />
    {loading ? <div className="list-skeleton" aria-label="Loading payment details"><span /><span /><span /></div> : error ? <div className="empty" role="alert">{error}</div> : members.length === 0
      ? <div className="content-card"><div className="empty">Everyone is up to date. Nice one.</div></div>
      : <div className="remind-grid">
        <div className="content-card">
          <div className="card-head">
            <div><h2>Message preview</h2><p>{firstMember ? `For ${firstMember.name}` : ''}</p></div>
            <div className="toggle" aria-label="Message language">
              {(['English', 'Pidgin'] as const).map((value) => <button key={value} type="button" className={language === value ? 'selected' : ''} aria-pressed={language === value} onClick={() => setLanguage(value)}>{value}</button>)}
            </div>
          </div>
          {firstMember && <p className="message-preview">{getMessage(firstMember)}</p>}
          <div className="card-head"><div><h2>People with bills due</h2><p>{members.length} {members.length === 1 ? 'person' : 'people'} have a bill due.</p></div></div>
          <div className="member-list">
            {members.map((member) => {
              const phone = member.phone_normalized ?? normalizeNgPhone(member.phone)
              return <div className="member-row" key={member.id}>
                <div className="member-name"><b>{member.name}</b><span>{member.status.label} · {member.phone_normalized ? `+${member.phone_normalized}` : normalizeNgPhone(member.phone) ? `+${normalizeNgPhone(member.phone)}` : member.phone || 'No phone number'}</span>
                  {openedMembers[member.id] && <span role="status">Opened WhatsApp</span>}
                  {copiedMembers[member.id] && <span role="status">Message copied</span>}
                  {rowMessage[member.id] && <span role="alert">{rowMessage[member.id]}</span>}
                </div>
                <button type="button" className="button secondary" disabled={!phone} onClick={() => openWhatsApp(member)}><MessageCircle size={15} />Send on WhatsApp</button>
                <button type="button" className="copy-button" onClick={() => copyMessage(member)}><Copy size={15} />Copy message</button>
              </div>
            })}
          </div>
        </div>
        <div className="tip-card"><span className="tip-icon"><Bell size={18} /></span><h3>Keep it friendly</h3><p>Most people just need a small reminder. Plank keeps the message clear and respectful.</p></div>
      </div>}
  </>
}
