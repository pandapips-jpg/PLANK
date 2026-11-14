'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, FileText, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/plank-ui'
import { useAppInfo } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/client'
import { friendlyDate, money } from '@/lib/format'
import type { Payout } from '@/lib/types'

export default function PayoutPage() {
  const { group } = useAppInfo()
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [amount, setAmount] = useState('')
  const [payee, setPayee] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    void createClient().from('payouts').select('*').eq('group_id', group.id).order('created_at', { ascending: false }).then(({ data, error: resultError }) => {
      if (!active) return
      if (resultError) setLoadError('We could not load past payments. Please refresh and try again.')
      else setPayouts(data ?? [])
      setLoading(false)
    })
    return () => { active = false }
  }, [group.id])

  async function savePayout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = Number(amount.trim().replace(/[₦,\s]/g, ''))
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount above zero.')
      return
    }
    setSaving(true)
    setError('')
    setSaved(false)
    const { data, error: insertError } = await createClient().from('payouts').insert({
      group_id: group.id,
      amount: value,
      payee: payee.trim(),
      note: note.trim(),
    }).select('*').single()
    setSaving(false)
    if (insertError) {
      setError('We could not record this payment. Please try again.')
      return
    }
    setPayouts((current) => [data, ...current])
    setAmount('')
    setPayee('')
    setNote('')
    setSaved(true)
  }

  return <>
    <PageHeader group={group} eyebrow="Keep track" title="Money out" description="Record what the group spends." action={<Link className="button secondary" href={`/app/groups/${group.id}/ledger`}><FileText size={17} />Group ledger</Link>} />
    <div className="payout-grid">
      <form className="content-card" onSubmit={savePayout}><h2>Record a payment</h2><p className="card-subtitle">Add money spent from the group account.</p>
        <label>How much?<div className="money-input"><span>₦</span><input inputMode="decimal" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></div></label>
        <label>Who is being paid?<input required value={payee} onChange={(event) => setPayee(event.target.value)} placeholder="Enter a payee" /></label>
        <label>What is it for?<input required value={note} onChange={(event) => setNote(event.target.value)} placeholder="Enter a short note" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button primary wide" disabled={saving}>{saving ? 'Saving...' : 'Save payment'}</button>
        {saved && <div className="success"><Check size={17} />Payment recorded and added to the ledger.</div>}
      </form>
      <div className="content-card"><div className="card-head"><div><h2>Past payments</h2><p>Recent money out</p></div></div>
        {loading ? <div className="list-skeleton" aria-label="Loading past payments"><span /><span /><span /></div> : loadError ? <div className="empty" role="alert">{loadError}</div> : payouts.length === 0 ? <div className="empty"><b>No payments recorded yet</b><span>Money out will appear here after you record a payment.</span></div> : payouts.map((payout) => <div className="payment" key={payout.id}><span className="payment-icon"><Wallet size={17} /></span><div><b>{payout.payee}</b><span>{payout.note} · {friendlyDate(payout.created_at)}</span></div><strong>-{money(payout.amount)}</strong></div>)}
      </div>
    </div>
  </>
}
