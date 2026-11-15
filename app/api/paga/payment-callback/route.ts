import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { EnvValidationError, getPagaHashKey } from '@/lib/env'
import {
  isProcessedCallbackOutcome,
  processPagaCallback,
  readCallbackRequestBody,
  redactCallbackAuditBody,
  type PagaCallbackStore,
} from '@/lib/paga/callback'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

function headersForAudit(request: Request) {
  const headers: Record<string, string> = {}
  request.headers.forEach((value, name) => {
    if (name === 'content-type' || name === 'user-agent') {
      headers[name] = value
    }
  })
  return headers
}

function createStore(): PagaCallbackStore {
  const admin = createAdminClient()
  return {
    async saveReceived(headers, rawBody) {
      const { data, error } = await admin.from('webhook_events').insert({
        provider: 'paga',
        event_id: `pending-${randomUUID()}`,
        event_type: 'unparsed',
        headers,
        raw_body: redactCallbackAuditBody(rawBody),
      }).select('id').single()
      if (error || !data) throw new Error('Could not save callback event.')
      return data.id
    },
    async claimNotification(eventRecordId, notificationId, eventType) {
      const { error } = await admin.from('webhook_events').update({
        event_id: notificationId,
        event_type: eventType,
      }).eq('id', eventRecordId)
      if (!error) {
        return { recordId: eventRecordId, duplicateRecordId: null, alreadyProcessed: false }
      }
      if (error.code !== '23505') throw new Error('Could not claim callback event.')
      const { data: existing, error: existingError } = await admin.from('webhook_events')
        .select('id, outcome')
        .eq('provider', 'paga')
        .eq('event_id', notificationId)
        .maybeSingle()
      if (existingError || !existing) throw new Error('Could not find duplicate callback event.')
      return {
        recordId: existing.id,
        duplicateRecordId: eventRecordId,
        alreadyProcessed: isProcessedCallbackOutcome(existing.outcome),
      }
    },
    async finish(eventRecordId, hashOk, outcome) {
      const { error } = await admin.from('webhook_events')
        .update({ hash_ok: hashOk, outcome })
        .eq('id', eventRecordId)
      if (error) throw new Error('Could not update callback event.')
    },
    async findAttempt(referenceNumber) {
      const { data, error } = await admin.from('payment_attempts')
        .select('*')
        .eq('reference_number', referenceNumber)
        .maybeSingle()
      if (error) throw new Error('Could not find payment request.')
      return data
    },
    async insertPayment(payment) {
      const { error } = await admin.from('payments').insert(payment)
      if (error?.code === '23505') return 'duplicate'
      if (error) throw new Error('Could not record payment.')
      return 'inserted'
    },
    async markAttemptPaid(attemptId) {
      const { error } = await admin.from('payment_attempts').update({ status: 'paid' }).eq('id', attemptId)
      if (error) throw new Error('Could not update payment request.')
    },
    async markAttemptExpired(attemptId) {
      const { error } = await admin.from('payment_attempts')
        .update({ status: 'expired' })
        .eq('id', attemptId)
        .eq('status', 'open')
      if (error) throw new Error('Could not expire payment request.')
    },
    async getMemberName(memberId) {
      const { data, error } = await admin.from('members').select('name').eq('id', memberId).single()
      if (error || !data) throw new Error('Could not load member.')
      return data.name
    },
    async insertNotification(input) {
      const { error } = await admin.from('notifications').insert(input)
      if (error) throw new Error('Could not create payment notification.')
    },
  }
}

export async function POST(request: Request) {
  let rawBody: string
  try {
    const body = await readCallbackRequestBody(request.body, request.headers.get('content-length'))
    if (body === null) return NextResponse.json({ status: 'ERROR' }, { status: 413 })
    rawBody = body
  } catch {
    return NextResponse.json({ status: 'ERROR' }, { status: 400 })
  }

  try {
    const headers = headersForAudit(request)
    const providedHash = request.headers.get('x-paga-hash') ?? request.headers.get('hash') ?? undefined
    const result = await processPagaCallback(
      rawBody,
      headers,
      () => getPagaHashKey(),
      createStore(),
      providedHash,
    )
    return NextResponse.json(
      { status: result.status === 200 ? 'SUCCESS' : 'ERROR' },
      { status: result.status },
    )
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error('Paga callback failed', { stage: 'env', problems: error.problems })
    }
    return NextResponse.json({ status: 'ERROR' }, { status: 500 })
  }
}
