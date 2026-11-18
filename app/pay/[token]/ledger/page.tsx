import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { GroupMark } from '@/components/group-mark'
import { Logo } from '@/components/plank-ui'
import { friendlyDate, money } from '@/lib/format'
import { createDemoPaymentMatcher } from '@/lib/demo-ledger'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function MemberLedgerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const { data, error } = uuidPattern.test(token)
    ? await supabase.rpc('get_ledger_for_member', { p_token: token })
    : { data: null, error: null }

  if (error) return <div className="ledger-page"><header><Logo /></header><main><div className="ledger-hero"><p className="eyebrow">Group ledger</p><h1>We could not load this ledger</h1><p>Please try again in a moment.</p></div></main></div>
  if (!data) return <div className="ledger-page"><header><Logo /></header><main><div className="ledger-hero"><p className="eyebrow">Group ledger</p><h1>The group owner keeps this private.</h1></div></main></div>

  const admin = createAdminClient()
  const { data: member, error: memberError } = await admin.from('members')
    .select('group_id')
    .eq('pay_token', token)
    .eq('status', 'active')
    .maybeSingle()
  if (memberError) return <div className="ledger-page"><header><Logo /></header><main><div className="ledger-hero"><p className="eyebrow">Group ledger</p><h1>We could not load this ledger</h1><p>Please try again in a moment.</p></div></main></div>
  const { data: demoPayments, error: demoPaymentsError } = member
    ? await admin.from('payments').select('amount, paid_at').eq('group_id', member.group_id).eq('provider', 'demo')
    : { data: [], error: null }
  if (demoPaymentsError) return <div className="ledger-page"><header><Logo /></header><main><div className="ledger-hero"><p className="eyebrow">Group ledger</p><h1>We could not load this ledger</h1><p>Please try again in a moment.</p></div></main></div>

  const entries = [...data.entries].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  const isDemoEntry = createDemoPaymentMatcher(demoPayments ?? [])
  const moneyIn = entries.filter((entry) => entry.direction === 'in').reduce((sum, entry) => sum + entry.amount, 0)
  const moneyOut = entries.filter((entry) => entry.direction === 'out').reduce((sum, entry) => sum + entry.amount, 0)

  return <div className="ledger-page">
    <header><Logo /><Link href={`/pay/${token}`} className="ledger-small"><ArrowLeft size={15} />Payment details</Link></header>
    <main>
      <div className="ledger-hero"><GroupMark group={{ name: data.name, logo_url: data.logo_url ?? null }} className="page-group-mark" /><p className="eyebrow">Group ledger</p><h1>{data.name}</h1></div>
      <div className="ledger-stats"><div><span>Money in</span><strong>{money(moneyIn)}</strong></div><div><span>Money out</span><strong>{money(moneyOut)}</strong></div><div><span>Balance</span><strong>{money(moneyIn - moneyOut)}</strong></div></div>
      <div className="ledger-list"><div className="ledger-list-head"><h2>Everything</h2><span>{entries.length} entries</span></div>
        {entries.length === 0 ? <div className="empty">There are no entries yet.</div> : entries.map((entry, index) => <div className="ledger-row" key={`${entry.at}-${entry.direction}-${index}`}><div className="ledger-entry-note"><b>{entry.note}</b>{entry.direction === 'in' && (entry.provider === 'demo' || isDemoEntry(entry)) && <small className="demo-tag">Demo</small>}<span>{friendlyDate(entry.at)}</span></div><span className={`badge ${entry.direction === 'in' ? 'paid' : 'owing'}`}><span className="badge-dot" />{entry.direction === 'in' ? 'In' : 'Out'}</span><strong className={entry.direction}>{entry.direction === 'out' ? '-' : '+'}{money(entry.amount)}</strong></div>)}
      </div>
      <footer><b>Powered by Plank</b><span>Simple group money for people who care.</span></footer>
    </main>
  </div>
}
