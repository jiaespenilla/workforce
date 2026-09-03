import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getActiveSettings } from '../lib/systemSettings'
import { api, apiEnabled } from '../lib/api'

function initialsOf(name) {
  return (name || '').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?'
}

const welcomeKey = (email) => `uw_welcome_seen_${String(email || '').trim().toLowerCase()}`
function isWelcomeSeen(email) {
  try { return !!localStorage.getItem(welcomeKey(email)) } catch { return false }
}
function markWelcomeSeen(email) {
  try { localStorage.setItem(welcomeKey(email), '1') } catch {}
}
function unwrapCompanies(res) {
  return Array.isArray(res) ? res : (res?.data || [])
}

export default function WelcomeIntro() {
  const { user } = useAuth()
  const [company, setCompany] = useState(null)
  const [open, setOpen] = useState(false)
  const settings = getActiveSettings()
  const email = user?.email || ''

  useEffect(() => {
    if (!user || user.role === 'administrator' || !email) return
    // Manual reopen via notification click — always allowed, even after first login.
    const reopen = () => setOpen(true)
    window.addEventListener('uw:open-welcome', reopen)

    // Fetch company for the welcome card (both first-time and reopen paths).
    if (apiEnabled()) {
      api('/api/companies').then((res) => {
        const cs = unwrapCompanies(res)
        const c = cs.find((co) => (co.employees || []).some((e) => String(e.email || '').toLowerCase() === email.toLowerCase())) || cs[0] || null
        if (c) setCompany(c)
      }).catch(() => {})
    }

    // Already seen → never auto-open again (fixes repeat pop-up on mobile revisits).
    if (isWelcomeSeen(email)) {
      return () => window.removeEventListener('uw:open-welcome', reopen)
    }

    // First login only: mark seen IMMEDIATELY on show (not on dismiss), so a
    // refresh/close without clicking "Get started" still won't reshow it.
    let cancelled = false
    const t = setTimeout(() => {
      if (cancelled) return
      markWelcomeSeen(email)
      setOpen(true)
    }, 800)
    return () => { cancelled = true; clearTimeout(t); window.removeEventListener('uw:open-welcome', reopen) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, user?.role])

  if (!open || !user || user.role === 'administrator') return null

  const dismiss = () => {
    markWelcomeSeen(user.email)
    // Persist welcome intro to notifications so user can revisit via bell
    try {
      const subject = `Welcome to ${company?.name || 'your company'} — You're all set!`
      const already = JSON.parse(localStorage.getItem('uw_notifications') || '[]').some((n) => n.subject === subject && (n.to || '').toLowerCase() === user.email.toLowerCase())
      if (!already) {
        const body = `Welcome to ${company?.name || user.companyName || 'your company'}!\n\nYour company is now active on ${settings.name}.\n\nQuick start:\n• View your Dashboard for an overview\n• Manage teammates in People\n• Set up Shift Schedules for your team\n• Clock in/out via the Time Kiosk (QR / PIN / fingerprint)\n\nTip: Find this introduction again in Notifications.`
        const list = JSON.parse(localStorage.getItem('uw_notifications') || '[]')
        list.push({ id: `welcome-${Date.now()}`, to: user.email.toLowerCase(), subject, body, createdAt: new Date().toISOString(), status: 'welcome' })
        localStorage.setItem('uw_notifications', JSON.stringify(list))
      }
    } catch {}
    setOpen(false)
  }

  const logoSrc = company?.logoName?.startsWith?.('data:image/') ? company.logoName : null
  const companyName = company?.name || user.companyName || 'your company'
  const steps = [
    { title: 'Explore your Dashboard', desc: 'Track active teammates and tasks at a glance.', icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
    { title: 'Manage People', desc: 'Add teammates, assign roles and locations.', icon: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6 1.37a6 6 0 10-6-6 6 6 0 006 6z' },
    { title: 'Set Shift Schedules', desc: 'Define shifts and assign them to your team.', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { title: 'Try the Time Kiosk', desc: 'Clock in/out with QR, PIN or fingerprint.', icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z' },
  ]

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={dismiss}>
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="h-1.5 w-full bg-gradient-to-r from-brand-600 to-emerald-400" />
        <div className="px-6 pt-6">
          <div className="flex items-start gap-4">
            {logoSrc ? <img src={logoSrc} alt="" className="h-12 w-12 rounded-xl object-cover ring-1 ring-gray-200 bg-white" /> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white">{initialsOf(companyName)}</div>}
            <div>
              <h2 className="text-xl font-bold text-gray-900">Welcome to {companyName}!</h2>
              <p className="mt-1 text-xs text-gray-500">{settings.name} · {company?.industry || 'Workforce Management'} {company?.city ? `· ${company.city}` : ''}</p>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-brand-50 px-4 py-3 ring-1 ring-brand-100">
            <p className="text-sm font-semibold text-brand-800">You're all set, {user.name?.split(' ')[0] || 'there'}!</p>
            <p className="mt-1 text-xs leading-relaxed text-brand-700">Your company is now active on {settings.name}. Here are a few things to get you started. You can revisit this introduction anytime from your notifications.</p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {steps.map((s) => (
              <div key={s.title} className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-gray-200 text-brand-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7"><path strokeLinecap="round" strokeLinejoin="round" d={s.icon} /></svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-900">{s.title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-gray-400">Tip: Your progress is saved — this welcome appears only on your first sign-in. Find it again in the bell icon (Notifications) if you close it.</p>
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button onClick={dismiss} className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-brand-700">Get started</button>
        </div>
      </div>
    </div>
  )
}
