import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ api: vi.fn(), getCompanyLocations: vi.fn() }))

vi.mock('../src/lib/api', () => ({ api: mocks.api }))
vi.mock('../src/lib/locations', () => ({ getCompanyLocations: mocks.getCompanyLocations }))
vi.mock('../src/lib/documentMeta', () => ({ usePageTitle: vi.fn() }))

import TimeClockSetup from '../src/pages/KioskSetup.jsx'

const devices = [
  { id: 'terminal-a', name: 'Alpha terminal', active: 1, mapping_count: 0, paired_kiosk_count: 0, issue_count: 0 },
  { id: 'terminal-b', name: 'Beta terminal', active: 1, mapping_count: 0, paired_kiosk_count: 0, issue_count: 0 },
]

describe('time clock terminal selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
    vi.stubGlobal('confirm', vi.fn(() => true))
    mocks.getCompanyLocations.mockResolvedValue([])
    mocks.api.mockImplementation(async (path) => {
      if (path === '/api/companies') return [{ id: 'co-1', name: 'Acme', active: true, employees: [] }]
      if (path.startsWith('/api/time-clock/admin/devices?')) return devices
      if (path.startsWith('/api/time-clock/admin/events?')) return []
      if (path.startsWith('/api/time-clock/admin/config?')) return { personalPhoneEnabled: true }
      if (path.startsWith('/api/time-clock/admin/mappings?')) return []
      if (path.startsWith('/api/time-clock/admin/kiosk-activity?')) return {
        codes: [{ id: 'pair-1', createdAt: '2026-09-22T00:00:00.000Z', expiresAt: Date.now() + 60000, usedAt: '2026-09-22T00:01:00.000Z', status: 'used' }],
        sessions: [{ id: 'session-1', label: 'Front desk kiosk', pairedAt: '2026-09-22T00:01:00.000Z', lastSeenAt: null, active: true }],
      }
      if (path === '/api/time-clock/admin/devices/terminal-b/rotate-secret') return { signingSecret: 'replacement-secret-value', secretVersion: 2 }
      return { ok: true }
    })
  })

  it('visibly selects a terminal, moves to its controls, and replaces a lost secret', async () => {
    render(<TimeClockSetup />)
    const beta = await screen.findByRole('button', { name: /Beta terminal/ })
    fireEvent.click(beta)

    expect(await screen.findByRole('heading', { name: 'Beta terminal' })).toBeTruthy()
    expect(beta.getAttribute('aria-pressed')).toBe('true')
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled())
    expect(await screen.findByText('Front desk kiosk')).toBeTruthy()
    expect(screen.getByText('Automatic mapping is on.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Replace lost secret' }))
    expect(await screen.findByText('replacement-secret-value')).toBeTruthy()
    expect(screen.getByText(/previous secret no longer works/i)).toBeTruthy()
  })
})
