'use server'

import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPaymentRequest } from '@/lib/paga/collect'
import { findReusablePaymentAttempt } from '@/lib/payments/attempts'
import { normalizeNgPhone, toLocalNg } from '@/lib/phone'
import { getPagaEnv } from '@/lib/env'
import { getMemberStatus } from '@/lib/status'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const missingPhoneMessage = 'Add a valid Nigerian phone number to your profile before starting a Paga payment.'

export type StartPaymentResult =
  | {
      ok: true
      attempt: {
        id: string
        amount: number
        accountNumber: string
        bankName: string
        totalAmount: number
        expiresAt: string
      }
      reused: boolean
    }
  | { ok: false; error: string; nothingDue?: boolean }

export type AttemptStateResult =
  | { ok: true; status: 'open' | 'paid' | 'failed' | 'expired'; expiresAt: string | null }
  | { ok: false; error: string }

function paymentAttemptError(error: { code?: string; message?: string }, operation: string) {
  console.error(`Payment attempt ${operation} failed`, { code: error.code, message: error.message })
}

export async function startPayment(payToken: string): Promise<StartPaymentResult> {
  if (!uuidPattern.test(payToken)) return { ok: false, error: 'This payment link is not active.' }

  const admin = createAdminClient()
  const { data: member, error: memberError } = await admin.from('members')
    .select('id, group_id, phone, phone_normalized')
    .eq('pay_token', payToken)
    .eq('status', 'active')
    .maybeSingle()
  if (memberError) {
    paymentAttemptError(memberError, 'member lookup')
    return { ok: false, error: 'We could not load your payment details. Please try again.' }
  }
  if (!member) return { ok: false, error: 'This payment link is not active.' }

  const { data: group, error: groupError } = await admin.from('groups')
    .select('id, frequency, due_rule')
    .eq('id', member.group_id)
    .maybeSingle()
  if (groupError) {
    paymentAttemptError(groupError, 'group lookup')
    return { ok: false, error: 'We could not load your payment details. Please try again.' }
  }
  if (!group) return { ok: false, error: 'This payment link is not active.' }

  const { error: ensureError } = await admin.rpc('ensure_charges', { p_group: group.id })
  if (ensureError) {
    paymentAttemptError(ensureError, 'charge refresh')
    return { ok: false, error: 'We could not calculate the amount due. Please try again.' }
  }

  const { data: charges, error: chargesError } = await admin.from('charges')
    .select('member_id, due_date, amount, paid_amount')
    .eq('member_id', member.id)
  if (chargesError) {
    paymentAttemptError(chargesError, 'charge lookup')
    return { ok: false, error: 'We could not calculate the amount due. Please try again.' }
  }
  const now = new Date()
  const due = Number(getMemberStatus(charges ?? [], now, group.frequency, group.due_rule).remaining.toFixed(2))
  if (due <= 0) return { ok: false, error: 'There is nothing due right now.', nothingDue: true }

  const reusableAfter = new Date(now.getTime() + 10 * 60 * 1000).toISOString()
  const { data: openAttempts, error: attemptsError } = await admin.from('payment_attempts')
    .select('*')
    .eq('member_id', member.id)
    .eq('status', 'open')
    .eq('amount', due)
    .gt('expires_at', reusableAfter)
    .order('created_at', { ascending: false })
  if (attemptsError) {
    paymentAttemptError(attemptsError, 'open request lookup')
    return { ok: false, error: 'We could not check for an existing payment request. Please try again.' }
  }
  const reusable = findReusablePaymentAttempt(openAttempts ?? [], due, now)
  if (reusable?.account_number && reusable.bank_name && reusable.total_amount !== null && reusable.expires_at) {
    return {
      ok: true,
      reused: true,
      attempt: {
        id: reusable.id,
        amount: Number(reusable.amount),
        accountNumber: reusable.account_number,
        bankName: reusable.bank_name,
        totalAmount: Number(reusable.total_amount),
        expiresAt: reusable.expires_at,
      },
    }
  }

  const phone = toLocalNg(member.phone_normalized ?? '')
    ?? toLocalNg(normalizeNgPhone(member.phone ?? '') ?? '')
  if (!phone) return { ok: false, error: missingPhoneMessage }

  const env = getPagaEnv()
  const expiresAt = new Date(now.getTime() + env.pagaRequestExpiryMinutes * 60 * 1000)
  const referenceNumber = `PLK${randomUUID().replace(/-/g, '')}`
  const request = await createPaymentRequest({
    referenceNumber,
    amount: due,
    phoneNumber: phone,
    callbackUrl: `${env.publicAppUrl}/api/paga/payment-callback`,
    expiresAt,
  })

  if (!request.ok) {
    const { error: saveError } = await admin.from('payment_attempts').insert({
      group_id: group.id,
      member_id: member.id,
      amount: due,
      status: 'failed',
      reference_number: referenceNumber,
      account_number: null,
      bank_name: null,
      total_amount: null,
      expires_at: expiresAt.toISOString(),
    })
    if (saveError) paymentAttemptError(saveError, 'failed request save')
    return { ok: false, error: 'We could not create your payment request. Please try again.' }
  }

  const { data: attempt, error: saveError } = await admin.from('payment_attempts').insert({
    group_id: group.id,
    member_id: member.id,
    amount: due,
    status: 'open',
    reference_number: referenceNumber,
    account_number: request.accountNumber,
    bank_name: request.bankName,
    total_amount: request.totalAmount,
    expires_at: request.expiresAt,
  }).select('id').single()
  if (saveError || !attempt) {
    if (saveError) paymentAttemptError(saveError, 'request save')
    return { ok: false, error: 'We could not save your payment request. Please try again.' }
  }

  return {
    ok: true,
    reused: false,
    attempt: {
      id: attempt.id,
      amount: due,
      accountNumber: request.accountNumber,
      bankName: request.bankName,
      totalAmount: request.totalAmount,
      expiresAt: request.expiresAt,
    },
  }
}

