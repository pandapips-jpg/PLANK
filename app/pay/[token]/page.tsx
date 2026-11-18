import { ArrowRight, Check } from 'lucide-react'
import Link from 'next/link'
import { Badge, Logo } from '@/components/plank-ui'
import { GroupMark } from '@/components/group-mark'
import { PaymentRequest } from '@/components/payment-request'
import { WelcomeBanner } from '@/components/welcome-banner'
import { friendlyDate, money, scheduleDate } from '@/lib/format'
import { getPaymentPageState } from '@/lib/payment-page-status'
import { firstContributionDate } from '@/lib/schedule'
import { isDemoMode } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { MemberPageData } from '@/lib/types'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function firstContributionDeadline(data: MemberPageData) {
  const firstCharge = [...(data.charges ?? [])].sort((a, b) => a.due_date.localeCompare(b.due_date))[0]
  if (firstCharge) return scheduleDate(firstCharge.due_date, data.frequency ?? 'monthly')
  if (data.frequency === 'weekly' || data.frequency === 'biweekly') {
    return scheduleDate(firstContributionDate({
      frequency: data.frequency,
      due_rule: data.due_rule ?? 'fixed',
      due_day: data.due_day ?? 5,
      first_due_date: data.first_due_date ?? data.group_first_due_date ?? null,
    }, new Date()), data.frequency)
  }
  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  if (data.first_due_date) {
    const groupStart = new Date(`${data.first_due_date.slice(0, 10)}T00:00:00`)
    if (groupStart > nextMonth) nextMonth.setFullYear(groupStart.getFullYear(), groupStart.getMonth(), 1)
  }
  const deadline = data.due_rule === 'month_end'
    ? new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0)
    : new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(Math.max(data.due_day ?? 1, 1), 28))
  return friendlyDate(deadline.toISOString().slice(0, 10))
}

async function loadMemberPage(token: string) {
  const admin = createAdminClient()
  const { data: member, error: memberError } = await admin.from('members')
    .select('group_id')
    .eq('pay_token', token)
    .eq('status', 'active')
    .maybeSingle()
  if (memberError) {
    console.error('Could not look up payment page member', { code: memberError.code, message: memberError.message })
    return { data: null, error: memberError }
  }
  let groupFirstDueDate: string | null = null
  if (member) {
    const { data: group, error: groupError } = await admin.from('groups')
      .select('first_due_date')
      .eq('id', member.group_id)
      .maybeSingle()
    if (groupError) {
      console.error('Could not load payment page group start date', { code: groupError.code, message: groupError.message })
      return { data: null, error: groupError }
    }
    groupFirstDueDate = group?.first_due_date ?? null
    const { error: ensureError } = await admin.rpc('ensure_charges', { p_group: member.group_id })
    if (ensureError) {
      console.error('Could not ensure payment page charges', { code: ensureError.code, message: ensureError.message })
      return { data: null, error: ensureError }
    }
  }
  const supabase = await createClient()
  const result = await supabase.rpc('get_member_page', { p_token: token })
  return {
    ...result,
    data: result.data ? { ...result.data, group_first_due_date: groupFirstDueDate } : null,
  }
}

export default async function MemberPaymentPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const { token } = await params
  const query = await searchParams
  const validToken = uuidPattern.test(token)
  const { data, error } = validToken
    ? await loadMemberPage(token)
    : { data: null, error: null }
  if (error) return <div className="member-page"><header><Logo /><Link href="/login" className="ledger-small">Treasurer login <ArrowRight size={15} /></Link></header><main><div className="member-greeting"><p className="eyebrow">Payment details</p><h1>We could not load this page</h1><p>Please try again in a moment.</p></div></main></div>

  if (!data) return <div className="member-page"><header><Logo /><Link href="/login" className="ledger-small">Treasurer login <ArrowRight size={15} /></Link></header><main><div className="member-greeting"><p className="eyebrow">Payment details</p><h1>This link does not look right</h1><p>Check the link and try again.</p></div></main></div>

  const payments = [...data.payments].sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime())
  const paymentState = getPaymentPageState({
    charges: data.charges ?? [],
    amount: data.amount,
    frequency: data.frequency ?? 'monthly',
    due_rule: data.due_rule ?? 'month_end',
    due_day: data.due_day ?? 5,
    first_due_date: data.first_due_date ?? null,
    group_first_due_date: data.group_first_due_date ?? null,
  })
  return <div className="member-page">
    <header><Logo /><Link href="/login" className="ledger-small">Treasurer login <ArrowRight size={15} /></Link></header>
    <main>
      {query.welcome === '1' && <WelcomeBanner name={data.name} date={firstContributionDeadline(data)} />}
      <div className="member-greeting"><GroupMark group={{ name: data.group, logo_url: data.logo_url ?? null }} className="page-group-mark" /><p className="eyebrow">{data.group}</p><h1>Hello {data.name}</h1><p>{data.unit ? `Tag: ${data.unit}` : 'Here are your payment details.'}</p></div>
      <div className={`due-card ${paymentState.kind === 'paid' ? 'is-paid' : paymentState.kind === 'upcoming' || paymentState.kind === 'first_bill_not_set_up' ? 'is-pending' : ''}`}>
        {paymentState.kind === 'due'
          ? <><span className="due-label">Payment status</span><h2>You owe {money(paymentState.amount)}.</h2></>
          : paymentState.kind === 'upcoming'
            ? <><span className="due-label">Next payment</span><h2>Next payment {money(paymentState.amount)}, due by {scheduleDate(paymentState.dueDate, data.frequency ?? 'monthly')}.</h2></>
            : paymentState.kind === 'first_bill_not_set_up'
              ? <><span className="due-label">Payment status</span><h2>Your first bill has not been set up yet. Please ask your group admin.</h2></>
              : <div className="paid-state"><span className="done-mark"><Check size={28} /></span><h2>You&apos;re all paid up.</h2></div>}
      </div>
      {(paymentState.kind === 'due' || paymentState.kind === 'upcoming') && <PaymentRequest
        payToken={token}
        dueAmount={paymentState.amount}
        payEarly={paymentState.kind === 'upcoming'}
        demoMode={isDemoMode()}
      />}
      <div className="history"><h2>Your payments</h2>{payments.length === 0 ? <div className="empty">No payments recorded yet.</div> : payments.map((payment) => <div className="history-row" key={`${payment.paid_at}-${payment.amount}`}><div><b>Payment recorded</b><span>Paid on {friendlyDate(payment.paid_at)}</span></div><Badge paid /><strong>{money(payment.amount)}</strong></div>)}</div>
      {data.ledger_available && <Link className="button secondary" href={`/pay/${token}/ledger`}>See group ledger <ArrowRight size={16} /></Link>}
      <div className="member-footer"><b>Powered by Plank</b><span>Simple group money for people who care.</span><Link href="/start">Create your group</Link></div>
    </main>
  </div>
}
