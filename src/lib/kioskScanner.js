// Browser boundary for a vendor fingerprint-reader connector.
// The future manufacturer-specific Windows agent should expose either:
//   window.CadensiQFingerprintConnector.scan() -> { terminalUserId, eventId? }
// or dispatch a "cadensiq:fingerprint-scan" CustomEvent with that detail.
// Fingerprint images/templates must remain inside the reader or vendor agent.

export function scannerAvailable() {
  return typeof window !== 'undefined' && typeof window.CadensiQFingerprintConnector?.scan === 'function'
}

export async function scanFingerprint() {
  if (!scannerAvailable()) throw new Error('Fingerprint reader connector is not installed on this kiosk.')
  const result = await window.CadensiQFingerprintConnector.scan()
  const terminalUserId = String(result?.terminalUserId || '').trim()
  if (!terminalUserId) throw new Error('The fingerprint reader did not return an employee ID.')
  return { terminalUserId, eventId: result?.eventId || crypto.randomUUID() }
}

export function subscribeToFingerprintScans(callback) {
  const listener = (event) => {
    const terminalUserId = String(event.detail?.terminalUserId || '').trim()
    if (terminalUserId) callback({ terminalUserId, eventId: event.detail?.eventId || crypto.randomUUID() })
  }
  window.addEventListener('cadensiq:fingerprint-scan', listener)
  return () => window.removeEventListener('cadensiq:fingerprint-scan', listener)
}
