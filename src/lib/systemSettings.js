const DEFAULT_SETTINGS = {
  name: 'Unified Workforce',
  version: 'v2.4.1',
  timezone: '(GMT+08:00) Asia/Manila',
}

export function getActiveSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('uw_system_settings')) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function getPendingSettings() {
  try {
    return JSON.parse(localStorage.getItem('uw_pending_system_settings'))
  } catch {
    return null
  }
}

export function queueSystemSettings(settings) {
  localStorage.setItem('uw_pending_system_settings', JSON.stringify(settings))
}

// Called during logout — pending changes become the live system details.
export function commitPendingSystemSettings() {
  const pending = getPendingSettings()
  if (!pending) return
  localStorage.setItem('uw_system_settings', JSON.stringify(pending))
  localStorage.removeItem('uw_pending_system_settings')
}

// IANA time zone derived from the system settings (e.g. "(GMT+08:00) Asia/Manila" -> "Asia/Manila").
export function getSystemTimeZone() {
  const tz = getActiveSettings().timezone || ''
  return tz.split(') ')[1] || 'Asia/Manila'
}
