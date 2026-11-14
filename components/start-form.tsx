'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { signUpWithEmailPassword } from '@/lib/auth'
import { Logo } from '@/components/plank-ui'
import { GroupLogoInput } from '@/components/group-logo-input'
import { JoinLinkActions } from '@/components/join-link-actions'
import { contributionMonthChoices, contributionPeriodChoices } from '@/lib/schedule'
import type { DueRule, GroupType, GroupVisibility, PaymentFrequency } from '@/lib/types'

export function StartForm({ initialStep, hasGroups, isAuthenticated }: { initialStep: number; hasGroups: boolean; isAuthenticated: boolean }) {
  const router = useRouter()
  const supabase = createClient()
  const initialStartChoices = contributionMonthChoices()
  const [step, setStep] = useState(initialStep)
  const [signedIn, setSignedIn] = useState(isAuthenticated)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupType, setGroupType] = useState<GroupType>('Estate')
  const [frequency, setFrequency] = useState<PaymentFrequency>('monthly')
  const [dueRule, setDueRule] = useState<DueRule>('month_end')
  const [dueDay, setDueDay] = useState('1')
  const [dueWeekday, setDueWeekday] = useState('5')
  const [startMonth, setStartMonth] = useState(() => initialStartChoices[1].value)
  const [visibility, setVisibility] = useState<GroupVisibility>('members')
  const [amount, setAmount] = useState('')
  const [group, setGroup] = useState<{ id: string; slug: string; name: string; logo_url: string | null; join_token: string } | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoError, setLogoError] = useState('')
  const [error, setError] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false)
  const weekly = frequency === 'weekly' || frequency === 'biweekly'
  const startChoices = contributionPeriodChoices({
    frequency,
    due_rule: dueRule,
    due_day: Number(dueDay),
    first_due_date: null,
    due_weekday: Number(dueWeekday),
  })
  const hasUnsavedGroup = !group && Boolean(
    groupName.trim()
    || amount.trim()
    || logoFile
    || groupType !== 'Estate'
    || frequency !== 'monthly'
    || (weekly ? dueWeekday !== '5' : dueRule !== 'month_end')
    || dueDay !== '1'
    || startMonth !== startChoices[1].value
    || visibility !== 'members',
  )

  async function logOut() {
    setLoading(true)
    setError('')
    const { error: signOutError } = await supabase.auth.signOut()
    setLoading(false)
    if (signOutError) {
      setError('We could not log you out. Please try again.')
      return
    }
    router.replace('/login')
    router.refresh()
  }

  function navigateToGroups() {
    setShowLeaveConfirmation(false)
    router.push('/app')
  }

  function handleGroupsLinkClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (hasUnsavedGroup) {
      event.preventDefault()
      setShowLeaveConfirmation(true)
    }
  }

  function changeFrequency(nextFrequency: PaymentFrequency) {
    const nextWeekly = nextFrequency === 'weekly' || nextFrequency === 'biweekly'
    const nextDueRule = nextWeekly ? 'fixed' : 'month_end'
    const choices = contributionPeriodChoices({
      frequency: nextFrequency,
      due_rule: nextDueRule,
      due_day: Number(dueDay),
      first_due_date: null,
      due_weekday: Number(dueWeekday),
    })
    setFrequency(nextFrequency)
    setDueRule(nextDueRule)
    setStartMonth(choices[1].value)
  }

  function changeDueWeekday(value: string) {
    setDueWeekday(value)
    setStartMonth(contributionPeriodChoices({
      frequency,
      due_rule: 'fixed',
      due_day: Number(dueDay),
      first_due_date: null,
      due_weekday: Number(value),
    })[1].value)
  }

  function goBack() {
    setError('')
    setErrorCode('')
    if (step > initialStep) {
      setStep(step - 1)
      return
    }
    if (hasGroups) {
      if (hasUnsavedGroup) setShowLeaveConfirmation(true)
      else navigateToGroups()
      return
    }
    setStep(Math.max(1, step - 1))
  }

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (signedIn) {
      setStep(2)
      return
    }
    const cleanPhone = phone.trim().replace(/[\s-]/g, '')
    const validPhone = /^0[789]\d{9}$/.test(cleanPhone) || /^\+234[789]\d{9}$/.test(cleanPhone)
    if (!fullName.trim()) {
      setError('Enter your full name.')
      return
    }
    if (!validPhone) {
      setError('Enter a valid Nigerian phone number.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.')
      return
    }
    if (password.length < 8) {
      setError('Your password must be at least 8 characters.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const { data, error: signUpError } = await signUpWithEmailPassword(
        email.trim(),
        password,
        fullName.trim(),
        phone.trim(),
      )
      if (signUpError || !data.user || !data.session) {
        setError('We could not create your account. Please try again.')
        return
      }
      setSignedIn(true)
      setStep(2)
    } catch {
      setError('We could not reach the service. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setErrorCode('')
    if (logoError) {
      setError(logoError)
      return
    }
    if (!groupName.trim()) {
      setError('Enter your group name.')
      return
    }
    const value = Number(amount.trim().replace(/[₦,\s]/g, ''))
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount above zero.')
      return
    }
    if (!startMonth) {
      setError('Choose when your group starts.')
      return
    }
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      setError('We could not check your account. Please try again.')
      return
    }
    if (!session) {
      setError('Please log in before creating your group.')
      return
    }
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) {
      setError('We could not check your account. Please try again.')
      return
    }
    if (!user || user.id !== session.user.id) {
      setError('Please log in before creating your group.')
      return
    }
    setLoading(true)
    const baseSlug = groupName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group'
    const parsedDueDay = Number(dueDay)
    const fixedDueDay = Number.isFinite(parsedDueDay) ? Math.min(28, Math.max(1, Math.trunc(parsedDueDay))) : 5
    const groupValues = {
      owner_id: user.id,
      name: groupName.trim(),
      type: groupType,
      amount: value,
      frequency,
      due_rule: weekly ? 'fixed' : dueRule,
      due_day: weekly ? 5 : dueRule === 'fixed' ? fixedDueDay : 5,
      due_mode: 'shared' as const,
      first_due_date: weekly ? startMonth : `${startMonth}-01`,
      visibility,
      join_open: true,
      join_needs_approval: false,
    }
    const makeSlug = () => `${baseSlug}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
    const logInsertError = (insertError: { code: string; message: string; details: string; hint: string }) => {
      console.error('Failed to create group', {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
      })
    }
    let insertResult = await supabase.from('groups').insert({ ...groupValues, slug: makeSlug() })
      .select('id, slug, name, logo_url, join_token')
    for (let retry = 0; insertResult.error?.code === '23505' && retry < 2; retry++) {
      logInsertError(insertResult.error)
      insertResult = await supabase.from('groups').insert({ ...groupValues, slug: makeSlug() })
        .select('id, slug, name, logo_url, join_token')
    }
    if (insertResult.error) {
      logInsertError(insertResult.error)
      setLoading(false)
      setError('We could not save your group. Please try again.')
      setErrorCode(insertResult.error.code)
      return
    }
    const createdGroups = insertResult.data
    const data = createdGroups?.[0]
    if (!data) {
      setLoading(false)
      setError('We could not save your group. Please try again.')
      return
    }
    let createdGroup = data
    if (logoFile) {
      const extension = logoFile.type === 'image/jpeg' ? 'jpg' : logoFile.type === 'image/png' ? 'png' : 'webp'
      const path = `${data.id}/logo-${Date.now()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('group-logos').upload(path, logoFile, {
        contentType: logoFile.type,
        upsert: true,
      })
      if (uploadError) {
        setLogoError('Your group was created, but we could not upload its logo.')
      } else {
        const logoUrl = supabase.storage.from('group-logos').getPublicUrl(path).data.publicUrl
        const { error: updateError } = await supabase.from('groups').update({ logo_url: logoUrl }).eq('id', data.id)
        if (updateError) setLogoError('Your group was created, but we could not save its logo.')
        else createdGroup = { ...data, logo_url: logoUrl }
      }
    }
    setLoading(false)
    setGroup(createdGroup)
    setStep(3)
  }

  return <div className="start-page">
    <header><Logo />
      {step > 1 && (hasGroups || group !== null)
        ? <Link href="/app" className="setup-exit-link" onClick={handleGroupsLinkClick}>← Your groups</Link>
        : signedIn
          ? <button type="button" className="setup-exit-link" onClick={logOut} disabled={loading}><LogOut size={15} />Log out</button>
          : step === 1
            ? <Link href="/login" className="login-link">Already have an account? <b>Log in</b></Link>
            : null}
    </header>
    <div className="start-wrap">
      <div className="step-count">Step {step} of 3</div><div className="step-progress"><span style={{ width: `${step * 100 / 3}%` }} /></div>
      {step === 1 && <form onSubmit={createAccount}>
        <p className="eyebrow">Welcome to Plank</p><h1>Let&apos;s start with you.</h1><p className="description">The person keeping the group&apos;s money in order.</p>
        <div className="form-stack">
          <label>Your full name<input required autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
          <label>Phone number<input type="tel" required autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
          <label>Email address<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<div className="password-field"><input type={showPassword ? 'text' : 'password'} required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((current) => !current)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button primary wide continue" disabled={loading}>{loading ? 'Creating account...' : <>Continue <ArrowRight size={17} /></>}</button>
      </form>}
      {step === 2 && <form onSubmit={createGroup}>
        <p className="eyebrow">Your group</p><h1>What are you collecting for?</h1><p className="description">A simple setup now makes everything easier later.</p>
        <button type="button" className="button secondary setup-back" onClick={goBack}><ArrowLeft size={16} />Back</button>
        <div className="form-stack">
          <label>Group name<input required value={groupName} onChange={(event) => setGroupName(event.target.value)} /></label>
          <label>How much?<input inputMode="numeric" required value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
          <label>How often?<select value={frequency} onChange={(event) => changeFrequency(event.target.value as PaymentFrequency)}><option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="monthly">Monthly</option><option value="quarterly">Every 3 months</option><option value="yearly">Yearly</option><option value="one_time">One time</option></select></label>
          {weekly
            ? <label>Which day is it due?<select value={dueWeekday} onChange={(event) => changeDueWeekday(event.target.value)}><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option><option value="0">Sunday</option></select></label>
            : <>
              <label>Deadline<select value={dueRule} onChange={(event) => setDueRule(event.target.value as DueRule)}><option value="month_end">End of every month</option><option value="fixed">A fixed day</option></select></label>
              {dueRule === 'fixed' && <label>Day of the month<input type="number" min="1" max="28" required value={dueDay} onChange={(event) => setDueDay(event.target.value)} /></label>}
            </>}
          <label>Starts<select value={startMonth} onChange={(event) => setStartMonth(event.target.value)}>{startChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>
          <details className="more-options">
            <summary>More options</summary>
            <div className="form-stack">
              <label>Group type<select value={groupType} onChange={(event) => setGroupType(event.target.value as GroupType)}><option>Estate</option><option>Church</option><option>Union</option><option>Age grade</option><option>Rent (property)</option><option>Other</option></select></label>
              <label>Who can see the money record?<select value={visibility} onChange={(event) => setVisibility(event.target.value as GroupVisibility)}><option value="owner">Only me</option><option value="members">Members of this group</option><option value="public">Anyone with the link</option></select><small>{visibility === 'owner' ? 'Only you can see the money record. Members see only their own payments.' : visibility === 'members' ? 'Members see every payment and payout using their own link. Nobody else can.' : 'Anyone who has the group link can see it.'}</small></label>
              <GroupLogoInput group={{ name: groupName || 'Your group', logo_url: null }} file={logoFile} onChange={(file, message) => { setLogoFile(file); setLogoError(message) }} />
              {logoError && <p className="logo-error" role="alert">{logoError}</p>}
            </div>
          </details>
        </div>
        {error && <p className="form-error" role="alert">{error}{errorCode && <small className="form-error-code">Code {errorCode}</small>}</p>}
        <button className="button primary wide continue" disabled={loading}>{loading ? 'Saving group...' : <>Continue <ArrowRight size={17} /></>}</button>
      </form>}
      {step === 3 && group && <>
        <div className="done-mark"><Check size={28} /></div><p className="eyebrow">You&apos;re all set</p><h1>{group.name} is ready.</h1><p className="description">Share the join link with your members.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {logoError && <p className="form-error" role="alert">{logoError}</p>}
        <div className="content-card next-payment-links"><h2>Share with your members</h2><JoinLinkActions groupName={group.name} joinToken={group.join_token} />
          <Link className="optional-link" href={`/app/groups/${group.id}/members`}>Add members yourself</Link>
        </div>
        <button className="button primary wide" onClick={() => { router.replace(`/app/groups/${group.id}`); router.refresh() }}>Go to my overview <ArrowRight size={17} /></button>
      </>}
    </div>
    {showLeaveConfirmation && <div className="leave-group-backdrop" onClick={() => setShowLeaveConfirmation(false)}>
      <div className="leave-group-dialog" role="dialog" aria-modal="true" aria-labelledby="leave-group-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="leave-group-title">Leave without saving this group?</h2>
        <div className="leave-group-actions">
          <button type="button" className="button secondary" onClick={() => setShowLeaveConfirmation(false)}>Stay</button>
          <button type="button" className="button primary" onClick={navigateToGroups}>Leave</button>
        </div>
      </div>
    </div>}
  </div>
}
