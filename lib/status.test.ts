import { describe, expect, it } from 'vitest'
import { getMemberStatus } from './status'

describe('member status', () => {
  it('does not mark a member paid when there are no charges', () => {
    expect(getMemberStatus([], '2026-11-07')).toEqual({
      state: 'no_charges',
      label: 'No bills yet',
      nextDue: null,
      remaining: 0,
    })
  })
})
