// Shift schedules per company.
// Shape: { shifts: [{id,name,start,end}], assignments: { email: shiftId } }
// Cloud mode persists via the per-company settings API (one key per company,
// so companies never overwrite each other); local mode uses localStorage.

import { api, apiEnabled } from './api'

const KEY = 'uw_shift_schedules'

const EMPTY = { shifts: [], assignments: {} }

function readLocalAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {}
  } catch {
    return {}
  }
}

function writeLocalAll(all) {
  localStorage.setItem(KEY, JSON.stringify(all))
}

export async function getCompanyShifts(companyId) {
  if (!companyId) return { ...EMPTY }
  if (apiEnabled()) {
    try {
      const data = await api(`/api/company-settings/${encodeURIComponent(companyId)}`)
      return data?.shift_schedules || { ...EMPTY }
    } catch {
      return { ...EMPTY }
    }
  }
  return readLocalAll()[companyId] || { ...EMPTY }
}

export async function saveCompanyShifts(companyId, data) {
  if (apiEnabled()) {
    await api(`/api/company-settings/${encodeURIComponent(companyId)}`, { method: 'PUT', body: { shift_schedules: data } })
    return
  }
  const all = readLocalAll()
  all[companyId] = data
  writeLocalAll(all)
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
 * - With a timed shift: first scan of the day is CLOCK-IN; once clocked in,
 *   the next scan is CLOCK-OUT. Clocking out beyond shift end + OT grace
 *   marks OVERTIME.
 * - Without any shift: simple alternation based on their last punch.
 */
export function decideAction(punches, shift, now = new Date(), otGraceMinutes = 15) {
  const todayStr = now.toDateString()
  const todays = punches
    .filter((p) => new Date(p.time).toDateString() === todayStr)
    .sort((a, b) => new Date(a.time) - new Date(b.time))

  const lastToday = todays[todays.length - 1]

  const toMinutes = (t) => {
    const [h, m] = (t || '00:00').split(':').map(Number)
    return h * 60 + m
  }

  // Open shift — flexible, no standard times: scans simply alternate.
  if (shift?.open) {
    if (!lastToday) return { action: 'in', overtime: false }
    return { action: lastToday.type === 'in' ? 'out' : 'in', overtime: false }
  }

  if (!shift) {
    // No shift assigned — alternate in/out per scan of the day.
    if (!lastToday) return { action: 'in' }
    return { action: lastToday.type === 'in' ? 'out' : 'in', overtime: false }
  }

  const hasOpenClockIn = lastToday && lastToday.type === 'in'

  // Already clocked in this shift → this scan ends it. Detect overtime when
  // the clock-out happens past shift end + grace period.
  if (hasOpenClockIn) {
    const endM = toMinutes(shift.end)
    const graceM = Number.isFinite(otGraceMinutes) ? Number(otGraceMinutes) : 15
    const nowM = now.getHours() * 60 + now.getMinutes()
    const overtime = nowM >= endM + graceM
    return { action: 'out', overtime }
  }

  // Not yet clocked in today → this scan starts the shift.
  return { action: 'in', overtime: false }
}
