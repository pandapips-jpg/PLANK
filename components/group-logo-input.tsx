'use client'

import { useEffect, useState } from 'react'
import { GroupMark } from '@/components/group-mark'
import type { Group } from '@/lib/types'

const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])

export function GroupLogoInput({
  group,
  file,
  onChange,
}: {
  group: Pick<Group, 'name' | 'logo_url'>
  file: File | null
  onChange: (file: File | null, error: string) => void
}) {
  const [preview, setPreview] = useState('')

  useEffect(() => {
    if (!file) {
      setPreview('')
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  return <div className="logo-input">
    {preview
      ? <img className="group-mark logo-input-preview" src={preview} alt="Selected group logo preview" />
      : <GroupMark group={group} className="logo-input-preview" />}
    <label>Group logo (optional)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
      const selected = event.target.files?.[0] ?? null
      if (!selected) return onChange(null, '')
      if (!allowedTypes.has(selected.type)) {
        event.currentTarget.value = ''
        return onChange(null, 'Choose a PNG, JPG or WebP image.')
      }
      if (selected.size > 1024 * 1024) {
        event.currentTarget.value = ''
        return onChange(null, 'Choose an image smaller than 1 MB.')
      }
      onChange(selected, '')
    }} /><small>PNG, JPG or WebP. Max 1 MB.</small></label>
  </div>
}
