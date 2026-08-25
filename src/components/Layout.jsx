import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getActiveSettings } from '../lib/systemSettings'
const nav = [
  { to: '/', label: 'Dashboard', icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
  { to: '/timekeeping', label: 'Time Keeping', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { to: '/tasks', label: 'Tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { to: '/payroll', label: 'Payroll', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
]

function Logo({ light = false }) {
  const settings = getActiveSettings()
  return (
    <div className="flex items-center gap-2.5">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg font-bold text-sm ${light ? 'bg-white/15 text-white ring-1 ring-white/25' : 'bg-brand-600 text-white'}`}>U</div>
      <div className="leading-tight">
        <p className={`text-sm font-semibold ${light ? 'text-white' : 'text-gray-900'}`}>{settings.name}</p>
        <p className={`text-[11px] ${light ? 'text-brand-200' : 'text-gray-400'}`}>Workforce Management Suite</p>
      </div>
    </div>
  )
}

export { Logo }

export default function Layout() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const settings = getActiveSettings()

  const links = (
    <>
      <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Main Menu</p>
      <nav className="space-y-1">
        {nav.map((item) => (
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

      {user?.role !== 'ceo' && (
        <>
          <p className="px-3 pb-2 pt-6 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Workforce</p>
          <nav className="space-y-1">
            <button
              onClick={() => navigate('/kiosk')}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Kiosk Mode
            </button>
          </nav>
        </>
      )}
    </>
  )

  const userBlock = (
    <div className="mt-auto border-t border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{user?.initials || 'U'}</div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium text-gray-900">{user?.name}</p>
          <p className="truncate text-xs text-gray-400">{user?.companyName ? `${user.roleLabel} · ${user.companyName}` : user?.roleLabel}</p>
        </div>
        <button onClick={() => { logout(); navigate('/login') }} title="Sign out" className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600">
          <svg className="h-4.5 w-4.5" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100/60">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-8">
        <div className="flex items-center gap-4">
          <button className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d={open ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
            </svg>
          </button>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-gray-900">{settings.name}</p>
            <p className="text-[11px] text-gray-400">{user?.companyName || 'Workforce Management Suite'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="relative rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100" aria-label="Notifications">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V5a2 2 0 10-4 0v.3A6 6 0 006 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white" />
          </button>
          <div className="mx-1 hidden h-8 w-px bg-gray-200 sm:block" />
          <div className="flex items-center gap-2.5">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-xs font-semibold text-gray-800">{user?.name}</p>
              <p className="text-[11px] text-gray-400">{user?.roleLabel}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{user?.initials || 'U'}</div>
          </div>
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-gray-200 bg-white lg:flex">
        <div className="flex h-16 items-center border-b border-gray-200 px-5">
          <Logo />
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto p-4">
          {links}
          {userBlock}
        </div>
        <div className="border-t border-gray-100 px-5 py-3">
          <p className="text-[11px] text-gray-300">{settings.name} · {settings.version}</p>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-30 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-gray-900/40" />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-16 items-center border-b border-gray-200 px-5"><Logo /></div>
            <div className="flex flex-1 flex-col overflow-y-auto p-4">{links}{userBlock}</div>
          </div>
        </div>
      )}

      <main className="min-w-0 lg:pl-64">
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
