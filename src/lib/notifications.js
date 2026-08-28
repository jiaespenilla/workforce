export const ADMIN_RECIPIENT = 'jiaespenilla@gmail.com'

export function loadNotifications() {
  try {
    const stored = JSON.parse(localStorage.getItem('uw_notifications'))
    return Array.isArray(stored) ? stored.slice().reverse() : []
  } catch {
    return []
  }
}

// Cloud mode: fetch from D1 via Worker. Falls back to localStorage.
import { api, apiEnabled } from './api'

export async function fetchNotifications() {
  try {
    if (!apiEnabled()) return loadNotifications()
    const rows = await api('/api/notifications')
    const server = Array.isArray(rows) ? rows : []
    // Merge local welcome intros so first-login welcome persists in cloud mode
    // even for companies approved before this feature (server has no welcome yet).
    try {
      const local = JSON.parse(localStorage.getItem('uw_notifications') || '[]')
      const welcomeLocal = Array.isArray(local) ? local.filter((n) => n.status === 'welcome' || (n.subject && n.subject.startsWith('Welcome to'))) : []
      if (welcomeLocal.length) {
        const serverKeys = new Set(server.map((s) => `${(s.subject||'').toLowerCase()}|${(s.to||'').toLowerCase()}`))
        const extras = welcomeLocal.filter((l) => !serverKeys.has(`${(l.subject||'').toLowerCase()}|${(l.to||'').toLowerCase()}`))
        if (extras.length) return [...server, ...extras].slice().reverse()
      }
    } catch {}
    return server.slice().reverse()
  } catch {
    return loadNotifications()
  }
}

export async function clearNotificationsRemote() {
  try {
    if (!apiEnabled()) {
      clearNotifications()
      return
    }
    await api('/api/notifications', { method: 'DELETE' })
  } catch {
    clearNotifications()
  }
}

export function queueNotification({ to, subject, body }) {
  try {
    const notifications = JSON.parse(localStorage.getItem('uw_notifications')) || []
    notifications.push({
      id: `notif-${Date.now()}`,
      to,
      subject,
      body,
      createdAt: new Date().toISOString(),
      status: 'pending-smtp',
    })
    localStorage.setItem('uw_notifications', JSON.stringify(notifications))
  } catch {
    // storage unavailable
  }
}

export function clearNotifications() {
  localStorage.setItem('uw_notifications', '[]')
}

export function getNotificationsReadAt() {
  return Number(localStorage.getItem('uw_notifs_read_at')) || 0
}

export function markNotificationsRead() {
  localStorage.setItem('uw_notifs_read_at', String(Date.now()))
}
