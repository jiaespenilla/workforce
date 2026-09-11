// Kiosk administration — device-token get/rotate + biometric registration.

import * as webAuthn from '../webauthn.js'
import { json, readJson } from '../lib/http.js'
import { generateKioskToken, kioskTtlExpiry, KIOSK_TOKEN_TTLS, revokeKioskToken } from '../lib/kiosk.js'

export async function handle({ request, env, url, path, method, isAdmin }) {
  /* kiosk device tokens (administrator) */
  {
    const m = path.match(/^\/api\/kiosk-token\/([^/]+)$/)
    if (m) {
      if (!isAdmin) return json({ error: 'Administrator only.' }, 403)
      const companyId = decodeURIComponent(m[1])
      if (method === 'GET') {
        // Permanent pairing token — get-or-create: each company has exactly one.
        const row = await env.DB.prepare("SELECT key FROM settings WHERE key LIKE 'kiosk_device_token:%' AND value = ?").bind(companyId).first()
        let token = row ? row.key.slice('kiosk_device_token:'.length) : null
        if (!token) {
          token = generateKioskToken()
          await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
            .bind(`kiosk_device_token:${token}`, companyId).run()
        }
        // (71) Active temporary tokens for field work, with their expiry.
        const tempRows = await env.DB.prepare(
          "SELECT key, value FROM settings WHERE key LIKE 'kiosk_device_token:%' AND value = ?"
        ).bind(companyId).all().then((r) => r.results)
        const temporary = []
        for (const t of tempRows) {
          const tok = t.key.slice('kiosk_device_token:'.length)
          if (tok === token) continue // permanent token is reported separately
          const exp = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(`kiosk_token_expiry:${tok}`).first()
          if (exp?.value && new Date(exp.value).getTime() > Date.now()) {
            temporary.push({ token: tok, expiresAt: exp.value })
          }
        }
        return json({ token, companyId, temporary })
      }
      if (method === 'POST') {
        // (71) Generate a temporary field-work token with an expiry.
        const body = await readJson(request)
        const ttl = String(body?.ttl || '').trim()
        if (!KIOSK_TOKEN_TTLS.includes(ttl)) {
          return json({ error: `ttl must be one of: ${KIOSK_TOKEN_TTLS.join(', ')}.` }, 400)
        }
        const expiresAt = kioskTtlExpiry(ttl)
        if (!expiresAt) return json({ error: 'Could not compute an expiry for that TTL.' }, 400)
        const token = generateKioskToken()
        await env.DB.batch([
          env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
            .bind(`kiosk_device_token:${token}`, companyId),
          env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
            .bind(`kiosk_token_expiry:${token}`, expiresAt.toISOString()),
        ])
        return json({ token, companyId, expiresAt: expiresAt.toISOString(), ttl }, 201)
      }
      if (method === 'DELETE') {
        // Optional ?token= revokes one temp token; without it, rotate the
        // company's permanent token (and all of its temp tokens) as before.
        const target = url?.searchParams?.get('token') || ''
        if (target) {
          const ok = await revokeKioskToken(env, target)
          return json({ ok, message: ok ? 'Temporary token revoked.' : 'Token not found.' }, ok ? 200 : 404)
        }
        await env.DB.prepare("DELETE FROM settings WHERE key LIKE 'kiosk_device_token:%' AND value = ?").bind(companyId).run()
        await env.DB.prepare(
          "DELETE FROM settings WHERE key LIKE 'kiosk_token_expiry:%' AND key IN (SELECT key FROM settings WHERE key LIKE 'kiosk_device_token:%' AND value = ?)"
        ).bind(companyId).run().catch(() => {})
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
      // One device can serve ALL employees (54/55) — multiple fingerprint
      // credentials registered on the same kiosk are allowed. Each employee
      // keeps a single credential (re-registering replaces theirs). device_id
      // is recorded for auditing which kiosk enrolled the finger.
      let deviceIdNorm = deviceId ? String(deviceId).slice(0, 80) : null
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
  {
    const m = path.match(/^\/api\/webauthn\/credentials\/([^/]+)$/)
    if (m && method === 'DELETE') {
      if (!isAdmin) return json({ error: 'Administrator only.' }, 403)
      const email = decodeURIComponent(m[1]).toLowerCase()
      await env.DB.prepare('DELETE FROM webauthn_credentials WHERE lower(email) = ?').bind(email).run()
      return json({ ok: true })
    }
  }

  return null
}
