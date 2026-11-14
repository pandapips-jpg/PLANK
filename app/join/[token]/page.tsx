import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { GroupMark } from '@/components/group-mark'
import { JoinForm } from '@/components/join-form'
import { Logo } from '@/components/plank-ui'
import { friendlyDate, money } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import type { JoinInfo } from '@/lib/types'

function nextContributionDeadline(info: JoinInfo) {
  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  if (info.first_due_date) {
    const start = new Date(`${info.first_due_date.slice(0, 10)}T00:00:00`)
    if (start > nextMonth) nextMonth.setFullYear(start.getFullYear(), start.getMonth(), 1)
  }
  const deadline = info.due_rule === 'month_end'
    ? new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0)
    : new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(Math.max(info.due_day ?? 1, 1), 28))
  return friendlyDate(deadline.toISOString().slice(0, 10))
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const cookieStore = await cookies()
  const savedPayToken = cookieStore.get(`plank_m_${token}`)?.value
  if (savedPayToken && /^[0-9a-f-]{36}$/i.test(savedPayToken)) redirect(`/pay/${savedPayToken}`)

  const supabase = await createClient()
  const { data: response, error } = await supabase.rpc('get_join_info', { p_token: token })
  if (error) throw error
  const info = Array.isArray(response) ? response[0] ?? null : response

  if (!info) return <div className="member-page join-page">
    <header><Logo /></header>
    <main><div className="member-greeting"><p className="eyebrow">Join your group</p><h1>This link is not active.</h1><p>Ask your group admin for a new one.</p></div></main>
  </div>

  const groupName = typeof info.name === 'string' ? info.name : ''
  const logoUrl = typeof info.logo_url === 'string' ? info.logo_url : null
  const frequency = info.frequency === 'monthly' ? 'every month'
    : info.frequency === 'quarterly' ? 'every 3 months'
      : info.frequency === 'yearly' ? 'every year' : 'one time'
  return <div className="member-page join-page">
    <header><Logo /></header>
    <main>
      <div className="member-greeting">
        <GroupMark group={{ name: groupName, logo_url: logoUrl }} className="page-group-mark" />
        <p className="eyebrow">{groupName}</p>
        <h1>Join {groupName}</h1>
        <p>{money(info.amount)} {frequency}</p>
        <p>Your first contribution is due by {nextContributionDeadline(info)}.</p>
      </div>
      <JoinForm token={token} />
      <div className="member-footer"><b>Powered by Plank</b><span>Simple group money for people who care.</span></div>
    </main>
  </div>
}
