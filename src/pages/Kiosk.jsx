import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getActiveSettings } from '../lib/systemSettings'
import { getSystemIcon } from '../lib/documentMeta'
import { loadKioskConfig } from './KioskSetup'

// Makes the kiosk installable as a stand-alone app on phones/tablets.
function useKioskPwa(systemName, brandLetter) {
  useLayoutEffect(() => {
    const icon = getSystemIcon()
    const manifest = {
      name: `${systemName} — Time Kiosk`,
      short_name: 'Time Kiosk',
      start_url: '/kiosk',
      scope: '/kiosk',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#047857',
      theme_color: '#047857',
      icons: [
        ...(icon ? [{ src: icon, sizes: '512x512', type: 'image/png', purpose: 'any' }] : []),
        {
          src:
            'data:image/svg+xml,' +
            encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#047857"/><text x="256" y="340" font-family="Arial,sans-serif" font-size="280" font-weight="bold" fill="#ffffff" text-anchor="middle">${brandLetter}</text></svg>`
            ),
          sizes: 'any',
          type: 'image/svg+xml',
          purpose: 'any',
        },
      ],
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }))
    const link = document.createElement('link')
    link.rel = 'manifest'
    link.href = url
    document.head.appendChild(link)

    const metas = [
      ['theme-color', '#047857'],
      ['apple-mobile-web-app-capable', 'yes'],
      ['apple-mobile-web-app-status-bar-style', 'black-translucent'],
      ['apple-mobile-web-app-title', 'Time Kiosk'],
    ].map(([name, content]) => {
      const m = document.createElement('meta')
      m.name = name
      m.content = content
      document.head.appendChild(m)
      return m
    })

    return () => {
      link.remove()
      metas.forEach((m) => m.remove())
      URL.revokeObjectURL(url)
    }
  }, [systemName, brandLetter])
}

function QrGlyph({ className }) {
  return (
    <svg viewBox="0 0 21 21" className={className} fill="currentColor">
      <path d="M0 0h7v7H0zM2 2v3h3V2zM14 0h7v7h-7zM16 2v3h3V2zM0 14h7v7H0zM2 16v3h3v-3zM10 0h2v2h-2zM10 4h2v2h-2zM4 10h2v2H4zM8 8h2v2H8zM12 10h2v2h-2zM10 14h2v2h-2zM14 14h2v2h-2zM18 14h2v2h-2zM16 10h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" />
    </svg>
  )
}

function FingerprintGlyph({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0 3.5-1 5.5-2 7m4-9a9 9 0 00-.5 8m2-10.5c1.6 2 2.3 4.6 1.8 7.2M7.5 6.5A9 9 0 0112 5a9 9 0 015.5 1.9M5 9.5A9 9 0 016.2 8" />
    </svg>
  )
}

