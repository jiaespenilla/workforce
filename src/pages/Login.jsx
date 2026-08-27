import { usePageTitle } from '../lib/documentMeta'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, getCeoEmail } from '../context/AuthContext'
import { getActiveSettings } from '../lib/systemSettings'
import { getSystemIcon } from '../lib/documentMeta'
import { getAllCompanies } from '../lib/companies'

export default function Login() {
  usePageTitle('Login Page')
  const navigate = useNavigate()
  const { login, loginAdmin, loginCeo, serverLogin } = useAuth()
  const [error, setError] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(() => sessionStorage.getItem('uw_session_expired') === '1')
  const settings = getActiveSettings()
  const activeCompanies = getAllCompanies().filter((c) => c.active !== false).length

  if (sessionExpired) sessionStorage.removeItem('uw_session_expired')

  const handleSubmit = async (e) => {
    e.preventDefault()
    const email = e.target.email.value.trim()
    const password = e.target.password.value
    if (!email || !password) return setError('Please enter your email and password.')
    setError(null)
    const identifier = email.trim().toLowerCase()

    // Cloud mode first — falls back to local demo accounts when no API is configured.
    let serverUser = null
    try {
      serverUser = await serverLogin(identifier, password)
    } catch (err) {
      return setError(err.message || 'Sign-in failed.')
    }
    if (serverUser) {
      navigate(serverUser.role === 'administrator' ? '/settings' : '/', { replace: true })
      return
    }

    if (identifier === 'admin_celestine') {
      const user = loginAdmin(email, password)
      if (!user) return setError('Invalid credentials. Please try again.')
      navigate('/settings', { replace: true })
      return
    }

    if (identifier === getCeoEmail()) {
      const user = loginCeo(identifier, password)
      if (!user) return setError('Invalid credentials. Please try again.')
      navigate('/', { replace: true })
      return
    }

    try {
      const user = login(identifier, password)
      navigate('/', { replace: true })
    } catch (err) {
      if (err.message === 'ACCOUNT_NOT_FOUND') {
        setError('No account found for this email. Register your company first.')
      } else if (err.message === 'COMPANY_INACTIVE') {
        setError('Your company is deactivated. Contact administrator.')
      } else if (err.message === 'EMPLOYEE_INACTIVE') {
        setError('Your account is deactivated. Contact administrator.')
      } else {
        setError('Invalid credentials. Please try again.')
      }
    }
  }

  const inputCls =
    'mt-1 w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10'

  return (
    <div className="flex min-h-screen bg-white">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between bg-gradient-to-br from-brand-800 via-brand-600 to-emerald-500 p-12 lg:flex">
        <div>
          <div className="flex items-center gap-2.5">
            {getSystemIcon() ? <img src={getSystemIcon()} alt="" className="h-10 w-10 rounded-xl bg-white object-contain p-1" /> : <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 font-bold text-sm text-white ring-1 ring-white/25">{(settings.name || 'U').charAt(0).toUpperCase()}</div>}
            <div className="leading-tight">
              <p className="text-base font-bold text-white">{settings.name}</p>
              <p className="text-xs text-emerald-100">by CelestSolutions</p>
            </div>
          </div>
          <span className="mt-8 inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-emerald-50 ring-1 ring-white/20">
            Workforce Management Platform
          </span>
        </div>

        <div>
          <h2 className="max-w-md text-3xl font-bold leading-snug text-white">
            One platform for your entire workforce.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-emerald-50">
            Time keeping, task management and payroll — unified in a single, secure workspace trusted by growing teams.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {[
            [String(activeCompanies), 'Active companies'],
            ['99.9%', 'Platform uptime'],
            ['24/7', 'Support coverage'],
          ].map(([v, l]) => (
            <div key={l} className="rounded-xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
              <p className="text-xl font-bold text-white">{v}</p>
              <p className="mt-0.5 text-xs text-emerald-100">{l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-gray-50 px-4 py-12 sm:bg-white">
        <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-xl sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
          <div className="mb-8 lg:hidden">
            {getSystemIcon() ? <img src={getSystemIcon()} alt="" className="mb-4 h-11 w-11 rounded-xl bg-white object-contain p-1 shadow" /> : <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 font-bold text-white">{(settings.name || 'U').charAt(0).toUpperCase()}</div>}
            <h1 className="text-xl font-bold text-gray-900">{settings.name}</h1>
            <p className="mt-1 text-sm text-gray-500">Sign in to your workspace</p>
          </div>

          <div className="mb-8">
            <h1 className="hidden text-2xl font-bold tracking-tight text-gray-900 lg:block">Welcome back</h1>
            <p className="mt-1.5 text-sm text-gray-500">Enter your credentials to access your account.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {sessionExpired && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                Your session has expired due to inactivity. Please sign in again.
              </p>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email or username:
              </label>
              <input id="email" type="text" required placeholder="you@company.com" autoComplete="username" className={inputCls} />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password:
              </label>
              <div className="relative mt-1">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className={`${inputCls} mt-0 pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 transition hover:text-gray-600"
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
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 ring-1 ring-red-100" role="alert">{error}</p>
            )}

            <button
              type="submit"
              className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-500/30"
            >
              Sign in
            </button>
          </form>

          <div className="my-7 flex items-center gap-3">
            <span className="h-px flex-1 bg-gray-200" />
            <span className="text-xs uppercase tracking-wide text-gray-400">or</span>
            <span className="h-px flex-1 bg-gray-200" />
          </div>

          <p className="text-center text-sm text-gray-500">
            Setting up a new organization?{' '}
            <a href="/register" className="font-semibold text-brand-600 hover:text-brand-700">
              Register your company
            </a>
          </p>

          <details className="mt-7 rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs">
            <summary className="cursor-pointer font-semibold text-gray-600">Account help</summary>
            <p className="mt-2 leading-relaxed text-gray-500">
              Administrator: <span className="font-medium text-gray-700">admin_celestine</span><br />
              Platform CEO: <span className="font-medium text-gray-700">{getCeoEmail()}</span><br />
              Company owners &amp; employees: sign in with your registered email — default password <span className="font-medium text-gray-700">P@ssw0rd2026!</span>
            </p>
          </details>

          <p className="mt-8 text-center text-xs text-gray-500">
            {settings.name} · <span className="font-semibold text-gray-700">CelestSolutions</span>
          </p>
        </div>
      </div>
    </div>
  )
}
