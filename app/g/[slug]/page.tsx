import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Logo } from '@/components/plank-ui'
import { GroupMark } from '@/components/group-mark'
import { money, friendlyDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export default async function PublicLedgerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_public_ledger', { p_slug: slug })
  if (error) return <div className="ledger-page"><header><Logo /><Link href="/login" className="ledger-small">Treasurer login <ArrowRight size={15} /></Link></header><main><div className="ledger-hero"><p className="eyebrow">Group ledger</p><h1>We could not load this group</h1><p>Please try again in a moment.</p></div></main></div>

  if (!data) return <div className="ledger-page"><header><Logo /><Link href="/login" className="ledger-small">Treasurer login <ArrowRight size={15} /></Link></header><main><div className="ledger-hero"><p className="eyebrow">Group ledger</p><h1>This ledger is private.</h1></div></main></div>

  const entries = [...data.entries].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  const moneyIn = data.entries.filter((entry) => entry.direction === 'in').reduce((sum, entry) => sum + entry.amount, 0)
  const moneyOut = data.entries.filter((entry) => entry.direction === 'out').reduce((sum, entry) => sum + entry.amount, 0)

  return <div className="ledger-page">
    <header><Logo /><Link href="/login" className="ledger-small">Treasurer login <ArrowRight size={15} /></Link></header>
    <main>
      <div className="ledger-hero"><GroupMark group={{ name: data.name, logo_url: data.logo_url ?? null }} className="page-group-mark" /><p className="eyebrow">Group ledger</p><h1>{data.name}</h1><p>A simple record of money in and money out for everyone in the group.</p></div>
      <div className="ledger-stats"><div><span>Money in</span><strong>{money(moneyIn)}</strong></div><div><span>Money out</span><strong>{money(moneyOut)}</strong></div><div><span>Balance</span><strong>{money(moneyIn - moneyOut)}</strong></div></div>
      <div className="ledger-list"><div className="ledger-list-head"><h2>Everything</h2><span>{entries.length} entries</span></div>
        {entries.length === 0 ? <div className="empty">There are no entries yet.</div> : entries.map((entry, index) => <div className="ledger-row" key={`${entry.at}-${entry.direction}-${index}`}><span className={`badge ${entry.direction === 'in' ? 'paid' : 'owing'}`}><span className="badge-dot" />{entry.direction === 'in' ? 'In' : 'Out'}</span><div><b>{entry.note}</b><span>{friendlyDate(entry.at)}</span></div><strong className={entry.direction}>{entry.direction === 'out' ? '-' : '+'}{money(entry.amount)}</strong></div>)}
      </div>
      <footer><b>Powered by Plank</b><span>Simple group money for people who care.</span></footer>
    </main>
  </div>
}
