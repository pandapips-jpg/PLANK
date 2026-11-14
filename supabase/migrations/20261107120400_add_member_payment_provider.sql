ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'paga';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'members_payment_provider_check'
      AND conrelid = 'public.members'::regclass
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_payment_provider_check
      CHECK (payment_provider IN ('paga', 'demo'));
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
