'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { money } from '@/lib/format'
import { GroupMark } from '@/components/group-mark'
import type { Group } from '@/lib/types'

export function Logo({ href = '/app' }: { href?: string }) {
  return <Link href={href} className="brand"><img className="brand-image" src="/plank-poster.jpeg" alt="Plank smiling plank logo" /><span>plank</span></Link>
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  group,
}: {
  eyebrow: string
  title: string
  description?: string
  action?: React.ReactNode
  group?: Pick<Group, 'name' | 'logo_url'>
}) {
  return <div className="page-header"><div className="page-title-wrap">{group && <GroupMark group={group} className="page-group-mark" />}<div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="description">{description}</p>}</div></div>{action}</div>
}

export function Badge({ paid }: { paid: boolean }) {
  return <span className={`badge ${paid ? 'paid' : 'owing'}`}><span className="badge-dot" />{paid ? 'Paid' : 'Owing'}</span>
}

export function StatusBadge({ state }: { state: 'paid' | 'due_soon' | 'overdue' | 'part_paid' | 'no_charges' }) {
  const labels = { paid: 'Paid', due_soon: 'Due soon', overdue: 'Overdue', part_paid: 'Part paid', no_charges: 'No bills yet' }
  return <span className={`badge ${state}`}><span className="badge-dot" />{labels[state]}</span>
}

export type Stats = {
  inThisMonth: number
  paidCount: number
  memberCount: number
  overdueCount: number
  overdueAmount: number
  dueSoonCount: number
  dueSoonAmount: number
  outThisMonth: number
  balance: number
  changePercent: number | null
}

export function StatsCarousel({ stats }: { stats: Stats }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const touchStart = useRef<number | null>(null)
  const cards = [
    { label: 'Money in this month', value: money(stats.inThisMonth), note: stats.changePercent === null ? '' : `${stats.changePercent >= 0 ? '↑' : '↓'} ${Math.abs(stats.changePercent)}% from last month`, tone: 'blue' },
    { label: 'Paid up', value: `${stats.paidCount} of ${stats.memberCount}`, note: 'People paid up', tone: 'yellow' },
    { label: 'Overdue', value: `${stats.overdueCount} people`, note: `Remaining ${money(stats.overdueAmount)}`, tone: 'orange' },
    { label: 'Due soon', value: `${stats.dueSoonCount} people`, note: `Remaining ${money(stats.dueSoonAmount)}`, tone: 'cream' },
    { label: 'Money out this month', value: money(stats.outThisMonth), note: 'Recorded from the group account', tone: 'cream' },
    { label: 'Balance', value: money(stats.balance), note: 'Total money in the account', tone: 'ink' },
  ]
  const move = (direction: number) => setIndex((current) => (current + direction + cards.length) % cards.length)

  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => move(1), 5000)
    return () => window.clearInterval(timer)
  }, [paused])

  return <div className="stats-carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; setPaused(true) }} onTouchEnd={(event) => { if (touchStart.current !== null) { const distance = event.changedTouches[0]?.clientX - touchStart.current; if (distance !== undefined && Math.abs(distance) > 35) move(distance < 0 ? 1 : -1) } touchStart.current = null; window.setTimeout(() => setPaused(false), 3200) }}>
    <button className="carousel-arrow left" aria-label="Previous card" onClick={() => move(-1)}><ArrowLeft size={18} /></button>
    <div className={`stat-carousel-card ${cards[index].tone}`}><span>{cards[index].label}</span><strong>{cards[index].value}</strong>{cards[index].note && <small>{cards[index].note}</small>}</div>
    <button className="carousel-arrow right" aria-label="Next card" onClick={() => move(1)}><ArrowRight size={18} /></button>
    <div className="carousel-dots">{cards.map((card, dot) => <button type="button" key={card.label} aria-label={`Go to card ${dot + 1}`} className={dot === index ? 'active' : ''} onClick={() => { setIndex(dot); setPaused(true); window.setTimeout(() => setPaused(false), 3200) }} />)}</div>
  </div>
}
