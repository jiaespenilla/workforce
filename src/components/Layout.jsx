import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getActiveSettings, isMaintenanceMode } from '../lib/systemSettings'
import { getSystemIcon } from '../lib/documentMeta'
import NotificationBell from './NotificationBell'
import DefaultPasswordBanner from './DefaultPasswordBanner'
import Avatar from './Avatar'
import SignOutButton from './SignOutButton'
import HelpModal from './HelpModal'

const nav = [
  { to: '/', label: 'Dashboard', key: 'dashboard', icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
  { to: '/timekeeping', label: 'Time Keeping', key: 'timekeeping', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { to: '/tasks', label: 'Tasks', key: 'tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { to: '/payroll', label: 'Payroll', key: 'payroll', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  { to: '/shifts', label: 'Shift Schedules', key: 'shifts', ceoOnly: true, icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { to: '/people', label: 'People', key: 'employees', ceoOnly: true, icon: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z' },
]

const settingsNav = [
  { to: '/storage-setup', label: 'Storage Setup', key: 'storage', icon: 'M3 7v10a2 2 0 002 2h1l3 3h8l3-3h1a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2z' },
]

function Logo({ light = false }) {
  const settings = getActiveSettings()
  // Logo letter = first letter of the configured system name.
  const brandLetter = (settings.name || 'U').charAt(0).toUpperCase()
  const icon = getSystemIcon()
  return (
    <div className="flex items-center gap-2.5">
      {icon ? (
        <img src={icon} alt="" className={`h-8 w-8 rounded-lg object-contain ${light ? 'bg-white/90 p-0.5' : 'bg-white ring-1 ring-gray-200'}`} />
      ) : (
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg font-bold text-sm ${light ? 'bg-white/15 text-white ring-1 ring-white/25' : 'bg-brand-600 text-white'}`}>{brandLetter}</div>
      )}
      <div className="leading-tight">
        <p className={`text-sm font-semibold ${light ? 'text-white' : 'text-gray-900'}`}>{settings.name}</p>
        <p className={`text-[11px] ${light ? 'text-emerald-100' : 'text-gray-500'}`}>Workforce Management Suite</p>
      </div>
    </div>
  )
}

export { Logo }

export default function Layout({ children }) {
  const [open, setOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [maintenance, setMaintenance] = useState(isMaintenanceMode())
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const settings = getActiveSettings()
  const brandLetter = (settings.name || 'U').charAt(0).toUpperCase()

  useEffect(() => {
    const t = setInterval(() => setMaintenance(isMaintenanceMode()), 5000)
    return () => clearInterval(t)
  }, [])

  const links = (
    <>
      {(() => {
        // Page-level access: each nav item is gated by the user's role permissions.
        if (!user) return null
        const allowed = nav.filter((item) => {
          // "Add Employee" is a CEO-only module.
          if (item.ceoOnly && user.role !== 'ceo') return false
          return user.perms?.[item.key] !== false
        })
        if (allowed.length === 0) {
          return (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-800">
              Your role (<span className="font-semibold">{user.roleLabel}</span>) does not include access to any pages. Contact your system administrator.
            </div>
          )
        }
        return (
          <>
            <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Main Menu</p>
                        <nav className="space-y-1">
              {allowed.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setOpen(false)}
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
            </nav>

            {/* Settings section — gated by the role's per-page permissions */}
            {settingsNav.filter((item) => user.perms?.[item.key] !== false).length > 0 && (
            <>
            <p className="px-3 pb-2 pt-6 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Settings</p>
            <nav className="space-y-1">
              {settingsNav.filter((item) => user.perms?.[item.key] !== false).map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setOpen(false)}
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
            </nav>
            </>
            )}
          </>
        )
      })()}

      <p className="px-3 pb-2 pt-6 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Account</p>
      <nav className="space-y-1">
        <NavLink
          to="/profile"
          onClick={() => setOpen(false)}
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
        {user?.role === 'employee' && user?.perms?.kiosk !== false && (
          <NavLink
            to="/kiosk-credentials"
            onClick={() => setOpen(false)}
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
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a3 3 0 01-3 3H8m6 0a3 3 0 00-3-3H8m0 0a3 3 0 100 6m9-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Kiosk Credentials
              </>
            )}
          </NavLink>
        )}
      </nav>
    </>
  )

  const signOut = () => {
    sessionStorage.removeItem('uw_pwd_banner_dismissed')
    logout()
    navigate('/login')
  }

  const sidebarFooter = (
    <div className="space-y-1 border-t border-gray-200 p-4">
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
  )

  return (
    <div className="min-h-screen bg-gray-100/60">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-8">
        <div className="flex items-center gap-3">
          <button className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d={open ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
            </svg>
          </button>
          {getSystemIcon() ? <img src={getSystemIcon()} alt="" className="h-8 w-8 rounded-lg bg-white object-contain p-0.5 ring-1 ring-gray-200" /> : <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-sm text-white">{brandLetter}</div>}
          <div className="leading-tight">
            <p className="text-sm font-semibold text-gray-900">{settings.name}</p>
            <p className="text-[11px] text-gray-500">{user?.companyName || 'Workforce Management Suite'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {maintenance && (
            <span className="hidden rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-200 md:inline">
              Maintenance mode active
            </span>
          )}
          <NotificationBell />
          <button onClick={() => navigate('/profile')} className="flex items-center gap-2.5 rounded-full p-0.5 pr-2 transition hover:bg-gray-100">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-xs font-semibold text-gray-800">{user?.name}</p>
              <p className="text-[11px] text-gray-500">{user?.roleLabel}</p>
            </div>
            <Avatar user={user} size="h-9 w-9 text-xs" />
          </button>
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-gray-200 bg-white lg:flex">
        <div className="flex h-16 items-center border-b border-gray-200 px-5">
          <Logo />
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto p-4">
          {links}
        </div>
        {sidebarFooter}
      </aside>

      {open && (
        <div className="fixed inset-0 z-30 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-gray-900/40" />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-16 items-center border-b border-gray-200 px-5"><Logo /></div>
            <div className="flex flex-1 flex-col overflow-y-auto p-4">{links}</div>
            {sidebarFooter}
          </div>
        </div>
      )}

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      <main className="min-w-0 lg:pl-64">
        <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6 lg:p-8">
          <DefaultPasswordBanner />
          {children ?? <Outlet />}
        </div>
      </main>
    </div>
  )
}
