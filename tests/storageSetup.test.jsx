import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const apiCalls = []
vi.mock('../src/lib/api', () => ({
  api: (path, opts = {}) => {
    apiCalls.push({ path, ...opts })
    if (path === '/api/companies') {
      return Promise.resolve([
        { id: 1, name: 'ACME', employees: [{ email: 'ceo@acme.com', name: 'CEO' }] },
      ])
    }
    if (path.startsWith('/api/company-settings/')) {
      return Promise.resolve({ attachment_storage: { provider: 'gdrive', folderId: 'FOLDER123' } })
    }
    return Promise.resolve({})
  },
}))
vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'ceo@acme.com', role: 'ceo' } }),
}))

import StorageSetup from '../src/pages/StorageSetup.jsx'

describe('StorageSetup page', () => {
  beforeEach(() => apiCalls.length = 0)

  it('does not show the "2TB client" label in the provider dropdown', async () => {
    render(<StorageSetup />)
    await screen.findByDisplayValue('FOLDER123')
    expect(screen.queryByText(/2\s*TB/i)).toBeNull()
    const combo = screen.getByRole('combobox')
    expect([...combo.options].some((o) => o.text.toLowerCase().includes('2tb'))).toBe(false)
    expect(combo.value).toBe('gdrive') // saved config is loaded back (attachment_storage)
  })

  it('loads the saved attachment_storage config from company settings', async () => {
    render(<StorageSetup />)
    // folder ID input is populated from GET /api/company-settings (regression:
    // the endpoint used to omit attachment_storage entirely)
    expect(await screen.findByDisplayValue('FOLDER123')).toBeTruthy()
    expect(apiCalls.some((c) => c.path === '/api/company-settings/1')).toBe(true)
  })

  it('renders the step-by-step setup guide for the selected provider', async () => {
    render(<StorageSetup />)
    expect(await screen.findByText('Step-by-step Setup Guide')).toBeTruthy()
    // gdrive-specific step visible (multiple mentions are expected)
    expect(screen.getAllByText(/Service Account/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/GDRIVE_SERVICE_KEY/i).length).toBeGreaterThan(0)
    // verification step always present
    expect(screen.getByText(/must persist/i)).toBeTruthy()
  })

  it('saves the storage config via PUT company-settings', async () => {
    render(<StorageSetup />)
    await screen.findByDisplayValue('FOLDER123')
    fireEvent.click(screen.getByRole('button', { name: /save storage/i }))
    const put = apiCalls.find((c) => c.method === 'PUT')
    expect(put).toBeTruthy()
    expect(put.path).toBe('/api/company-settings/1')
    expect(put.body).toEqual({ attachment_storage: { provider: 'gdrive', folderId: 'FOLDER123' } })
    expect(await screen.findByText(/storage saved: gdrive/i)).toBeTruthy()
  })
})
