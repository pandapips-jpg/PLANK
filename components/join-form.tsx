'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { joinGroupAction, type JoinActionState } from '@/app/actions/join'

function JoinButton() {
  const { pending } = useFormStatus()
  return <button className="button primary btn-block" disabled={pending}>{pending ? 'Joining...' : 'Join group'}</button>
}

export function JoinForm({ token }: { token: string }) {
  const [state, action] = useActionState<JoinActionState, FormData>(joinGroupAction, null)
  return <form className="join-form" action={action}>
    <input type="hidden" name="token" value={token} />
    <label>Your name<input name="name" required autoComplete="name" /></label>
    <label>Your WhatsApp number<input name="phone" required inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" /><small>We will send your updates here.</small></label>
    {state?.message && <p className="join-message" role="status">{state.message}</p>}
    <JoinButton />
  </form>
}
