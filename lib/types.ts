export type GroupType = 'Estate' | 'Church' | 'Union' | 'Age grade' | 'Rent (property)' | 'Other'
export type PaymentFrequency = 'monthly' | 'quarterly' | 'yearly' | 'one_time'
export type DueMode = 'shared' | 'per_member'
export type DueRule = 'month_end' | 'fixed'
export type GroupVisibility = 'owner' | 'members' | 'public'
export type PaymentProviderName = 'paga' | 'demo'

export type Group = {
  id: string
  owner_id: string
  name: string
  slug: string
  type: GroupType
  amount: number
  frequency: PaymentFrequency
  due_rule: DueRule
  first_due_date: string | null
  due_day: number
  due_mode: DueMode
  visibility: GroupVisibility
  logo_url: string | null
  join_token: string
  join_open: boolean
  join_needs_approval: boolean
  created_at: string
}

export type Member = {
  id: string
  group_id: string
  name: string
  house: string
  phone: string
  phone_normalized: string | null
  pay_token: string
  amount: number | null
  first_due_date: string | null
  status: 'pending' | 'active' | 'removed'
  joined_via: 'link' | 'treasurer'
  joined_at: string | null
  created_at: string
}

export type Payment = {
  id: string
  group_id: string
  member_id: string
  amount: number
  provider_reference: string
  provider: PaymentProviderName
  provider_fee: number | null
  payer_name: string | null
  paid_at: string
}

export type WebhookEvent = {
  id: string
  received_at: string
  provider: 'paga'
  event_id: string
  event_type: string
  headers: Record<string, string>
  raw_body: string
  hash_ok: boolean | null
  outcome: string | null
}

export type PaymentAttempt = {
  id: string
  group_id: string
  member_id: string
  amount: number
  status: 'open' | 'paid' | 'failed' | 'expired'
  reference_number: string
  account_number: string | null
  bank_name: string | null
  total_amount: number | null
  expires_at: string | null
  created_at: string
}

export type Notification = {
  id: string
  group_id: string
  member_id: string
  kind: string
  title: string
  body: string
  read_at: string | null
  created_at: string
}

export type Charge = {
  member_id: string
  due_date: string
  amount: number
  paid_amount: number
}

export type Payout = {
  id: string
  group_id: string
  amount: number
  payee: string
  note: string
  paga_reference: string | null
  created_at: string
}

export type PublicLedger = {
  name: string
  type: string
  logo_url?: string | null
  entries: Array<{
    at: string
    direction: 'in' | 'out'
    amount: number
    note: string
  }>
}

export type LedgerForMember = PublicLedger

export type MemberPageData = {
  name: string
  group: string
  unit?: string | null
  group_slug?: string
  logo_url?: string | null
  amount: number
  frequency?: PaymentFrequency
  due_rule?: DueRule
  due_day?: number | null
  first_due_date?: string | null
  ledger_available?: boolean
  payments: Array<{
    amount: number
    paid_at: string
  }>
  charges?: Charge[]
  visibility?: GroupVisibility
}

export type JoinInfo = {
  name: string
  type: string
  logo_url: string | null
  amount: number
  frequency: PaymentFrequency
  due_rule: DueRule
  needs_approval: boolean
  due_day?: number | null
  first_due_date?: string | null
}

export type Database = {
  public: {
    Tables: {
      groups: {
        Row: Group
        Insert: Omit<Group, 'id' | 'created_at' | 'visibility' | 'logo_url' | 'due_rule' | 'join_token' | 'join_open' | 'join_needs_approval'> & {
          visibility?: string | null
          logo_url?: string | null
          due_rule?: DueRule
          join_open?: boolean
          join_needs_approval?: boolean
        }
        Update: Partial<Omit<Group, 'id' | 'created_at'>>
        Relationships: []
      }
      members: {
        Row: Member
        Insert: Omit<Member, 'id' | 'created_at' | 'pay_token' | 'amount' | 'first_due_date' | 'phone_normalized' | 'status' | 'joined_via' | 'joined_at'> & {
          pay_token?: string
          amount?: number | null
          first_due_date?: string | null
          phone_normalized?: string | null
          status?: Member['status']
          joined_via?: Member['joined_via']
          joined_at?: string | null
        }
        Update: Partial<Omit<Member, 'id' | 'created_at'>>
        Relationships: []
      }
      payments: {
        Row: Payment
        Insert: Omit<Payment, 'id' | 'provider_fee' | 'payer_name'> & {
          provider_fee?: number | null
          payer_name?: string | null
        }
        Update: Partial<Omit<Payment, 'id'>>
        Relationships: []
      }
      payment_attempts: {
        Row: PaymentAttempt
        Insert: Omit<PaymentAttempt, 'id' | 'created_at'> & {
          id?: string
          account_number?: string | null
          bank_name?: string | null
          total_amount?: number | null
          expires_at?: string | null
        }
        Update: Partial<Omit<PaymentAttempt, 'id'>>
        Relationships: []
      }
      notifications: {
        Row: Notification
        Insert: Omit<Notification, 'id' | 'created_at' | 'read_at'> & {
          id?: string
          created_at?: string
          read_at?: string | null
        }
        Update: Partial<Omit<Notification, 'id' | 'created_at'>>
        Relationships: []
      }
      charges: {
        Row: Charge
        Insert: Charge
        Update: Partial<Charge>
        Relationships: []
      }
      payouts: {
        Row: Payout
        Insert: Omit<Payout, 'id' | 'created_at' | 'paga_reference'> & {
          paga_reference?: string | null
        }
        Update: Partial<Omit<Payout, 'id' | 'created_at'>>
        Relationships: []
      }
      webhook_events: {
        Row: WebhookEvent
        Insert: Omit<WebhookEvent, 'id' | 'received_at' | 'hash_ok' | 'outcome'> & {
          hash_ok?: boolean | null
          outcome?: string | null
        }
        Update: Partial<Omit<WebhookEvent, 'id' | 'received_at'>>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      get_public_ledger: {
        Args: { p_slug: string }
        Returns: PublicLedger | null
      }
      get_member_page: {
        Args: { p_token: string }
        Returns: MemberPageData | null
      }
      get_ledger_for_member: {
        Args: { p_token: string }
        Returns: LedgerForMember | null
      }
      refresh_charges: {
        Args: { p_group: string }
        Returns: null
      }
      ensure_charges: {
        Args: { p_group: string }
        Returns: null
      }
      get_join_info: {
        Args: { p_token: string }
        Returns: JoinInfo | JoinInfo[] | null
      }
      join_group: {
        Args: { p_token: string; p_name: string; p_phone: string }
        Returns: { status: 'joined' | 'pending' | 'exists' | 'closed' | 'bad_name' | 'bad_phone' | 'busy'; pay_token: string | null; name: string | null }
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
