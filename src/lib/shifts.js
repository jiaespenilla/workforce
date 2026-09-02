// Shift schedules per company.
// Cloud persists via per-company settings API (one key per company).

import { api } from './api'
import { getSystemTimeZone } from './systemSettings.js'

const EMPTY = { shifts: [], assignments: {} }

function systemDateKey(timeStr) {
  try { return new Date(timeStr).toLocaleDateString('en-CA', { timeZone: getSystemTimeZone() }) } catch { return new Date(timeStr).toDateString() }
}

export async function getCompanyShifts(companyId) {
  if (!companyId) return { ...EMPTY }
  try {
    const data = await api(`/api/company-settings/${encodeURIComponent(companyId)}`)
    return data?.shift_schedules || { ...EMPTY }
  } catch {
    return { ...EMPTY }
  }
}

export async function saveCompanyShifts(companyId, data) {
  await api(`/api/company-settings/${encodeURIComponent(companyId)}`, { method: 'PUT', body: { shift_schedules: data } })
}

export async function saveCompanyShiftData(companyId, updater) {
  const current = await getCompanyShifts(companyId)
  const next = updater({ ...EMPTY, ...current })
  await saveCompanyShifts(companyId, next)
  return next
}

/**
 * Decide the punch action for an identified employee, plus overtime detection.
 * - Open shift (no fixed times): every scan alternates clock-in / clock-out.
 *   Overtime applies AFTER 8 hours of work — measured from the clock-in that
 *   starts the session up to the actual clock-out (minutes beyond 8h are OT).
 * - With a timed shift: first scan of the day is CLOCK-IN; once clocked in,
 *   the next scan is CLOCK-OUT. Clocking out beyond shift end + OT grace
 *   marks OVERTIME.
 * - Without any shift: simple alternation based on their last punch.
 */
export function decideAction(punches, shift, now = new Date(), otGraceMinutes = 15, regularWorkMinutes = 480) {
  const todayKey = systemDateKey(now.toISOString())
  const todays = punches
    .filter((p) => systemDateKey(p.time) === todayKey)
    .sort((a, b) => new Date(a.time) - new Date(b.time))

  const lastToday = todays[todays.length - 1]

  const toMinutes = (t) => {
    const [h, m] = (t || '00:00').split(':').map(Number)
    return h * 60 + m
  }

  // Minutes actually worked in the session that this clock-out ends.
  const sessionMinutes = (startTime) => Math.max(0, Math.round((now.getTime() - new Date(startTime).getTime()) / 60000))
    // Open-shift end is derived as clock-in + regular work + grace (no fixed
  // schedule end). Clocking out past it flags OVERTIME; the whole session
  // then counts, matching the timed-shift branch below.
  const openShiftEndMinutes = (startTime) => {
    const graceM = Number.isFinite(otGraceMinutes) ? Number(otGraceMinutes) : 15
    return (new Date(startTime).getTime() + (regularWorkMinutes + graceM) * 60000)
  }

  // Open shift — flexible, no standard times: scans simply alternate.
  if (shift?.open) {
    if (!lastToday) return { action: 'in', overtime: false, overtimeMinutes: 0 }
    if (lastToday.type === 'in') {
      const ot = now.getTime() >= openShiftEndMinutes(lastToday.time)
      return { action: 'out', overtime: ot, overtimeMinutes: ot ? sessionMinutes(lastToday.time) : 0 }
    }
    return { action: 'in', overtime: false, overtimeMinutes: 0 }
  }

  if (!shift) {
    // No shift assigned — alternate in/out per scan of the day.
    if (!lastToday) return { action: 'in', overtime: false, overtimeMinutes: 0 }
    return { action: lastToday.type === 'in' ? 'out' : 'in', overtime: false, overtimeMinutes: 0 }
  }

  const hasOpenClockIn = lastToday && lastToday.type === 'in'

  // Already clocked in this shift → this scan ends it. Detect overtime when
  // the clock-out happens past shift end + grace period.
  if (hasOpenClockIn) {
    const endM = toMinutes(shift.end)
    const graceM = Number.isFinite(otGraceMinutes) ? Number(otGraceMinutes) : 15
    const nowM = now.getHours() * 60 + now.getMinutes()
    const overtime = nowM >= endM + graceM
    // Match TimeKeeping's display: the whole flagged session counts as OT.
    return { action: 'out', overtime, overtimeMinutes: overtime ? sessionMinutes(lastToday.time) : 0 }
  }

  // Not yet clocked in today → this scan starts the shift.
  return { action: 'in', overtime: false, overtimeMinutes: 0 }
}
