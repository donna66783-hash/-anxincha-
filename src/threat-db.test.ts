import { describe, expect, it } from 'vitest'
import { extractDomains, searchRecords } from './threat-db'

const testDatabase = {
  version: '2026-11-11',
  recordCount: 1,
  categories: { shopping: '假購物／電子商務' },
  sources: [{ id: 1, name: '政府測試資料', datasetUrl: 'https://data.gov.tw/', license: '政府資料開放授權條款', importedRows: 1 }],
  records: [['known-scam.example', 1, 'shopping', '20261110']] as [string, number, string, string][],
}

describe('threat database lookup', () => {
  it('extracts and normalizes domains from a message', () => {
    expect(extractDomains('請看 https://WWW.Example.com/path，謝謝')).toEqual(['example.com'])
  })

  it('matches a known domain and its subdomains', () => {
    const result = searchRecords('登入 https://login.known-scam.example/account', testDatabase)
    expect(result.status).toBe('matched')
    expect(result.matches[0]?.domain).toBe('known-scam.example')
  })

  it('reports a clean miss without claiming safety', () => {
    const result = searchRecords('https://unknown.example', testDatabase)
    expect(result.status).toBe('not-matched')
    expect(result.matches).toHaveLength(0)
  })
})
