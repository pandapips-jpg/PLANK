'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Bell, Wallet } from 'lucide-react'
import { MemberRows, type MemberWithStatus } from '@/components/member-rows'
import { PageHeader, StatsCarousel, type Stats } from '@/components/plank-ui'
import { useAppInfo } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/client'
import { money } from '@/lib/format'
import { groupLabels } from '@/lib/labels'
import { getMemberStatus } from '@/lib/status'
import { CopyLedgerLink, PaymentLinks } from '@/components/payment-links'
import { NotificationsBell } from '@/components/notifications-bell'
import type { Charge, Member, Payment, Payout } from '@/lib/types'

function monthRange(date: Date, offset = 0) {
  const start = new Date(date.getFullYear(), date.getMonth() + offset, 1)
  const end = new Date(date.getFullYear(), date.getMonth() + offset + 1, 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

export default function OverviewPage() {
  const { group, name } = useAppInfo()
  const [members, setMembers] = useState<MemberWithStatus[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('All')
  const [showPaymentLinks, setShowPaymentLinks] = useState(false)
  const [joinActivity, setJoinActivity] = useState({ recent: 0, pending: 0 })
  const now = new Date()
  const currentMonth = monthRange(now)
  const previousMonth = monthRange(now, -1)
  const labels = groupLabels(group.type)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { error: refreshError } = await supabase.rpc('refresh_charges', { p_group: group.id })
      if (refreshError) {
        if (active) {
          setError('We could not refresh payment details. Please refresh and try again.')
          setLoading(false)
        }
        return
      }

      const [memberResult, paymentResult, payoutResult, joinResult] = await Promise.all([
        supabase.from('members').select('*').eq('group_id', group.id).eq('status', 'active').order('created_at'),
        supabase.from('payments').select('*').eq('group_id', group.id),
        supabase.from('payouts').select('*').eq('group_id', group.id),
        supabase.from('members').select('status, joined_via, joined_at').eq('group_id', group.id),
      ])
      if (!active) return
      const failed = memberResult.error ?? paymentResult.error ?? payoutResult.error ?? joinResult.error
      if (failed) {
        setError('We could not load your group details. Please refresh and try again.')
        setLoading(false)
        return
      }

      const groupMembers = memberResult.data ?? []
      const chargeResult = groupMembers.length
        ? await supabase.from('charges').select('member_id, due_date, amount, paid_amount').in('member_id', groupMembers.map((member) => member.id))
        : { data: [], error: null }
      if (!active) return
      if (chargeResult.error) {
        setError('We could not load payment details. Please refresh and try again.')
        setLoading(false)
        return
      }

      const chargesByMember = new Map<string, Charge[]>()
      for (const charge of chargeResult.data ?? []) {
        const current = chargesByMember.get(charge.member_id) ?? []
        current.push(charge)
        chargesByMember.set(charge.member_id, current)
      }
      setMembers(groupMembers.map((member) => ({
        ...member,
        membershipStatus: member.status,
        status: getMemberStatus(chargesByMember.get(member.id) ?? [], now, group.frequency, group.due_rule),
      })))
      const activeIds = new Set(groupMembers.map((member) => member.id))
      setPayments((paymentResult.data ?? []).filter((payment) => activeIds.has(payment.member_id)))
      setPayouts(payoutResult.data ?? [])
      const weekAgo = Date.now() - 7 * 86400000
      const allMembers = joinResult.data ?? []
      setJoinActivity({
        recent: allMembers.filter((member) => member.status === 'active' && member.joined_via === 'link' && member.joined_at && new Date(member.joined_at).getTime() >= weekAgo).length,
        pending: allMembers.filter((member) => member.status === 'pending').length,
      })
      setError('')
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [group.id, group.frequency])

  const stats = useMemo<Stats>(() => {
    const inThisMonth = payments.filter((payment) => payment.paid_at >= currentMonth.start && payment.paid_at < currentMonth.end).reduce((sum, payment) => sum + payment.amount, 0)
    const lastMonthPayments = payments.filter((payment) => payment.paid_at >= previousMonth.start && payment.paid_at < previousMonth.end)
    const lastMonthTotal = lastMonthPayments.reduce((sum, payment) => sum + payment.amount, 0)
    const outThisMonth = payouts.filter((payout) => payout.created_at >= currentMonth.start && payout.created_at < currentMonth.end).reduce((sum, payout) => sum + payout.amount, 0)
    const allIn = payments.reduce((sum, payment) => sum + payment.amount, 0)
    const allOut = payouts.reduce((sum, payout) => sum + payout.amount, 0)
    const paidCount = members.filter((member) => member.status.state === 'paid').length
    const overdue = members.filter((member) => member.status.state === 'overdue')
    const dueSoon = members.filter((member) => member.status.state === 'due_soon')
    return {
      inThisMonth,
      paidCount,
      memberCount: members.length,
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((sum, member) => sum + member.status.remaining, 0),
      dueSoonCount: dueSoon.length,
      dueSoonAmount: dueSoon.reduce((sum, member) => sum + member.status.remaining, 0),
      outThisMonth,
      balance: allIn - allOut,
      changePercent: lastMonthPayments.length === 0 || lastMonthTotal === 0 ? null : Math.round(((inThisMonth - lastMonthTotal) / lastMonthTotal) * 100),
    }
  }, [currentMonth.end, currentMonth.start, members, payments, payouts, previousMonth.end, previousMonth.start])

  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening'
  const paidCount = members.filter((member) => member.status.state === 'paid').length
  const progress = members.length ? Math.round((paidCount / members.length) * 100) : 0
  const filterCounts = {
    All: members.length,
    Paid: paidCount,
    'Due soon': members.filter((member) => member.status.state === 'due_soon').length,
    Overdue: members.filter((member) => member.status.state === 'overdue').length,
  }

  return <>
    <PageHeader group={group} eyebrow={group.name} title={`${greeting}, ${name}`} description={`Here is how your group is doing this month.`} />
    {loading ? <div className="list-skeleton" aria-label="Loading your group details"><span /><span /><span /></div> : error ? <div className="empty" role="alert">{error}</div> : <div className="overview-layout">
      <div className="overview-main-column">
        <StatsCarousel stats={stats} />
        {(joinActivity.recent > 0 || joinActivity.pending > 0) && <div className="join-activity"><Link href={`/app/groups/${group.id}/members`}>{joinActivity.recent > 0 && <span>{joinActivity.recent} new {joinActivity.recent === 1 ? 'member joined' : 'members joined'}</span>}{joinActivity.pending > 0 && <span>{joinActivity.pending} waiting for approval</span>}</Link></div>}
        <div className="progress-card"><div><b>{new Date().toLocaleDateString('en-NG', { month: 'long' })} collections</b><span>{paidCount} of {members.length} {labels.people} paid up</span></div><div className="progress"><span style={{ width: `${progress}%` }} /></div><strong>{progress}%</strong></div>
        <div className="content-card"><div className="card-head"><div><h2>{labels.people[0]?.toUpperCase()}{labels.people.slice(1)}</h2><p>Everyone in {group.name}</p></div><Link href={`/app/groups/${group.id}/members`} className="text-button">View all <ArrowRight size={15} /></Link></div>
          <div className="pills">{(['All', 'Paid', 'Due soon', 'Overdue'] as const).map((value) => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{value}<span>{filterCounts[value]}</span></button>)}</div>
          <MemberRows members={members} amount={group.amount} filter={filter} />
        </div>
      </div>
      <aside className="overview-side-column">
        <div className="content-card overview-notifications"><div><h2>Notifications</h2><p>Updates about your group</p></div><NotificationsBell groupId={group.id} /></div>
        <div className="share-link-card"><div><span className="eyebrow">Send payment links</span><b>Share a payment page with each person</b><small>Each person gets their own payment details.</small></div><div className="quick-actions"><button className="button secondary" type="button" onClick={() => setShowPaymentLinks((value) => !value)}>{showPaymentLinks ? 'Hide payment links' : 'Send payment links'} <ArrowRight size={16} /></button><Link className="button secondary" href={`/app/groups/${group.id}/ledger`}>See ledger <ArrowRight size={16} /></Link>{group.visibility === 'public' && <CopyLedgerLink slug={group.slug} />}</div></div>
        {showPaymentLinks && <div className="content-card"><h2>Payment links</h2><PaymentLinks members={members} groupName={group.name} /></div>}
        <div className="quick-actions overview-quick-actions"><Link href={`/app/groups/${group.id}/remind`} className="button secondary"><Bell size={17} />Remind people who owe</Link><Link href={`/app/groups/${group.id}/payout`} className="button secondary"><Wallet size={17} />Record money out</Link></div>
      </aside>
    </div>}
  </>
}
