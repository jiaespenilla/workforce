import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ api: vi.fn(), startAuthentication: vi.fn(), startRegistration: vi.fn() }))

vi.mock('../src/lib/api', () => ({ apiEnabled: () => true, api: mocks.api }))
vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: mocks.startAuthentication,
  startRegistration: mocks.startRegistration,
}))

import PersonalTimeClock from '../src/components/PersonalTimeClock.jsx'

const passkeys = [{ id: 'cred-1', name: 'My phone', createdAt: '2026-09-20T00:00:00.000Z', lastUsedAt: null }]

describe('personal phone clock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'PublicKeyCredential', { configurable: true, value: class PublicKeyCredential {} })
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (_success, failure) => failure({ code: 1, PERMISSION_DENIED: 1 }) },
    })
    if (!crypto.randomUUID) vi.stubGlobal('crypto', { ...crypto, randomUUID: () => 'request-0001' })
    mocks.startAuthentication.mockResolvedValue({ id: 'cred-1', rawId: 'cred-1', response: {} })
    mocks.api.mockImplementation(async (path) => {
      if (path === '/api/time-clock/passkeys') return passkeys
      if (path === '/api/time-clock/clock-options') return { challenge: 'challenge' }
      if (path === '/api/time-clock/clock-punch') return { action: 'in', time: '2026-09-21T01:00:00.000Z', locationStatus: 'denied' }
      return { ok: true }
    })
  })

  it('does not double-submit and still punches when location is denied', async () => {
    render(<PersonalTimeClock />)
    const button = await screen.findByRole('button', { name: 'Clock In' })
    fireEvent.click(button)
    fireEvent.click(button)
    await screen.findByText(/Clocked in successfully/)
    expect(mocks.startAuthentication).toHaveBeenCalledTimes(1)
    const punchCalls = mocks.api.mock.calls.filter(([path]) => path === '/api/time-clock/clock-punch')
    expect(punchCalls).toHaveLength(1)
    expect(punchCalls[0][1].body.location).toEqual({ status: 'denied' })
  })

  it('retries the exact same request after a network failure', async () => {
    let attempts = 0
    mocks.api.mockImplementation(async (path) => {
      if (path === '/api/time-clock/passkeys') return passkeys
      if (path === '/api/time-clock/clock-options') return { challenge: 'challenge' }
      if (path === '/api/time-clock/clock-punch') {
        attempts += 1
        if (attempts === 1) throw new Error('Network unavailable')
        return { action: 'in', time: '2026-09-21T01:00:00.000Z', locationStatus: 'denied' }
      }
      return { ok: true }
    })
    render(<PersonalTimeClock />)
    fireEvent.click(await screen.findByRole('button', { name: 'Clock In' }))
    const retry = await screen.findByRole('button', { name: /Retry the same punch/ })
    const firstBody = mocks.api.mock.calls.find(([path]) => path === '/api/time-clock/clock-punch')[1].body
    fireEvent.click(retry)
    await screen.findByText(/Clocked in successfully/)
    const bodies = mocks.api.mock.calls.filter(([path]) => path === '/api/time-clock/clock-punch').map((call) => call[1].body)
    expect(bodies).toHaveLength(2)
    expect(bodies[1].requestId).toBe(firstBody.requestId)
    expect(mocks.startAuthentication).toHaveBeenCalledTimes(1)
  })

  it('records nothing when phone verification is cancelled', async () => {
    mocks.startAuthentication.mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }))
    render(<PersonalTimeClock />)
    fireEvent.click(await screen.findByRole('button', { name: 'Clock In' }))
    await screen.findByText(/verification was cancelled/i)
    await waitFor(() => expect(mocks.api.mock.calls.some(([path]) => path === '/api/time-clock/clock-punch')).toBe(false))
  })
})
