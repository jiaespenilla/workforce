import { describe, it, expect, beforeEach } from 'vitest'
import { canAction, getConfiguredRoles } from '../src/lib/roles.js'

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
    expect(role.perms.kiosk).toBe(true)
  })
})
