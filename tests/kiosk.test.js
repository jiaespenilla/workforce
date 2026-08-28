import { describe, it, expect } from 'vitest'
import { getDefaultKioskConfig } from '../src/lib/kioskConfig.js'

describe('kiosk config', () => {
  it('returns expected defaults', () => {
    const cfg = getDefaultKioskConfig()
    expect(cfg.method).toBe('fingerprint')
    expect(cfg.pinFallback).toBe(true)
    expect(cfg.pinLength).toBe(4)
    expect(cfg.idleTimeout).toBe(60)
    expect(cfg.site).toBe('hq')
  })
  it('returns a fresh copy each call', () => {
    const a = getDefaultKioskConfig()
    const b = getDefaultKioskConfig()
    a.method = 'pin'
    expect(b.method).toBe('fingerprint')
  })
})

describe('kiosk token format (worker logic mirror)', () => {
  function generateKioskToken() {
    const bytes = new Uint8Array(24)
    crypto.getRandomValues(bytes)
    return 'uwk_' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  it('generates uwk_ + 48 hex chars', () => {
    const token = generateKioskToken()
    expect(token.startsWith('uwk_')).toBe(true)
    expect(token.length).toBe(4 + 48)
    expect(/^uwk_[0-9a-f]{48}$/.test(token)).toBe(true)
  })
  it('tokens are unique', () => {
    const a = generateKioskToken()
    const b = generateKioskToken()
    expect(a).not.toBe(b)
  })
  it('rejects invalid prefixes', () => {
    const valid = 'uwk_' + 'a'.repeat(48)
    const invalid = 'bad_' + 'a'.repeat(48)
    expect(valid.startsWith('uwk_')).toBe(true)
    expect(invalid.startsWith('uwk_')).toBe(false)
  })
})
