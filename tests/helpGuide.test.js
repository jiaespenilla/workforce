import { describe, it, expect } from 'vitest'
import { buildGuideSections, buildGuideHtml, QUICK_ANSWERS } from '../src/lib/helpGuide.js'

// (76) Help & Guide — plain-language, role-aware, PDF-exportable.

describe('buildGuideSections — role awareness', () => {
  it('gives administrators the console sections', () => {
    const ids = buildGuideSections({ role: 'administrator' }).map((s) => s.id)
    expect(ids).toContain('companies')
    expect(ids).toContain('system-config')
    expect(ids).toContain('roles')
    expect(ids).toContain('kiosk-setup')
    expect(ids).not.toContain('tasks')
    expect(ids).not.toContain('people')
  })

  it('gives CEOs the management sections for their permitted modules', () => {
    const ids = buildGuideSections({ role: 'ceo' }).map((s) => s.id)
    expect(ids).toContain('dashboard')
    expect(ids).toContain('tasks')
    expect(ids).toContain('timekeeping')
    expect(ids).toContain('people')
    expect(ids).toContain('payroll')
    expect(ids).not.toContain('companies')
    expect(ids).not.toContain('kiosk') // Kiosk Mode is employee-only
  })

  it('hides modules the employee has no permission for', () => {
    const full = buildGuideSections({ role: 'employee', perms: {} }).map((s) => s.id)
    expect(full).toContain('tasks')
    expect(full).toContain('kiosk')

    const limited = buildGuideSections({ role: 'employee', perms: { tasks: false, timekeeping: false, kiosk: false } }).map((s) => s.id)
    expect(limited).not.toContain('tasks')
    expect(limited).not.toContain('timekeeping')
    expect(limited).not.toContain('kiosk')
    // Always-available sections remain.
    expect(limited).toContain('notifications')
    expect(limited).toContain('security')
  })

  it('every section has a title, an intro and at least one bullet', () => {
    for (const role of ['administrator', 'ceo', 'employee']) {
      for (const s of buildGuideSections({ role })) {
        expect(s.title.length).toBeGreaterThan(0)
        expect(s.intro.length).toBeGreaterThan(0)
        expect(s.bullets.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('plain language (76) — no technical jargon in user-facing copy', () => {
  const JARGON = ['API', 'localStorage', 'endpoint', 'JWT', 'D1', 'database', 'payload', 'UI', 'CSS', 'config ', 'JSON', 'HTTP', 'token']

  it('avoids jargon across every role guide and the quick answers', () => {
    for (const role of ['administrator', 'ceo', 'employee']) {
      const texts = buildGuideSections({ role })
        .flatMap((s) => [s.title, s.intro, ...s.bullets])
        .concat(QUICK_ANSWERS.flatMap((f) => [f.q, f.a]))
      for (const t of texts) {
        for (const j of JARGON) {
          expect(t.includes(j), `"${t}" contains jargon: "${j}"`).toBe(false)
        }
      }
    }
  })

  it('quick answers all have a question and an answer', () => {
    expect(QUICK_ANSWERS.length).toBeGreaterThanOrEqual(4)
    for (const f of QUICK_ANSWERS) {
      expect(f.q.length).toBeGreaterThan(0)
      expect(f.a.length).toBeGreaterThan(0)
    }
  })
})

describe('buildGuideHtml — printable PDF document', () => {
  it('renders a complete standalone HTML document with the same sections', () => {
    const html = buildGuideHtml({ role: 'ceo', perms: {}, roleLabel: 'Company Owner', systemName: 'Acme Workforce', version: '1.2.3' })
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('Acme Workforce')
    expect(html).toContain('Company Owner')
    expect(html).toContain('Time Keeping')
    expect(html).toContain('Quick answers')
    expect(html).toContain('</html>')
    // HTML-escaping is applied to copy (apostrophes are quotes-safe).
    expect(html).not.toMatch(/<script/i)
  })
})
