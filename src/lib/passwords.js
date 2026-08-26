// Per-user password overrides. When no override exists the account is on the
// default password (P@ssw0rd2026!) and the system prompts a reset.

export const DEFAULT_PASSWORD = 'P@ssw0rd2026!'

function readMap() {
  try {
    return JSON.parse(localStorage.getItem('uw_passwords')) || {}
  } catch {
    return {}
  }
}

export function getStoredPassword(email) {
  if (!email) return null
  const map = readMap()
  return map[email.toLowerCase()] || null
}

export function setStoredPassword(email, password) {
  if (!email) return
  const map = readMap()
  map[email.toLowerCase()] = password
  localStorage.setItem('uw_passwords', JSON.stringify(map))
}

// True when the account still uses the default password (no override saved).
export function isUsingDefaultPassword(email) {
  return !getStoredPassword(email)
}
