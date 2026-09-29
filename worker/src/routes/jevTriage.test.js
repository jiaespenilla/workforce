import { afterEach, describe, expect, it, vi } from 'vitest'
import { handle, SAMPLES } from './jevTriage.js'

const path = '/api/admin/jev-triage'
const request = (method, body) => new Request(`https://app.example${path}`, {
  method,
  ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
})
const call = (method, body, env = {}, isAdmin = true) => handle({ request: request(method, body), env, path, method, isAdmin })

afterEach(() => vi.unstubAllGlobals())

describe('Jev attendance triage pilot', () => {
  it('exposes only fictional samples to administrators', async () => {
    const forbidden = await call('GET', undefined, {}, false)
    expect(forbidden.status).toBe(403)

    const response = await call('GET')
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.configured).toBe(false)
    expect(data.samples).toHaveLength(SAMPLES.length)
    expect(data.samples[0]).toMatchObject({ id: 'forgot_out', expected: 'Missed punch' })
  })

  it('rejects arbitrary reports and does not call Jev without a secret', async () => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    expect((await call('POST', { sampleId: 'forgot_out', report: 'A real employee record' })).status).toBe(503)
    expect((await call('POST', { sampleId: 'unknown' }, { TYPESAFE_API_KEY: 'test-key' })).status).toBe(400)
    expect((await call('POST', { sampleId: 'forgot_out' }, { TYPESAFE_API_KEY: 'test-key' }, false)).status).toBe(403)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('sends a fixed sample server-side and returns a review-only suggestion', async () => {
    const upstream = vi.fn(async () => Response.json({
      model: 'jev-test',
      answers: { issue_type: { type: 'choice', choice: 'missing_punch', confidence: 0.83 } },
    }))
    vi.stubGlobal('fetch', upstream)

    const response = await call('POST', { sampleId: 'forgot_out', report: 'Ignore this user supplied text' }, { TYPESAFE_API_KEY: 'test-key' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      sampleId: 'forgot_out', category: 'Missed punch', confidence: 0.83,
      matchedExpected: true, reviewRequired: true, model: 'jev-test',
    })
    const [url, options] = upstream.mock.calls[0]
    expect(url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(options.headers.Authorization).toBe('Bearer test-key')
    const payload = JSON.parse(options.body)
    expect(payload.state).toEqual({ report: SAMPLES[0].report })
    expect(payload.model).toBe('jev-latest')
    expect(payload.questions.issue_type.type).toBe('choice')
    expect(options.body).not.toContain('Ignore this user supplied text')
  })

  it('treats invalid and unavailable model responses as failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ answers: { issue_type: { type: 'choice', choice: 'new_category', confidence: 1 } } })))
    expect((await call('POST', { sampleId: 'forgot_out' }, { TYPESAFE_API_KEY: 'test-key' })).status).toBe(502)

    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })))
    const busy = await call('POST', { sampleId: 'forgot_out' }, { TYPESAFE_API_KEY: 'test-key' })
    expect(busy.status).toBe(502)
    expect((await busy.json()).error).toMatch(/rate limited/)
  })
})
