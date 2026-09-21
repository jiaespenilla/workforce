// Vendor boundary: future hardware connectors translate their payload into
// this canonical event shape. The API and attendance rules stay unchanged.
export function normalizeTerminalBatch(payload, adapter = 'generic-v1') {
  if (adapter !== 'generic-v1') throw new Error(`Unsupported terminal adapter: ${adapter}`)
  const events = Array.isArray(payload?.events) ? payload.events : []
  return events.map((event) => ({
    eventId: String(event.eventId || '').trim(),
    terminalUserId: String(event.terminalUserId || '').trim(),
    occurredAt: String(event.occurredAt || '').trim(),
    sequence: Number(event.sequence),
    action: String(event.action || '').toLowerCase(),
  }))
}

