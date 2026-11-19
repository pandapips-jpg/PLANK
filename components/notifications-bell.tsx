'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, Check, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Notification } from '@/lib/types'

function relativeTime(value: string) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))
  if (elapsedMinutes < 1) return 'Just now'
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours}h ago`
  const elapsedDays = Math.floor(elapsedHours / 24)
  if (elapsedDays < 7) return `${elapsedDays}d ago`
  return new Date(value).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
}

export function NotificationsBell({ groupId }: { groupId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [desktopPosition, setDesktopPosition] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const loadNotifications = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [listResult, countResult] = await Promise.all([
      supabase.from('notifications')
        .select('id, group_id, member_id, kind, title, body, read_at, created_at')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .is('read_at', null),
    ])
    if (listResult.error || countResult.error) {
      setError('We could not load notifications. Please try again.')
    } else {
      setNotifications(listResult.data ?? [])
      setUnreadCount(countResult.count ?? 0)
      setError('')
    }
    setLoading(false)
  }, [groupId])

  useEffect(() => {
    void loadNotifications()
    const timer = window.setInterval(() => void loadNotifications(), 30_000)
    return () => window.clearInterval(timer)
  }, [loadNotifications])

  useLayoutEffect(() => {
    if (!open) {
      setDesktopPosition(null)
      return
    }

    function placePanel() {
      if (window.innerWidth < 768) {
        setDesktopPosition(null)
        return
      }
      const trigger = triggerRef.current
      const panel = panelRef.current
      if (!trigger || !panel) return

      const triggerBounds = trigger.getBoundingClientRect()
      const panelBounds = panel.getBoundingClientRect()
      const left = Math.min(
        Math.max(16, triggerBounds.right - panelBounds.width),
        window.innerWidth - panelBounds.width - 16,
      )
      const below = triggerBounds.bottom + 8
      const top = below + panelBounds.height <= window.innerHeight - 16
        ? below
        : Math.max(16, triggerBounds.top - panelBounds.height - 8)
      setDesktopPosition({ top, left })
    }

    placePanel()
    window.addEventListener('resize', placePanel)
    window.addEventListener('scroll', placePanel, true)
    return () => {
      window.removeEventListener('resize', placePanel)
      window.removeEventListener('scroll', placePanel, true)
    }
  }, [open, notifications.length, loading])

  async function markAllRead() {
    const { error: updateError } = await createClient().from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('group_id', groupId)
      .is('read_at', null)
    if (updateError) {
      setError('We could not mark notifications as read. Please try again.')
      return
    }
    setNotifications((current) => current.map((notification) => ({
      ...notification,
      read_at: notification.read_at ?? new Date().toISOString(),
    })))
    setUnreadCount(0)
    setError('')
  }

  async function markRead(id: string) {
    const { error: updateError } = await createClient().from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('group_id', groupId)
      .eq('id', id)
      .is('read_at', null)
    if (updateError) {
      setError('We could not mark this notification as read.')
      return
    }
    if (notifications.some((notification) => notification.id === id && notification.read_at === null)) {
      setUnreadCount((count) => Math.max(0, count - 1))
    }
    setNotifications((current) => current.map((notification) =>
      notification.id === id ? { ...notification, read_at: new Date().toISOString() } : notification,
    ))
  }

  const control = <div className="notifications-control">
    <button
      ref={triggerRef}
      type="button"
      className="icon-button notifications-trigger"
      aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      aria-expanded={open}
      onClick={() => {
        setOpen((value) => !value)
        if (!open) void loadNotifications()
      }}
    >
      <Bell size={18} />
      {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </button>
    {open && <>
      <button type="button" className="notifications-backdrop" aria-label="Close notifications" onClick={() => setOpen(false)} />
      <div
        ref={panelRef}
        className="notifications-panel"
        data-positioned={desktopPosition ? 'true' : 'false'}
        style={desktopPosition ?? undefined}
        role="dialog"
        aria-label="Notifications"
      >
        <div className="notifications-panel-head">
          <b>Notifications</b>
          <div>
            <button type="button" className="notifications-mark-read" disabled={unreadCount === 0} onClick={markAllRead}><Check size={14} />Mark all as read</button>
            <button type="button" className="icon-button" aria-label="Close notifications" onClick={() => setOpen(false)}><X size={15} /></button>
          </div>
        </div>
        {error && <p className="notifications-error" role="alert">{error}</p>}
        {loading && notifications.length === 0
          ? <p className="notifications-empty">Loading notifications…</p>
          : notifications.length === 0
            ? <p className="notifications-empty">No notifications yet.</p>
            : <div className="notifications-list">{notifications.map((notification) => <Link
                href={`/app/groups/${groupId}/members#member-${notification.member_id}`}
                className={`notification-item ${notification.read_at === null ? 'unread' : ''}`}
                key={notification.id}
                onClick={() => {
                  void markRead(notification.id)
                  setOpen(false)
                }}
              >
                <span className="notification-unread-dot" aria-hidden="true" />
                <span className="notification-copy">
                  <b>{notification.title}</b>
                  <span>{notification.body}</span>
                  <small>{relativeTime(notification.created_at)}</small>
                </span>
              </Link>)}</div>}
      </div>
    </>}
  </div>

  return control
}
