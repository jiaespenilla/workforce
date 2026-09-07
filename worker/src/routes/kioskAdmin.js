// Kiosk administration — device-token get/rotate + biometric registration.

import * as webAuthn from '../webauthn.js'
import { json, readJson } from '../lib/http.js'
import { generateKioskToken } from '../lib/kiosk.js'

export async function handle({ request, env, url, path, method, isAdmin }) {
  /* kiosk device tokens (administrator) */
  {
    const m = path.match(/^\/api\/kiosk-token\/([^/]+)$/)
    if (m) {
      if (!isAdmin) return json({ error: 'Administrator only.' }, 403)
      const companyId = decodeURIComponent(m[1])
      if (method === 'GET') {
        // Get-or-create: each company has exactly one active kiosk token.
        const row = await env.DB.prepare("SELECT key FROM settings WHERE key LIKE 'kiosk_device_token:%' AND value = ?").bind(companyId).first()
        let token = row ? row.key.slice('kiosk_device_token:'.length) : null
        if (!token) {
          token = generateKioskToken()
          await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
            .bind(`kiosk_device_token:${token}`, companyId).run()
        }
        return json({ token, companyId })
      }
      if (method === 'DELETE') {
        await env.DB.prepare("DELETE FROM settings WHERE key LIKE 'kiosk_device_token:%' AND value = ?").bind(companyId).run()
        return json({ ok: true })
      }
    }
  }

  /* kiosk biometric registration (administrator) */
  if (path === '/api/webauthn/register/options' && method === 'POST') {
    if (!isAdmin) return json({ error: 'Administrator only.' }, 403)
    const { email, origin } = await readJson(request)
    if (!email) return json({ error: 'email is required.' }, 400)
    try {
      return json(await webAuthn.buildRegistrationOptions(env, { username: email.trim().toLowerCase(), origin }))
    } catch (err) {
      return json({ error: err.message || 'Could not start biometric registration.' }, 400)
    }
  }
  if (path === '/api/webauthn/register' && method === 'POST') {
    if (!isAdmin) return json({ error: 'Administrator only.' }, 403)
    const { email, companyId, deviceId, response } = await readJson(request)
    if (!email || !companyId || !response) return json({ error: 'email, companyId and response are required.' }, 400)
    try {
      const reg = await webAuthn.registerCredential(env, { response })
      // One fingerprint per kiosk device (55): if THIS device already enrolled
      // a different employee, refuse — otherwise the OS account picker lets
      // one finger clock in/out as either person, so identity is ambiguous.
      let deviceIdNorm = deviceId ? String(deviceId).slice(0, 80) : null
      if (deviceIdNorm) {
        const other = await env.DB.prepare(
          'SELECT w.email, e.name FROM webauthn_credentials w LEFT JOIN employees e ON lower(e.email) = w.email WHERE w.device_id = ? AND lower(w.email) != ? LIMIT 1'
        ).bind(deviceIdNorm, reg.email.toLowerCase()).first()
        if (other) {
          const who = other.name || other.email
          return json({ error: 'This kiosk already has a fingerprint enrolled for ' + who + '. One fingerprint per kiosk device — remove that enrollment first, or use PIN/QR for other employees.' }, 409)
        }
      }
      // Only one fingerprint credential per employee (simplest for a shared kiosk).
      await env.DB.prepare('DELETE FROM webauthn_credentials WHERE email = ?').bind(reg.email.toLowerCase()).run()
      await env.DB.prepare(
        'INSERT INTO webauthn_credentials (email, company_id, credential_id, public_key, counter, transports, device_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(reg.email.toLowerCase(), companyId, reg.credentialId, reg.publicKey, reg.counter, JSON.stringify(reg.transports || []), deviceIdNorm).run()
      return json({ ok: true, email: reg.email })
    } catch (err) {
      return json({ error: err.message || 'Biometric registration failed.' }, err.status || 400)
    }
  }
  if (path === '/api/webauthn/credentials' && method === 'GET') {
    if (!isAdmin) return json({ error: 'Administrator only.' }, 403)
    const email = (url.searchParams.get('email') || '').trim().toLowerCase()
    const row = await env.DB.prepare('SELECT credential_id FROM webauthn_credentials WHERE email = ?').bind(email).first()
    return json({ registered: !!row })
  }

  return null
}
