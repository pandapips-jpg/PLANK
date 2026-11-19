'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  const trackRef = useRef<HTMLDivElement>(null)
  const touchStart = useRef<number | null>(null)
  const resumeTimer = useRef<number | null>(null)
  const cards = [
    { label: 'Money in this month', value: money(stats.inThisMonth), note: stats.changePercent === null ? '' : `${stats.changePercent >= 0 ? '↑' : '↓'} ${Math.abs(stats.changePercent)}% from last month`, tone: 'blue' },
    { label: 'Paid up', value: `${stats.paidCount} of ${stats.memberCount}`, note: 'People paid up', tone: 'yellow' },
    { label: 'Overdue', value: `${stats.overdueCount} people`, note: `Remaining ${money(stats.overdueAmount)}`, tone: 'orange' },
    { label: 'Due soon', value: `${stats.dueSoonCount} people`, note: `Remaining ${money(stats.dueSoonAmount)}`, tone: 'cream' },
    { label: 'Money out this month', value: money(stats.outThisMonth), note: 'Recorded from the group account', tone: 'cream' },
    { label: 'Balance', value: money(stats.balance), note: 'Total money in the account', tone: 'ink' },
  ]
  const goTo = useCallback((nextIndex: number) => {
    const next = (nextIndex + cards.length) % cards.length
    setIndex(next)
    const track = trackRef.current
    if (track) {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      track.scrollTo({ left: next * track.clientWidth, behavior: reducedMotion ? 'auto' : 'smooth' })
    }
  }, [cards.length])

  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => goTo(index + 1), 5000)
    return () => window.clearInterval(timer)
  }, [goTo, index, paused])

  useEffect(() => () => {
    if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current)
  }, [])

  function handleTrackScroll() {
    const track = trackRef.current
    if (!track || track.clientWidth === 0) return
    setIndex(Math.round(track.scrollLeft / track.clientWidth) % cards.length)
  }

  function pauseAfterTouch() {
    if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current)
    resumeTimer.current = window.setTimeout(() => setPaused(false), 3200)
  }

  return <div
    className="stats-carousel"
    onMouseEnter={() => setPaused(true)}
    onMouseLeave={() => setPaused(false)}
    onFocus={() => setPaused(true)}
    onBlur={(event) => {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setPaused(false)
    }}
  >
    <div
      ref={trackRef}
      className="stats-carousel-track"
      onScroll={handleTrackScroll}
      onTouchStart={(event) => {
        touchStart.current = event.touches[0]?.clientX ?? null
        setPaused(true)
      }}
      onTouchEnd={(event) => {
        if (touchStart.current !== null) {
          const distance = event.changedTouches[0]?.clientX - touchStart.current
          if (distance !== undefined && Math.abs(distance) > 35) goTo(index + (distance < 0 ? 1 : -1))
        }
        touchStart.current = null
        pauseAfterTouch()
      }}
    >
      {cards.map((card, cardIndex) => <div className={`stat-carousel-card ${card.tone}`} key={card.label} aria-hidden={cardIndex !== index}>
        <span>{card.label}</span><strong>{card.value}</strong>{card.note && <small>{card.note}</small>}
      </div>)}
    </div>
    <button type="button" className="carousel-edge-zone left" aria-label="Previous card" onClick={() => goTo(index - 1)}><span className="carousel-arrow"><ArrowLeft size={18} /></span></button>
    <button type="button" className="carousel-edge-zone right" aria-label="Next card" onClick={() => goTo(index + 1)}><span className="carousel-arrow"><ArrowRight size={18} /></span></button>
    <div className="carousel-dots">{cards.map((card, dot) => <button type="button" key={card.label} aria-label={`Go to card ${dot + 1}`} className={dot === index ? 'active' : ''} onClick={() => { goTo(dot); setPaused(true); pauseAfterTouch() }} />)}</div>
  </div>
}
