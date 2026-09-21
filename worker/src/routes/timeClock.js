import * as webAuthn from '../webauthn.js'
import { hmac, timingSafeEqual } from '../lib/crypto.js'
import { json, readJson, clampText, HttpError } from '../lib/http.js'
import {
  activeEmployee,
  createAttendanceEvent,
  deviceSigningSecret,
  recordRejectedEvent,
} from '../lib/timeClock.js'
import { normalizeTerminalBatch } from '../timeClockAdapters.js'

const MAX_BATCH_EVENTS = 250
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000

async function pilotEnabled(env, companyId) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?')
    .bind(`personal_time_clock_enabled:${companyId}`).first()
  return row?.value === '1'
}

async function siteBelongsToCompany(env, companyId, siteId) {
  if (!siteId) return true
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(`company_locations:${companyId}`).first()
  try {
    const locations = JSON.parse(row?.value || '{}')?.locations || []
    return locations.some((location) => String(location.id) === String(siteId))
  } catch { return false }
}

function safeUuid(value) {
  const normalized = String(value || '').trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(normalized)) {
    throw HttpError(400, 'A valid unique request ID is required.')
  }
  return normalized
}

function safeEvent(event) {
  if (!event.eventId || !event.terminalUserId || !event.occurredAt || !Number.isInteger(event.sequence) || event.sequence < 0) {
    throw HttpError(400, 'Each event needs eventId, terminalUserId, occurredAt, and a non-negative integer sequence.')
  }
  if (!['in', 'out'].includes(event.action)) throw HttpError(400, 'Each event action must be in or out.')
  if (!Number.isFinite(new Date(event.occurredAt).getTime())) throw HttpError(400, 'Each event occurrence time must be valid.')
}

