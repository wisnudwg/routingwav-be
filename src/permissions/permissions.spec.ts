import { generateTempPassword } from '../common/temp-password'
import { CATALOG, PERMISSIONS, limitToProfiles, normalizePermissions, requiresOf } from './catalog'

describe('normalizePermissions', () => {
  it('adds dependencies, drops unknown and owner-only ids', () => {
    const result = normalizePermissions(['talent:products.manage', 'team:manage', 'nope'])
    expect(result).toEqual(['mode:talent', 'talent:products.view', 'talent:products.manage'])
  })

  it('pulls every dependency of a financial permission', () => {
    expect(normalizePermissions(['wallet:withdraw'])).toEqual(
      expect.arrayContaining(['wallet:view', 'approvals:view', 'wallet:withdraw']),
    )
  })

  it('returns catalog order without duplicates', () => {
    const result = normalizePermissions(['messages:send', 'messages:view', 'messages:send'])
    expect(result).toEqual(['messages:view', 'messages:send'])
  })
})

describe('limitToProfiles', () => {
  it('drops permissions of profiles the account does not have', () => {
    const all = normalizePermissions(['talent:sales.view', 'client:orders.view', 'messages:view'])
    expect(limitToProfiles(all, ['talent'])).toEqual(['mode:talent', 'talent:sales.view', 'messages:view'])
  })
})

describe('catalog integrity', () => {
  it('only references permissions that exist', () => {
    for (const p of PERMISSIONS) {
      for (const r of CATALOG[p].requires ?? []) expect(PERMISSIONS).toContain(r)
    }
  })

  it('has no dependency cycles', () => {
    const visit = (p: (typeof PERMISSIONS)[number], path: string[]) => {
      expect(path).not.toContain(p)
      for (const r of requiresOf(p)) visit(r, [...path, p])
    }
    PERMISSIONS.forEach((p) => visit(p, []))
  })
})

describe('generateTempPassword', () => {
  it('has the 4-4-4 format without look-alike characters', () => {
    const pattern = /^[A-HJ-NP-Za-km-z2-9]{4}(-[A-HJ-NP-Za-km-z2-9]{4}){2}$/
    for (let i = 0; i < 200; i++) expect(generateTempPassword()).toMatch(pattern)
  })

  it('does not repeat', () => {
    expect(new Set(Array.from({ length: 200 }, generateTempPassword)).size).toBe(200)
  })
})