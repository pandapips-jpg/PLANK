'use server'

import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPaymentRequest } from '@/lib/paga/collect'
import { findReusablePaymentAttempt } from '@/lib/payments/attempts'
import { normalizeNgPhone, toLocalNg } from '@/lib/phone'
import { getPagaEnv } from '@/lib/env'
import { getPaymentPageState } from '@/lib/payment-page-status'
import { z } from 'zod'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const paymentTokenSchema = z.string().max(36).regex(uuidPattern)
const startPaymentInputSchema = z.object({
  payToken: paymentTokenSchema,
  payEarly: z.boolean(),
})
const attemptStateInputSchema = z.object({
  payToken: paymentTokenSchema,
  attemptId: paymentTokenSchema,
})
const missingPhoneMessage = 'Add your phone number first.'
type PaymentStage = 'env' | 'find_member' | 'ensure_charges' | 'compute_amount' | 'insert_attempt' | 'paga_request' | 'save_attempt'

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
  | { error: string; code: PaymentStage }

export type AttemptStateResult =
  | { ok: true; status: 'open' | 'paid' | 'failed' | 'expired'; expiresAt: string | null }
  | { ok: false; error: string }

function paymentAttemptError(error: { code?: string; message?: string }, operation: string) {
  console.error(`Payment attempt ${operation} failed`, { code: error.code, message: error.message })
}

function logSupabaseError(stage: PaymentStage, error: { code?: string; message?: string; details?: string; hint?: string }) {
  console.error('Payment request failed', {
    stage,
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  })
}

function logStageError(stage: PaymentStage, error: unknown) {
  const exception = error instanceof Error
    ? { errorName: error.name, message: error.message }
    : { errorName: typeof error, message: String(error) }
  console.error('Payment request failed', { stage, ...exception })
}

function paymentFailure(stage: PaymentStage, error: string): StartPaymentResult {
  return { error, code: stage }
}

