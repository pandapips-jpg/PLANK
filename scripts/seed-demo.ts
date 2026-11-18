import { createAdminClient } from '../lib/supabase/admin'
import { normalizeNgPhone } from '../lib/phone'

const GROUP_NAME = 'Aviation Estate Residents Association'
const GROUP_SLUG = 'aviation-estate-residents-association-demo'
const GROUP_AMOUNT = 50_000
const DUE_DAY = 5
const PAGE_SIZE = 1000

class SeedError extends Error {}

type SeedMember = {
  name: string
  house: string
  phone: string
  status: 'active' | 'pending'
  paidThroughOffset: number | null
}

const members: SeedMember[] = [
  { name: 'Amina Balogun', house: 'Block A, Flat 3', phone: '08000000001', status: 'active', paidThroughOffset: 0 },
  { name: 'Chinedu Okafor', house: 'Block A, Flat 5', phone: '08000000002', status: 'active', paidThroughOffset: 0 },
  { name: 'Ifeoma Nwosu', house: 'Block A, Flat 8', phone: '08000000003', status: 'active', paidThroughOffset: 0 },
  { name: 'Tunde Adebayo', house: 'Block B, Flat 2', phone: '08000000004', status: 'active', paidThroughOffset: 0 },
  { name: 'Zainab Bello', house: 'Block B, Flat 6', phone: '08000000005', status: 'active', paidThroughOffset: 0 },
  { name: 'Emeka Eze', house: 'Block B, Flat 9', phone: '08000000006', status: 'active', paidThroughOffset: 0 },
  { name: 'Funmi Adeyemi', house: 'Block C, Flat 1', phone: '08000000007', status: 'active', paidThroughOffset: 0 },
  { name: 'Seyi Ogundipe', house: 'Block C, Flat 4', phone: '08000000008', status: 'active', paidThroughOffset: 0 },
  { name: 'Nneka Obi', house: 'Block C, Flat 7', phone: '08000000009', status: 'active', paidThroughOffset: 0 },
  { name: 'Musa Ibrahim', house: 'Block D, Flat 2', phone: '08000000010', status: 'active', paidThroughOffset: 0 },
  { name: 'Kemi Lawal', house: 'Block D, Flat 5', phone: '08000000011', status: 'active', paidThroughOffset: -2 },
  { name: 'Chukwudi Umeh', house: 'Block D, Flat 8', phone: '08000000012', status: 'active', paidThroughOffset: -2 },
  { name: 'Bisi Ogunleye', house: 'Block E, Flat 1', phone: '08000000013', status: 'active', paidThroughOffset: -2 },
  { name: 'Femi Ojo', house: 'Block E, Flat 4', phone: '08000000014', status: 'active', paidThroughOffset: -2 },
  { name: 'Halima Yusuf', house: 'Block E, Flat 7', phone: '08000000015', status: 'active', paidThroughOffset: -3 },
  { name: 'Obinna Ibe', house: 'Block F, Flat 2', phone: '08000000016', status: 'active', paidThroughOffset: -3 },
  { name: 'Grace Bassey', house: 'Block F, Flat 5', phone: '08000000017', status: 'pending', paidThroughOffset: null },
  { name: 'Kunle Akintola', house: 'Block F, Flat 8', phone: '08000000018', status: 'pending', paidThroughOffset: null },
]

function assertNoError(error: { code?: string } | null, message: string) {
  if (error) {
    throw new SeedError(error.code ? `${message} (code ${error.code})` : message)
  }
}

function monthDate(offset: number, day: number) {
  const now = new Date()
  const date = new Date(now.getFullYear(), now.getMonth() + offset, day)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function monthLabel(offset: number) {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() + offset)
  return date.toLocaleDateString('en-NG', { month: 'long' })
}

function paymentDate(offset: number, memberIndex: number) {
  const now = new Date()
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 7 + memberIndex % 3, 10, 0, 0)
  return date.toISOString()
}

async function findExistingUserId(admin: ReturnType<typeof createAdminClient>, email: string) {
  let page = 1
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE })
    if (error) throw new SeedError('Could not look up existing authentication users.')
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email)
    if (user) return user.id
    if (data.users.length < PAGE_SIZE) return null
    page += 1
  }
}

