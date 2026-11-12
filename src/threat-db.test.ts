import { describe, expect, it } from 'vitest'
import { extractDomainInputs, extractDomains, normalizeDomain, searchRecords } from './threat-db'

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

  it('normalizes case, trailing dots, www, full-width dots, and IDN/Punycode', () => {
    expect(normalizeDomain('HTTPS://WWW.Example.COM./path')).toBe('example.com')
    expect(normalizeDomain('WWW.Example。COM。')).toBe('example.com')
    expect(normalizeDomain('https://測試.台灣/說明')).toBe('xn--g6w251d.xn--kpry57d')
    expect(normalizeDomain('xn--g6w251d.xn--kpry57d')).toBe('xn--g6w251d.xn--kpry57d')
    expect(extractDomains('請看 WWW.Example。COM。')).toEqual(['example.com'])
  })

  it('preserves the original domain text alongside the normalized hostname', () => {
    expect(extractDomainInputs('請看 HTTPS://WWW.Example.COM./path')).toEqual([{
      original: 'HTTPS://WWW.Example.COM',
      normalized: 'example.com',
    }])
  })

  it('does not turn Chinese text immediately before an URL into a fake IDN', () => {
    expect(extractDomainInputs('食安自負。https://kk1.site/HZaNAd 你填寫好')).toEqual([{
      original: 'https://kk1.site/HZaNAd',
      normalized: 'kk1.site',
    }])
  })

  it('matches a known domain and its subdomains', () => {
    const result = searchRecords('登入 https://login.known-scam.example/account', testDatabase)
    expect(result.status).toBe('matched')
    expect(result.matches[0]?.domain).toBe('known-scam.example')
    expect(result.matches[0]?.matchType).toBe('parent-domain')
    expect(result.matches[0]?.originalInput).toBe('https://login.known-scam.example/account')
  })

  it('requires an exact tenant hostname on shared hosting platforms', () => {
    const database = {
      ...testDatabase,
      recordCount: 2,
      records: [
        ['badtenant.github.io', 1, 'shopping', '20261110'],
        ['github.io', 1, 'shopping', '20261110'],
      ] as [string, number, string, string][],
    }
    expect(searchRecords('https://badtenant.github.io/pay', database).status).toBe('matched')
    expect(searchRecords('https://other.github.io/pay', database).status).toBe('not-matched')
  })

  it.each(['forms.gle', 'bit.ly', 't.co', 'facebook.com', 'instagram.com'])('does not treat a shared platform root record as platform-wide evidence: %s', (domain) => {
    const database = {
      ...testDatabase,
      records: [[domain, 1, 'shopping', '20261110']] as [string, number, string, string][],
    }
    expect(searchRecords(`https://${domain}/some-user-content`, database).status).toBe('not-matched')
  })

  it('reports a clean miss without claiming safety', () => {
    const result = searchRecords('https://unknown.example', testDatabase)
    expect(result.status).toBe('not-matched')
    expect(result.matches).toHaveLength(0)
  })
})
