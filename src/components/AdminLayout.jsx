import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getActiveSettings, isMaintenanceMode } from '../lib/systemSettings'
import { getSystemIcon } from '../lib/documentMeta'
import NotificationBell from './NotificationBell'
import DefaultPasswordBanner from './DefaultPasswordBanner'
import Avatar from './Avatar'
import SignOutButton from './SignOutButton'
import HelpModal from './HelpModal'

const ADMIN_NAV = [
  { to: '/companies', label: 'Companies', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { to: '/settings', label: 'System Configuration', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { to: '/kiosk-setup', label: 'Kiosk Setup', icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z' },
]

export default function AdminLayout({ children }) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [maintenance, setMaintenance] = useState(isMaintenanceMode())
  const [helpOpen, setHelpOpen] = useState(false)
  const settings = getActiveSettings()
  const nav = ADMIN_NAV

  useEffect(() => {
    const t = setInterval(() => setMaintenance(isMaintenanceMode()), 5000)
    return () => clearInterval(t)
  }, [])

  // Logo letter = first letter of the configured system name.
  const brandLetter = (settings.name || 'U').charAt(0).toUpperCase()

  const signOut = () => {
    logout()
    navigate('/login')
  }

  const navLinks = (onNavigate) => (
    <nav className="space-y-1 p-4">
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <svg className={`h-5 w-5 ${isActive ? 'text-brand-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              {item.label}
            </>
          )}
        </NavLink>
      ))}
      <NavLink
        to="/profile"
        onClick={onNavigate}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            isActive
              ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <svg className={`h-5 w-5 ${isActive ? 'text-brand-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            My Profile
          </>
        )}
      </NavLink>
    </nav>
  )

  return (
    <div className="min-h-screen bg-gray-100/60">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
            className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 lg:hidden"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d={menuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
            </svg>
          </button>
          {getSystemIcon() ? <img src={getSystemIcon()} alt="" className="h-8 w-8 rounded-lg bg-white object-contain p-0.5 ring-1 ring-gray-200" /> : <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-sm text-white">{brandLetter}</div>}
          <div className="leading-tight">
            <p className="text-sm font-semibold text-gray-900">{settings.name}</p>
            <p className="text-[11px] text-gray-500">System Administration</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {maintenance && (
            <span className="hidden rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-200 md:inline">
              Maintenance mode active
            </span>
          )}
          <NotificationBell />
          <span className="mr-1 hidden rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200 sm:inline">
            Administrator
          </span>
          <button type="button" onClick={() => navigate('/profile')} title="My profile" className="flex items-center gap-2.5 rounded-full p-0.5 pr-2 transition hover:bg-gray-100">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-xs font-semibold text-gray-800">{user?.name}</p>
              <p className="text-[11px] text-gray-500">{user?.email}</p>
            </div>
            <Avatar user={user} size="h-9 w-9 text-xs" />
          </button>
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-gray-200 bg-white lg:flex">
        <div className="flex h-16 items-center border-b border-gray-200 px-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Administration Console</p>
        </div>
        {navLinks()}
        <div className="mt-auto space-y-1 border-t border-gray-200 p-4">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
          >
            <svg className="h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Help &amp; Guide
          </button>
          <SignOutButton onConfirm={signOut} />
          <div className="mt-3 border-t border-gray-100 px-3 pt-3 text-[11px] text-gray-400">
            <p><span className="font-semibold text-gray-500">{settings.name} {settings.version}</span> · <span className="font-semibold">CelestSolutions</span></p>
          </div>
        </div>
      </aside>

      {/* Mobile navigation drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-30 lg:hidden" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-gray-900/40" />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-16 items-center border-b border-gray-200 px-5">
              {getSystemIcon() ? <img src={getSystemIcon()} alt="" className="h-8 w-8 rounded-lg bg-white object-contain p-0.5 ring-1 ring-gray-200" /> : <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-sm text-white">{brandLetter}</div>}
              <div className="ml-2.5 leading-tight">
                <p className="text-sm font-semibold text-gray-900">{settings.name}</p>
                <p className="text-[11px] text-gray-400">System Administration</p>
              </div>
            </div>
            <div className="flex flex-1 flex-col overflow-y-auto">
              {navLinks(() => setMenuOpen(false))}
              <div className="mt-auto space-y-1 p-4">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); setHelpOpen(true) }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
                >
                  <svg className="h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Help &amp; Guide
                </button>
                <SignOutButton onConfirm={signOut} />
                <div className="mt-3 space-y-0.5 border-t border-gray-100 px-3 pt-3 text-[11px] leading-relaxed text-gray-400">
                  <p className="font-semibold text-gray-500">{settings.name}</p>
                  <p>{settings.version}</p>
                  <p>by <span className="font-semibold">CelestSolutions</span></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      <main className="min-w-0 lg:pl-64">
        <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6 lg:p-8">
          <DefaultPasswordBanner />
          {children ?? <Outlet />}
        </div>
      </main>
    </div>
  )
}
