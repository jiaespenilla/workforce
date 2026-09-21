import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { hmac } from '../lib/crypto.js'
import { handle, handlePublic } from './timeClock.js'

const schema = `
CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, name TEXT, active INTEGER, status TEXT);
CREATE TABLE IF NOT EXISTS employees (id INTEGER PRIMARY KEY, email TEXT, name TEXT, company_id TEXT, active INTEGER);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT, attempt_at TEXT);
CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, company_id TEXT, type TEXT, time TEXT, overtime INTEGER, overtime_minutes INTEGER, source_event_id TEXT, source TEXT, device_id TEXT, site_id TEXT, received_at TEXT, latitude REAL, longitude REAL, accuracy REAL, location_status TEXT, needs_review INTEGER);
CREATE TABLE IF NOT EXISTS time_clock_devices (id TEXT PRIMARY KEY, company_id TEXT, site_id TEXT, name TEXT, vendor TEXT, model TEXT, adapter TEXT DEFAULT 'generic-v1', secret_version INTEGER, active INTEGER, last_seen_at TEXT, last_sequence INTEGER, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS terminal_employee_mappings (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT, terminal_user_id TEXT, employee_id INTEGER, UNIQUE(device_id, terminal_user_id));
CREATE TABLE IF NOT EXISTS time_clock_nonces (device_id TEXT, nonce TEXT, expires_at INTEGER, PRIMARY KEY(device_id, nonce));
CREATE TABLE IF NOT EXISTS time_clock_pairing_codes (id TEXT PRIMARY KEY, device_id TEXT, code_hash TEXT UNIQUE, expires_at INTEGER, used_at TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS time_clock_kiosk_sessions (id TEXT PRIMARY KEY, device_id TEXT, token_hash TEXT UNIQUE, label TEXT, active INTEGER DEFAULT 1, paired_at TEXT, last_seen_at TEXT, revoked_at TEXT);
CREATE TABLE IF NOT EXISTS attendance_events (id TEXT PRIMARY KEY, event_id TEXT, source TEXT, employee_id INTEGER, email TEXT, company_id TEXT, device_id TEXT, site_id TEXT, occurred_at TEXT, received_at TEXT, punch_type TEXT, sequence INTEGER, status TEXT, rejection_reason TEXT, latitude REAL, longitude REAL, accuracy REAL, location_status TEXT, payload_json TEXT, created_at TEXT, UNIQUE(source, device_id, event_id));
`

async function seed() {
  await env.DB.exec(schema)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM attendance'),
    env.DB.prepare('DELETE FROM attendance_events'),
    env.DB.prepare('DELETE FROM time_clock_nonces'),
    env.DB.prepare('DELETE FROM time_clock_kiosk_sessions'),
    env.DB.prepare('DELETE FROM time_clock_pairing_codes'),
    env.DB.prepare('DELETE FROM terminal_employee_mappings'),
    env.DB.prepare('DELETE FROM time_clock_devices'),
    env.DB.prepare('DELETE FROM employees'),
    env.DB.prepare('DELETE FROM companies'),
    env.DB.prepare('DELETE FROM settings'),
    env.DB.prepare('DELETE FROM login_attempts'),
  ])
  await env.DB.batch([
    env.DB.prepare("INSERT OR REPLACE INTO companies (id, name, active, status) VALUES ('co-1', 'Acme', 1, 'approved')"),
    env.DB.prepare("INSERT OR REPLACE INTO employees (id, email, name, company_id, active) VALUES (1, 'emp@acme.com', 'Employee', 'co-1', 1)"),
    env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind('company_locations:co-1', JSON.stringify({ locations: [{ id: 'site-1', name: 'HQ' }] })),
    env.DB.prepare("INSERT OR REPLACE INTO time_clock_devices (id, company_id, site_id, name, secret_version, active) VALUES ('terminal-1', 'co-1', 'site-1', 'Front door', 1, 1)"),
    env.DB.prepare("INSERT OR REPLACE INTO terminal_employee_mappings (device_id, terminal_user_id, employee_id) VALUES ('terminal-1', '1001', 1)"),
  ])
}

