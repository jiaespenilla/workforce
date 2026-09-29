import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/documentMeta', () => ({
  usePageTitle: () => {},
  getSystemIcon: () => null,
  setSystemIcon: () => {},
}))

import SystemConfig from '../src/pages/SystemConfig.jsx'

describe('System Configuration developer company', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('saves the edited company through the system settings form', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    render(<SystemConfig />)
    const field = screen.getByLabelText(/Developer company:/i)
    expect(field.value).toBe('CelestSolutions')
    fireEvent.change(field, { target: { value: 'Example Studio' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.getByText('Saved successfully')).toBeTruthy())
    const call = fetchSpy.mock.calls.find(([url, options]) => url.endsWith('/api/settings') && options.method === 'PUT')
    expect(JSON.parse(call[1].body).developer_company).toBe('Example Studio')
    fireEvent.click(screen.getByRole('button', { name: 'Terms & Policies' }))
    expect(screen.getByLabelText('Terms & Conditions').value).toContain('CadensIQ by Example Studio')
  })
})
