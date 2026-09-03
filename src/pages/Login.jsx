import { usePageTitle } from '../lib/documentMeta'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiEnabled } from '../lib/api'
import { getActiveSettings } from '../lib/systemSettings'
import { fetchPublicSystemIcon, getSystemIcon } from '../lib/documentMeta'

const features = [
  {
    title: 'Time Keeping',
    desc: 'Kiosk clock-in with QR, PIN or fingerprint.',
    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    title: 'Tasks',
    desc: 'Assign, track and complete team work.',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  },
  {
    title: 'Payroll & People',
    desc: 'One record for every team member.',
    icon: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6 1.37a6 6 0 10-6-6 6 6 0 006 6z',
  },
]

export default function Login() {
  usePageTitle('Login')
  const navigate = useNavigate()
  const { serverLogin } = useAuth()
  const [error, setError] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [sessionExpired] = useState(() => sessionStorage.getItem('uw_session_expired') === '1')
  const settings = getActiveSettings()
  const brandLetter = (settings.name || 'C').charAt(0).toUpperCase()
  // Pull the admin-selected icon so the login brand matches the rest of the system.
  const [brandIcon, setBrandIcon] = useState(getSystemIcon)
  useEffect(() => {
    let live = true
    fetchPublicSystemIcon().then((icon) => { if (live && icon) setBrandIcon(icon) })
    return () => { live = false }
  }, [])

  if (sessionExpired) sessionStorage.removeItem('uw_session_expired')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    const email = e.target.email.value.trim()
    const password = e.target.password.value
    if (!email || !password) return setError('Please enter your email and password.')
    if (!apiEnabled()) {
      return setError('The API is not configured. Set VITE_API_URL to continue.')
    }
    setError(null)
    setSubmitting(true)
    try {
      const serverUser = await serverLogin(email.toLowerCase(), password)
      if (serverUser) {
        navigate(serverUser.role === 'administrator' ? '/settings' : '/', { replace: true })
        return
      }
      setError('Cannot reach the server. Check your connection and try again.')
    } catch (err) {
      setError(err.message || 'Sign-in failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls =
    'mt-1.5 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10'

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Brand panel — desktop only, one message + what the platform does */}
      <div className="relative hidden w-[44%] shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-800 via-brand-600 to-emerald-500 p-10 lg:flex xl:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-28 -left-20 h-80 w-80 rounded-full bg-black/10" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          {brandIcon
            ? <img src={brandIcon} alt="" className="h-10 w-10 rounded-xl bg-white object-contain p-1 shadow" />
            : <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-sm font-bold text-white ring-1 ring-white/25">{brandLetter}</div>}
          <div className="leading-tight">
            <p className="text-base font-bold text-white">{settings.name}</p>
            <p className="text-xs text-emerald-100">by CelestSolutions</p>
          </div>
        </div>

        <div className="relative">
          <h2 className="max-w-md text-3xl font-bold leading-tight text-white xl:text-4xl">
            Your workforce,<br />in one place.
          </h2>
          <ul className="mt-8 space-y-4">
            {features.map((f) => (
              <li key={f.title} className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/25">
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d={f.icon} />
                  </svg>
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">{f.title}</span>
                  <span className="block text-xs text-emerald-50">{f.desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs font-semibold tabular-nums text-emerald-100">{settings.version || 'v0.1.0'}</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            {brandIcon
              ? <img src={brandIcon} alt="" className="h-11 w-11 rounded-xl bg-white object-contain p-1 shadow ring-1 ring-gray-200" />
              : <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 font-bold text-white shadow">{brandLetter}</div>}
            <div className="leading-tight">
              <p className="text-base font-bold text-gray-900">{settings.name}</p>
              <p className="text-xs text-gray-500">Workforce Management Platform</p>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl sm:p-8">
            <h1 className="text-xl font-bold tracking-tight text-gray-900">Welcome back</h1>
            <p className="mt-1 text-sm text-gray-500">Sign in to continue to your workspace.</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {sessionExpired && (
                <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                  Your session expired due to inactivity. Please sign in again.
                </p>
              )}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email or username
                </label>
                <input
                  id="email"
                  type="text"
                  required
                  placeholder="you@company.com or admin username"
                  autoComplete="username"
                  disabled={submitting}
                  className={`${inputCls} disabled:opacity-60`}
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    disabled={submitting}
                    className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-4 pr-11 text-sm text-gray-900 placeholder-gray-400 transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 min-h-[36px] min-w-[36px] -translate-y-1/2 rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 ring-1 ring-red-200" role="alert">
                  <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting && (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                )}
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>

          <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 text-center shadow-sm">
            <p className="text-sm text-gray-600">
              New organization?{' '}
              <a href="/register" className="font-semibold text-brand-600 hover:text-brand-700">
                Register your company
              </a>
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-gray-400">
            {settings.name} · CelestSolutions
          </p>
        </div>
      </div>
    </div>
  )
}
