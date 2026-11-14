import { ArrowRight, Check } from 'lucide-react'
import Link from 'next/link'
import { Badge, Logo } from '@/components/plank-ui'
import { GroupMark } from '@/components/group-mark'
import { PaymentRequest } from '@/components/payment-request'
import { WelcomeBanner } from '@/components/welcome-banner'
import { friendlyDate, money } from '@/lib/format'
import { getMemberStatus } from '@/lib/status'
import { createClient } from '@/lib/supabase/server'
import type { MemberPageData } from '@/lib/types'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function firstContributionDeadline(data: MemberPageData) {
  const firstCharge = [...(data.charges ?? [])].sort((a, b) => a.due_date.localeCompare(b.due_date))[0]
  if (firstCharge) return friendlyDate(firstCharge.due_date)
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

function dayAfter(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  date.setDate(date.getDate() + 1)
  return friendlyDate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`)
}

async function loadMemberPage(token: string) {
  const supabase = await createClient()
  return supabase.rpc('get_member_page', { p_token: token })
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
  const status = data.charges ? getMemberStatus(data.charges, new Date(), data.frequency, data.due_rule) : null
  const statusCharge = status?.nextDue
    ? data.charges?.find((charge) => charge.due_date.slice(0, 10) === status.nextDue?.slice(0, 10))
    : undefined
  return <div className="member-page">
    <header><Logo /><Link href="/login" className="ledger-small">Treasurer login <ArrowRight size={15} /></Link></header>
    <main>
      {query.welcome === '1' && <WelcomeBanner name={data.name} date={firstContributionDeadline(data)} />}
      <div className="member-greeting"><GroupMark group={{ name: data.group, logo_url: data.logo_url ?? null }} className="page-group-mark" /><p className="eyebrow">{data.group}</p><h1>Hello {data.name}</h1><p>{data.unit || 'Here are your payment details.'}</p></div>
      {status ? <div className={`due-card ${status.state === 'paid' ? 'is-paid' : status.state === 'no_charges' ? 'is-pending' : ''}`}>
        {status.state === 'paid'
          ? <div className="paid-state"><span className="done-mark"><Check size={28} /></span><h2>{data.frequency === 'one_time' ? "Thank you, you've paid." : "You're all paid up."}</h2><p>{data.frequency === 'one_time' ? '' : status.nextDue && statusCharge ? `Next payment: ${money(statusCharge.amount)} on ${friendlyDate(status.nextDue)}.` : status.label}</p></div>
          : status.state === 'overdue'
            ? <><span className="due-label">Overdue</span><h2>You owe {money(status.remaining)}.</h2><p>{status.nextDue ? data.due_rule === 'month_end' ? `Overdue since ${dayAfter(status.nextDue)}.` : `It was due on ${friendlyDate(status.nextDue)}.` : 'It was due on an earlier date.'}</p></>
            : status.state === 'no_charges'
              ? <><span className="due-label">Payment status</span><h2>Your payment schedule is being set up.</h2><p>Please check back soon.</p></>
              : status.state === 'due_soon'
              ? <><span className="due-label">Due soon</span><h2>{money(status.remaining)} is due {data.due_rule === 'month_end' ? 'by' : 'on'} {status.nextDue ? friendlyDate(status.nextDue) : 'an upcoming date'}.</h2></>
              : <><span className="due-label">Part paid</span><h2>You have paid {money(statusCharge?.paid_amount ?? 0)} of {money(statusCharge?.amount ?? data.amount)}. {money(status.remaining)} left.</h2>{data.due_rule === 'month_end' && status.nextDue && <p>Due by {friendlyDate(status.nextDue)}.</p>}</>}
      </div> : <div className="due-card"><span className="due-label">Payment status</span><h2>Check with your treasurer.</h2><p>Your payment details are available below.</p></div>}
      {status && status.remaining > 0 && <PaymentRequest payToken={token} dueAmount={status.remaining} />}
      <div className="history"><h2>Your payments</h2>{payments.length === 0 ? <div className="empty">No payments recorded yet.</div> : payments.map((payment) => <div className="history-row" key={`${payment.paid_at}-${payment.amount}`}><div><b>Payment recorded</b><span>Paid on {friendlyDate(payment.paid_at)}</span></div><Badge paid /><strong>{money(payment.amount)}</strong></div>)}</div>
      {data.ledger_available && <Link className="button secondary" href={`/pay/${token}/ledger`}>See group ledger <ArrowRight size={16} /></Link>}
      <div className="member-footer"><b>Powered by Plank</b><span>Simple group money for people who care.</span><Link href="/start">Create your group</Link></div>
    </main>
  </div>
}