export async function handlePublic({ request, env, path, method }) {
  if (path !== '/api/time-clock/device-events' || method !== 'POST') return null
  const deviceId = String(request.headers.get('X-Time-Clock-Device') || '').trim()
  const timestamp = String(request.headers.get('X-Time-Clock-Timestamp') || '').trim()
  const nonce = String(request.headers.get('X-Time-Clock-Nonce') || '').trim()
  const signature = String(request.headers.get('X-Time-Clock-Signature') || '').trim().toLowerCase()
  if (!deviceId || !timestamp || !nonce || !signature) return json({ error: 'Device authentication headers are required.' }, 401, request)
  const signedAt = Number(timestamp)
  if (!Number.isFinite(signedAt) || Math.abs(Date.now() - signedAt) > SIGNATURE_MAX_AGE_MS) {
    return json({ error: 'Device request timestamp is expired.' }, 401, request)
  }
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(nonce)) return json({ error: 'Device nonce is invalid.' }, 400, request)
  const device = await env.DB.prepare(
    `SELECT d.*, c.active AS company_active, c.status AS company_status
     FROM time_clock_devices d JOIN companies c ON c.id = d.company_id WHERE d.id = ? LIMIT 1`
  ).bind(deviceId).first()
  if (!device || device.active !== 1 || device.company_active !== 1 || device.company_status === 'rejected') {
    return json({ error: 'Device is unknown, revoked, or belongs to an inactive company.' }, 403, request)
  }
  if (!await siteBelongsToCompany(env, device.company_id, device.site_id)) {
    return json({ error: 'Device site is no longer assigned to its company.' }, 403, request)
  }
  const rawBody = await request.text()
  if (rawBody.length > 512000) return json({ error: 'Event batch is too large.' }, 413, request)
  const secret = await deviceSigningSecret(env, device)
  const expected = await hmac(`${timestamp}\n${nonce}\n${rawBody}`, secret)
  if (!timingSafeEqual(signature, expected)) return json({ error: 'Device signature is invalid.' }, 401, request)
  try {
    await env.DB.prepare('INSERT INTO time_clock_nonces (device_id, nonce, expires_at) VALUES (?, ?, ?)')
      .bind(device.id, nonce, Date.now() + SIGNATURE_MAX_AGE_MS).run()
  } catch (error) {
    if (/unique/i.test(String(error?.message || ''))) return json({ error: 'This device request was already received.' }, 409, request)
    throw error
  }
  await env.DB.prepare('DELETE FROM time_clock_nonces WHERE expires_at < ?').bind(Date.now()).run().catch(() => {})
  let payload
  try { payload = JSON.parse(rawBody) } catch { return json({ error: 'Request body must be valid JSON.' }, 400, request) }
  let events
  try { events = normalizeTerminalBatch(payload, device.adapter || 'generic-v1') } catch (error) { return json({ error: error.message }, 400, request) }
  if (!events.length || events.length > MAX_BATCH_EVENTS) return json({ error: `Send 1 to ${MAX_BATCH_EVENTS} events per batch.` }, 400, request)
  events.sort((a, b) => a.sequence - b.sequence)
  const receivedAt = new Date().toISOString()
  const results = []
  let highestSequence = Number(device.last_sequence ?? -1)
  let hasPriorSequence = device.last_sequence !== null && device.last_sequence !== undefined
  for (const event of events) {
    try {
      safeEvent(event)
      const mapping = await env.DB.prepare(
        `SELECT e.id, e.email, e.name, e.company_id, e.active, c.active AS company_active, c.status AS company_status
         FROM terminal_employee_mappings m
         JOIN employees e ON e.id = m.employee_id
         JOIN companies c ON c.id = e.company_id
         WHERE m.device_id = ? AND m.terminal_user_id = ? LIMIT 1`
      ).bind(device.id, event.terminalUserId).first()
      if (!mapping || mapping.company_id !== device.company_id || mapping.active !== 1 || mapping.company_active !== 1) {
        const reason = !mapping ? 'unknown_employee_mapping' : 'inactive_or_cross_company_employee'
        await recordRejectedEvent(env, { ...event, source: 'terminal', companyId: device.company_id, deviceId: device.id, siteId: device.site_id, receivedAt, reason, payload: event })
        results.push({ eventId: event.eventId, status: 'rejected', reason })
        continue
      }
      const sequenceReview = hasPriorSequence && (event.sequence <= highestSequence || event.sequence > highestSequence + 1)
      const result = await createAttendanceEvent(env, {
        eventId: event.eventId,
        source: 'terminal',
        employee: mapping,
        occurredAt: event.occurredAt,
        receivedAt,
        deviceId: device.id,
        siteId: device.site_id,
        sequence: event.sequence,
        explicitAction: event.action,
        forceReview: sequenceReview,
        payload: event,
      })
      highestSequence = Math.max(highestSequence, event.sequence)
      hasPriorSequence = true
      results.push({ eventId: event.eventId, status: result.duplicate ? 'duplicate' : result.reviewStatus, action: result.action })
    } catch (error) {
      const reason = error?.message || 'invalid_event'
      await recordRejectedEvent(env, { ...event, source: 'terminal', companyId: device.company_id, deviceId: device.id, siteId: device.site_id, receivedAt, reason, payload: event })
      results.push({ eventId: event.eventId, status: 'rejected', reason })
    }
  }
  await env.DB.prepare(
    'UPDATE time_clock_devices SET last_seen_at = ?, last_sequence = ?, updated_at = ? WHERE id = ?'
  ).bind(receivedAt, highestSequence, receivedAt, device.id).run()
  console.log(JSON.stringify({ event: 'time_clock_batch', deviceId: device.id, count: events.length, rejected: results.filter((item) => item.status === 'rejected').length }))
  return json({ receivedAt, results }, 202, request)
}

