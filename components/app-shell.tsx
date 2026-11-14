'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Bell, Check, ChevronDown, FileText, Home, LogOut, MoreHorizontal, Settings, Users, Wallet, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { initials } from '@/lib/format'
import type { Group } from '@/lib/types'
import { GroupMark } from '@/components/group-mark'
import { Logo } from '@/components/plank-ui'
import { NotificationsBell } from '@/components/notifications-bell'

type AppInfo = { group: Group; groups: Group[]; name: string; phone: string }
const AppInfoContext = createContext<AppInfo | null>(null)

export function useAppInfo() {
  const value = useContext(AppInfoContext)
  if (!value) throw new Error('App information is not available.')
  return value
}

const items = [
  { section: '', label: 'Overview', icon: Home },
  { section: '/members', label: 'Members', icon: Users },
  { section: '/remind', label: 'Remind', icon: Bell },
  { section: '/payout', label: 'Money out', icon: Wallet },
  { section: '/settings', label: 'Settings', icon: Settings },
]

export function AppShell({ info, children }: { info: AppInfo; children: React.ReactNode }) {
  const path = usePathname()
  const router = useRouter()
  const [error, setError] = useState('')
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const prefix = `/app/groups/${info.group.id}`
  const section = path.startsWith(prefix) ? path.slice(prefix.length) : ''
  const current = path === '/app/profile' ? '/profile' : items.find((item) => item.section === section)?.section ?? ''

  useEffect(() => {
    document.cookie = `plank_last_group=${encodeURIComponent(info.group.id)}; Path=/; Max-Age=31536000; SameSite=Lax`
  }, [info.group.id])

  function switchGroup(group: Group) {
    const targetSection = section && items.some((item) => item.section === section) ? section : ''
    setSwitcherOpen(false)
    router.push(`/app/groups/${group.id}${targetSection}`)
  }

  async function logOut() {
    const { error: signOutError } = await createClient().auth.signOut()
    if (signOutError) {
      setError('We could not log you out. Please try again.')
      return
    }
    router.replace('/login')
    router.refresh()
  }

  const avatar = initials(info.name) || 'P'
  const switcher = <button type="button" className="group-switch" onClick={() => setSwitcherOpen(true)} aria-expanded={switcherOpen}>
    <GroupMark group={info.group} /><span><b>{info.group.name}</b><small>{info.group.type}</small></span><ChevronDown size={15} />
  </button>

  return <AppInfoContext.Provider value={info}>
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        {switcher}
        <NotificationsBell groupId={info.group.id} />
        <nav>{items.map(({ section: itemSection, label, icon: Icon }) => <Link key={itemSection} href={`${prefix}${itemSection}`} className={current === itemSection ? 'active' : ''}><Icon size={18} />{label}</Link>)}</nav>
        <div className="side-bottom">
          <Link href={`/app/groups/${info.group.id}/ledger`} className="ledger-link"><FileText size={17} />Group ledger <ArrowRight size={15} /></Link>
          <Link href="/app/profile" className="user"><span className="avatar">{avatar}</span><span><b>{info.name}</b><small>Treasurer · My profile</small></span><MoreHorizontal size={17} /></Link>
          <button type="button" className="ledger-link" onClick={logOut}><LogOut size={17} />Log out</button>
          {error && <small role="alert">{error}</small>}
        </div>
      </aside>
      <main className="main">
        <header className="mobile-header"><Logo /><div className="mobile-header-actions"><NotificationsBell groupId={info.group.id} /><div className="mobile-group-switch">{switcher}<Link href="/app/profile" className="mobile-menu" aria-label="Open profile">{avatar}</Link></div></div></header>
        {children}
      </main>
      <div className="mobile-tabs">{items.map(({ section: itemSection, label, icon: Icon }) => <Link key={itemSection} href={`${prefix}${itemSection}`} className={current === itemSection ? 'active' : ''}><Icon size={19} /><span>{label}</span></Link>)}</div>
    </div>
    {switcherOpen && <div className="group-switch-backdrop" onClick={() => setSwitcherOpen(false)}>
      <div className="group-switch-menu" role="dialog" aria-modal="true" aria-label="Switch group" onClick={(event) => event.stopPropagation()}>
        <div className="group-switch-menu-head"><b>Switch group</b><button type="button" className="icon-button" aria-label="Close" onClick={() => setSwitcherOpen(false)}><X size={16} /></button></div>
        {info.groups.map((group) => <button type="button" key={group.id} className="group-switch-option" onClick={() => switchGroup(group)}>
          <GroupMark group={group} /><span><b>{group.name}</b><small>{group.type}</small></span>{group.id === info.group.id && <Check size={17} />}
        </button>)}
        <Link className="group-switch-create" href="/app/new" onClick={() => setSwitcherOpen(false)}>+ Create a new group</Link>
      </div>
    </div>}
  </AppInfoContext.Provider>
}