async function removeExistingSeedGroup(
  admin: ReturnType<typeof createAdminClient>,
  ownerId: string,
) {
  const { data: group, error: groupError } = await admin.from('groups')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('slug', GROUP_SLUG)
    .maybeSingle()
  assertNoError(groupError, 'Could not check for the existing demo group.')
  if (!group) return

  const { data: existingMembers, error: memberError } = await admin.from('members')
    .select('id')
    .eq('group_id', group.id)
  assertNoError(memberError, 'Could not load existing demo members.')
  const memberIds = (existingMembers ?? []).map((member) => member.id)

  const { error: paymentsError } = await admin.from('payments').delete().eq('group_id', group.id)
  assertNoError(paymentsError, 'Could not clear existing demo payments.')
  const { error: attemptsError } = await admin.from('payment_attempts').delete().eq('group_id', group.id)
  assertNoError(attemptsError, 'Could not clear existing demo payment requests.')
  const { error: notificationsError } = await admin.from('notifications').delete().eq('group_id', group.id)
  assertNoError(notificationsError, 'Could not clear existing demo notifications.')
  const { error: payoutsError } = await admin.from('payouts').delete().eq('group_id', group.id)
  assertNoError(payoutsError, 'Could not clear existing demo payouts.')

  if (memberIds.length > 0) {
    const { error: chargesError } = await admin.from('charges').delete().in('member_id', memberIds)
    assertNoError(chargesError, 'Could not clear existing demo charges.')
  }
  const { error: membersError } = await admin.from('members').delete().eq('group_id', group.id)
  assertNoError(membersError, 'Could not clear existing demo members.')
  const { error: deleteGroupError } = await admin.from('groups').delete().eq('id', group.id)
  assertNoError(deleteGroupError, 'Could not remove the existing demo group.')
}

