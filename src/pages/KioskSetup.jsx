import { usePageTitle } from '../lib/documentMeta'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { startRegistration } from '@simplewebauthn/browser'
import { getActiveSettings } from '../lib/systemSettings'
import { api, apiEnabled } from '../lib/api'
import { getCredential, setPin, ensureQrCode } from '../lib/credentials'
import { getDefaultKioskConfig, saveCompanyKioskConfig, loadKioskConfig as loadKioskConfigPerCompany } from '../lib/kioskConfig'

// Keep legacy export for Kiosk.jsx fallback (no companyId)
export function loadKioskConfig(companyId) {
  if (companyId) return loadKioskConfigPerCompany(companyId)
  try {
    const legacy = localStorage.getItem('uw_kiosk_config')
    if (legacy) return { ...getDefaultKioskConfig(), ...JSON.parse(legacy) }
  } catch {}
  return getDefaultKioskConfig()
}

const methods = [
  {
    id: 'fingerprint',
    label: 'Fingerprint',
    tag: 'Default',
    desc: 'Biometric unlock using the device fingerprint sensor. Recommended for mobile kiosks.',
    icon: 'M2 12a10 10 0 0 1 18-6M21.8 16c.2-2 .131-5.354 0-6M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2M8.65 22c.21-.66.45-1.32.57-2M9 6.8a6 6 0 0 1 9 5.2v2M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4M14 13.12c0 2.38 0 6.38-1 8.88',
  },
  {
    id: 'pin',
    label: 'PIN Code',
    tag: null,
    desc: 'Employees enter a personal identification number on a numeric keypad.',
    icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  },
  {
    id: 'qr',
    label: 'QR Code',
    tag: null,
    desc: 'Employees scan their personal QR badge with the kiosk camera.',
    icon: 'M3 9V5a2 2 0 012-2h4m6 0h4a2 2 0 012 2v4m0 6v4a2 2 0 01-2 2h-4m-6 0H5a2 2 0 01-2-2v-4M8 13v3h3m2-6h3v3',
  },
]

const SITES = { hq: 'Head Office', branch1: 'Branch 1 — Makati', branch2: 'Branch 2 — Cebu' }

function QrGlyph({ className }) {
  return (
    <svg viewBox="0 0 21 21" className={className} fill="currentColor">
      <path d="M0 0h7v7H0zM2 2v3h3V2zM14 0h7v7h-7zM16 2v3h3V2zM0 14h7v7H0zM2 16v3h3v-3zM10 0h2v2h-2zM10 4h2v2h-2zM4 10h2v2H4zM8 8h2v2H8zM12 10h2v2h-2zM10 14h2v2h-2zM14 14h2v2h-2zM18 14h2v2h-2zM16 10h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" />
    </svg>
  )
}

