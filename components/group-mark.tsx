type GroupMarkData = { name?: string | null; logo_url?: string | null }

export function GroupMark({ group, className = '' }: { group?: GroupMarkData | null; className?: string }) {
  const logoUrl = group?.logo_url
  const initial = (group?.name ?? '').trim().charAt(0).toUpperCase() || 'G'
  return logoUrl
    ? <img className={`group-mark ${className}`} src={logoUrl} alt="" />
    : <span className={`group-mark group-mark-fallback ${className}`} aria-hidden="true">{initial}</span>
}
