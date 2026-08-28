import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getSystemTimeZone } from '../lib/systemSettings'
import {
  loadNotifications,
  fetchNotifications,
  markNotificationsRead,
  clearNotifications,
  clearNotificationsRemote,
  getNotificationsReadAt,
  ADMIN_RECIPIENT,
} from '../lib/notifications'

// Bell shown to every signed-in user; notifications are filtered so each user
// only sees what is addressed to them (admins also see the registration
// recipient inbox).
export default function NotificationBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState(loadNotifications)
  const [readAt, setReadAt] = useState(getNotificationsReadAt)
  const ref = useRef(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const data = await fetchNotifications()
      if (!cancelled) setNotifications(data)
    }
    load()
    const t = setInterval(load, 5000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const visible = notifications.filter((n) => {
    const to = (n.to || '').toLowerCase()
    return to === (user?.email || '').toLowerCase() || (user?.role === 'administrator' && to === ADMIN_RECIPIENT.toLowerCase())
  })
  const unreadCount = visible.filter((n) => new Date(n.createdAt).getTime() > readAt).length

  const toggle = () => {
    if (!open) {
      markNotificationsRead()
      setReadAt(getNotificationsReadAt())
    }
    setOpen(!open)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
        className="relative rounded-lg p-2 text-gray-500 transition hover:bg-gray-100"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V5a2 2 0 10-4 0v.3A6 6 0 006 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-bold text-gray-900">Notifications</p>
            {visible.length > 0 && (
              <button
                onClick={async () => { await clearNotificationsRemote(); setNotifications([]) }}
                className="text-xs font-medium text-gray-400 hover:text-red-500"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {visible.length === 0 && (
              <p className="px-4 py-8 text-center text-xs text-gray-400">No notifications yet.</p>
            )}
            {visible.map((n) => {
              const unread = new Date(n.createdAt).getTime() > readAt
              const subject = (n.subject || '').toLowerCase()
              const isWelcome = subject.startsWith('welcome to')
              const isApproved = subject.includes('approved') || subject.includes('registration for')
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    if (isWelcome) {
                      // reopen welcome intro modal
                      window.dispatchEvent(new CustomEvent('uw:open-welcome'))
                      return
                    }
                    if (isApproved) {
                      // best practice: approved company → admin sees companies list, others see dashboard
                      navigate(user?.role === 'administrator' ? '/companies' : '/')
                      return
                    }
                    // default: tasks or people notifications go to relevant page
                    if (subject.includes('task')) navigate('/tasks')
                    else if (subject.includes('people') || subject.includes('team')) navigate('/people')
                    else navigate(user?.role === 'administrator' ? '/companies' : '/')
                  }}
                  className="block w-full border-b border-gray-50 px-4 py-3 text-left transition hover:bg-brand-50/60"
                >
                  <p className="flex items-start gap-2 text-xs font-semibold text-gray-900">
                    {unread && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                    {n.subject}
                  </p>
                  <p className="mt-1 line-clamp-2 whitespace-pre-line text-[11px] leading-relaxed text-gray-400">{n.body}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-gray-300">
                    {new Date(n.createdAt).toLocaleString([], { timeZone: getSystemTimeZone(), month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
