import { describe, it, expect, beforeEach } from 'vitest'
import { canAction, getConfiguredRoles, kioskEnabled, kioskMethodAllowed } from '../src/lib/roles.js'

describe('canAction', () => {
  it('allows when perms missing (default open)', () => {
    expect(canAction(undefined, 'people', 'add')).toBe(true)
    expect(canAction({}, 'people', 'add')).toBe(true)
    expect(canAction({ actions: {} }, 'people', 'add')).toBe(true)
  })
  it('blocks when explicitly false', () => {
    expect(canAction({ actions: { people: { add: false } } }, 'people', 'add')).toBe(false)
    expect(canAction({ actions: { tasks: { delete: false } } }, 'tasks', 'delete')).toBe(false)
  })
  it('allows when explicitly true', () => {
    expect(canAction({ actions: { people: { add: true } } }, 'people', 'add')).toBe(true)
  })
})

describe('getConfiguredRoles fallback', () => {
  beforeEach(() => localStorage.clear())
  it('returns empty when nothing stored', () => {
    expect(getConfiguredRoles()).toEqual([])
  })
  it('returns stored roles with normalized perms', () => {
    localStorage.setItem('uw_roles', JSON.stringify([{ name: 'Tester', perms: {} }]))
    const [role] = getConfiguredRoles()
    expect(role.name).toBe('Tester')
    // normalize fills PAGE_KEYS
    expect(role.perms.dashboard).toBe(true)
    // legacy boolean kiosk migrates to per-method toggles (all on)
    expect(role.perms.kiosk).toEqual({ fingerprint: true, pin: true, qr: true })
  })
})

describe('kiosk credential permissions', () => {
  it('allows all methods by default', () => {
    expect(kioskMethodAllowed(undefined, 'pin')).toBe(true)
    expect(kioskMethodAllowed({}, 'qr')).toBe(true)
    expect(kioskEnabled(undefined)).toBe(true)
  })
  it('migrates legacy boolean flags', () => {
    expect(kioskMethodAllowed({ kiosk: true }, 'fingerprint')).toBe(true)
    expect(kioskMethodAllowed({ kiosk: false }, 'pin')).toBe(false)
    expect(kioskEnabled({ kiosk: false })).toBe(false)
  })
  it('hides individual methods', () => {
    const perms = { kiosk: { fingerprint: true, pin: false, qr: true } }
    expect(kioskMethodAllowed(perms, 'pin')).toBe(false)
    expect(kioskMethodAllowed(perms, 'qr')).toBe(true)
    expect(kioskEnabled(perms)).toBe(true)
    expect(kioskEnabled({ kiosk: { fingerprint: false, pin: false, qr: false } })).toBe(false)
  })
})