export default function KioskSetup() {
  usePageTitle('Kiosk Setup')
  const [companies, setCompanies] = useState([])
  const [configCompanyId, setConfigCompanyId] = useState('')
  const [config, setConfig] = useState(() => loadKioskConfig())

  useEffect(() => {
    if (!apiEnabled()) return
    api('/api/companies').then((res)=>{
      const all = Array.isArray(res) ? res : (res.data || [])
      const active = all.filter((c)=>c.active!==false)
      setCompanies(active)
      if (active.length && !active.find((c)=>c.id===configCompanyId)) setConfigCompanyId(active[0].id)
    }).catch(()=>{})
  }, [configCompanyId])
  const [saved, setSaved] = useState(false)

  // Device pairing — a per-company token kiosks use to record punches.
  const [kioskToken, setKioskToken] = useState(null)
  const [tokenCopied, setTokenCopied] = useState(false)
  useEffect(() => {
    if (!configCompanyId) { setKioskToken(null); return }
    let cancelled = false
    api(`/api/kiosk-token/${encodeURIComponent(configCompanyId)}`).then((r) => { if (!cancelled) setKioskToken(r.token) }).catch(() => { if (!cancelled) setKioskToken(null) })
    return () => { cancelled = true }
  }, [configCompanyId])
  const regenerateToken = async () => {
    if (!configCompanyId) return
    try {
      await api(`/api/kiosk-token/${encodeURIComponent(configCompanyId)}`, { method: 'DELETE' })
      const r = await api(`/api/kiosk-token/${encodeURIComponent(configCompanyId)}`)
      setKioskToken(r.token)
      setTokenCopied(false)
    } catch { /* ignore */ }
  }
  const copyToken = async () => {
    if (!kioskToken) return
    try { await navigator.clipboard.writeText(kioskToken); setTokenCopied(true); setTimeout(() => setTokenCopied(false), 3000) } catch {}
  }

  // Credential registration state
  // (uses same active companies list)
  const [credCompanyId, setCredCompanyId] = useState(companies[0]?.id || '')
  const credCompany = companies.find((c) => c.id === credCompanyId)
  const credEmployees = credCompany?.employees || []
  const [credEmail, setCredEmail] = useState('')
  const credEmployee = credEmployees.find((e) => e.email === credEmail)
  const [fpStatus, setFpStatus] = useState(null)   // 'registered' | null
  const [pinInput, setPinInput] = useState('')
  const [pinStatus, setPinStatus] = useState(null) // {ok, msg}
  const [qrImg, setQrImg] = useState(null)
  const [qrCodeStr, setQrCodeStr] = useState(null)
  const [_credError, setCredError] = useState(null)

  // Keep credential company in sync when active list refreshes (cloud mode)
  useEffect(() => {
    if (companies.length && !companies.find((c)=>c.id===credCompanyId)) {
      setCredCompanyId(companies[0].id)
      setCredEmail('')
    }
  }, [companies, credCompanyId])

  useEffect(() => {
    setFpStatus(null); setPinStatus(null); setQrImg(null); setQrCodeStr(null); setCredError(null)
    if (!credEmail) return
    ;(async () => {
      try {
        if (apiEnabled()) {
          const status = await api(`/api/credentials/${encodeURIComponent(credEmail.toLowerCase())}`)
          setPinStatus(status.pinSet ? { ok: true } : null)
          if (status.qrCode) {
            setQrCodeStr(status.qrCode)
            setQrImg(await QRCode.toDataURL(status.qrCode, { width: 240, margin: 1 }))
          }
          // Fingerprint is a platform-authenticator credential (WebAuthn).
          try {
            const w = await api(`/api/webauthn/credentials?email=${encodeURIComponent(credEmail.toLowerCase())}`)
            setFpStatus(w.registered ? 'registered' : null)
          } catch {
            setFpStatus(null)
          }
        } else {
          const cred = await getCredential(credEmail)
          setFpStatus(cred.fpToken ? 'registered' : null)
          setPinStatus(cred.pin ? { ok: true } : null)
          if (cred.qrCode) {
            setQrCodeStr(cred.qrCode)
            setQrImg(await QRCode.toDataURL(cred.qrCode, { width: 240, margin: 1 }))
          }
        }
      } catch { /* ignore */ }
    })()
  }, [credEmail])

  const registerFingerprint = async () => {
    if (!credEmail) return setCredError('Select an employee first.')
    if (!credCompanyId) return setCredError('Select a company first.')
    const email = credEmail.toLowerCase()
    try {
      setCredError(null)
      const options = await api('/api/webauthn/register/options', { method: 'POST', body: { email, origin: window.location.origin } })
      // Triggers the platform biometric prompt (fingerprint / Face ID) on this device.
      const reg = await startRegistration({ optionsJSON: options })
      await api('/api/webauthn/register', { method: 'POST', body: { email, companyId: credCompanyId, response: reg } })
      setFpStatus('registered')
    } catch (err) {
      setCredError('Biometric capture failed: ' + (err?.message || 'Unknown error'))
    }
  }

  const savePin = async () => {
    if (!credEmail) return setCredError('Select an employee first.')
    if (pinInput.length < 4 || pinInput.length > 8) return setCredError('PIN must be 4–8 digits.')
    await setPin(credEmail, pinInput)
    setPinInput('')
    setPinStatus({ ok: true })
    setCredError(null)
  }

  const generateQr = async () => {
    if (!credEmail) return setCredError('Select an employee first.')
    const code = await ensureQrCode(credEmail)
    setQrCodeStr(code)
    setQrImg(await QRCode.toDataURL(code, { width: 240, margin: 1 }))
    setCredError(null)
  }

  const update = (key, value) => setConfig((c) => ({ ...c, [key]: value }))

  const save = async (e) => {
    e.preventDefault()
    if (!configCompanyId) return
    await saveCompanyKioskConfig(configCompanyId, config)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const inputCls = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10'
  const systemName = getActiveSettings().name

  return (
    <form onSubmit={save} className="space-y-6 px-1 sm:px-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Administration</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Kiosk Setup</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">Configure how employees authenticate at time-keeping kiosks. Each company has its own unique setup — detected automatically via employee tagging.</p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto shrink-0">
          {saved && (
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-2 text-xs font-medium text-brand-700 ring-1 ring-brand-200 animate-pulse">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              Saved
            </span>
          )}
          <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">Save configuration</button>
        </div>
      </div>

      <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-4 shadow-sm sm:p-5">
        <label className="block text-sm">
          <span className="flex items-center gap-2 font-semibold text-gray-900">
            <svg className="h-4 w-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1" /></svg>
            Configuring for company:
          </span>
          <select value={configCompanyId} onChange={(e)=>setConfigCompanyId(e.target.value)} className={inputCls + ' mt-2 max-w-sm min-h-[44px] bg-white'}>
            {companies.length===0 && <option value="">No active companies — add one first</option>}
            {companies.map((c)=><option key={c.id} value={c.id}>{c.name} {c.active===false?' (inactive)':''}</option>)}
          </select>
        </label>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
          <svg className="h-3.5 w-3.5 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h5l-1.407-1.407A2 2 0 0118 13.585V11a6.003 6.003 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.585a2 2 0 01-.586 1.414L4 17.5" /></svg>
          Unique per company — kiosk detects automatically via employee badge.
        </p>
      </div>

      <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold text-gray-900">Kiosk device pairing</h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-600">
          Kiosks without a user login need this token to record punches. On the kiosk device, open the time kiosk page and tap <span className="font-semibold">Pair device</span>, then paste the token below.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-xs text-gray-800">{kioskToken || '—'}</code>
          <div className="flex gap-2">
            <button type="button" onClick={copyToken} disabled={!kioskToken} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-40">{tokenCopied ? 'Copied ✓' : 'Copy'}</button>
            <button type="button" onClick={regenerateToken} disabled={!kioskToken} className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-40">Regenerate</button>
          </div>
        </div>
        {kioskToken && <p className="mt-2 text-[11px] text-gray-500">Regenerating invalidates the old token immediately — re-pair any kiosk that used it.</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Authentication Method</h2>
            <p className="mt-1 text-sm text-gray-500">Select the primary sign-in method for kiosk devices.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {methods.map((m) => (
                <label
                  key={m.id}
                  className={`relative cursor-pointer rounded-xl border-2 p-4 transition ${
                    config.method === m.id ? 'border-brand-500 bg-brand-50/60' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input type="radio" name="method" value={m.id} checked={config.method === m.id} onChange={() => update('method', m.id)} className="sr-only" />
                  {m.tag && (
                    <span className="absolute -top-2.5 right-3 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{m.tag}</span>
                  )}
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${config.method === m.id ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
                      <path strokeLinecap="round" strokeLinejoin="round" d={m.icon} />
                    </svg>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-gray-900">{m.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">{m.desc}</p>
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Method Options</h2>
            {config.method === 'fingerprint' && (
              <div className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Allow PIN fallback</p>
                    <p className="text-xs text-gray-500">Permit PIN entry when the fingerprint sensor is unavailable or fails.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={!!config.pinFallback}
                    onChange={(e) => update('pinFallback', e.target.checked)}
                    className="h-5 w-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                </div>
                <div className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Require re-authentication after checkout</p>
                    <p className="text-xs text-gray-500">Prevents duplicate punches on shared devices.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={!!config.requireReAuth}
                    onChange={(e) => update('requireReAuth', e.target.checked)}
                    className="h-5 w-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                </div>
              </div>
            )}
            {config.method === 'pin' && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">PIN length:</span>
                  <select value={String(config.pinLength)} onChange={(e) => update('pinLength', Number(e.target.value))} className={inputCls}>
                    <option value="4">4 digits</option>
                    <option value="6">6 digits</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Lockout after failed attempts:</span>
                  <select value={String(config.lockoutAttempts)} onChange={(e) => update('lockoutAttempts', Number(e.target.value))} className={inputCls}>
                    <option value="3">3 attempts</option>
                    <option value="5">5 attempts</option>
                    <option value="0">No lockout</option>
                  </select>
                </label>
              </div>
            )}
            {config.method === 'qr' && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Badge QR rotation:</span>
                  <select value={config.qrRotation} onChange={(e) => update('qrRotation', e.target.value)} className={inputCls}>
                    <option value="static">Static (never expires)</option>
                    <option value="daily">Rotate daily</option>
                    <option value="weekly">Rotate weekly</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Camera device:</span>
                  <select value={config.camera} onChange={(e) => update('camera', e.target.value)} className={inputCls}>
                    <option value="rear">Rear camera (mobile)</option>
                    <option value="front">Front camera</option>
                  </select>
                </label>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Credential Registration</h2>
            <p className="mt-1 text-sm text-gray-500">
              Register each employee's fingerprint, PIN and QR badge. On the kiosk, these credentials identify
              who is clocking in — no name selection needed.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Company:</span>
                <select value={credCompanyId} onChange={(e) => { setCredCompanyId(e.target.value); setCredEmail('') }} className={inputCls}>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Employee:</span>
                <select value={credEmail} onChange={(e) => setCredEmail(e.target.value)} className={inputCls}>
                  <option value="">Select employee…</option>
                  {credEmployees.map((emp) => <option key={emp.email} value={emp.email}>{emp.name}</option>)}
                </select>
              </label>
            </div>

            {!credEmployee ? (
              <p className="mt-4 rounded-lg bg-gray-50 px-4 py-3 text-center text-xs text-gray-400">Select an employee to manage their credentials.</p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {/* Fingerprint */}
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <svg className="h-4 w-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2 12a10 10 0 0 1 18-6M21.8 16c.2-2 .131-5.354 0-6M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2M8.65 22c.21-.66.45-1.32.57-2M9 6.8a6 6 0 0 1 9 5.2v2M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4M14 13.12c0 2.38 0 6.38-1 8.88" /></svg>
                    Fingerprint
                  </p>
                  {fpStatus === 'registered' ? (
                    <>
                      <p className="mt-2 text-xs font-medium text-brand-700">✓ Registered</p>
                      <button type="button" onClick={registerFingerprint} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Re-capture</button>
                    </>
                  ) : (
                    <>
                      <p className="mt-2 text-xs text-gray-400">Not registered</p>
                      <button type="button" onClick={registerFingerprint} className="mt-2 w-full rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">Capture</button>
                    </>
                  )}
                </div>

                {/* PIN */}
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <svg className="h-4 w-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    PIN Code
                  </p>
                  {pinStatus?.ok && <p className="mt-2 text-xs font-medium text-brand-700">✓ Set</p>}
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="4–8 digits"
                    aria-label="New PIN"
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm tabular-nums focus:border-brand-500 focus:outline-none"
                  />
                  <button type="button" onClick={savePin} disabled={!pinInput} className="mt-2 w-full rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
                    Save PIN
                  </button>
                </div>

                {/* QR */}
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <QrGlyph className="h-4 w-4 text-brand-600" />
                    QR Badge
                  </p>
                  {qrImg ? (
                    <img src={qrImg} alt="Employee QR badge" className="mx-auto mt-2 h-24 w-24 rounded-lg bg-white p-1 ring-1 ring-gray-200" />
                  ) : (
                    <p className="mt-2 text-xs text-gray-400">Not generated</p>
                  )}
                  <button type="button" onClick={generateQr} className="mt-2 w-full rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
                    {qrImg ? 'Regenerate' : 'Generate badge'}
                  </button>
                  {qrCodeStr && <p className="mt-1 break-all text-center text-[10px] tabular-nums text-gray-400">{qrCodeStr}</p>}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Device Settings</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Idle timeout:</span>
                <select value={String(config.idleTimeout)} onChange={(e) => update('idleTimeout', Number(e.target.value))} className={inputCls}>
                  <option value="30">30 seconds</option>
                  <option value="60">60 seconds</option>
                  <option value="120">2 minutes</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Assigned branch / site:</span>
                <select value={config.site} onChange={(e) => update('site', e.target.value)} className={inputCls}>
                  {Object.entries(SITES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
            </div>
          </section>
        </div>

        <aside className="self-start lg:sticky lg:top-24">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Live Preview</p>
          <Preview method={config.method} systemName={systemName} site={SITES[config.site]} />
        </aside>
      </div>
    </form>
  )
}

function Preview({ method, systemName, site }) {
  return (
    <div className="mx-auto w-56 rounded-[2rem] border border-gray-200 bg-gray-900 p-2 shadow-xl">
      <div className="mx-auto mb-1 h-1.5 w-16 rounded-full bg-gray-700" />
      <div className="flex h-96 flex-col items-center justify-between rounded-[1.6rem] bg-gradient-to-b from-brand-600 to-emerald-500 px-4 py-6 text-white">
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-100">{systemName}</p>
          {site && <p className="mt-0.5 text-[9px] text-emerald-100/80">{site}</p>}
        </div>
        <div className="flex flex-col items-center gap-3">
          {method === 'fingerprint' && (
            <>
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/15 ring-2 ring-white/40">
                <svg className="h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 12a10 10 0 0 1 18-6M21.8 16c.2-2 .131-5.354 0-6M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2M8.65 22c.21-.66.45-1.32.57-2M9 6.8a6 6 0 0 1 9 5.2v2M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4M14 13.12c0 2.38 0 6.38-1 8.88" />
                </svg>
              </div>
              <p className="text-xs font-medium text-emerald-100">Touch the sensor to sign in</p>
            </>
          )}
          {method === 'pin' && (
            <>
              <div className="flex gap-2">
                {[0, 1, 2, 3].map((i) => <span key={i} className="h-3.5 w-3.5 rounded-full bg-white/30 ring-1 ring-white/50" />)}
              </div>
              <div className="grid w-44 grid-cols-3 gap-1.5">
                {['1','2','3','4','5','6','7','8','','0','OK'].map((k, i) => (
                  <span key={i} className={`rounded-lg py-2 text-center text-xs font-semibold ${k === 'OK' ? 'bg-gray-900/40 text-white' : k ? 'bg-white/15 ring-1 ring-white/25' : ''}`}>{k}</span>
                ))}
              </div>
            </>
          )}
          {method === 'qr' && (
            <>
              <svg viewBox="0 0 21 21" className="h-32 w-32 rounded-xl bg-white p-2 fill-gray-900">
                <path d="M0 0h7v7H0zM2 2v3h3V2zM14 0h7v7h-7zM16 2v3h3V2zM0 14h7v7H0zM2 16v3h3v-3zM10 0h2v2h-2zM10 4h2v2h-2zM4 10h2v2H4zM8 8h2v2H8zM12 10h2v2h-2zM10 14h2v2h-2zM14 14h2v2h-2zM18 14h2v2h-2zM16 10h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/>
              </svg>
              <p className="text-xs font-medium text-emerald-100">Scan your employee QR badge</p>
            </>
          )}
        </div>
        <div className="w-full rounded-lg bg-white/10 py-2 text-center text-[10px] font-medium text-emerald-100 ring-1 ring-white/20">
          Check In / Check Out
        </div>
      </div>
    </div>
  )
}
