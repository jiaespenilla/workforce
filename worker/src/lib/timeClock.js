import { hmac } from './crypto.js'
import { HttpError } from './http.js'

export function normalizeLocation(value) {
  const status = ['granted', 'denied', 'unavailable', 'unsupported'].includes(value?.status)
    ? value.status
    : 'unavailable'
  const latitude = value?.latitude == null ? NaN : Number(value.latitude)
  const longitude = value?.longitude == null ? NaN : Number(value.longitude)
  const accuracy = Number(value?.accuracy)
  if (status !== 'granted' || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { status, latitude: null, longitude: null, accuracy: null }
  }
  return {
    status,
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
  }
}

function timeZoneName(value) {
  const match = String(value || '').match(/([A-Za-z_]+\/[A-Za-z_+-]+)$/)
  if (!match) return 'Asia/Manila'
  try {
    new Intl.DateTimeFormat('en', { timeZone: match[1] })
    return match[1]
  } catch {
    return 'Asia/Manila'
  }
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type) => parts.find((part) => part.type === type)?.value || ''
  return { dateKey: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) }
}

export function decideAttendanceAction(punches, shift, now = new Date(), timeZone = 'UTC', explicitAction = null) {
  const sorted = [...(punches || [])].sort((a, b) => new Date(a.time) - new Date(b.time))
  const lastAny = sorted[sorted.length - 1]
  const action = explicitAction === 'in' || explicitAction === 'out'
    ? explicitAction : lastAny?.type === 'in' ? 'out' : 'in'
  if (action !== 'out' || lastAny?.type !== 'in') return { action, overtime: false, overtimeMinutes: 0 }

  // Attribute overnight work to the day on which the session began.
  const workday = zonedParts(new Date(lastAny.time), timeZone).dateKey
  let open = null
  let earlierMinutes = 0
  for (const punch of sorted.slice(0, -1)) {
    if (punch.type === 'in') open = punch
    else if (punch.type === 'out' && open) {
      if (zonedParts(new Date(open.time), timeZone).dateKey === workday) {
        earlierMinutes += Math.max(0, Math.round((new Date(punch.time) - new Date(open.time)) / 60000))
      }
      open = null
    }
  }
  const sessionMinutes = Math.max(0, Math.round((now - new Date(lastAny.time)) / 60000))
  const overtimeMinutes = Math.max(0, earlierMinutes + sessionMinutes - 480) - Math.max(0, earlierMinutes - 480)
  return { action, overtime: overtimeMinutes > 0, overtimeMinutes }
}

export async function activeEmployee(env, email) {
  const row = await env.DB.prepare(
    `SELECT e.id, e.email, e.name, e.company_id, e.active, c.active AS company_active, c.status AS company_status
     FROM employees e JOIN companies c ON c.id = e.company_id
     WHERE lower(e.email) = lower(?) LIMIT 1`
  ).bind(email).first()
  if (!row || row.active !== 1 || row.company_active !== 1 || row.company_status === 'rejected') {
    throw HttpError(403, 'Your employee or company account is not active.')
  }
  return row
}

const TERMINAL_EMPLOYEE_SELECT = `SELECT e.id, e.email, e.name, e.company_id, e.active,
  c.active AS company_active, c.status AS company_status
  FROM employees e JOIN companies c ON c.id = e.company_id`

// Automatic mappings use the employee's stable app ID as the terminal ID.
// Manual mappings remain authoritative when a vendor assigns a different ID.
export async function syncAutomaticMappings(env, { companyId, deviceId = null, employeeId = null }) {
  if (deviceId) {
    return env.DB.prepare(
      `INSERT OR IGNORE INTO terminal_employee_mappings (device_id, terminal_user_id, employee_id)
       SELECT ?, CAST(id AS TEXT), id FROM employees WHERE company_id = ? AND active = 1`
    ).bind(deviceId, companyId).run()
  }
  if (employeeId) {
    return env.DB.prepare(
      `INSERT OR IGNORE INTO terminal_employee_mappings (device_id, terminal_user_id, employee_id)
       SELECT id, CAST(? AS TEXT), ? FROM time_clock_devices WHERE company_id = ? AND active = 1`
    ).bind(employeeId, employeeId, companyId).run()
  }
  return { meta: { changes: 0 } }
}