export async function handle({ request, env, url, path, method, claims, isAdmin }) {
  const email = String(claims.sub || '').toLowerCase()

  if (path === '/api/time-clock/passkeys' && method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT credential_id, label, created_at, last_used_at
       FROM webauthn_credentials WHERE lower(email) = ? AND revoked_at IS NULL ORDER BY created_at DESC`
    ).bind(email).all().then((result) => result.results || [])
    return json(rows.map((row) => ({ id: row.credential_id, name: row.label || 'Personal device', createdAt: row.created_at, lastUsedAt: row.last_used_at })))
  }

  if (path === '/api/time-clock/passkeys/register/options' && method === 'POST') {
    const employee = await activeEmployee(env, email)
    if (!await pilotEnabled(env, employee.company_id)) return json({ error: 'Personal phone clocking is not enabled for your company yet.' }, 403, request)
    return json(await webAuthn.buildRegistrationOptions(env, { username: email, request }), 200, request)
  }

  if (path === '/api/time-clock/passkeys/register/verify' && method === 'POST') {
    const employee = await activeEmployee(env, email)
    if (!await pilotEnabled(env, employee.company_id)) return json({ error: 'Personal phone clocking is not enabled for your company yet.' }, 403, request)
    const body = await readJson(request)
    if (!body.response) return json({ error: 'Passkey response is required.' }, 400, request)
    const registration = await webAuthn.registerCredential(env, { response: body.response })
    if (registration.email !== email) return json({ error: 'Passkey registration belongs to a different employee.' }, 403, request)
    const label = clampText(body.name, 60) || 'Personal device'
    const existing = await env.DB.prepare('SELECT email FROM webauthn_credentials WHERE credential_id = ?')
      .bind(registration.credentialId).first()
    if (existing && String(existing.email).toLowerCase() !== email) {
      return json({ error: 'This passkey is already registered to a different employee.' }, 409, request)
    }
    try {
      if (existing) {
        await env.DB.prepare(
          `UPDATE webauthn_credentials SET company_id = ?, public_key = ?, counter = ?, transports = ?, label = ?, revoked_at = NULL
           WHERE credential_id = ? AND lower(email) = ?`
        ).bind(employee.company_id, registration.publicKey, registration.counter, JSON.stringify(registration.transports || []), label, registration.credentialId, email).run()
      } else {
        await env.DB.prepare(
          `INSERT INTO webauthn_credentials
            (email, company_id, credential_id, public_key, counter, transports, label)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(email, employee.company_id, registration.credentialId, registration.publicKey, registration.counter, JSON.stringify(registration.transports || []), label).run()
      }
    } catch (error) {
      if (!/unique/i.test(String(error?.message || ''))) throw error
      return json({ error: 'This passkey is already registered.' }, 409, request)
    }
    return json({ ok: true, id: registration.credentialId, name: label }, 201, request)
  }

  {
    const match = path.match(/^\/api\/time-clock\/passkeys\/([^/]+)$/)
    if (match && method === 'DELETE') {
      const credentialId = decodeURIComponent(match[1])
      const result = await env.DB.prepare(
        'UPDATE webauthn_credentials SET revoked_at = ? WHERE credential_id = ? AND lower(email) = ? AND revoked_at IS NULL'
      ).bind(new Date().toISOString(), credentialId, email).run()
      if (!result.meta?.changes) return json({ error: 'Passkey not found.' }, 404, request)
      return json({ ok: true }, 200, request)
    }
  }

  if (path === '/api/time-clock/clock-options' && method === 'POST') {
    const employee = await activeEmployee(env, email)
    if (!await pilotEnabled(env, employee.company_id)) return json({ error: 'Personal phone clocking is not enabled for your company yet.' }, 403, request)
    return json(await webAuthn.buildAuthenticationOptions(env, { request, email }), 200, request)
  }

  if (path === '/api/time-clock/clock-punch' && method === 'POST') {
    const body = await readJson(request)
    const requestId = safeUuid(body.requestId)
    const prior = await env.DB.prepare(
      "SELECT id, punch_type, occurred_at, status FROM attendance_events WHERE source = 'personal-phone' AND event_id = ? AND lower(email) = ? LIMIT 1"
    ).bind(requestId, email).first()
    if (prior) return json({ duplicate: true, eventId: prior.id, action: prior.punch_type, time: prior.occurred_at, reviewStatus: prior.status }, 200, request)
    const employee = await activeEmployee(env, email)
    if (!await pilotEnabled(env, employee.company_id)) return json({ error: 'Personal phone clocking is not enabled for your company yet.' }, 403, request)
    if (!body.response) return json({ error: 'Passkey verification is required.' }, 400, request)
    const verified = await webAuthn.verifyAuthentication(env, { response: body.response })
    if (String(verified.email).toLowerCase() !== email) return json({ error: 'Passkey belongs to a different employee.' }, 403, request)
    const credentialOwner = await env.DB.prepare('SELECT company_id FROM webauthn_credentials WHERE credential_id = ? AND revoked_at IS NULL')
      .bind(verified.credentialId).first()
    if (!credentialOwner || credentialOwner.company_id !== employee.company_id) {
      return json({ error: 'This passkey is not registered to your current company.' }, 403, request)
    }
    const now = new Date().toISOString()
    const result = await createAttendanceEvent(env, {
      eventId: requestId,
      source: 'personal-phone',
      employee,
      occurredAt: now,
      receivedAt: now,
      deviceId: verified.credentialId,
      location: body.location,
    })
    console.log(JSON.stringify({ event: 'personal_time_clock_punch', companyId: employee.company_id, action: result.action, locationStatus: result.locationStatus }))
    return json(result, result.duplicate ? 200 : 201, request)
  }

  if (!path.startsWith('/api/time-clock/admin/')) return null
  if (!isAdmin) return json({ error: 'Administrator only.' }, 403, request)

  if (path === '/api/time-clock/admin/config' && method === 'GET') {
    const companyId = url.searchParams.get('companyId') || ''
    return json({ personalPhoneEnabled: companyId ? await pilotEnabled(env, companyId) : false }, 200, request)
  }
  if (path === '/api/time-clock/admin/config' && method === 'PUT') {
    const body = await readJson(request)
    if (!body.companyId) return json({ error: 'companyId is required.' }, 400, request)
    const company = await env.DB.prepare('SELECT id FROM companies WHERE id = ?').bind(body.companyId).first()
    if (!company) return json({ error: 'Company not found.' }, 404, request)
    await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .bind(`personal_time_clock_enabled:${body.companyId}`, body.personalPhoneEnabled ? '1' : '0').run()
    return json({ ok: true, personalPhoneEnabled: !!body.personalPhoneEnabled }, 200, request)
  }

  if (path === '/api/time-clock/admin/devices' && method === 'GET') {
    const companyId = url.searchParams.get('companyId') || ''
    if (!companyId) return json({ error: 'companyId is required.' }, 400, request)
    const rows = await env.DB.prepare(
      `SELECT d.*,
        (SELECT COUNT(*) FROM terminal_employee_mappings m WHERE m.device_id = d.id) AS mapping_count,
        (SELECT COUNT(*) FROM attendance_events a WHERE a.device_id = d.id AND a.status IN ('rejected','needs_review')) AS issue_count
       FROM time_clock_devices d WHERE d.company_id = ? ORDER BY d.created_at DESC`
    ).bind(companyId).all().then((result) => result.results || [])
    return json(rows, 200, request)
  }
  if (path === '/api/time-clock/admin/devices' && method === 'POST') {
    const body = await readJson(request)
    const name = clampText(body.name, 80)
    if (!body.companyId || !name) return json({ error: 'companyId and name are required.' }, 400, request)
    if (!env.TIME_CLOCK_DEVICE_MASTER_SECRET) return json({ error: 'Terminal signing secret is not configured on this server.' }, 503, request)
    const company = await env.DB.prepare('SELECT id FROM companies WHERE id = ?').bind(body.companyId).first()
    if (!company) return json({ error: 'Company not found.' }, 404, request)
    const device = {
      id: `tc_${crypto.randomUUID()}`,
      company_id: body.companyId,
      site_id: clampText(body.siteId, 100),
      name,
      vendor: clampText(body.vendor, 80),
      model: clampText(body.model, 80),
      secret_version: 1,
    }
    if (!await siteBelongsToCompany(env, device.company_id, device.site_id)) return json({ error: 'Selected site does not belong to this company.' }, 403, request)
    await env.DB.prepare(
      'INSERT INTO time_clock_devices (id, company_id, site_id, name, vendor, model) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(device.id, device.company_id, device.site_id, device.name, device.vendor, device.model).run()
    const signingSecret = await deviceSigningSecret(env, device)
    return json({ device, signingSecret, note: 'Copy this signing secret now. It is not stored in the database.' }, 201, request)
  }

  {
    const match = path.match(/^\/api\/time-clock\/admin\/devices\/([^/]+)$/)
    if (match && method === 'PUT') {
      const body = await readJson(request)
      const id = decodeURIComponent(match[1])
      const current = await env.DB.prepare('SELECT company_id, site_id FROM time_clock_devices WHERE id = ?').bind(id).first()
      if (!current) return json({ error: 'Device not found.' }, 404, request)
      const nextSite = body.siteId === undefined ? current.site_id : clampText(body.siteId, 100)
      if (!await siteBelongsToCompany(env, current.company_id, nextSite)) return json({ error: 'Selected site does not belong to this company.' }, 403, request)
      await env.DB.prepare(
        'UPDATE time_clock_devices SET name = COALESCE(?, name), site_id = ?, vendor = COALESCE(?, vendor), model = COALESCE(?, model), active = COALESCE(?, active), updated_at = ? WHERE id = ?'
      ).bind(clampText(body.name, 80), nextSite, clampText(body.vendor, 80), clampText(body.model, 80), typeof body.active === 'boolean' ? (body.active ? 1 : 0) : null, new Date().toISOString(), id).run()
      return json({ ok: true }, 200, request)
    }
  }
  {
    const match = path.match(/^\/api\/time-clock\/admin\/devices\/([^/]+)\/rotate-secret$/)
    if (match && method === 'POST') {
      if (!env.TIME_CLOCK_DEVICE_MASTER_SECRET) return json({ error: 'Terminal signing secret is not configured on this server.' }, 503, request)
      const id = decodeURIComponent(match[1])
      await env.DB.prepare('UPDATE time_clock_devices SET secret_version = secret_version + 1, updated_at = ? WHERE id = ?')
        .bind(new Date().toISOString(), id).run()
      const device = await env.DB.prepare('SELECT * FROM time_clock_devices WHERE id = ?').bind(id).first()
      if (!device) return json({ error: 'Device not found.' }, 404, request)
      return json({ signingSecret: await deviceSigningSecret(env, device), secretVersion: device.secret_version }, 200, request)
    }
  }

  if (path === '/api/time-clock/admin/mappings' && method === 'GET') {
    const deviceId = url.searchParams.get('deviceId') || ''
    const rows = await env.DB.prepare(
      `SELECT m.id, m.device_id, m.terminal_user_id, m.employee_id, e.name, e.email
       FROM terminal_employee_mappings m JOIN employees e ON e.id = m.employee_id
       WHERE m.device_id = ? ORDER BY e.name`
    ).bind(deviceId).all().then((result) => result.results || [])
    return json(rows, 200, request)
  }
  if (path === '/api/time-clock/admin/mappings' && method === 'POST') {
    const body = await readJson(request)
    const terminalUserId = clampText(body.terminalUserId, 100)
    const device = await env.DB.prepare('SELECT * FROM time_clock_devices WHERE id = ?').bind(body.deviceId).first()
    const employee = await env.DB.prepare('SELECT id, company_id FROM employees WHERE id = ?').bind(Number(body.employeeId)).first()
    if (!device || !employee || !terminalUserId) return json({ error: 'Valid device, employee, and terminal user ID are required.' }, 400, request)
    if (device.company_id !== employee.company_id) return json({ error: 'Employee and terminal must belong to the same company.' }, 403, request)
    await env.DB.prepare(
      `INSERT INTO terminal_employee_mappings (device_id, terminal_user_id, employee_id) VALUES (?, ?, ?)
       ON CONFLICT(device_id, terminal_user_id) DO UPDATE SET employee_id = excluded.employee_id`
    ).bind(device.id, terminalUserId, employee.id).run()
    return json({ ok: true }, 201, request)
  }
  {
    const match = path.match(/^\/api\/time-clock\/admin\/mappings\/(\d+)$/)
    if (match && method === 'DELETE') {
      await env.DB.prepare('DELETE FROM terminal_employee_mappings WHERE id = ?').bind(Number(match[1])).run()
      return json({ ok: true }, 200, request)
    }
  }

  if (path === '/api/time-clock/admin/events' && method === 'GET') {
    const companyId = url.searchParams.get('companyId') || ''
    const rows = await env.DB.prepare(
      `SELECT a.*, d.name AS device_name FROM attendance_events a
       LEFT JOIN time_clock_devices d ON d.id = a.device_id
       WHERE a.company_id = ? AND a.status IN ('rejected','needs_review')
       ORDER BY a.received_at DESC LIMIT 200`
    ).bind(companyId).all().then((result) => result.results || [])
    return json(rows, 200, request)
  }

  if (path === '/api/time-clock/admin/simulator' && method === 'POST') {
    const body = await readJson(request)
    const device = await env.DB.prepare('SELECT * FROM time_clock_devices WHERE id = ? AND active = 1').bind(body.deviceId).first()
    if (!device) return json({ error: 'Active device not found.' }, 404, request)
    const event = normalizeTerminalBatch({ events: [{
      eventId: body.eventId || `sim_${crypto.randomUUID()}`,
      terminalUserId: body.terminalUserId,
      occurredAt: body.occurredAt || new Date().toISOString(),
      sequence: Number.isInteger(body.sequence) ? body.sequence : Number(device.last_sequence ?? -1) + 1,
      action: body.action,
    }] })[0]
    safeEvent(event)
    const rawBody = JSON.stringify({ events: [event] })
    const timestamp = String(Date.now())
    const nonce = `sim_${crypto.randomUUID()}`
    const signature = await hmac(`${timestamp}\n${nonce}\n${rawBody}`, await deviceSigningSecret(env, device))
    const simulatedRequest = new Request(new URL('/api/time-clock/device-events', url), {
      method: 'POST',
      body: rawBody,
      headers: {
        'Content-Type': 'application/json',
        'X-Time-Clock-Device': device.id,
        'X-Time-Clock-Timestamp': timestamp,
        'X-Time-Clock-Nonce': nonce,
        'X-Time-Clock-Signature': signature,
      },
    })
    return handlePublic({ request: simulatedRequest, env, path: '/api/time-clock/device-events', method: 'POST' })
  }

  return null
}
