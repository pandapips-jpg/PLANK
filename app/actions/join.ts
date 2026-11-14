'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type JoinActionState = { message: string } | null

export async function joinGroupAction(_state: JoinActionState, formData: FormData): Promise<JoinActionState> {
  const token = String(formData.get('token') ?? '')
  const name = String(formData.get('name') ?? '')
  const phone = String(formData.get('phone') ?? '')
  const supabase = await createClient()
  const { data: joinInfoResponse, error: infoError } = await supabase.rpc('get_join_info', { p_token: token })
  if (infoError) throw infoError
  const joinInfo = Array.isArray(joinInfoResponse) ? joinInfoResponse[0] ?? null : joinInfoResponse
  const { data, error } = await supabase.rpc('join_group', {
    p_token: token,
    p_name: name,
    p_phone: phone,
  })
  if (error) throw error

  const result = Array.isArray(data) ? data[0] : data
  if (!result) throw new Error('The group did not return a join result.')

  if (result.status === 'joined') {
    if (!result.pay_token) throw new Error('The group did not return a payment link.')
    const cookieStore = await cookies()
    cookieStore.set(`plank_m_${token}`, result.pay_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    })
    redirect(`/pay/${result.pay_token}?welcome=1`)
  }

  const messages: Record<string, string> = {
    pending: `Request sent. ${joinInfo?.name || 'Your group'} will let you in shortly.`,
    exists: 'You have already joined. Ask the group admin to send your link again.',
    bad_name: 'Please enter your name.',
    bad_phone: 'Please enter a valid Nigerian WhatsApp number.',
    closed: 'This group is not accepting new members right now.',
    busy: 'We could not send your request. Please try again.',
  }
  return { message: messages[result.status] ?? 'We could not send your request. Please try again.' }
}
