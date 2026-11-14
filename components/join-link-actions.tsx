'use client'

import { useEffect, useState } from 'react'
import { Copy, MessageCircle } from 'lucide-react'

export function JoinLinkActions({ groupName, joinToken }: { groupName: string; joinToken: string }) {
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => setOrigin(window.location.origin), [])

  const link = origin ? `${origin}/join/${joinToken}` : `/join/${joinToken}`
  const message = `Join ${groupName} on Plank so you get updates and can pay your contribution easily: ${link}`

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/join/${joinToken}`)
      setCopied(true)
      setError('')
    } catch {
      setError('We could not copy the join link. Please try again.')
    }
  }

  return <div className="join-link-actions">
    <input aria-label="Join link" readOnly value={link} />
    <div className="quick-actions">
      <button type="button" className="button secondary" onClick={copyLink}><Copy size={15} />{copied ? 'Copied' : 'Copy'}</button>
      <a className="button whatsapp" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><MessageCircle size={15} />Share on WhatsApp</a>
    </div>
    {error && <small role="alert">{error}</small>}
  </div>
}
