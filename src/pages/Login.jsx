import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiEnabled } from '../lib/api'
import { fetchPublicSystemIcon, getSystemIcon, usePageTitle } from '../lib/documentMeta'
import { getActiveSettings } from '../lib/systemSettings'

const features = [
  {
    title: 'Reliable attendance',
    desc: 'Simple clocking for office and remote teams.',
    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    title: 'Clear team progress',
    desc: 'Keep people, tasks and schedules aligned.',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  },
  {
    title: 'Connected workforce',
    desc: 'One dependable place for daily operations.',
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
  const [brandIcon, setBrandIcon] = useState(getSystemIcon)

  useEffect(() => {
    let live = true
    fetchPublicSystemIcon().then((icon) => { if (live && icon) setBrandIcon(icon) })
    return () => { live = false }
  }, [])

  if (sessionExpired) sessionStorage.removeItem('uw_session_expired')

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return
    const email = event.target.email.value.trim()
    const password = event.target.password.value
    if (!email || !password) return setError('Please enter your email and password.')
    if (!apiEnabled()) return setError('The API is not configured. Set VITE_API_URL to continue.')
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

  const inputClass = 'w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3.5 pl-11 pr-4 text-base text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm'

  return (
    <main className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(440px,0.92fr)]">
      <section className="relative hidden min-h-screen overflow-hidden bg-slate-950 px-10 py-10 lg:flex lg:flex-col lg:justify-between xl:px-16 xl:py-14" aria-label="Platform overview">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-900/90 via-slate-950 to-slate-950" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-emerald-400/15 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-32 -top-24 h-96 w-96 rounded-full bg-brand-500/15 blur-3xl" aria-hidden="true" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          aria-hidden="true"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative flex items-center gap-3.5">
          {brandIcon
            ? <img src={brandIcon} alt="" className="h-11 w-11 rounded-xl bg-white object-contain p-1.5 shadow-lg shadow-black/20" />
            : <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-base font-bold text-white ring-1 ring-white/20">{brandLetter}</div>}
          <div className="leading-tight">
            <p className="text-lg font-bold tracking-tight text-white">{settings.name}</p>
            <p className="mt-0.5 text-xs font-medium text-emerald-200">Workforce management</p>
          </div>
        </div>

        <div className="relative max-w-2xl py-12">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
            One secure workspace
          </p>
          <h2 className="text-4xl font-bold leading-[1.08] tracking-tight text-white xl:text-5xl">
            Run every workday<br />with confidence.
          </h2>
          <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">
            Give your team a simpler way to manage attendance, schedules and daily work.
          </p>
          <ul className="mt-10 grid gap-3 xl:grid-cols-3">
            {features.map((feature) => (
              <li key={feature.title} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-300/10 ring-1 ring-emerald-200/15">
                  <svg className="h-5 w-5 text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d={feature.icon} />
                  </svg>
                </span>
                <span className="mt-4 block text-sm font-semibold text-white">{feature.title}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-300">{feature.desc}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center justify-between text-xs text-slate-400">
          <p>Built for focused teams</p>
          <p className="font-semibold tabular-nums text-slate-300">{settings.version || 'v0.1.0'}</p>
        </div>
      </section>

      <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:px-8 lg:px-10" aria-label="Sign in">
        <div className="pointer-events-none absolute -right-32 top-0 h-80 w-80 rounded-full bg-brand-100/60 blur-3xl lg:hidden" aria-hidden="true" />
        <div className="relative w-full max-w-md">
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            {brandIcon
              ? <img src={brandIcon} alt="" className="h-12 w-12 rounded-xl bg-white object-contain p-1.5 shadow-sm ring-1 ring-slate-200" />
              : <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 font-bold text-white shadow-sm">{brandLetter}</div>}
            <div className="leading-tight">
              <p className="text-lg font-bold tracking-tight text-slate-950">{settings.name}</p>
              <p className="mt-0.5 text-xs font-medium text-slate-500">Workforce management</p>
            </div>
          </div>

          <div className="rounded-3xl border border-white bg-white/95 p-6 shadow-[0_24px_70px_-25px_rgba(15,23,42,0.24)] ring-1 ring-slate-200/70 backdrop-blur sm:p-9">
            <p className="text-sm font-semibold text-brand-700">Welcome back</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Sign in to your account</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">Enter your account details to continue.</p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-5" aria-busy={submitting}>
              {sessionExpired && (
                <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 ring-1 ring-inset ring-amber-200" role="status">
                  Your session expired due to inactivity. Please sign in again.
                </p>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-slate-700">Email or username</label>
                <div className="relative mt-2">
                  <svg className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM5 21a7 7 0 0114 0" />
                  </svg>
                  <input
                    id="email"
                    type="text"
                    required
                    placeholder="Email or username"
                    autoComplete="username"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    disabled={submitting}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-slate-700">Password</label>
                <div className="relative mt-2">
                  <svg className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6-7V8a6 6 0 1112 0v2m-13 0h14a1 1 0 011 1v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9a1 1 0 011-1z" />
                  </svg>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    disabled={submitting}
                    className={`${inputClass} pr-16`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 min-h-10 -translate-y-1/2 rounded-lg px-2.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {error && (
                <p className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-200" role="alert">
                  <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-xl hover:shadow-brand-600/25 focus:outline-none focus:ring-4 focus:ring-brand-500/25 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-70"
              >
                {submitting && (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                )}
                {submitting ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <div className="mt-7 border-t border-slate-100 pt-6 text-center">
              <p className="text-sm text-slate-600">
                New organization?{' '}
                <Link to="/register" className="font-semibold text-brand-700 underline-offset-4 hover:text-brand-800 hover:underline">
                  Register your company
                </Link>
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">{settings.name} - CelestSolutions</p>
        </div>
      </section>
    </main>
  )
}