export async function startPayment(payToken: string, payEarly = false): Promise<StartPaymentResult> {
  let stage: PaymentStage = 'env'
  try {
    const parsedInput = startPaymentInputSchema.safeParse({ payToken, payEarly })
    if (!parsedInput.success) {
      console.error('Payment request failed', { stage: 'find_member', reason: 'invalid_input' })
      return paymentFailure('find_member', 'This payment link is not active.')
    }
    payToken = parsedInput.data.payToken
    payEarly = parsedInput.data.payEarly

    const env = getPagaEnv()
    const admin = createAdminClient()

    stage = 'find_member'
    const { data: member, error: memberError } = await admin.from('members')
      .select('id, group_id, phone, phone_normalized, amount, first_due_date')
      .eq('pay_token', payToken)
      .eq('status', 'active')
      .maybeSingle()
    if (memberError) {
      logSupabaseError(stage, memberError)
      return paymentFailure(stage, 'We could not load your payment details. Please try again.')
    }
    if (!member) {
      console.error('Payment request failed', { stage, reason: 'member_not_found' })
      return paymentFailure(stage, 'This payment link is not active.')
    }

    const { data: group, error: groupError } = await admin.from('groups')
      .select('id, frequency, due_rule, due_day, amount, first_due_date')
      .eq('id', member.group_id)
      .maybeSingle()
    if (groupError) {
      logSupabaseError(stage, groupError)
      return paymentFailure(stage, 'We could not load your payment details. Please try again.')
    }
    if (!group) {
      console.error('Payment request failed', { stage, reason: 'group_not_found' })
      return paymentFailure(stage, 'This payment link is not active.')
    }

    stage = 'ensure_charges'
    const { error: ensureError } = await admin.rpc('ensure_charges', { p_group: group.id })
    if (ensureError) {
      logSupabaseError(stage, ensureError)
      return paymentFailure(stage, 'We could not calculate the amount due. Please try again.')
    }

    stage = 'compute_amount'
    const { data: charges, error: chargesError } = await admin.from('charges')
      .select('member_id, due_date, amount, paid_amount')
      .eq('member_id', member.id)
    if (chargesError) {
      logSupabaseError(stage, chargesError)
      return paymentFailure(stage, 'We could not calculate the amount due. Please try again.')
    }
    const now = new Date()
    const paymentState = getPaymentPageState({
      charges: charges ?? [],
      amount: member.amount ?? group.amount,
      frequency: group.frequency,
      due_rule: group.due_rule,
      due_day: group.due_day,
      first_due_date: member.first_due_date ?? group.first_due_date,
      group_first_due_date: group.first_due_date,
    }, now)
    const due = paymentState.kind === 'due'
      ? paymentState.amount
      : payEarly && paymentState.kind === 'upcoming'
        ? paymentState.amount
        : 0
    if (due <= 0) {
      console.error('Payment request failed', { stage, reason: 'nothing_due' })
      return paymentFailure(stage, 'There is nothing due right now.')
    }

    const phone = toLocalNg(member.phone_normalized ?? '')
      ?? toLocalNg(normalizeNgPhone(member.phone ?? '') ?? '')
    if (!phone) {
      console.error('Payment request failed', { stage, reason: 'missing_phone' })
      return paymentFailure(stage, missingPhoneMessage)
    }

    stage = 'insert_attempt'
    const reusableAfter = new Date(now.getTime() + 10 * 60 * 1000).toISOString()
    const { data: openAttempts, error: attemptsError } = await admin.from('payment_attempts')
      .select('*')
      .eq('member_id', member.id)
      .eq('status', 'open')
      .eq('amount', due)
      .gt('expires_at', reusableAfter)
      .order('created_at', { ascending: false })
    if (attemptsError) {
      logSupabaseError(stage, attemptsError)
      return paymentFailure(stage, 'We could not check for an existing payment request. Please try again.')
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

    const expiresAt = new Date(now.getTime() + env.pagaRequestExpiryMinutes * 60 * 1000)
    const referenceNumber = `PLK${randomUUID().replace(/-/g, '')}`
    stage = 'paga_request'
    const request = await createPaymentRequest({
      referenceNumber,
      amount: due,
      phoneNumber: phone,
      callbackUrl: `${env.publicAppUrl}/api/paga/payment-callback`,
      expiresAt,
    })

    if (!request.ok) {
      console.error('Payment request failed', {
        stage: 'paga_request',
        statusCode: request.statusCode,
        statusMessage: request.statusMessage,
        httpStatus: request.httpStatus,
      })
      stage = 'insert_attempt'
      const { error: insertError } = await admin.from('payment_attempts').insert({
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
      if (insertError) {
        logSupabaseError(stage, insertError)
        return paymentFailure('insert_attempt', 'We could not create your payment request. Please try again.')
      }
      return paymentFailure('paga_request', 'We could not create your payment request. Please try again.')
    }

    stage = 'save_attempt'
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
      if (saveError) logSupabaseError(stage, saveError)
      else {
        console.error('Payment request failed', { stage, reason: 'attempt_not_returned' })
      }
      return paymentFailure(stage, 'We could not save your payment request. Please try again.')
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
  } catch (error) {
    logStageError(stage, error)
    const message = stage === 'env'
      ? 'We could not start your payment. Please try again.'
      : stage === 'find_member'
        ? 'We could not load your payment details. Please try again.'
        : stage === 'ensure_charges' || stage === 'compute_amount'
          ? 'We could not calculate the amount due. Please try again.'
          : stage === 'save_attempt'
            ? 'We could not save your payment request. Please try again.'
            : 'We could not create your payment request. Please try again.'
    return paymentFailure(stage, message)
  }
}

export async function getAttemptState(payToken: string, attemptId: string): Promise<AttemptStateResult> {
  const parsedInput = attemptStateInputSchema.safeParse({ payToken, attemptId })
  if (!parsedInput.success) {
    return { ok: false, error: 'We could not check this payment request.' }
  }
  payToken = parsedInput.data.payToken
  attemptId = parsedInput.data.attemptId

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
