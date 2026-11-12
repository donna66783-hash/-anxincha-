import { describe, expect, it } from 'vitest'
import snapshot from '../public/data/threat-intelligence.json'
import { searchRecords, type ThreatDatabase } from './threat-db'

const database = snapshot as unknown as ThreatDatabase
const actualDomain = database.records.find(([domain]) => domain.includes('.') && !domain.endsWith('forms.gle'))?.[0]

describe('production government threat snapshot smoke test', () => {
  it('loads a verified snapshot with traceable source metadata', () => {
    expect(database.recordCount).toBe(database.records.length)
    expect(database.recordCount).toBeGreaterThan(100_000)
    expect(database.lastSuccessfulDownloadAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(database.lastVerifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(database.sources.length).toBeGreaterThanOrEqual(3)
    for (const source of database.sources) {
      expect(source.license).toContain('政府資料開放授權條款')
      expect(source.contentUpdatedAt).toBeTruthy()
      expect(source.downloadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(source.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })

  it('matches a real record using text-only case, www, trailing-dot and parent-domain variants', () => {
    expect(actualDomain).toBeTruthy()
    const upperVariant = `HTTPS://WWW.${actualDomain!.toUpperCase()}.`
    const exact = searchRecords(upperVariant, database)
    expect(exact.status).toBe('matched')
    expect(exact.matches[0]?.domain).toBe(actualDomain)
    expect(exact.matches[0]?.matchType).toBe('exact-hostname')
    expect(exact.matches[0]?.originalInput).toBe(upperVariant.replace(/\.$/, ''))

    const child = searchRecords(`subdomain.${actualDomain}`, database)
    expect(child.status).toBe('matched')
    expect(child.matches[0]?.matchType).toBe('parent-domain')
  })

  it('never opens a listed domain during lookup', () => {
    const originalFetch = globalThis.fetch
    let called = false
    globalThis.fetch = (() => { called = true; throw new Error('network access is forbidden in this smoke test') }) as typeof fetch
    try {
      expect(searchRecords(actualDomain!, database).status).toBe('matched')
      expect(called).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
