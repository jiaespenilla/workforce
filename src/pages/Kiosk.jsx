import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getActiveSettings } from '../lib/systemSettings'
import { fetchPublicSystemIcon, getSystemIcon } from '../lib/documentMeta'
import { loadKioskConfig } from './KioskSetup'
import { getCompanyShifts, decideAction } from '../lib/shifts'
import { getCompanyKioskConfig } from '../lib/kioskConfig'
import { startAuthentication } from '@simplewebauthn/browser'
import { api, apiEnabled } from '../lib/api'

// Makes the kiosk installable as a stand-alone app on phones/tablets.
function useKioskPwa(systemName, brandLetter, brandIcon) {
  useLayoutEffect(() => {
    const icon = brandIcon || getSystemIcon()
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
  }, [systemName, brandLetter, brandIcon])
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
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
      <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
      <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
      <path d="M2 12a10 10 0 0 1 18-6" />
      <path d="M2 16h.01" />
      <path d="M21.8 16c.2-2 .131-5.354 0-6" />
      <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
      <path d="M8.65 22c.21-.66.45-1.32.57-2" />
      <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
    </svg>
  )
}

export default function Kiosk() {
  const settings = getActiveSettings()
  const systemName = settings.name
  const brandLetter = (systemName || 'U').charAt(0).toUpperCase()
  const [brandIcon, setBrandIcon] = useState(getSystemIcon)
  const [kioskCompanyId, setKioskCompanyId] = useState(null)
  const [config, setConfig] = useState(() => loadKioskConfig())

  // Public kiosk has no login — pull the admin-selected icon so it matches the system.
  useEffect(() => {
    let live = true
    fetchPublicSystemIcon().then((icon) => { if (live && icon) setBrandIcon(icon) })
    return () => { live = false }
  }, [])

  // When company is detected (via employee tag), load that company's unique setup automatically
  useEffect(() => {
    if (!kioskCompanyId) return
    getCompanyKioskConfig(kioskCompanyId).then(setConfig).catch(()=>{})
  }, [kioskCompanyId])

  const [now, setNow] = useState(new Date())
  // identified = the employee matched via credential
  // result = the automatic punch record (shown until timeout / Done)
  const [result, setResult] = useState(null)
  const [authError, setAuthError] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [pin, setPin] = useState('')
  const [pinMode, setPinMode] = useState(false)
  const idleTimer = useRef(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Reset to the authentication screen after the configured idle timeout — per-company.
  useEffect(() => {
    const resetIdle = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => {
        setResult(null)
        setPin('')
        setPinMode(false)
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
  }, [config.idleTimeout])

  useKioskPwa(systemName, brandLetter, brandIcon)

  // Kiosk device pairing — punches are recorded with a per-company device token.
  const [deviceToken, setDeviceToken] = useState(() => localStorage.getItem('uw_kiosk_device_token') || '')
  const [pairOpen, setPairOpen] = useState(false)
  const [pairInput, setPairInput] = useState('')
  const [pairError, setPairError] = useState(null)
  const [pairing, setPairing] = useState(false)
  const pairDevice = async () => {
    const t = pairInput.trim()
    if (!t || pairing) return
    setPairing(true)
    setPairError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/kiosk/verify-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t }),
      })
      if (!res.ok) { setPairError('That token was not recognized. Check Kiosk Setup and try again.'); return }
      localStorage.setItem('uw_kiosk_device_token', t)
      setDeviceToken(t)
      setAuthError(null)
      setPairOpen(false)
      setPairInput('')
    } catch {
      setPairError('Could not reach the server. Check the connection and try again.')
    } finally {
      setPairing(false)
    }
  }

  /* Real biometric (fingerprint / Face ID) scan via the device's platform
     authenticator. The kiosk request pairs the scan to the employee server-side;
     the returned match is then used to record the clock-in/out (with the kiosk
     device token so no user login is needed). */
  const fingerprintScan = async () => {
    setAuthError(null)
    setScanning(true)
    try {
      if (!apiEnabled()) { setAuthError('Fingerprint scanning requires the cloud API.'); return }
      const options = await api('/api/webauthn/authentication/options', { method: 'POST', body: { origin: window.location.origin } })
      // Triggers the OS biometric prompt (fingerprint / Face ID) on the device.
      const auth = await startAuthentication({ optionsJSON: options })
      const match = await api('/api/webauthn/authentication', { method: 'POST', body: { response: auth } })
      if (match.companyId) setKioskCompanyId(match.companyId)
      await recordPunch(match)
    } catch (err) {
      setAuthError(err?.message || 'Fingerprint scan failed. Touch the sensor and try again.')
    } finally {
      setScanning(false)
    }
  }

  /* Identify the employee from a registered credential (PIN / QR).
     Fingerprint is handled separately via WebAuthn above. */
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
        setAuthError('Credential not recognized. Register it in Kiosk Setup first.')
        return false
      }
      if (match.companyId) setKioskCompanyId(match.companyId)
      await recordPunch(match)
      return true
    } finally {
      setScanning(false)
    }
  }

  // Automatic clock-in / clock-out based on the employee's assigned shift.
  const recordPunch = async (match) => {
    let shift = null
    try {
      const shiftsData = await getCompanyShifts(match.companyId || company_id_by_name(match))
      const shiftId = (shiftsData.assignments || {})[match.email]
      shift = (shiftsData.shifts || []).find((s) => s.id === shiftId) || null
    } catch {
      shift = null
    }

    const nowDate = new Date()
    let punches = []
    if (apiEnabled()) {
      try {
        const headers = deviceToken ? { 'X-Kiosk-Token': deviceToken } : {}
        const all = await api(`/api/attendance?email=${encodeURIComponent(match.email)}`, { headers })
        // API may return paginated envelope {data, total} or plain array
        punches = Array.isArray(all) ? all : (all.data || [])
        // fallback: filter to this email only (public kiosk endpoint already does)
        punches = punches.filter((p) => (p.email || '').toLowerCase() === match.email.toLowerCase())
      } catch {
        punches = []
      }
    } else {
      try { punches = (JSON.parse(localStorage.getItem('uw_punches')) || []).filter((p) => (p.email || '').toLowerCase() === match.email.toLowerCase()) } catch { punches = [] }
    }
    const { action, overtime, overtimeMinutes = 0 } = decideAction(punches, shift, nowDate)

    const punchRecord = {
      email: match.email,
      name: match.name,
      company: match.company,
      type: action,
      time: nowDate.toISOString(),
    }

    if (apiEnabled()) {
      await api('/api/attendance', {
        method: 'POST',
        body: { email: match.email, company_id: match.companyId || company_id_by_name(match), type: action, time: nowDate.toISOString(), overtime: !!overtime, overtimeMinutes },
        headers: deviceToken ? { 'X-Kiosk-Token': deviceToken } : {},
      }).catch(() => {})
    } else {
      // merge back to global uw_punches
      try {
        const all = JSON.parse(localStorage.getItem('uw_punches')) || []
        all.push({ ...punchRecord, overtime: !!overtime, overtimeMinutes })
        localStorage.setItem('uw_punches', JSON.stringify(all))
      } catch { localStorage.setItem('uw_punches', JSON.stringify([{ ...punchRecord, overtime: !!overtime, overtimeMinutes }])) }
    }

    setResult({
      name: match.name,
      action, // 'in' | 'out'
      overtime: !!overtime,
      overtimeMinutes: Number(overtimeMinutes) || 0,
      time: nowDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      shiftName: shift?.name || null,
    })
    setTimeout(() => setResult(null), 6000) // auto-return to auth screen
  }

  function company_id_by_name(_companyName) {
    // Company ids come from the identify response; no local company list exists.
    return undefined
  }

  const header = (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {brandIcon ? (
          <img src={brandIcon} alt="" className="h-12 w-12 shrink-0 rounded-2xl bg-white object-contain p-1 shadow-lg" />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-xl font-black text-brand-600 shadow-lg">{brandLetter}</div>
        )}
        <div className="min-w-0 leading-tight">
          <span className="block truncate text-lg font-bold">{systemName}</span>
          <span className="block truncate text-[11px] font-medium text-emerald-100">Time Kiosk{config.site ? ` · ${config.site}` : ''}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!deviceToken ? (
          <button type="button" onClick={() => { setPairOpen(true); setPairError(null) }} className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-gray-900 shadow hover:bg-amber-300">Pair device</button>
        ) : (
          <span className="hidden items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-emerald-50 sm:inline-flex">
            <span className="h-2 w-2 rounded-full bg-emerald-300" /> Paired
          </span>
        )}
        <Link to="/" className="rounded-full bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25">Exit kiosk</Link>
      </div>
    </header>
  )

  const pairModal = pairOpen && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPairOpen(false)}>
      <div className="absolute inset-0 bg-gray-900/60" />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 text-gray-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold">Pair this kiosk</h3>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          Paste the device token from <span className="font-semibold">Kiosk Setup</span>. Pairing links this screen to your company so punches are recorded.
        </p>
        <label className="mt-4 block text-xs font-medium text-gray-700">
          Device token
          <input
            value={pairInput}
            onChange={(e) => setPairInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') pairDevice() }}
            placeholder="uwk_…"
            autoComplete="off"
            autoFocus
            className="mt-1 w-full rounded-xl border border-gray-300 px-3.5 py-2.5 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
          />
        </label>
        {pairError && (
          <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-red-200">{pairError}</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setPairOpen(false)} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={pairDevice} disabled={!pairInput.trim() || pairing} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-brand-700 disabled:opacity-50">
            {pairing ? 'Verifying…' : 'Pair kiosk'}
          </button>
        </div>
      </div>
    </div>
  )

  /* ---------- Identification screen ---------- */
  if (!result) {
    const methodLabel = config.method === 'fingerprint' && !pinMode ? 'Fingerprint' : config.method === 'qr' ? 'QR badge' : 'PIN code'
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-b from-brand-800 via-brand-600 to-emerald-500 p-4 text-white sm:p-6">
        {header}
        {pairModal}

        {/* Live clock — wall-mounted kiosks double as the office clock */}
        <div className="mx-auto mt-5 text-center" aria-live="off">
          <p className="text-4xl font-black tabular-nums tracking-tight drop-shadow-lg sm:text-5xl">
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="mt-1 text-xs font-medium text-emerald-100 sm:text-sm">
            {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 py-6 sm:gap-7 sm:py-8">
          <p className="rounded-full bg-white/15 px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-50 ring-1 ring-white/25">
            Clock in / out · {methodLabel}
          </p>

          {/* Fingerprint screen */}
          {config.method === 'fingerprint' && !pinMode && (
            <>
              <button
                type="button"
                disabled={scanning}
                onClick={fingerprintScan}
                aria-label="Touch the sensor to clock in or out"
                className="animate-pulse-slow flex h-44 w-44 transform flex-col items-center justify-center gap-2 rounded-full bg-white/15 shadow-2xl ring-4 ring-white/40 transition hover:scale-105 hover:bg-white/25 active:scale-95 disabled:opacity-70 sm:h-48 sm:w-48"
              >
                {scanning
                  ? <svg className="h-16 w-16 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                  : <FingerprintGlyph className="h-20 w-20" />}
              </button>
              <div className="text-center">
                <p className="text-lg font-semibold">
                  {scanning ? 'Identifying…' : 'Touch the sensor'}
                </p>
                <p className="mt-1 text-sm text-emerald-100">
                  {scanning ? 'Hold still while we match your fingerprint.' : 'Your clock-in or out is recorded automatically.'}
                </p>
              </div>

              {config.pinFallback && (
                <div className="flex rounded-full bg-black/20 p-1 ring-1 ring-white/25" role="group" aria-label="Identification method">
                  <span className="rounded-full bg-white px-4 py-1.5 text-xs font-bold text-brand-700">Fingerprint</span>
                  <button type="button" onClick={() => setPinMode(true)} className="rounded-full px-4 py-1.5 text-xs font-semibold text-emerald-50 hover:text-white">
                    PIN
                  </button>
                </div>
              )}
            </>
          )}

          {/* PIN screen */}
          {(config.method === 'pin' || pinMode) && (
            <>
              <div className="text-center">
                <p className="text-lg font-semibold">Enter your PIN</p>
                <p className="mt-1 text-sm tabular-nums text-emerald-100" aria-live="polite">
                  {pin.length} of {config.pinLength} digits
                </p>
              </div>
              <div className="w-full rounded-3xl bg-white/10 p-5 ring-1 ring-white/25 backdrop-blur">
                <div className="mb-4 flex justify-center gap-2.5" aria-hidden="true">
                  {Array.from({ length: config.pinLength }).map((_, i) => (
                    <span key={i} className={`h-3.5 w-3.5 rounded-full transition ${i < pin.length ? 'bg-white scale-110' : 'bg-white/30'}`} />
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {['1','2','3','4','5','6','7','8','9','C','0','OK'].map((key) => {
                    const ready = key === 'OK' && pin.length === config.pinLength && !scanning
                    return (
                    <button
                      key={key}
                      type="button"
                      disabled={scanning || (key === 'OK' && pin.length !== config.pinLength)}
                      onClick={async () => {
                        if (key === 'C') setPin('')
                        else if (key === 'OK') {
                          if (pin.length === config.pinLength) await identify('pin', pin)
                          setPin('')
                        } else if (pin.length < config.pinLength) setPin(pin + key)
                      }}
                      aria-label={key === 'OK' ? 'Submit PIN' : key === 'C' ? 'Clear PIN' : `Digit ${key}`}
                      className={`min-h-[56px] rounded-2xl text-xl font-bold shadow transition active:scale-95 disabled:opacity-40 ${
                        key === 'OK' ? (ready ? 'bg-white text-brand-700 hover:bg-emerald-50' : 'bg-white/40 text-white/80')
                        : key === 'C' ? 'bg-gray-900/30 hover:bg-gray-900/45'
                        : 'bg-white/15 ring-1 ring-white/25 hover:bg-white/25'
                      }`}
                    >
                      {scanning && key === 'OK' ? '…' : key}
                    </button>
                    )
                  })}
                </div>
                {config.method === 'fingerprint' && (
                  <div className="mt-3 flex rounded-full bg-black/20 p-1 ring-1 ring-white/25" role="group" aria-label="Identification method">
                    <button type="button" onClick={() => { setPinMode(false); setPin('') }} className="rounded-full px-4 py-1.5 text-xs font-semibold text-emerald-50 hover:text-white">
                      Fingerprint
                    </button>
                    <span className="rounded-full bg-white px-4 py-1.5 text-xs font-bold text-brand-700">PIN</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* QR */}
          {config.method === 'qr' && (
            <>
              <div className="text-center">
                <p className="text-lg font-semibold">{scanning ? 'Identifying…' : 'Scan your QR badge'}</p>
                <p className="mt-1 text-sm text-emerald-100">Hold your badge in front of the camera.</p>
              </div>
              {/* Scan-frame illustration (not a real code) */}
              <div className="relative rounded-[2rem] bg-white p-7 shadow-2xl" aria-hidden="true">
                <span className="absolute left-3 top-3 h-6 w-6 rounded-tl-xl border-4 border-b-0 border-r-0 border-brand-600" />
                <span className="absolute right-3 top-3 h-6 w-6 rounded-tr-xl border-4 border-b-0 border-l-0 border-brand-600" />
                <span className="absolute bottom-3 left-3 h-6 w-6 rounded-bl-xl border-4 border-r-0 border-t-0 border-brand-600" />
                <span className="absolute bottom-3 right-3 h-6 w-6 rounded-br-xl border-4 border-l-0 border-t-0 border-brand-600" />
                <QrGlyph className={`h-36 w-36 text-gray-900 sm:h-40 sm:w-40 ${scanning ? 'animate-pulse' : ''}`} />
                {scanning && <span className="absolute inset-x-8 top-1/2 h-0.5 animate-pulse bg-red-500/80" />}
              </div>
              <details className="w-full rounded-3xl bg-white/10 px-5 py-3 ring-1 ring-white/25 backdrop-blur">
                <summary className="cursor-pointer text-center text-sm font-medium text-emerald-50 hover:text-white">
                  No camera? Enter badge code manually
                </summary>
                <div className="mt-3">
                  <input
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    onKeyDown={async (e) => { if (e.key === 'Enter' && pin.trim()) await identify('qr', pin.trim()) }}
                    placeholder="Badge code"
                    aria-label="Badge code"
                    autoComplete="off"
                    className="w-full rounded-xl border-0 px-4 py-3 text-center font-mono text-sm text-gray-900 focus:outline-none focus:ring-4 focus:ring-white/40"
                  />
                  <button
                    type="button"
                    disabled={scanning || !pin.trim()}
                    onClick={async () => { const v = pin.trim(); setPin(''); await identify('qr', v) }}
                    className="mt-3 min-h-[48px] w-full rounded-xl bg-white py-3 text-base font-bold text-brand-700 shadow-xl transition hover:bg-emerald-50 disabled:opacity-50"
                  >
                    {scanning ? 'Checking…' : 'Submit badge code'}
                  </button>
                </div>
              </details>
            </>
          )}

          {authError && (
            <div className="flex w-full items-start gap-3 rounded-2xl bg-white px-5 py-4 text-left shadow-xl ring-1 ring-red-200" role="alert">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
                <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900">Not recognized</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{authError}</p>
                <button type="button" onClick={() => setAuthError(null)} className="mt-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800">
                  Try again
                </button>
              </div>
            </div>
          )}
        </main>

        <footer className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs text-emerald-100">
          {config.site && <span className="font-semibold text-white">{config.site}</span>}
          {config.site && <span aria-hidden="true">·</span>}
          <span>Touch the sensor, enter PIN, or scan to begin</span>
        </footer>
      </div>
    )
  }

  /* ---------- Automatic punch result screen ---------- */
  const clockedIn = result.action === 'in'
  return (
    <div className={`flex min-h-screen flex-col p-4 text-white sm:p-6 ${clockedIn ? 'bg-gradient-to-b from-emerald-700 via-brand-600 to-emerald-500' : 'bg-gradient-to-b from-slate-800 via-slate-700 to-brand-800'}`}>
      {header}
      {pairModal}

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 px-2 py-6 sm:gap-6 sm:py-8">
        <div className="flex w-full flex-col items-center gap-3 rounded-[2rem] bg-white px-5 py-8 text-center text-gray-900 shadow-2xl sm:gap-4 sm:px-10 sm:py-10">
          <span className={`flex h-20 w-20 items-center justify-center rounded-full text-white shadow-xl ${clockedIn ? 'bg-emerald-500' : 'bg-slate-700'}`} aria-hidden="true">
            {clockedIn ? (
              <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </span>
          <div>
            <p className={`text-3xl font-black tracking-wide sm:text-4xl ${clockedIn ? 'text-emerald-700' : 'text-slate-800'}`}>
              {clockedIn ? 'Welcome!' : 'Goodbye!'}
            </p>
            <p className="mt-1 text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">
              Clocked {clockedIn ? 'in' : 'out'}
            </p>
          </div>
          {result.action === 'out' && result.overtime && (
            <span className="rounded-full bg-amber-100 px-4 py-1 text-xs font-extrabold uppercase tracking-widest text-amber-800 ring-1 ring-amber-300">
              Overtime{result.overtimeMinutes ? ` · +${Math.floor(result.overtimeMinutes / 60)}h${result.overtimeMinutes % 60 ? ` ${result.overtimeMinutes % 60}m` : ''}` : ''}
            </span>
          )}
          <div>
            <p className="truncate text-lg font-bold">{result.name}</p>
            <p className="mt-0.5 text-sm tabular-nums text-gray-500">
              {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })} · {result.time}{result.shiftName ? ` · ${result.shiftName}` : ''}
            </p>
          </div>
          {/* Auto-return countdown */}
          <div className="w-full" aria-hidden="true">
            <div className="h-1 overflow-hidden rounded-full bg-gray-100">
              <div key={result.time} className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-400" style={{ animation: 'shrink-bar 6s linear forwards' }} />
            </div>
            <p className="mt-1.5 text-[11px] text-gray-400">Returning to the clock-in screen…</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setResult(null)}
          className="min-h-[52px] rounded-2xl bg-white px-10 py-3 text-base font-bold text-brand-700 shadow-xl transition hover:bg-emerald-50 active:scale-95"
        >
          Done
        </button>
      </main>
    </div>
  )
}
