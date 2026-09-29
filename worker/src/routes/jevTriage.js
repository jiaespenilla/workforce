// Administrator-only Jev pilot. Only fixed, synthetic reports leave the Worker.
// This route never reads or changes employee, attendance, or payroll records.
import { json, readJson } from '../lib/http.js'

const PATH = '/api/admin/jev-triage'

const CATEGORIES = {
  missing_punch: 'Missed punch',
  device_or_connection: 'Device or connection',
  identity_or_pairing: 'Identity or pairing',
  schedule_or_location: 'Schedule or location',
  duplicate_or_order: 'Duplicate or sequence',
  other_or_unclear: 'Needs review',
}

export const SAMPLES = [
  { id: 'forgot_out', label: 'Forgot to clock out', report: 'I forgot to clock out yesterday after my shift ended.', expected: 'missing_punch' },
  { id: 'field_offline', label: 'Field work without signal', report: 'I was at a field site with no signal. My mobile clock-in only synced after I returned to town.', expected: 'device_or_connection' },
  { id: 'kiosk_mapping', label: 'Kiosk fingerprint not linked', report: 'The kiosk reads my fingerprint but says it is not linked to any employee account.', expected: 'identity_or_pairing' },
  { id: 'wfh_schedule', label: 'Approved WFH shift marked late', report: 'My WFH shift was approved for 9 AM but the timekeeping screen marked me late based on the office schedule.', expected: 'schedule_or_location' },
  { id: 'unclear', label: 'Insufficient detail', report: 'My attendance looks wrong. Please check it.', expected: 'other_or_unclear' },
  { id: 'tagalog_forgot_out', label: 'Forgotten clock-out in Filipino', report: 'Nakalimutan kong mag-time out kahapon pagkatapos ng shift.', expected: 'missing_punch' },
]

export const TRIAGE_QUESTIONS = {
  issue_type: {
    type: 'choice',
    instructions: 'Which attendance exception is primarily described in `report`? Choose based on the reported cause, not a requested remedy. When the report lacks enough detail or several issues are equally central, choose other_or_unclear.',
    criteria: {
      missing_punch: 'Employee forgot, missed, or could not complete a clock-in or clock-out; no explicit device or identity failure explains it.',
      device_or_connection: 'Phone, kiosk, scanner, internet, GPS, or app malfunction prevented or delayed a punch.',
      identity_or_pairing: 'Employee identity, account, passkey, fingerprint mapping, or kiosk/phone pairing was rejected or belongs to the wrong person.',
      schedule_or_location: 'Disagreement about shift schedule, approved work location, WFH or field work assignment, lateness, or time zone.',
      duplicate_or_order: 'Repeated punches, wrong in/out sequence, or conflicting recorded clock events.',
      other_or_unclear: 'No clear exception, multiple equally central issues, insufficient details, or a report outside the defined categories.',
    },
  },
}

export async function handle({ request, env, path, method, isAdmin }) {
  if (path !== PATH) return null
  if (!isAdmin) return json({ error: 'Administrator only.' }, 403, request)

  if (method === 'GET') {
    return json({
      configured: Boolean(env.TYPESAFE_API_KEY),
      samples: SAMPLES.map(({ id, label, report, expected }) => ({ id, label, report, expected: CATEGORIES[expected] })),
    }, 200, request)
  }
  if (method !== 'POST') return json({ error: 'Method not allowed.' }, 405, request)

  const body = await readJson(request)
  const sample = SAMPLES.find(({ id }) => id === body?.sampleId)
  if (!sample) return json({ error: 'Choose a valid sample report.' }, 400, request)
  if (!env.TYPESAFE_API_KEY) return json({ error: 'Jev is not configured. Add the TYPESAFE_API_KEY Worker secret.' }, 503, request)

  let upstream
  try {
    upstream = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.TYPESAFE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ state: { report: sample.report }, model: 'jev-latest', questions: TRIAGE_QUESTIONS }),
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    return json({ error: 'Jev could not be reached. Try again later.' }, 502, request)
  }

  if (!upstream.ok) {
    const message = upstream.status === 401 || upstream.status === 403
      ? 'Jev rejected the configured API key.'
      : upstream.status === 429 || upstream.status === 529
        ? 'Jev is busy or rate limited. Try again later.'
        : 'Jev could not evaluate this sample.'
    return json({ error: message }, 502, request)
  }

  let result
  try { result = await upstream.json() } catch { return json({ error: 'Jev returned an unreadable response.' }, 502, request) }
  const answer = result?.answers?.issue_type
  if (answer?.type !== 'choice' || !Object.hasOwn(CATEGORIES, answer.choice) ||
      typeof answer.confidence !== 'number' || !Number.isFinite(answer.confidence) ||
      answer.confidence < 0 || answer.confidence > 1) {
    return json({ error: 'Jev returned an unexpected answer.' }, 502, request)
  }

  return json({
    sampleId: sample.id,
    category: CATEGORIES[answer.choice],
    confidence: answer.confidence,
    matchedExpected: answer.choice === sample.expected,
    reviewRequired: true,
    model: String(result.model || 'jev-latest'),
  }, 200, request)
}