export async function getAttemptState(payToken: string, attemptId: string): Promise<AttemptStateResult> {
  if (!uuidPattern.test(payToken) || !uuidPattern.test(attemptId)) {
    return { ok: false, error: 'We could not check this payment request.' }
  }

  const admin = createAdminClient()
  const { data: member, error: memberError } = await admin.from('members')
    .select('id')
    .eq('pay_token', payToken)
    .eq('status', 'active')
    .maybeSingle()
  if (memberError) {
    paymentAttemptError(memberError, 'member lookup')
    return { ok: false, error: 'We could not check this payment request.' }
  }
  if (!member) return { ok: false, error: 'We could not check this payment request.' }

  const { data: attempt, error: attemptError } = await admin.from('payment_attempts')
    .select('id, status, expires_at')
    .eq('id', attemptId)
    .eq('member_id', member.id)
    .maybeSingle()
  if (attemptError) {
    paymentAttemptError(attemptError, 'status lookup')
    return { ok: false, error: 'We could not check this payment request.' }
  }
  if (!attempt) return { ok: false, error: 'We could not check this payment request.' }

  let status = attempt.status
  if (status === 'open' && (!attempt.expires_at || new Date(attempt.expires_at).getTime() <= Date.now())) {
    const { data: expiredAttempt, error: expireError } = await admin.from('payment_attempts')
      .update({ status: 'expired' })
      .eq('id', attempt.id)
      .eq('status', 'open')
      .select('status')
      .maybeSingle()
    if (expireError) {
      paymentAttemptError(expireError, 'expiry update')
      return { ok: false, error: 'We could not check this payment request.' }
    }
    if (expiredAttempt) {
      status = expiredAttempt.status
    } else {
      const { data: latestAttempt, error: latestError } = await admin.from('payment_attempts')
        .select('status')
        .eq('id', attempt.id)
        .eq('member_id', member.id)
        .maybeSingle()
      if (latestError || !latestAttempt) {
        if (latestError) paymentAttemptError(latestError, 'status refresh')
        return { ok: false, error: 'We could not check this payment request.' }
      }
      status = latestAttempt.status
    }
  }

  return { ok: true, status, expiresAt: attempt.expires_at }
}
