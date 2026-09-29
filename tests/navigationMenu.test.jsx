import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Test User', role: 'ceo', roleLabel: 'CEO', perms: {} }, logout: vi.fn() }),
}))
vi.mock('../src/lib/systemSettings', () => ({
  getActiveSettings: () => ({ name: 'CadensIQ', version: '1.0' }),
  isMaintenanceMode: () => false,
}))
vi.mock('../src/lib/documentMeta', () => ({ getSystemIcon: () => null }))
vi.mock('../src/components/NotificationBell', () => ({ default: () => null }))
vi.mock('../src/components/DefaultPasswordBanner', () => ({ default: () => null }))
vi.mock('../src/components/Avatar', () => ({ default: () => null }))
vi.mock('../src/components/SignOutButton', () => ({ default: () => null }))

import Layout from '../src/components/Layout.jsx'
import AdminLayout from '../src/components/AdminLayout.jsx'

describe.each([
  ['employee', Layout, 'desktop-navigation', 'mobile-navigation', 'Open menu'],
  ['administrator', AdminLayout, 'admin-desktop-navigation', 'admin-mobile-navigation', 'Open navigation menu'],
])('%s navigation menu', (_role, Component, desktopId, mobileId, mobileLabel) => {
  beforeEach(() => localStorage.clear())

  it('opens and closes the desktop sidebar from the hamburger', () => {
    render(<MemoryRouter><Component><p>Page content</p></Component></MemoryRouter>)
    const toggle = screen.getByRole('button', { name: 'Hide navigation menu' })
    const sidebar = document.getElementById(desktopId)
    expect(sidebar.className).toContain('lg:flex')
    fireEvent.click(toggle)
    expect(sidebar.className).not.toContain('lg:flex')
    expect(screen.getByRole('button', { name: 'Show navigation menu' }).getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Show navigation menu' }))
    expect(sidebar.className).toContain('lg:flex')
  })

  it('opens the mobile drawer and closes it with Escape', () => {
    render(<MemoryRouter><Component><p>Page content</p></Component></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: mobileLabel }))
    expect(document.getElementById(mobileId)).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.getElementById(mobileId)).toBeNull()
  })
})
