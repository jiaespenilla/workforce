import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '../components/Layout'
import { useAuth, getCeoEmail } from '../context/AuthContext'

export default function Login() {
  const navigate = useNavigate()
  const { login, loginAdmin, loginCeo } = useAuth()
  const [error, setError] = useState(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    const email = e.target.email.value.trim()
    const password = e.target.password.value
    if (!email || !password) return setError('Please enter your email and password.')
    setError(null)
    const identifier = email.trim().toLowerCase()

    if (identifier === 'admin_celestine') {
      const user = loginAdmin(email, password)
      if (!user) return setError('Invalid credentials. Please try again.')
      navigate('/settings', { replace: true })
      return
    }

    if (identifier === getCeoEmail()) {
      const user = loginCeo(identifier, password)
      if (!user) return setError('Invalid credentials. Please try again.')
      navigate('/companies', { replace: true })
      return
    }

    if (password.length < 4) return setError('Invalid credentials. Please try again.')
    const user = login(identifier)
    navigate(user.role === 'administrator' ? '/settings' : '/', { replace: true })
  }

  const inputCls =
    'mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10'

  return (
    <div className="flex min-h-screen bg-white">
      <div className="relative hidden w-1/2 flex-col justify-between bg-gradient-to-br from-brand-700 via-brand-600 to-emerald-600 p-12 lg:flex">
        <Logo light />
        <div>
          <h2 className="max-w-md text-3xl font-bold leading-snug text-white">
            One platform for your entire workforce.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-brand-100">
            Time keeping, task management and payroll — unified in a single, secure workspace trusted by growing teams.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-6">
          {[
            ['42+', 'Active employees'],
            ['99.9%', 'Platform uptime'],
            ['24/7', 'Support coverage'],
          ].map(([v, l]) => (
            <div key={l} className="rounded-xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
              <p className="text-xl font-bold text-white">{v}</p>
              <p className="mt-0.5 text-xs text-brand-100">{l}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 font-bold text-white">U</div>
            <h1 className="text-xl font-bold text-gray-900">Unified Workforce</h1>
            <p className="mt-1 text-sm text-gray-500">Sign in to your workspace</p>
          </div>

          <div className="hidden mb-8 lg:block">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Welcome back</h1>
            <p className="mt-1.5 text-sm text-gray-500">Enter your credentials to access your account.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email or username
              </label>
              <input id="email" type="text" required placeholder="you@company.com" autoComplete="username" className={inputCls} />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input id="password" type="password" required placeholder="Enter your password" autoComplete="current-password" className={inputCls} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-gray-600">
                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                Remember me
              </label>
              <a href="#" className="font-medium text-brand-600 hover:text-brand-700">
                Forgot password?
              </a>
            </div>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 ring-1 ring-red-100">{error}</p>
            )}
            <button
              type="submit"
              className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-500/20"
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

          <div className="mt-7 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold text-gray-600">Demo accounts</p>
            <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
              Administrator: <span className="font-medium text-gray-700">admin_celestine</span> — system configuration only<br />
              CEO: <span className="font-medium text-gray-700">{getCeoEmail()}</span> — company oversight<br />
              Employee: <span className="font-medium text-gray-700">alex@company.com</span> — full workforce suite &amp; kiosk
            </p>
          </div>

          <p className="mt-8 text-center text-xs text-gray-400">
            Protected by enterprise-grade security. By signing in you agree to our Terms of Service.
          </p>
        </div>
      </div>
    </div>
  )
}
