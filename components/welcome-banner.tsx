'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

export function WelcomeBanner({ name, date }: { name: string; date: string }) {
  const [visible, setVisible] = useState(true)
  if (!visible) return null

  return <div className="welcome-banner" role="status">
    <span>You&apos;re in, {name}! Your first contribution is due by {date}. We will remind you.</span>
    <button type="button" aria-label="Dismiss" onClick={() => setVisible(false)}><X size={16} /></button>
  </div>
}
