import type { GroupType } from '@/lib/types'

export const GROUP_LABELS: Record<GroupType, { people: string; unit: string; payment: string }> = {
  Estate: { people: 'members', unit: 'House', payment: 'dues' },
  Church: { people: 'members', unit: 'Member no.', payment: 'contributions' },
  Union: { people: 'members', unit: 'Member no.', payment: 'dues' },
  'Age grade': { people: 'members', unit: 'Member no.', payment: 'dues' },
  'Rent (property)': { people: 'tenants', unit: 'Flat or unit', payment: 'rent' },
  Other: { people: 'members', unit: 'Ref', payment: 'payments' },
}

export function groupLabels(type: GroupType) {
  return GROUP_LABELS[type] ?? GROUP_LABELS.Other
}
