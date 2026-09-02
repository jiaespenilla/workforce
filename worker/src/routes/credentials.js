// Kiosk credential management — QR codes, fingerprint tokens, PINs.

import { sha256, hashPassword } from '../lib/crypto.js'
import { json, readJson } from '../lib/http.js'

export async function handle({ request, env, _url, path, method, claims, isAdmin }) {
  /* credentials management — admins manage anyone; users manage their own */
  if (path === '/api/credentials/qr' && method === 'POST') {
    const { email } = await readJson(request)
    if (!email) return json({ error: 'Email is required.' }, 400)
    const target = email.toLowerCase()
    if (!isAdmin && claims.sub !== target) return json({ error: 'Forbidden' }, 403)
    const existing = await env.DB.prepare('SELECT qr_code FROM employee_credentials WHERE email = ?').bind(target).first()
    if (existing?.qr_code) return json({ code: existing.qr_code })
    const code = 'UWQ-' + (await sha256(target)).slice(0, 16).toUpperCase()
    await env.DB.prepare(
      `INSERT INTO employee_credentials (email, qr_code) VALUES (?, ?)
       ON CONFLICT(email) DO UPDATE SET qr_code = excluded.qr_code`
    ).bind(target, code).run()
    return json({ code })
  }
  if (path === '/api/credentials' && method === 'POST') {
    const { email, kind, value } = await readJson(request)
    if (!email || !kind || !value) return json({ error: 'email, kind and value are required.' }, 400)
    const e = email.toLowerCase()
    // Users may only register their own credentials; admins can register anyone.
    if (!isAdmin && claims.sub !== e) return json({ error: 'Forbidden' }, 403)
    if (kind === 'fingerprint') {
      await env.DB.prepare(
        `INSERT INTO employee_credentials (email, fp_token) VALUES (?, ?)
         ON CONFLICT(email) DO UPDATE SET fp_token = excluded.fp_token`
      ).bind(e, value).run()
    } else if (kind === 'pin') {
      const salt = crypto.randomUUID()
      await env.DB.prepare(
        `INSERT INTO employee_credentials (email, pin_salt, pin_hash) VALUES (?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET pin_salt = excluded.pin_salt, pin_hash = excluded.pin_hash`
      ).bind(e, salt, await hashPassword(value, salt)).run()
    } else {
      return json({ error: 'Unknown credential kind.' }, 400)
    }
    return json({ ok: true })
  }

  {
    const m = path.match(/^\/api\/credentials\/([^/]+)$/)
    if (m && method === 'GET') {
      const targetEmail = decodeURIComponent(m[1]).toLowerCase()
      // Users may only view their own credentials; admins can view any.
      if (!isAdmin && claims.sub !== targetEmail) return json({ error: 'Forbidden' }, 403)
      const row = await env.DB.prepare('SELECT * FROM employee_credentials WHERE email = ?').bind(targetEmail).first()
      const wRow = await env.DB.prepare('SELECT credential_id FROM webauthn_credentials WHERE lower(email) = lower(?)').bind(targetEmail).first()
      return json({
        fpToken: row?.fp_token || (wRow ? 'webauthn-registered' : null),
        webauthn: !!wRow,
        pinSet: !!row?.pin_hash,
        qrCode: row?.qr_code || null,
      })
    }
  }

  return null
}
