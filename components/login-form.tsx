'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { signInWithEmailPassword } from '@/lib/auth'
import { Logo } from '@/components/plank-ui'

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data, error: loginError } = await signInWithEmailPassword(email.trim(), password)
      if (loginError || !data.user) {
        setError(loginError?.message.toLowerCase().includes('fetch')
          ? 'We could not reach the service. Check your connection and try again.'
          : 'That email or password is not right.')
        return
      }

      const { data: groups, error: groupError } = await createClient()
        .from('groups')
        .select('id')
        .eq('owner_id', data.user.id)
      if (groupError) {
        setError('We could not open your group. Please try again.')
        return
      }
      const lastGroup = decodeURIComponent(document.cookie.split('; ').find((cookie) => cookie.startsWith('plank_last_group='))?.split('=').slice(1).join('=') ?? '')
      const destination = lastGroup && groups?.some((group) => group.id === lastGroup)
        ? `/app/groups/${lastGroup}`
        : '/app'
      router.replace(destination)
      router.refresh()
    } catch {
      setError('We could not reach the service. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return <div className="auth-page"><Logo /><div className="auth-card">
    <p className="eyebrow">Welcome back</p><h1>Log in to Plank.</h1>
    <p className="description">Enter your email and password to continue.</p>
    <form onSubmit={handleLogin}>
      <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Password<div className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((current) => !current)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary wide" disabled={loading}>{loading ? 'Logging in...' : <>Log in <ArrowRight size={17} /></>}</button>
    </form>
    <p className="auth-foot">New to Plank? <Link href="/start">Create a group</Link></p>
  </div></div>
}