export async function employeeForTerminal(env, { deviceId, companyId, terminalUserId }) {
  const value = String(terminalUserId || '').trim()
  let employee = await env.DB.prepare(
    `${TERMINAL_EMPLOYEE_SELECT}
     JOIN terminal_employee_mappings m ON m.employee_id = e.id
     WHERE m.device_id = ? AND m.terminal_user_id = ? LIMIT 1`
  ).bind(deviceId, value).first()
  if (employee) return employee

  // Recover safely when an old device has not yet been synchronized. Only an
  // exact app employee ID or exact company email can create an automatic map.
  employee = /^\d+$/.test(value)
    ? await env.DB.prepare(`${TERMINAL_EMPLOYEE_SELECT} WHERE e.company_id = ? AND e.id = ? LIMIT 1`)
      .bind(companyId, Number(value)).first()
    : value.includes('@')
      ? await env.DB.prepare(`${TERMINAL_EMPLOYEE_SELECT} WHERE e.company_id = ? AND lower(e.email) = lower(?) LIMIT 1`)
        .bind(companyId, value).first()
      : null
  if (!employee) return null

  await env.DB.prepare(
    'INSERT OR IGNORE INTO terminal_employee_mappings (device_id, terminal_user_id, employee_id) VALUES (?, ?, ?)'
  ).bind(deviceId, value, employee.id).run()
  return env.DB.prepare(
    `${TERMINAL_EMPLOYEE_SELECT}
     JOIN terminal_employee_mappings m ON m.employee_id = e.id
     WHERE m.device_id = ? AND m.terminal_user_id = ? LIMIT 1`
  ).bind(deviceId, value).first()
}

async function assignedShift(env, employee) {
  const [shiftRow, timezoneRow] = await Promise.all([
    env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(`shift_schedules:${employee.company_id}`).first(),
    env.DB.prepare("SELECT value FROM settings WHERE key = 'timezone'").first(),
  ])
  let data = { shifts: [], assignments: {} }
  try { data = JSON.parse(shiftRow?.value || '{}') } catch { /* no configured shift */ }
  const shiftId = data.assignments?.[employee.email] || data.assignments?.[String(employee.email).toLowerCase()]
  return {
    shift: (data.shifts || []).find((item) => item.id === shiftId) || null,
    timeZone: timeZoneName(timezoneRow?.value),
  }
}

async function priorPunches(env, email) {
  return env.DB.prepare('SELECT type, time FROM attendance WHERE lower(email) = lower(?) ORDER BY time DESC LIMIT 100')
    .bind(email).all().then((result) => result.results || [])
}

export async function deviceSigningSecret(env, device) {
  if (!env.TIME_CLOCK_DEVICE_MASTER_SECRET) {
    throw HttpError(503, 'Terminal signing is not configured on this server.')
  }
  return hmac(`device:${device.id}:v${device.secret_version}`, env.TIME_CLOCK_DEVICE_MASTER_SECRET)
}

