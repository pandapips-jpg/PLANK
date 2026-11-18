'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type RecordReminderResult = { ok: true } | { ok: false; error: string }

export async function recordReminderSent(groupId: string, memberId: string): Promise<RecordReminderResult> {
  if (!uuidPattern.test(groupId) || !uuidPattern.test(memberId)) {
    return { ok: false, error: 'This reminder request is invalid.' }
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) {
    console.error('Reminder notification authentication failed', { message: authError.message })
    return { ok: false, error: 'We could not verify your account. Please try again.' }
  }
  if (!user) return { ok: false, error: 'Sign in to record this reminder.' }

  const admin = createAdminClient()
  const { data: group, error: groupError } = await admin.from('groups')
    .select('id')
    .eq('id', groupId)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (groupError) {
    console.error('Reminder notification group lookup failed', { code: groupError.code, message: groupError.message })
    return { ok: false, error: 'We could not verify this group. Please try again.' }
  }
  if (!group) return { ok: false, error: 'You are not allowed to record reminders for this group.' }

  const { data: member, error: memberError } = await admin.from('members')
    .select('id, name')
    .eq('id', memberId)
    .eq('group_id', group.id)
    .eq('status', 'active')
    .maybeSingle()
  if (memberError) {
    console.error('Reminder notification member lookup failed', { code: memberError.code, message: memberError.message })
    return { ok: false, error: 'We could not verify this member. Please try again.' }
  }
  if (!member) return { ok: false, error: 'This member is no longer active in the group.' }

  const { error: insertError } = await admin.from('notifications').insert({
    group_id: group.id,
    member_id: member.id,
    kind: 'reminder_sent',
    title: `Reminder sent to ${member.name}`,
    body: `A WhatsApp reminder was opened for ${member.name}.`,
  })
  if (insertError) {
    console.error('Reminder notification insert failed', { code: insertError.code, message: insertError.message })
    return { ok: false, error: 'WhatsApp opened, but we could not record the reminder. Please try again.' }
  }

  return { ok: true }
}
