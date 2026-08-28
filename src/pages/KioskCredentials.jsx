import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useAuth } from '../context/AuthContext'
import { usePageTitle } from '../lib/documentMeta'
import { api, apiEnabled } from '../lib/api'
import { getCredential, setFingerprint, setPin, ensureQrCode } from '../lib/credentials'

// Self-service kiosk credential registration — employees register their own
// fingerprint, PIN and QR badge used to identify them at the time kiosk.
export default function KioskCredentials() {
  usePageTitle('Kiosk Credentials')
  const { user } = useAuth()
  const email = user?.email

  const [fpStatus, setFpStatus] = useState(null)
  const [pinStatus, setPinStatus] = useState(null)
  const [pinInput, setPinInput] = useState('')
  const [qrImg, setQrImg] = useState(null)
  const [qrCodeStr, setQrCodeStr] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!email) return
    ;(async () => {
      try {
        let cred = {}
        if (apiEnabled()) {
          cred = await api(`/api/credentials/${encodeURIComponent(email.toLowerCase())}`)
        } else {
          cred = await getCredential(email)
        }
        setFpStatus(cred.fpToken ? 'registered' : null)
        setPinStatus(cred.pinSet ? { ok: true } : null)
        if (cred.qrCode) {
          setQrCodeStr(cred.qrCode)
          setQrImg(await QRCode.toDataURL(cred.qrCode, { width: 240, margin: 1 }))
        }
      } catch {
        // ignore load errors
      }
    })()
  }, [email])

  const captureFingerprint = async () => {
    setError(null)
    try {
      await setFingerprint(email, `FP-${crypto.randomUUID()}`)
      setFpStatus('registered')
    } catch (err) {
      setError(err.message || 'Failed to register fingerprint.')
    }
  }

  const savePin = async () => {
    setError(null)
    if (pinInput.length < 4 || pinInput.length > 8) {
      return setError('PIN must be 4–8 digits.')
    }
    try {
      await setPin(email, pinInput)
      setPinInput('')
      setPinStatus({ ok: true })
    } catch (err) {
      setError(err.message || 'Failed to save PIN.')
    }
  }

  const generateQr = async () => {
    setError(null)
    try {
      const code = await ensureQrCode(email)
      setQrCodeStr(code)
      setQrImg(await QRCode.toDataURL(code, { width: 240, margin: 1 }))
    } catch (err) {
      setError(err.message || 'Failed to generate QR badge.')
    }
  }

  if (!user) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Main Menu</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Kiosk Credentials</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">
          Register how <span className="font-semibold">{user.name}</span> is identified at the time kiosk —
          fingerprint, PIN or QR badge. Once registered, you no longer select your name on the kiosk.
        </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-xs font-medium text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {/* Fingerprint */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <svg className="h-4 w-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0 3.5-1 5.5-2 7m4-9a9 9 0 00-.5 8m2-10.5c1.6 2 2.3 4.6 1.8 7.2M7.5 6.5A9 9 0 0112 5a9 9 0 015.5 1.9M5 9.5A9 9 0 016.2 8" /></svg>
            Fingerprint
          </p>
          {fpStatus === 'registered' ? (
            <>
              <p className="mt-2 text-xs font-medium text-brand-700">✓ Registered</p>
              <button type="button" onClick={captureFingerprint} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                Re-capture
              </button>
            </>
          ) : (
            <>
              <p className="mt-2 text-xs text-gray-400">Not registered</p>
              <button type="button" onClick={captureFingerprint} className="mt-2 w-full rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
                Capture
              </button>
            </>
          )}
        </div>

        {/* PIN */}
        <form onSubmit={(e) => { e.preventDefault(); savePin() }} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
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
          <button
            type="submit"
            disabled={!pinInput}
            className="mt-2 w-full rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            Save PIN
          </button>
        </form>

        {/* QR */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <svg viewBox="0 0 21 21" className="h-4 w-4 text-brand-600" fill="currentColor"><path d="M0 0h7v7H0zM2 2v3h3V2zM14 0h7v7h-7zM16 2v3h3V2zM0 14h7v7H0zM2 16v3h3v-3zM10 0h2v2h-2zM10 4h2v2h-2zM4 10h2v2H4zM8 8h2v2H8zM12 10h2v2h-2zM10 14h2v2h-2zM14 14h2v2h-2zM18 14h2v2h-2zM16 10h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/></svg>
            QR Badge
          </p>
          {qrImg ? (
            <img src={qrImg} alt="Your QR badge" className="mx-auto mt-2 h-24 w-24 rounded-lg bg-white p-1 ring-1 ring-gray-200" />
          ) : (
            <p className="mt-2 text-xs text-gray-400">Not generated</p>
          )}
          <button type="button" onClick={generateQr} className="mt-2 w-full rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
            {qrImg ? 'Regenerate' : 'Generate badge'}
          </button>
          {qrCodeStr && <p className="mt-1 break-all text-center text-[10px] tabular-nums text-gray-400">{qrCodeStr}</p>}
        </div>
      </div>

      <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 text-xs leading-relaxed text-brand-800">
        <p className="font-bold">How it works at the kiosk</p>
        <p className="mt-1">
          On the Time Kiosk, touch the sensor (or enter your PIN / scan your QR badge). The kiosk identifies you
          automatically and shows your CHECK IN / CHECK OUT buttons — no name selection needed.
        </p>
      </div>
    </div>
  )
}