export async function createAttendanceEvent(env, {
  eventId, source, employee, occurredAt, receivedAt = new Date().toISOString(),
  deviceId = null, siteId = null, sequence = null, explicitAction = null,
  location = null, forceReview = false, payload = null,
}) {
  const duplicate = await env.DB.prepare(
    'SELECT id, status, punch_type, occurred_at FROM attendance_events WHERE source = ? AND device_id IS ? AND event_id = ? LIMIT 1'
  ).bind(source, deviceId, eventId).first()
  if (duplicate) return { duplicate: true, eventId: duplicate.id, reviewStatus: duplicate.status, action: duplicate.punch_type, time: duplicate.occurred_at }

  const occurrence = new Date(occurredAt)
  if (!Number.isFinite(occurrence.getTime())) throw HttpError(400, 'Event occurrence time is invalid.')
  const { shift, timeZone } = await assignedShift(env, employee)
  const punches = await priorPunches(env, employee.email)
  const newestPunch = punches[0]
  const elapsedSinceLast = newestPunch ? occurrence.getTime() - new Date(newestPunch.time).getTime() : Infinity
  if (elapsedSinceLast >= 0 && elapsedSinceLast < 60_000) {
    return { duplicate: true, action: newestPunch.type, time: newestPunch.time, reviewStatus: 'accepted' }
  }
  if ((explicitAction === 'in' && newestPunch?.type === 'in') ||
      (explicitAction === 'out' && newestPunch?.type !== 'in')) {
    throw HttpError(409, 'Punch order conflicts with the employee’s latest recorded punch.')
  }
  const decision = decideAttendanceAction(punches, shift, occurrence, timeZone, explicitAction)
  const normalizedLocation = normalizeLocation(location)
  const eventRowId = crypto.randomUUID()
  const receivedMs = new Date(receivedAt).getTime()
  const delayed = receivedMs - occurrence.getTime() > 15 * 60 * 1000
  const clockSkew = occurrence.getTime() - receivedMs > 5 * 60 * 1000
  const newest = punches[0] ? new Date(punches[0].time).getTime() : 0
  const outOfOrder = newest > occurrence.getTime()
  const needsReview = forceReview || delayed || clockSkew || outOfOrder
  const status = needsReview ? 'needs_review' : 'accepted'

  const eventStmt = env.DB.prepare(
    `INSERT INTO attendance_events
      (id, event_id, source, employee_id, email, company_id, device_id, site_id,
       occurred_at, received_at, punch_type, sequence, status, latitude, longitude,
       accuracy, location_status, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    eventRowId, eventId, source, employee.id, employee.email.toLowerCase(), employee.company_id,
    deviceId, siteId, occurrence.toISOString(), receivedAt, decision.action, sequence, status,
    normalizedLocation.latitude, normalizedLocation.longitude, normalizedLocation.accuracy,
    normalizedLocation.status, payload ? JSON.stringify(payload).slice(0, 4000) : null
  )
  const attendanceStmt = env.DB.prepare(
    `INSERT INTO attendance
      (email, company_id, type, time, overtime, overtime_minutes, source_event_id,
       source, device_id, site_id, received_at, latitude, longitude, accuracy,
       location_status, needs_review)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    employee.email.toLowerCase(), employee.company_id, decision.action, occurrence.toISOString(),
    decision.overtime ? 1 : 0, decision.overtimeMinutes, eventRowId, source, deviceId, siteId,
    receivedAt, normalizedLocation.latitude, normalizedLocation.longitude,
    normalizedLocation.accuracy, normalizedLocation.status, needsReview ? 1 : 0
  )
  try {
    const results = await env.DB.batch([eventStmt, attendanceStmt])
    return {
      duplicate: false,
      id: results[1]?.meta?.last_row_id,
      eventId: eventRowId,
      action: decision.action,
      time: occurrence.toISOString(),
      overtime: decision.overtime,
      overtimeMinutes: decision.overtimeMinutes,
      reviewStatus: status,
      locationStatus: normalizedLocation.status,
    }
  } catch (error) {
    if (/unique/i.test(String(error?.message || ''))) {
      return createAttendanceEvent(env, { eventId, source, employee, occurredAt, receivedAt, deviceId, siteId, sequence, explicitAction, location, forceReview, payload })
    }
    throw error
  }
}

export async function recordRejectedEvent(env, {
  eventId, source, companyId, deviceId, siteId, occurredAt, receivedAt,
  action, sequence, reason, payload,
}) {
  try {
    await env.DB.prepare(
      `INSERT INTO attendance_events
        (id, event_id, source, company_id, device_id, site_id, occurred_at, received_at,
         punch_type, sequence, status, rejection_reason, location_status, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rejected', ?, 'unavailable', ?)`
    ).bind(
      crypto.randomUUID(), eventId, source, companyId, deviceId, siteId,
      occurredAt, receivedAt, action || null, sequence ?? null, reason,
      payload ? JSON.stringify(payload).slice(0, 4000) : null
    ).run()
  } catch (error) {
    if (!/unique/i.test(String(error?.message || ''))) throw error
  }
  console.warn(JSON.stringify({ event: 'time_clock_event_rejected', deviceId, eventId, reason }))
}
