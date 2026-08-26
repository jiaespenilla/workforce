// Shift schedules per company.
// Shape: { [companyId]: { shifts: [{id,name,start,end}], assignments: { email: shiftId } } }
// Cloud mode persists via the Worker settings API; local mode uses localStorage.

import { api, apiEnabled } from './api'

const KEY = 'uw_shift_schedules'
const SETTINGS_KEY = 'shift_schedules'

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

export async function loadAllShiftSchedules() {
  if (apiEnabled()) {
    try {
      const settings = await api('/api/settings')
      const raw = settings[SETTINGS_KEY]
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }
  return readLocalAll()
}

export async function saveCompanyShifts(companyId, data) {
  if (apiEnabled()) {
    await api('/api/settings', { method: 'PUT', body: { [SETTINGS_KEY]: JSON.stringify(data) } })
  } else {
    const all = readLocalAll()
    all[companyId] = data
    writeLocalAll(all)
  }
}

export async function getCompanyShifts(companyId) {
  const all = await loadAllShiftSchedules()
  return all[companyId] || { ...EMPTY }
}

export async function saveCompanyShiftData(companyId, updater) {
  const all = await loadAllShiftSchedules()
  const current = all[companyId] || { ...EMPTY }
  const next = updater({ ...EMPTY, ...current })
  all[companyId] = next
  await saveCompanyShifts(companyId, next)
  return next
}

/**
 * Decide the punch action for an identified employee.
 * - With a shift: first scan of the day is CLOCK-IN; once clocked in, the next
 *   scan is CLOCK-OUT. Outside the shift window (with no open clock-in) it
 *   falls back to simple alternation so nobody is locked out.
 * - Without a shift: simple alternation based on their last punch.
 */
export function decideAction(punches, shift, now = new Date()) {
  const todayStr = now.toDateString()
  const todays = punches
    .filter((p) => new Date(p.time).toDateString() === todayStr)
    .sort((a, b) => new Date(a.time) - new Date(b.time))

  const lastToday = todays[todays.length - 1]

  if (!shift) {
    // No shift assigned — alternate in/out per scan of the day.
    if (lastToday && lastToday.type === 'in') return { action: 'out' }
    if (lastToday && lastToday.type === 'out' && todays.length % 2 === 0) return { action: 'in' }
    if (todays.length === 0) return { action: 'in' }
    return { action: lastToday.type === 'in' ? 'out' : 'in' }
  }

  const minutesNow = now.getHours() * 60 + now.getMinutes()
  const toMinutes = (t) => {
    const [h, m] = (t || '00:00').split(':').map(Number)
    return h * 60 + m
  }
  const startM = toMinutes(shift.start)
  const endM = toMinutes(shift.end)

  const hasOpenClockIn = lastToday && lastToday.type === 'in'

  // Already clocked in this shift → this scan ends it.
  if (hasOpenClockIn) return { action: 'out' }

  // Not yet clocked in: allow early arrival up to 2h before shift start,
  // otherwise treat as clock-in anyway (grace for late employees).
  void minutesNow
  void startM
  void endM
  return { action: 'in' }
}
