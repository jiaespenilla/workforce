export const ADMIN_RECIPIENT = 'jiaespenilla@gmail.com'

export function loadNotifications() {
  try {
    const stored = JSON.parse(localStorage.getItem('uw_notifications'))
    return Array.isArray(stored) ? stored.slice().reverse() : []
  } catch {
    return []
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