export default function Kiosk() {
  const settings = getActiveSettings()
  const config = loadKioskConfig()
  const systemName = settings.name
  const brandLetter = (systemName || 'U').charAt(0).toUpperCase()
  const brandIcon = getSystemIcon()

  const [now, setNow] = useState(new Date())
  // identified = the employee matched via credential
  const [identified, setIdentified] = useState(null)
  const [authError, setAuthError] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [pin, setPin] = useState('')
  const [pinMode, setPinMode] = useState(false)
  const [message, setMessage] = useState(null)
  const idleTimer = useRef(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Reset to the authentication screen after the configured idle timeout.
  useEffect(() => {
    const resetIdle = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => {
        setIdentified(null)
        setPin('')
        setPinMode(false)
        setMessage(null)
        setAuthError(null)
      }, Math.max(config.idleTimeout, 10) * 1000)
    }
    resetIdle()
    const events = ['click', 'keydown', 'touchstart']
    events.forEach((e) => window.addEventListener(e, resetIdle, { passive: true }))
    return () => {
      clearTimeout(idleTimer.current)
      events.forEach((e) => window.removeEventListener(e, resetIdle))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useKioskPwa(systemName, brandLetter)

  /* Identify the employee from a registered credential.
     Cloud mode asks the API; local mode matches against uw_credentials and
     the locally registered fingerprint tokens. */
  const identify = async (method, value) => {
    setAuthError(null)
    setScanning(true)
    try {
      let match = null
      if (import.meta.env.VITE_API_URL) {
        try {
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/kiosk/identify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method, value }),
          })
          if (res.ok) match = await res.json()
        } catch {
          match = null
        }
      }
      if (!match) {
        // Local fallback — match against locally registered credentials
        let credMap = {}
        try { credMap = JSON.parse(localStorage.getItem('uw_credentials')) || {} } catch { credMap = {} }
        const { getAllEmployees } = await import('../lib/companies')
        const all = getAllEmployees()
        for (const [email, c] of Object.entries(credMap)) {
          const emp = all.find((e) => e.email === email)
          if (!emp) continue
          if (method === 'fingerprint' && c.fpToken && c.fpToken === value) match = { email, name: emp.name, company: emp.companyName }
          if (method === 'pin' && c.pin && c.pin === value) match = { email, name: emp.name, company: emp.companyName }
          if (method === 'qr' && c.qrCode && c.qrCode === value) match = { email, name: emp.name, company: emp.companyName }
          if (match) break
        }
        // Simulated sensor: exactly one registered fingerprint identifies the person.
        if (!match && method === 'fingerprint' && value === 'SIM_FP') {
          const fpEntries = Object.entries(credMap).filter(([, c]) => c.fpToken)
          if (fpEntries.length === 1) {
            const [email, c] = fpEntries[0]
            const emp = all.find((e) => e.email === email)
            if (emp) match = { email, name: emp.name, company: emp.companyName }
          }
        }
      }
      if (!match) {
        setAuthError(`Credential not recognized. Register it in Kiosk Setup first.`)
        return false
      }
      setIdentified(match)
      return true
    } finally {
      setScanning(false)
    }
  }

  const punch = (type) => {
    if (!identified) return
    try {
      const punches = JSON.parse(localStorage.getItem('uw_punches')) || []
      punches.push({
        email: identified.email,
        name: identified.name,
        company: identified.company,
        type,
        time: new Date().toISOString(),
      })
      localStorage.setItem('uw_punches', JSON.stringify(punches))
    } catch {
      // storage unavailable
    }
    setMessage({
      type,
      text: `${type === 'in' ? 'Checked in' : 'Checked out'} at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Have a great ${type === 'in' ? 'shift' : 'day'}, ${identified.name.split(' ')[0]}!`,
    })
    setTimeout(() => setMessage(null), 5000)
  }


  const header = (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {brandIcon ? (
          <img src={brandIcon} alt="" className="h-12 w-12 rounded-2xl bg-white object-contain p-1 shadow-lg" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-xl font-black text-brand-600 shadow-lg">{brandLetter}</div>
        )}
        <div className="leading-tight">
          <span className="block text-lg font-bold">{systemName}</span>
          <span className="block text-[11px] font-medium text-emerald-100">Time Kiosk{config.site ? ` · ${config.site}` : ''}</span>
        </div>
      </div>
      <Link to="/" className="rounded-full bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25">Exit kiosk</Link>
    </header>
  )

  /* ---------- Identification screen ---------- */
  if (!identified) {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-b from-brand-800 via-brand-600 to-emerald-500 p-6 text-white">
        {header}

        <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 py-8">
          {/* Fingerprint */}
          {(config.method === 'fingerprint' || pinMode) && (
            <>
              <button
                type="button"
                disabled={scanning}
                onClick={async () => {
                  // Simulated sensor: matches when exactly one fingerprint is registered.
                  await identify('fingerprint', 'SIM_FP')
                }}
                className="animate-pulse-slow flex h-44 w-44 transform flex-col items-center justify-center gap-2 rounded-full bg-white/15 ring-4 ring-white/40 shadow-2xl transition hover:scale-105 hover:bg-white/25 active:scale-95"
              >
                <FingerprintGlyph className="h-20 w-20" />
              </button>
              <p className="-mt-3 text-center text-lg font-semibold">
                {scanning ? 'Identifying…' : 'Touch the sensor to clock in / out'}
              </p>

              {(config.method === 'fingerprint' ? pinMode : true) && (
                <div className="w-full rounded-3xl bg-white/10 p-5 ring-1 ring-white/25 backdrop-blur">
                  <p className="mb-3 text-center text-sm font-bold">Or enter your PIN:</p>
                  <div className="mb-4 flex justify-center gap-2.5">
                    {Array.from({ length: config.pinLength }).map((_, i) => (
                      <span key={i} className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? 'bg-white' : 'bg-white/30'}`} />
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2.5">
                    {['1','2','3','4','5','6','7','8','9','C','0','OK'].map((key) => (
                      <button
                        key={key}
                        type="button"
                        disabled={scanning}
                        onClick={async () => {
                          if (key === 'C') setPin('')
                          else if (key === 'OK') {
                            if (pin.length === config.pinLength) await identify('pin', pin)
                            setPin('')
                          } else if (pin.length < config.pinLength) setPin(pin + key)
                        }}
                        className={`rounded-2xl py-3.5 text-xl font-bold shadow transition active:scale-95 ${
                          key === 'OK' ? 'bg-white text-brand-700 hover:bg-emerald-50'
                          : key === 'C' ? 'bg-gray-900/30 hover:bg-gray-900/45'
                          : 'bg-white/15 ring-1 ring-white/25 hover:bg-white/25'
                        }`}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {config.method === 'fingerprint' && config.pinFallback && !pinMode && (
                <button type="button" onClick={() => setPinMode(true)} className="text-sm font-medium text-emerald-100 underline hover:text-white">
                  Use PIN instead
                </button>
              )}
            </>
          )}

          {/* QR */}
          {config.method === 'qr' && (
            <>
              <div className={`rounded-[2rem] bg-white p-6 shadow-2xl transition ${scanning ? 'animate-pulse-slow' : ''}`}>
                <QrGlyph className="h-44 w-44 text-gray-900" />
              </div>
              <p className="text-lg font-semibold">{scanning ? 'Identifying…' : 'Scan your QR badge to clock in / out'}</p>
              <div className="w-full rounded-3xl bg-white/10 p-5 ring-1 ring-white/25 backdrop-blur">
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  onKeyDown={async (e) => { if (e.key === 'Enter' && pin.trim()) await identify('qr', pin.trim()) }}
                  placeholder="Badge code (manual entry)"
                  aria-label="Badge code"
                  className="w-full rounded-xl border-0 px-4 py-3 text-center font-mono text-sm text-gray-900 focus:outline-none focus:ring-4 focus:ring-white/40"
                />
                <button
                  type="button"
                  disabled={scanning || !pin.trim()}
                  onClick={async () => { const v = pin.trim(); setPin(''); await identify('qr', v) }}
                  className="mt-3 w-full rounded-xl bg-white py-3 text-base font-bold text-brand-700 shadow-xl transition hover:bg-emerald-50 disabled:opacity-50"
                >
                  Submit badge code
                </button>
              </div>
            </>
          )}

          {authError && (
            <div className="w-full rounded-2xl border border-red-300/40 bg-red-600/90 px-5 py-4 text-center text-base font-bold shadow-xl" role="alert">
              {authError}
            </div>
          )}
        </main>

        <footer className="text-center text-xs text-emerald-100">
          {config.site ? `Station: ${config.site}` : ''} · Idle timeout: {config.idleTimeout}s · Credentials are registered in Kiosk Setup
        </footer>
      </div>
    )
  }

  /* ---------- Punch confirmation screen (person identified) ---------- */
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-brand-700 via-brand-600 to-emerald-500 p-6 text-white">
      {header}

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-8 py-8">
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-white/10 px-10 py-6 ring-1 ring-white/25 backdrop-blur">
          <p className="text-sm uppercase tracking-widest text-emerald-100">Welcome,</p>
          <p className="text-3xl font-black">{identified.name}</p>
          {identified.company && <p className="text-sm text-emerald-100">{identified.company}</p>}
        </div>

        <div className="text-center">
          <p className="text-6xl font-black tabular-nums drop-shadow-lg sm:text-7xl">
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>

        <div className="grid w-full grid-cols-2 gap-5">
          <button
            onClick={() => punch('in')}
            className="group flex flex-col items-center gap-4 rounded-[2rem] bg-white py-12 text-brand-700 shadow-2xl transition-all duration-200 active:scale-95 hover:bg-brand-50"
          >
            <span className="flex h-16 w-16 transform items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition-transform group-hover:scale-110">
              <svg className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
            </span>
            <span className="text-2xl font-extrabold tracking-wide">CHECK IN</span>
          </button>
          <button
            onClick={() => punch('out')}
            className="group flex flex-col items-center gap-4 rounded-[2rem] bg-gray-900/25 py-12 text-white ring-2 ring-white/60 shadow-2xl transition-all duration-200 active:scale-95 hover:bg-gray-900/35"
          >
            <span className="flex h-16 w-16 transform items-center justify-center rounded-full bg-gray-900/40 transition-transform group-hover:scale-110">
              <svg className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </span>
            <span className="text-2xl font-extrabold tracking-wide">CHECK OUT</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => { setIdentified(null); setPin(''); setPinMode(false); setAuthError(null) }}
          className="text-sm font-medium text-emerald-100 underline hover:text-white"
        >
          Not you? Identify again
        </button>
      </main>

      {message && (
        <div className={`fixed bottom-8 left-1/2 z-50 w-[90%] max-w-md -translate-x-1/2 rounded-2xl px-6 py-5 text-center text-lg font-bold shadow-2xl ${message.type === 'in' ? 'bg-white text-brand-700' : 'bg-gray-900 text-white'}`}>
          {message.text}
        </div>
      )}
    </div>
  )
}
