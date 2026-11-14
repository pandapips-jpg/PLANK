import type { GroupType } from '@/lib/types'

export const GROUP_LABELS: Record<GroupType, { people: string; tag: string; tagPlaceholder: string; payment: string }> = {
  Estate: { people: 'members', tag: 'Tag', tagPlaceholder: 'House 12', payment: 'dues' },
  Church: { people: 'members', tag: 'Tag', tagPlaceholder: 'Choir', payment: 'contributions' },
  Union: { people: 'members', tag: 'Tag', tagPlaceholder: 'Member no.', payment: 'dues' },
  'Age grade': { people: 'members', tag: 'Tag', tagPlaceholder: 'Member no.', payment: 'dues' },
  'Rent (property)': { people: 'tenants', tag: 'Tag', tagPlaceholder: 'Flat 3B', payment: 'rent' },
  Other: { people: 'members', tag: 'Tag', tagPlaceholder: 'Optional', payment: 'payments' },
}

export function groupLabels(type: GroupType) {
  return GROUP_LABELS[type] ?? GROUP_LABELS.Other
}
