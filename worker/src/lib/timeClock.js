import { hmac } from './crypto.js'
import { HttpError } from './http.js'

export function normalizeLocation(value) {
  const status = ['granted', 'denied', 'unavailable', 'unsupported'].includes(value?.status)
    ? value.status
    : 'unavailable'
  const latitude = Number(value?.latitude)
  const longitude = Number(value?.longitude)
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
  return match?.[1] || 'UTC'
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
  const current = zonedParts(now, timeZone)
  const today = sorted.filter((punch) => zonedParts(new Date(punch.time), timeZone).dateKey === current.dateKey)
  const lastToday = today[today.length - 1]
  const lastAny = sorted[sorted.length - 1]
  let action
  let openPunch = null
  if (explicitAction === 'in' || explicitAction === 'out') {
    action = explicitAction
    openPunch = action === 'out' && lastAny?.type === 'in' ? lastAny : null
  } else if (shift?.open) {
    action = lastAny?.type === 'in' ? 'out' : 'in'
    openPunch = action === 'out' ? lastAny : null
  } else {
    action = lastToday?.type === 'in' ? 'out' : 'in'
    openPunch = action === 'out' ? lastToday : null
  }
  if (action !== 'out' || !openPunch) return { action, overtime: false, overtimeMinutes: 0 }
  const worked = Math.max(0, Math.round((now.getTime() - new Date(openPunch.time).getTime()) / 60000))
  const grace = 15
  if (shift?.open) {
    const overtime = worked >= 480 + grace
    return { action, overtime, overtimeMinutes: overtime ? worked : 0 }
  }
  if (shift?.end) {
    const [hour, minute] = String(shift.end).split(':').map(Number)
    const overtime = current.minutes >= hour * 60 + minute + grace && worked >= 480
    return { action, overtime, overtimeMinutes: overtime ? worked : 0 }
  }
  return { action, overtime: false, overtimeMinutes: 0 }
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
    'SELECT id, status, punch_type FROM attendance_events WHERE source = ? AND device_id IS ? AND event_id = ? LIMIT 1'
  ).bind(source, deviceId, eventId).first()
  if (duplicate) return { duplicate: true, eventId: duplicate.id, status: duplicate.status, action: duplicate.punch_type }

  const occurrence = new Date(occurredAt)
  if (!Number.isFinite(occurrence.getTime())) throw HttpError(400, 'Event occurrence time is invalid.')
  const { shift, timeZone } = await assignedShift(env, employee)
  const punches = await priorPunches(env, employee.email)
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