async function main() {
  const treasurerEmail = process.env.DEMO_TREASURER_EMAIL?.trim().toLowerCase()
  if (!treasurerEmail) {
    throw new SeedError('Set DEMO_TREASURER_EMAIL in .env.local to an existing treasurer account.')
  }

  const admin = createAdminClient()
  const ownerId = await findExistingUserId(admin, treasurerEmail)
  if (!ownerId) {
    throw new SeedError('No existing auth user was found for DEMO_TREASURER_EMAIL.')
  }

  await removeExistingSeedGroup(admin, ownerId)

  const { data: group, error: groupError } = await admin.from('groups').insert({
    owner_id: ownerId,
    name: GROUP_NAME,
    slug: GROUP_SLUG,
    type: 'Estate',
    amount: GROUP_AMOUNT,
    frequency: 'monthly',
    due_rule: 'fixed',
    due_day: DUE_DAY,
    due_mode: 'shared',
    first_due_date: monthDate(-3, 1),
    visibility: 'public',
    join_open: true,
    join_needs_approval: true,
  }).select('id, slug, join_token').single()
  assertNoError(groupError, 'Could not create the demo group.')
  if (!group) throw new SeedError('The database did not return the demo group.')

  const insertedMembers: Array<{ seed: SeedMember; id: string; payToken: string | null }> = []
  for (const seed of members) {
    const phoneNormalized = normalizeNgPhone(seed.phone)
    if (!phoneNormalized) throw new SeedError('A fake demo phone number failed validation.')

    if (seed.status === 'pending') {
      const { data, error } = await admin.rpc('join_group', {
        p_token: group.join_token,
        p_name: seed.name,
        p_phone: seed.phone,
      })
      assertNoError(error, 'Could not create a pending demo member.')
      const result = Array.isArray(data) ? data[0] : data
      if (!result || result.status !== 'pending') {
        throw new SeedError('The join RPC did not create a pending demo member.')
      }

      const { data: pendingMember, error: pendingMemberError } = await admin.from('members')
        .select('id')
        .eq('group_id', group.id)
        .eq('phone_normalized', phoneNormalized)
        .single()
      assertNoError(pendingMemberError, 'Could not load a pending demo member.')
      if (!pendingMember) throw new SeedError('The database did not return a pending demo member.')
      const { error: updatePendingError } = await admin.from('members')
        .update({ house: seed.house })
        .eq('id', pendingMember.id)
        .eq('group_id', group.id)
      assertNoError(updatePendingError, 'Could not add a house tag to a pending demo member.')
      insertedMembers.push({ seed, id: pendingMember.id, payToken: null })
      continue
    }

    const { data: member, error: memberError } = await admin.from('members').insert({
      group_id: group.id,
      name: seed.name,
      house: seed.house,
      phone: seed.phone,
      phone_normalized: phoneNormalized,
      amount: null,
      first_due_date: monthDate(-3, DUE_DAY),
      status: 'active',
      joined_via: 'treasurer',
      joined_at: new Date().toISOString(),
    }).select('id, pay_token').single()
    assertNoError(memberError, 'Could not create an active demo member.')
    if (!member) throw new SeedError('The database did not return an active demo member.')
    insertedMembers.push({ seed, id: member.id, payToken: member.pay_token })
  }

  const { error: ensureChargesError } = await admin.rpc('ensure_charges', { p_group: group.id })
  assertNoError(ensureChargesError, 'Could not create demo monthly charges.')

  const paymentOffsets = [-3, -2, -1, 0]
  for (const [index, insertedMember] of insertedMembers.entries()) {
    const { seed, id } = insertedMember
    if (seed.status !== 'active' || seed.paidThroughOffset === null) continue

    for (const offset of paymentOffsets) {
      if (offset > seed.paidThroughOffset) continue
      const { error: paymentError } = await admin.from('payments').insert({
        group_id: group.id,
        member_id: id,
        amount: GROUP_AMOUNT,
        provider_reference: `DEMO-SEED-${id}-${offset}`,
        provider: 'demo',
        provider_fee: 0,
        payer_name: seed.name,
        paid_at: paymentDate(offset, index),
      })
      assertNoError(paymentError, 'Could not create a demo payment.')
    }
  }

  const { error: refreshChargesError } = await admin.rpc('refresh_charges', { p_group: group.id })
  assertNoError(refreshChargesError, 'Could not refresh demo monthly charges.')

  const { error: payoutError } = await admin.from('payouts').insert([
    {
      group_id: group.id,
      amount: 285_000,
      payee: 'Musa & Sons Energy',
      note: 'Generator diesel for the estate',
    },
    {
      group_id: group.id,
      amount: 420_000,
      payee: 'Aviation Estate Security Team',
      note: `Security guards' salary for ${monthLabel(0)}`,
    },
    {
      group_id: group.id,
      amount: 165_000,
      payee: 'Flowline Borehole Services',
      note: 'Borehole pump repair and replacement',
    },
  ])
  assertNoError(payoutError, 'Could not create demo payouts.')

  const paidMembers = insertedMembers.filter((member) => member.seed.paidThroughOffset === 0)
  const pendingMembers = insertedMembers.filter((member) => member.seed.status === 'pending')
  const { error: notificationError } = await admin.from('notifications').insert([
    {
      group_id: group.id,
      member_id: paidMembers[0].id,
      kind: 'payment_received',
      title: 'Payment received',
      body: `${paidMembers[0].seed.name} paid the ${monthLabel(0)} contribution.`,
    },
    {
      group_id: group.id,
      member_id: paidMembers[1].id,
      kind: 'payment_received',
      title: 'Payment received',
      body: `${paidMembers[1].seed.name} paid the ${monthLabel(0)} contribution.`,
    },
    {
      group_id: group.id,
      member_id: pendingMembers[0].id,
      kind: 'member_request',
      title: 'New member request',
      body: `${pendingMembers[0].seed.name} requested to join the group.`,
    },
  ])
  assertNoError(notificationError, 'Could not create demo notifications.')

  const overdueMember = insertedMembers.find((member) => member.seed.paidThroughOffset === -2)
  if (!overdueMember?.payToken) throw new SeedError('No overdue demo member with a payment link was created.')

  console.log(`Demo group id: ${group.id}`)
  console.log(`Public ledger URL path: /g/${group.slug}`)
  console.log(`Overdue member payment page path: /pay/${overdueMember.payToken}`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof SeedError
    ? error.message
    : 'Demo seeding failed. Check the required environment configuration and database availability.')
  process.exitCode = 1
})
