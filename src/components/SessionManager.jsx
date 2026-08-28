import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getSessionTimeoutMinutes, syncSystemSettingsFromServer } from '../lib/systemSettings'

// Watches user activity and auto-signs-out after the configured idle minutes.
// A warning with countdown appears one minute before expiry.
export default function SessionManager() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const lastActivity = useRef(Date.now())
  const [, forceTick] = useState(0)
  const [warning, setWarning] = useState(false)

  useEffect(() => {
    const activity = () => { lastActivity.current = Date.now() }
    const events = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, activity, { passive: true }))
    return () => events.forEach((e) => window.removeEventListener(e, activity))
  }, [])

  useEffect(() => {
    if (!user) return undefined
    // sync idle timeout from server every 30s so non-admins get admin's change without reload
    const sync = setInterval(() => { syncSystemSettingsFromServer().catch(()=>{}) }, 30000)
    const t = setInterval(() => {
      const minutes = getSessionTimeoutMinutes()
      if (!minutes) {
        setWarning(false)
        return
      }
      const idleMs = Date.now() - lastActivity.current
      const limitMs = minutes * 60 * 1000
      if (idleMs >= limitMs) {
        sessionStorage.setItem('uw_session_expired', '1')
        logout()
        navigate('/login')
      } else if (idleMs >= limitMs - 60 * 1000) {
        setWarning(true)
        forceTick((n) => n + 1) // keep countdown live
      } else {
        setWarning(false)
      }
    }, 1000)
    return () => { clearInterval(t); clearInterval(sync) }
  }, [user, logout, navigate])

  if (!warning || !user) return null

  const minutes = getSessionTimeoutMinutes()
  const remainingSec = Math.max(0, Math.ceil(minutes * 60 - (Date.now() - lastActivity.current) / 1000))

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-80 rounded-xl border border-amber-200 bg-white p-4 shadow-xl" role="alert">
      <div className="flex items-start gap-3">
        <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="text-xs leading-relaxed text-gray-600">
          <p className="text-sm font-bold text-gray-900">Session expiring soon</p>
          <p className="mt-1">
            You will be signed out in{' '}
            <span className="font-bold tabular-nums text-red-600">
              {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, '0')}
            </span>{' '}
            due to inactivity. Move your mouse or press any key to stay signed in.
          </p>
        </div>
      </div>
      <button
        onClick={() => { lastActivity.current = Date.now(); setWarning(false) }}
        className="mt-3 w-full rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
      >
        Stay signed in
      </button>
    </div>
  )
}