async function signedRequest(body, { nonce = crypto.randomUUID(), timestamp = Date.now(), signature } = {}) {
  const raw = JSON.stringify(body)
  const derived = await hmac('device:terminal-1:v1', env.TIME_CLOCK_DEVICE_MASTER_SECRET)
  const signed = signature || await hmac(`${timestamp}\n${nonce}\n${raw}`, derived)
  return new Request('https://app.example/api/time-clock/device-events', {
    method: 'POST', body: raw,
    headers: {
      'Content-Type': 'application/json',
      'X-Time-Clock-Device': 'terminal-1',
      'X-Time-Clock-Timestamp': String(timestamp),
      'X-Time-Clock-Nonce': nonce,
      'X-Time-Clock-Signature': signed,
    },
  })
}

const event = (overrides = {}) => ({
  eventId: 'event-0001', terminalUserId: '1001', occurredAt: new Date().toISOString(), sequence: 1, action: 'in', ...overrides,
})

async function send(request) {
  return handlePublic({ request, env, path: '/api/time-clock/device-events', method: 'POST' })
}

async function adminRequest(path, body) {
  const request = new Request(`https://app.example${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
  })
  return handle({ request, env, url: new URL(request.url), path, method: 'POST', claims: { sub: 'admin', role: 'administrator' }, isAdmin: true })
}

async function pairKiosk() {
  const codeResponse = await adminRequest('/api/time-clock/admin/devices/terminal-1/pairing-code')
  const { code } = await codeResponse.json()
  const storedCode = await env.DB.prepare('SELECT code_hash FROM time_clock_pairing_codes').first()
  expect(storedCode.code_hash).not.toContain(code)
  const request = new Request('https://app.example/api/time-clock/kiosk/pair', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.10' },
    body: JSON.stringify({ code, name: 'Front desk PC' }),
  })
  const response = await handlePublic({ request, env, path: '/api/time-clock/kiosk/pair', method: 'POST' })
  return response.json()
}

describe('signed terminal batches in the Workers runtime', () => {
  beforeEach(seed)

  it('accepts a valid signed event and creates immutable source + attendance rows', async () => {
    const response = await send(await signedRequest({ events: [event()] }))
    expect(response.status).toBe(202)
    expect((await response.json()).results[0].status).toBe('accepted')
    expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM attendance_events').first()).count).toBe(1)
    expect((await env.DB.prepare('SELECT source, device_id FROM attendance').first())).toEqual(expect.objectContaining({ source: 'terminal', device_id: 'terminal-1' }))
  })

  it('runs the administrator simulator through the same signed ingestion path', async () => {
    const request = new Request('https://app.example/api/time-clock/admin/simulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'terminal-1', terminalUserId: '1001', action: 'in' }),
    })
    const response = await handle({
      request,
      env,
      url: new URL(request.url),
      path: '/api/time-clock/admin/simulator',
      method: 'POST',
      claims: { sub: 'admin', role: 'administrator' },
      isAdmin: true,
    })
    expect(response.status).toBe(202)
    expect((await response.json()).results[0]).toEqual(expect.objectContaining({ status: 'accepted', action: 'in' }))
    expect((await env.DB.prepare('SELECT source FROM attendance').first()).source).toBe('terminal')
  })

  it('pairs a standalone kiosk once and records scans without an employee login', async () => {
    const { token } = await pairKiosk()
    expect(token).toBeTruthy()
    const stored = await env.DB.prepare('SELECT token_hash FROM time_clock_kiosk_sessions').first()
    expect(stored.token_hash).not.toContain(token)

    const statusRequest = new Request('https://app.example/api/time-clock/kiosk/status', { headers: { 'X-Time-Clock-Kiosk': token } })
    const status = await handlePublic({ request: statusRequest, env, path: '/api/time-clock/kiosk/status', method: 'GET' })
    expect(await status.json()).toEqual(expect.objectContaining({ paired: true, deviceName: 'Front door', companyName: 'Acme' }))

    const punchRequest = new Request('https://app.example/api/time-clock/kiosk/punch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Time-Clock-Kiosk': token },
      body: JSON.stringify({ eventId: 'kiosk-event-0001', terminalUserId: '1001' }),
    })
    const punch = await handlePublic({ request: punchRequest, env, path: '/api/time-clock/kiosk/punch', method: 'POST' })
    expect(punch.status).toBe(201)
    expect(await punch.json()).toEqual(expect.objectContaining({ action: 'in', employeeName: 'Employee' }))
    expect(await env.DB.prepare('SELECT source FROM attendance').first()).toEqual({ source: 'standalone-kiosk' })
  })

  it('rejects invalid pairing codes and revokes every paired browser from admin setup', async () => {
    const badRequest = new Request('https://app.example/api/time-clock/kiosk/pair', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.11' },
      body: JSON.stringify({ code: 'BADCODE2' }),
    })
    const bad = await handlePublic({ request: badRequest, env, path: '/api/time-clock/kiosk/pair', method: 'POST' })
    expect(bad.status).toBe(401)

    const { token } = await pairKiosk()
    const unpair = await adminRequest('/api/time-clock/admin/devices/terminal-1/unpair-kiosks')
    expect(await unpair.json()).toEqual(expect.objectContaining({ ok: true, revoked: 1 }))
    const statusRequest = new Request('https://app.example/api/time-clock/kiosk/status', { headers: { 'X-Time-Clock-Kiosk': token } })
    await expect(handlePublic({ request: statusRequest, env, path: '/api/time-clock/kiosk/status', method: 'GET' }))
      .rejects.toMatchObject({ status: 401 })
  })

  it('blocks a replayed nonce before a second attendance row can be created', async () => {
    const nonce = 'nonce-replay-0001'
    const body = { events: [event()] }
    expect((await send(await signedRequest(body, { nonce }))).status).toBe(202)
    expect((await send(await signedRequest(body, { nonce }))).status).toBe(409)
    expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM attendance').first()).count).toBe(1)
  })

  it('treats a repeated event ID with a fresh request as a harmless duplicate', async () => {
    const body = { events: [event()] }
    expect((await send(await signedRequest(body))).status).toBe(202)
    const response = await send(await signedRequest(body))
    expect((await response.json()).results[0].status).toBe('duplicate')
    expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM attendance').first()).count).toBe(1)
  })

  it('rejects an invalid signature', async () => {
    const response = await send(await signedRequest({ events: [event()] }, { signature: '0'.repeat(64) }))
    expect(response.status).toBe(401)
    expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM attendance').first()).count).toBe(0)
  })

  it('blocks expired requests and revoked devices', async () => {
    expect((await send(await signedRequest({ events: [event()] }, { timestamp: Date.now() - 10 * 60 * 1000 }))).status).toBe(401)
    await env.DB.prepare("UPDATE time_clock_devices SET active = 0 WHERE id = 'terminal-1'").run()
    expect((await send(await signedRequest({ events: [event()] }))).status).toBe(403)
  })

  it('keeps unknown employee mappings as rejected events without changing attendance', async () => {
    const response = await send(await signedRequest({ events: [event({ eventId: 'event-unknown', terminalUserId: 'missing' })] }))
    expect(response.status).toBe(202)
    expect((await response.json()).results[0].status).toBe('rejected')
    expect((await env.DB.prepare('SELECT status, rejection_reason FROM attendance_events').first())).toEqual(expect.objectContaining({ status: 'rejected', rejection_reason: 'unknown_employee_mapping' }))
    expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM attendance').first()).count).toBe(0)
  })

  it('rejects a mapping that crosses company ownership', async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT OR REPLACE INTO companies (id, name, active, status) VALUES ('co-2', 'Other Co', 1, 'approved')"),
      env.DB.prepare("INSERT OR REPLACE INTO employees (id, email, name, company_id, active) VALUES (2, 'other@acme.com', 'Other', 'co-2', 1)"),
      env.DB.prepare("INSERT OR REPLACE INTO terminal_employee_mappings (device_id, terminal_user_id, employee_id) VALUES ('terminal-1', '2002', 2)"),
    ])
    const response = await send(await signedRequest({ events: [event({ eventId: 'event-cross', terminalUserId: '2002' })] }))
    expect((await response.json()).results[0]).toEqual(expect.objectContaining({ status: 'rejected', reason: 'inactive_or_cross_company_employee' }))
    expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM attendance').first()).count).toBe(0)
  })

  it('accepts an offline event but flags it for review instead of rewriting history silently', async () => {
    const delayed = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const response = await send(await signedRequest({ events: [event({ eventId: 'event-offline', occurredAt: delayed })] }))
    expect((await response.json()).results[0].status).toBe('needs_review')
    expect((await env.DB.prepare('SELECT needs_review FROM attendance').first()).needs_review).toBe(1)
  })

  it('flags out-of-order terminal sequences for review', async () => {
    const first = await send(await signedRequest({ events: [event({ eventId: 'event-seq-2', sequence: 2 })] }))
    expect(first.status).toBe(202)
    const second = await send(await signedRequest({ events: [event({ eventId: 'event-seq-1', sequence: 1, action: 'out' })] }))
    expect((await second.json()).results[0].status).toBe('needs_review')
  })
})
