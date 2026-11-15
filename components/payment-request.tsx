'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy } from 'lucide-react'
import { getAttemptState, startPayment, type StartPaymentResult } from '@/app/actions/payments'
import { money } from '@/lib/format'
import type { PaymentAttempt } from '@/lib/types'

type AttemptDetails = Extract<StartPaymentResult, { ok: true }>['attempt']
type AttemptStatus = PaymentAttempt['status']

function CopyValueButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setError('')
    } catch {
      setError(`We could not copy the ${label}.`)
    }
  }

  return <span className="payment-copy-control">
    <button className="button secondary" type="button" aria-label={`Copy ${label}`} onClick={copy}>
      <Copy size={15} />{copied ? 'Copied' : 'Copy'}
    </button>
    {error && <small role="alert">{error}</small>}
  </span>
}

function countdown(expiresAt: string, now: number) {
  const seconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  return hours > 0
    ? `${hours}h ${minutes}m`
    : `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`
}

export function PaymentRequest({ payToken, dueAmount, payEarly = false }: { payToken: string; dueAmount: number; payEarly?: boolean }) {
  const router = useRouter()
  const [attempt, setAttempt] = useState<AttemptDetails | null>(null)
  const [status, setStatus] = useState<AttemptStatus | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const refreshed = useRef(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!attempt || status !== 'open') return
    const attemptId = attempt.id
    let active = true
    let checking = false
    async function checkStatus() {
      if (checking) return
      checking = true
      try {
        const result = await getAttemptState(payToken, attemptId)
        if (!active) return
        if (!result.ok) {
          setError(result.error)
          setErrorCode(result.code ?? '')
          return
        }
        setError('')
        setErrorCode('')
        setStatus(result.status)
        if (result.status === 'paid' && !refreshed.current) {
          refreshed.current = true
          router.refresh()
        }
      } catch {
        if (active) {
          setError('We could not check the payment status. We will keep trying.')
          setErrorCode('')
        }
      } finally {
        checking = false
      }
    }
    void checkStatus()
    const timer = window.setInterval(() => void checkStatus(), 5000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [attempt, payToken, router, status])

  async function createRequest() {
    setStarting(true)
    setError('')
    setErrorCode('')
    try {
      const result = await startPayment(payToken, payEarly)
      if ('error' in result) {
        setError(result.error)
        setErrorCode(result.code)
        if (result.code === 'compute_amount' && result.error === 'There is nothing due right now.') router.refresh()
        return
      }
      setAttempt(result.attempt)
      setStatus('open')
      refreshed.current = false
    } catch {
      setError('We could not create your payment request. Please try again.')
      setErrorCode('')
    } finally {
      setStarting(false)
    }
  }

  if (status === 'paid') {
    return <div className="payment-request-card payment-request-state" role="status">
      <b>Payment confirmed</b>
      <span>Updating your payment details…</span>
    </div>
  }
  if (status === 'expired') {
    return <div className="payment-request-card payment-request-state">
      <b>This payment request has expired.</b>
      <button className="button primary" type="button" disabled={starting} onClick={createRequest}>
        {starting ? 'Creating request…' : 'Create a new payment request'}
      </button>
      {error && <p role="alert">{error}</p>}
      {errorCode && <small className="payment-error-code">{errorCode}</small>}
    </div>
  }
  if (status === 'failed') {
    return <div className="payment-request-card payment-request-state">
      <b>This payment request could not be completed.</b>
      <button className="button primary" type="button" disabled={starting} onClick={createRequest}>
        {starting ? 'Creating request…' : 'Create a new payment request'}
      </button>
      {error && <p role="alert">{error}</p>}
      {errorCode && <small className="payment-error-code">{errorCode}</small>}
    </div>
  }
  if (!attempt) {
    return <div className="payment-request-card payment-request-start">
      <div>
        <small>{payEarly ? 'Pay early by bank transfer' : 'Pay by bank transfer'}</small>
        <p>A temporary account will be created for the exact amount.</p>
      </div>
      <button className={`button ${payEarly ? 'secondary' : 'primary'}`} type="button" disabled={starting} onClick={createRequest}>
        {starting ? 'Creating request…' : payEarly ? 'Pay early' : `Pay ${money(dueAmount)}`}
      </button>
      {error && <p role="alert">{error}</p>}
      {errorCode && <small className="payment-error-code">{errorCode}</small>}
    </div>
  }

  const fee = Math.max(attempt.totalAmount - attempt.amount, 0)
  const amountText = attempt.totalAmount.toFixed(2)
  return <div className="payment-request-card">
    <div className="payment-request-heading">
      <small>Temporary bank transfer</small>
      <b>Send exactly {money(attempt.totalAmount)} to this account</b>
    </div>
    <div className="payment-account-line payment-account-number">
      <div><small>Account number</small><strong>{attempt.accountNumber}</strong></div>
      <CopyValueButton value={attempt.accountNumber} label="account number" />
    </div>
    <p className="payment-bank-hint"><b>Bank:</b> {attempt.bankName}. Choose Paga in your bank app’s bank list.</p>
    <div className="payment-request-details">
      <div className="payment-detail-row">
        <div><small>Exact amount to send</small><strong>{money(attempt.totalAmount)}</strong></div>
        <CopyValueButton value={amountText} label="exact amount" />
      </div>
      <p className="payment-fee-line">{money(attempt.amount)} dues + {money(fee)} payment fee</p>
      <div className="payment-detail-row payment-expiry-row"><span>Expires in</span><strong>{countdown(attempt.expiresAt, now)}</strong></div>
    </div>
    <p className="payment-waiting" role="status">Waiting for payment…</p>
    {error && <p className="payment-poll-error" role="alert">{error}</p>}
    {errorCode && <small className="payment-error-code">{errorCode}</small>}
  </div>
}
