// Bump this version to wipe all locally stored business data (registrations,
// tasks, notifications, settings) on next app load. Admin/CEO login accounts
// are defined in code and are therefore always retained.
const DATA_VERSION = 'celestsolutions-2026-08-27-1'

const DATA_KEYS = [
  'uw_companies',
  'uw_notifications',
  'uw_ceo_tasks',
  'uw_roles',
  'uw_legal',
  'uw_system_settings',
  'uw_pending_system_settings',
  'uw_user',
  'uw_ceo_password',
]

export function resetDataIfNeeded() {
  try {
    if (localStorage.getItem('uw_data_version') === DATA_VERSION) return
    DATA_KEYS.forEach((key) => localStorage.removeItem(key))
    localStorage.setItem('uw_data_version', DATA_VERSION)
  } catch {
    // storage unavailable — nothing to reset
  }
}
