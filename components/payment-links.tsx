'use client'

import { useState } from 'react'
import { Copy, MessageCircle } from 'lucide-react'
import type { Member } from '@/lib/types'
import { normalizeNgPhone } from '@/lib/phone'

export function PaymentLinkActions({ member, groupName }: { member: Pick<Member, 'id' | 'name' | 'phone' | 'phone_normalized' | 'pay_token'>; groupName: string }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const phone = member.phone_normalized ?? normalizeNgPhone(member.phone)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pay/${member.pay_token}`)
      setCopied(true)
      setError('')
    } catch {
      setError('We could not copy the payment link. Please try again.')
    }
  }

  function sendOnWhatsApp() {
    const link = `${window.location.origin}/pay/${member.pay_token}`
    const message = `Hi ${member.name}, here is your payment page for ${groupName}: ${link}`
    if (!phone) return
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  }

  return <div className="payment-link-actions">
    <button className="copy-button" type="button" onClick={copyLink}><Copy size={15} />{copied ? 'Link copied' : 'Copy payment link'}</button>
    <button className="button secondary" type="button" disabled={!phone} onClick={sendOnWhatsApp}><MessageCircle size={15} />Send on WhatsApp</button>
    {error && <small role="alert">{error}</small>}
  </div>
}

export function PaymentLinks({ members, groupName }: { members: Pick<Member, 'id' | 'name' | 'phone' | 'phone_normalized' | 'pay_token'>[]; groupName: string }) {
  return <div className="payment-links-list">
    {members.length === 0 ? <p className="description">Add people to your group to send payment links.</p> : members.map((member) => <div className="member-row" key={member.id}>
      <div className="member-name"><b>{member.name}</b>{!member.phone && <span>No phone number</span>}</div>
      <PaymentLinkActions member={member} groupName={groupName} />
    </div>)}
  </div>
}

export function CopyLedgerLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/g/${slug}`)
      setCopied(true)
      setError('')
    } catch {
      setError('We could not copy the ledger link. Please try again.')
    }
  }

  return <div className="copy-ledger-link"><button type="button" className="button secondary" onClick={copyLink}><Copy size={15} />{copied ? 'Ledger link copied' : 'Copy ledger link'}</button>{error && <small role="alert">{error}</small>}</div>
}
