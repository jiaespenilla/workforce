import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ api: vi.fn(), scanFingerprint: vi.fn(), available: vi.fn() }))

vi.mock('../src/lib/api', () => ({ api: mocks.api }))
vi.mock('../src/lib/documentMeta', () => ({ usePageTitle: () => {}, fetchPublicSystemIcon: vi.fn() }))
vi.mock('../src/lib/kioskScanner', () => ({
  scannerAvailable: mocks.available,
  scanFingerprint: mocks.scanFingerprint,
  subscribeToFingerprintScans: () => () => {},
}))

import Kiosk from '../src/pages/Kiosk.jsx'

describe('standalone kiosk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mocks.available.mockReturnValue(false)
    mocks.api.mockImplementation(async (path) => {
      if (path === '/api/time-clock/kiosk/pair') return { token: 'paired-session-token-value-that-is-long' }
      if (path === '/api/time-clock/kiosk/status') return { paired: true, deviceName: 'Head Office', companyName: 'Acme' }
      return { ok: true }
    })
  })

  it('opens without login and stores a one-time kiosk pairing', async () => {
    render(<Kiosk />)
    expect(screen.getByText(/No employee login is required/i)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/One-time pairing code/i), { target: { value: 'ABCD2345' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pair this kiosk' }))
    await screen.findByText('Head Office')
    expect(localStorage.getItem('uw_standalone_kiosk_session')).toBe('paired-session-token-value-that-is-long')
  })

  it('accepts an employee ID only from the installed scanner connector', async () => {
    localStorage.setItem('uw_standalone_kiosk_session', 'paired-session-token-value-that-is-long')
    mocks.available.mockReturnValue(true)
    mocks.scanFingerprint.mockResolvedValue({ terminalUserId: '1001', eventId: 'scanner-event-0001' })
    mocks.api.mockImplementation(async (path) => {
      if (path === '/api/time-clock/kiosk/status') return { paired: true, deviceName: 'Head Office', companyName: 'Acme' }
      if (path === '/api/time-clock/kiosk/punch') return { employeeName: 'Alice', action: 'in', time: '2026-09-21T06:00:00.000Z' }
      return { ok: true }
    })
    render(<Kiosk />)
    fireEvent.click(await screen.findByRole('button', { name: 'Scan fingerprint' }))
    await screen.findByText(/Alice successfully clocked in/i)
    const call = mocks.api.mock.calls.find(([path]) => path === '/api/time-clock/kiosk/punch')
    expect(call[1].body).toEqual({ terminalUserId: '1001', eventId: 'scanner-event-0001' })
    expect(call[1].headers['X-Time-Clock-Kiosk']).toBe('paired-session-token-value-that-is-long')
    await waitFor(() => expect(mocks.scanFingerprint).toHaveBeenCalledTimes(1))
  })
})
