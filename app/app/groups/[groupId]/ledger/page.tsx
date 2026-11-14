import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { GroupMark } from '@/components/group-mark'
import { Logo } from '@/components/plank-ui'
import { friendlyDate, money } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

type LedgerEntry = { at: string; direction: 'in' | 'out'; amount: number; note: string; provider?: 'paga' | 'demo' | null }

export default async function TreasurerLedgerPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params
  const supabase = await createClient()
  const [groupResult, paymentResult, payoutResult, memberResult] = await Promise.all([
    supabase.from('groups').select('id, name, logo_url').eq('id', groupId).single(),
    supabase.from('payments').select('member_id, amount, paid_at, provider').eq('group_id', groupId),
    supabase.from('payouts').select('amount, payee, note, created_at').eq('group_id', groupId),
    supabase.from('members').select('id, name').eq('group_id', groupId).eq('status', 'active'),
  ])
  const failure = groupResult.error ?? paymentResult.error ?? payoutResult.error ?? memberResult.error
  if (failure || !groupResult.data) return <div className="ledger-page"><header><Logo /></header><main><div className="ledger-hero"><p className="eyebrow">Group ledger</p><h1>We could not load this group</h1><p>Please try again in a moment.</p></div></main></div>

  const names = new Map((memberResult.data ?? []).map((member) => [member.id, member.name]))
  const entries: LedgerEntry[] = [
    ...(paymentResult.data ?? []).map((payment) => ({
      at: payment.paid_at,
      direction: 'in' as const,
      amount: payment.amount,
      note: names.get(payment.member_id) ?? 'Payment received',
      provider: payment.provider,
    })),
    ...(payoutResult.data ?? []).map((payout) => ({
      at: payout.created_at,
      direction: 'out' as const,
      amount: payout.amount,
      note: payout.note || payout.payee,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  const moneyIn = entries.filter((entry) => entry.direction === 'in').reduce((total, entry) => total + entry.amount, 0)
  const moneyOut = entries.filter((entry) => entry.direction === 'out').reduce((total, entry) => total + entry.amount, 0)
  const group = groupResult.data

  return <div className="ledger-page">
    <header><Logo /><Link href={`/app/groups/${groupId}`} className="ledger-small"><ArrowLeft size={15} />Overview</Link></header>
    <main>
      <div className="ledger-hero"><GroupMark group={{ name: group.name, logo_url: group.logo_url }} className="page-group-mark" /><p className="eyebrow">Group ledger</p><h1>{group.name}</h1><p>A simple record of money in and money out for your group.</p></div>
      <div className="ledger-stats"><div><span>Money in</span><strong>{money(moneyIn)}</strong></div><div><span>Money out</span><strong>{money(moneyOut)}</strong></div><div><span>Balance</span><strong>{money(moneyIn - moneyOut)}</strong></div></div>
      <div className="ledger-list"><div className="ledger-list-head"><h2>Everything</h2><span>{entries.length} entries</span></div>
        {entries.length === 0 ? <div className="empty">There are no entries yet.</div> : entries.map((entry, index) => <div className="ledger-row" key={`${entry.at}-${entry.direction}-${index}`}><span className={`badge ${entry.direction === 'in' ? 'paid' : 'owing'}`}><span className="badge-dot" />{entry.direction === 'in' ? 'In' : 'Out'}</span><div><b>{entry.note}</b>{entry.provider === 'demo' && <small className="demo-tag">Historical demo payment</small>}<span>{friendlyDate(entry.at)}</span></div><strong className={entry.direction}>{entry.direction === 'out' ? '-' : '+'}{money(entry.amount)}</strong></div>)}
      </div>
      <footer><b>Powered by Plank</b><span>Simple group money for people who care.</span></footer>
    </main>
  </div>
}
