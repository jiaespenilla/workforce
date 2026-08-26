import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getAllEmployees } from '../lib/companies'
import { getActiveSettings } from '../lib/systemSettings'
import { getSystemIcon } from '../lib/documentMeta'
import { loadKioskConfig } from './KioskSetup'

export default function Kiosk() {
  const { user } = useAuth()
  const settings = getActiveSettings()
  const config = loadKioskConfig()
  const [now, setNow] = useState(new Date())
  const employees = getAllEmployees().filter((e) => e.active !== false)
  const [employeeId, setEmployeeId] = useState(null)
  const employee = employees.find((e) => String(e.email) === String(employeeId)) || employees[0]
  const [message, setMessage] = useState(null)

  // Auth stage: 'awaiting' (per configured method) -> 'punch' (select name + check in/out)
  const [stage, setStage] = useState('auth')
  const [pin, setPin] = useState('')
  const idleTimer = useRef(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Reset to the auth screen after the configured idle timeout.
  const resetIdleTimer = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => {
      setStage('auth')
      setPin('')
      setEmployeeId(null)
      setMessage(null)
    }, Math.max(config.idleTimeout, 10) * 1000)
  }

  useEffect(() => {
    resetIdleTimer()
    const events = ['click', 'keydown', 'touchstart']
    events.forEach((e) => window.addEventListener(e, resetIdleTimer, { passive: true }))
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
      events.forEach((e) => window.removeEventListener(e, resetIdleTimer))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (user?.perms?.kiosk === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-b from-brand-600 to-emerald-500 p-6 text-white">
        <p className="text-lg font-semibold">Kiosk access is not enabled for your role.</p>
        <Link to="/" className="rounded-full bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25">Back</Link>
      </div>
    )
  }

  if (employees.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-b from-brand-600 to-emerald-500 p-6 text-white">
        <p className="text-lg font-semibold">No active employees found.</p>
        <Link to="/" className="rounded-full bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25">Exit kiosk</Link>
      </div>
    )
  }

  const punch = (type) => {
    if (!employee) return
    // Persist the punch so dashboards can show who is currently clocked in.
    try {
      const punches = JSON.parse(localStorage.getItem('uw_punches')) || []
      punches.push({
        email: employee.email,
        name: employee.name,
        company: employee.companyName,
        type, // 'in' | 'out'
        time: new Date().toISOString(),
      })
      localStorage.setItem('uw_punches', JSON.stringify(punches))
    } catch {
      // storage unavailable
    }
    setMessage({
      type,
      text: `${type === 'in' ? 'Checked in' : 'Checked out'} at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Have a great ${type === 'in' ? 'shift' : 'day'}, ${employee.name.split(' ')[0]}!`,
    })
    setTimeout(() => setMessage(null), 5000)
  }

  const brandLetter = (settings.name || 'U').charAt(0).toUpperCase()

  const submitPin = () => {
    if (pin.length !== config.pinLength) return
    setPin('')
    setStage('punch')
  }

  /* --- Authentication stage, driven by the admin's Kiosk Setup --- */
  if (stage === 'auth') {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-b from-brand-600 to-emerald-500 p-6 text-white">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white font-bold text-brand-600">{brandLetter}</div>
            <span className="text-lg font-semibold">{settings.name}</span>
          </div>
          <Link to="/" className="rounded-full bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25">Exit kiosk</Link>
        </header>

        <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 py-8">
          {config.method === 'fingerprint' && (
            <>
              <button
                type="button"
                onClick={() => setStage('punch')}
                aria-label="Touch fingerprint sensor to sign in"
                className="flex h-36 w-36 items-center justify-center rounded-full bg-white/15 ring-2 ring-white/40 transition active:scale-95 hover:bg-white/25"
              >
                <svg className="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0 3.5-1 5.5-2 7m4-9a9 9 0 00-.5 8m2-10.5c1.6 2 2.3 4.6 1.8 7.2M7.5 6.5A9 9 0 0112 5a9 9 0 015.5 1.9M5 9.5A9 9 0 016.2 8" />
                </svg>
              </button>
              <p className="text-base font-medium text-emerald-50">Touch the sensor to sign in</p>
              {config.pinFallback && (
                <button type="button" onClick={() => setStage('pin')} className="text-sm font-medium text-emerald-100 underline hover:text-white">
                  Use PIN instead
                </button>
              )}
            </>
          )}

          {(config.method === 'pin' || stage === 'pin') && (
            <>
              <p className="text-base font-medium text-emerald-50">Enter your {config.pinLength}-digit PIN</p>
              <div className="flex gap-3">
                {Array.from({ length: config.pinLength }).map((_, i) => (
                  <span key={i} className={`flex h-4 w-4 rounded-full ${i < pin.length ? 'bg-white' : 'bg-white/30 ring-1 ring-white/50'}`} />
                ))}
              </div>
              <div className="grid w-64 grid-cols-3 gap-2">
                {['1','2','3','4','5','6','7','8','9','C','0','OK'].map((k) => (
                  <button
                    key={i_key(k)}
                    type="button"
                    onClick={() => {
                      if (k === 'C') setPin('')
                      else if (k === 'OK') submitPin()
                      else if (pin.length < config.pinLength) setPin(pin + k)
                    }}
                    className={`rounded-xl py-3.5 text-lg font-bold transition active:scale-95 ${
                      k === 'OK' ? 'bg-white text-brand-700 hover:bg-emerald-50'
                      : k === 'C' ? 'bg-gray-900/30 text-white hover:bg-gray-900/40'
                      : 'bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              {config.method === 'fingerprint' && (
                <button type="button" onClick={() => setStage('auth')} className="text-sm text-emerald-100 underline hover:text-white">
                  Back to fingerprint
                </button>
              )}
            </>
          )}

          {config.method === 'qr' && (
            <>
              <div className="rounded-2xl bg-white p-4 shadow-xl">
                <svg viewBox="0 0 21 21" className="h-40 w-40 fill-gray-900">
                  <path d="M0 0h7v7H0zM2 2v3h3V2zM14 0h7v7h-7zM16 2v3h3V2zM0 14h7v7H0zM2 16v3h3v-3zM10 0h2v2h-2zM10 4h2v2h-2zM4 10h2v2H4zM8 8h2v2H8zM12 10h2v2h-2zM10 14h2v2h-2zM14 14h2v2h-2zM18 14h2v2h-2zM16 10h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/>
                </svg>
              </div>
              <p className="text-base font-medium text-emerald-50">Scan your employee QR badge</p>
              <button
                type="button"
                onClick={() => setStage('punch')}
                className="rounded-xl bg-white px-6 py-2.5 text-sm font-bold text-brand-700 shadow-lg transition hover:bg-emerald-50"
              >
                Simulate scan
              </button>
            </>
          )}
        </main>

        <footer className="text-center text-xs text-emerald-100">
          {config.site ? `Station: ${config.site}` : ''} · Idle timeout: {config.idleTimeout}s
        </footer>
      </div>
    )
  }

  /* --- Punch stage: select employee and check in / out --- */
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-brand-600 to-emerald-500 p-6 text-white">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white font-bold text-brand-600">{brandLetter}</div>
          <span className="text-lg font-semibold">{settings.name}</span>
        </div>
        <Link to="/" className="rounded-full bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25">Exit kiosk</Link>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 py-8">
        <div className="text-center">
          <p className="text-6xl font-bold tabular-nums sm:text-7xl">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
          <p className="mt-2 text-lg text-emerald-100">
            {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        <div className="w-full">
          <label htmlFor="kiosk-employee" className="mb-1 block text-center text-sm font-medium text-emerald-100">Select your name:</label>
          <select
            id="kiosk-employee"
            value={employee?.email || ''}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full rounded-xl border-0 bg-white px-4 py-4 text-base font-medium text-gray-900 focus:outline-none focus:ring-4 focus:ring-white/40"
          >
            {employees.map((e) => <option key={e.email} value={e.email}>{e.name} — {e.companyName}</option>)}
          </select>
        </div>

        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            onClick={() => punch('in')}
            className="flex flex-col items-center gap-3 rounded-3xl bg-white py-10 text-brand-700 shadow-xl transition active:scale-95 hover:bg-brand-50"
          >
            <svg className="h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            <span className="text-xl font-bold">CHECK IN</span>
          </button>
          <button
            onClick={() => punch('out')}
            className="flex flex-col items-center gap-3 rounded-3xl bg-gray-900/20 py-10 text-white ring-2 ring-white/60 shadow-xl transition active:scale-95 hover:bg-gray-900/30"
          >
            <svg className="h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="text-xl font-bold">CHECK OUT</span>
          </button>
        </div>

        {message && (
          <div className={`w-full rounded-2xl px-5 py-4 text-center text-base font-semibold shadow-lg ${message.type === 'in' ? 'bg-white text-brand-700' : 'bg-gray-900 text-white'}`}>
            {message.text}
          </div>
        )}

        <div className="flex items-center gap-4 text-center text-sm text-emerald-100">
          <button type="button" onClick={() => { setStage('auth'); setPin('') }} className="underline hover:text-white">
            Switch user
          </button>
          {config.requireReAuth && <span>· Re-authentication required after checkout</span>}
        </div>
      </main>
    </div>
  )
}

function i_key(k) {
  return `${k}`
}
