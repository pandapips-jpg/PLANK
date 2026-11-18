# Plank

## Paga Collect payments

Configure these values in the server environment and local `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAGA_PUBLIC_KEY`
- `PAGA_SECRET_KEY`
- `PAGA_HASH_KEY`
- `PAGA_BASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` (the public base URL for this Plank deployment)
- `PAGA_REQUEST_EXPIRY_MINUTES` (optional; defaults to `360`)
- `DEMO_MODE` (optional server-only flag; defaults to `false`)
- `DEMO_USE_PAGA` (optional; defaults to `false`, and is used only when `DEMO_MODE=true`)

Keep the Paga keys and Supabase service-role key server-only; never prefix them with `NEXT_PUBLIC_` or commit their values. Configure Paga to send Collect payment callbacks to `${NEXT_PUBLIC_APP_URL}/api/paga/payment-callback`.

Members request a temporary, amount-specific bank transfer account from their payment page. Plank reuses an open request when it has more than ten minutes left, and lets the member request another account after expiry. In normal mode, payment completion is recorded only from the verified Paga callback; the database trigger applies the payment to the member's oldest open charges.

Set `DEMO_MODE=true` to enable the payment-page simulation button. By default, demo mode never calls Paga and always creates demo bank details that expire in 30 minutes. Set `DEMO_USE_PAGA=true` only if you explicitly want demo mode to try Paga before falling back to demo details. Simulated payments are marked as demo and do not move real money. Set `DEMO_MODE=false` (or omit it) to use the normal payment flow.

## Local testing

Paga cannot call back to localhost, so a payment made locally is never marked paid. Test the full payment flow on the deployed site or through a tunnel.

## Security behavior

Payment, join, and public-ledger pages send `no-store`, `no-referrer`, and `noindex` headers. Other responses include baseline security headers and a report-only CSP. The CSP is not enforced; review browser reports and move to a nonce-based policy before enforcing it.

Paga callback bodies are limited to 32 KiB. Webhook audit records keep only non-sensitive callback fields; phone numbers, payer names, and hashes are excluded.

Run the integration unit tests with `pnpm test`.
