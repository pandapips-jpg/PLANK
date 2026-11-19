'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, LogOut } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/plank-ui'
import { GroupMark } from '@/components/group-mark'
import { createClient } from '@/lib/supabase/client'
import { initials } from '@/lib/format'
import { groupLabels } from '@/lib/labels'
import type { Group } from '@/lib/types'

export default function ProfilePage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    async function loadProfile() {
      const supabase = createClient()
      const [{ data: { user }, error: userError }, { data: groupData, error: groupError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('groups').select('*').order('created_at'),
      ])
      if (!active) return
      if (userError || groupError) {
        setError('We could not load your details. Please refresh and try again.')
      } else {
        setFullName(typeof user?.user_metadata.full_name === 'string' ? user.user_metadata.full_name : '')
        setPhoneNumber(typeof user?.user_metadata.phone === 'string' ? user.user_metadata.phone : '')
        setGroups(groupData ?? [])
      }
      setLoading(false)
    }
    void loadProfile()
    return () => { active = false }
  }, [])

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    const { error: updateError } = await createClient().auth.updateUser({
      data: { full_name: fullName.trim(), phone: phoneNumber.trim() },
    })
    setSaving(false)
    if (updateError) {
      setError('We could not save your details. Please try again.')
      return
    }
    setMessage('Your details have been saved.')
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

  return <>
    <PageHeader eyebrow="Your details" title="My profile" description="You can manage your treasurer details here." />
    <div className="profile-grid">
      <form className="content-card profile-card" onSubmit={saveProfile}><div className="profile-avatar">{initials(fullName)}</div><h2>{fullName || 'Treasurer'}</h2><p>Group treasurer</p>
        <label>Full name<input required value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
        <label>Phone number<input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="success">{message}</p>}
        <button className="button primary btn-block" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
        <button type="button" className="button secondary btn-block" onClick={logOut}><LogOut size={17} />Log out</button>
      </form>
      <div className="content-card"><div className="card-head"><div><span className="eyebrow">Your groups</span><h2>Groups you manage</h2></div><Link href="/app/new" className="text-button">Create a new group <ArrowRight size={15} /></Link></div>
        {loading ? <div className="list-skeleton" aria-label="Loading your groups"><span /><span /><span /></div> : groups.length === 0 ? <div className="empty">You have no groups yet.</div> : groups.map((group) => {
          const labels = groupLabels(group.type)
          return <Link className="profile-group" href={`/app/groups/${group.id}`} key={group.id}>
            <GroupMark group={group} /><div><b>{group.name}</b><small>{group.type} · {group.amount.toLocaleString('en-NG')} per {labels.people.slice(0, -1)}</small></div><ArrowRight size={16} />
          </Link>
        })}
      </div>
    </div>
  </>
}
