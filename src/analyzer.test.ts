import { describe, expect, it } from 'vitest'
import { analyzeContent } from './analyzer'

describe('analyzeContent', () => {
  it('marks coercive fake-police messages as high risk', () => {
    const result = analyzeContent('我是檢察官，你涉及洗錢。偵查不公開，今天內把錢匯到監管帳戶。')
    expect(result.level).toBe('high')
    expect(result.category).toBe('假檢警')
    expect(result.findings.length).toBeGreaterThanOrEqual(3)
  })

  it('keeps ordinary messages low risk', () => {
    const result = analyzeContent('明天下午三點在圖書館見面，記得帶筆記。')
    expect(result.level).toBe('low')
    expect(result.score).toBe(0)
  })

  it('flags suspicious URLs', () => {
    const result = analyzeContent('請登入 http://bank-secure-help.top/login')
    expect(result.level).not.toBe('low')
    expect(result.findings.some((finding) => finding.title.includes('HTTPS'))).toBe(true)
  })

  it('treats an official database match as high risk', () => {
    const result = analyzeContent('請到 https://bad.example 登入', {
      status: 'matched',
      searchedDomains: ['bad.example'],
      version: '2026-11-11',
      recordCount: 1,
      matches: [{
        domain: 'bad.example',
        inputDomain: 'bad.example',
        category: '仿冒登入／竊取帳密',
        lastSeen: '20261111',
        sources: [{ id: 1, name: '測試政府資料', datasetUrl: 'https://data.gov.tw/', license: '政府資料開放授權條款', importedRows: 1 }],
      }],
    })
    expect(result.level).toBe('high')
    expect(result.score).toBeGreaterThanOrEqual(85)
    expect(result.summary).toContain('政府公開涉詐資料')
  })

  it('treats a multi-signal community case match as high risk without a URL', () => {
    const result = analyzeContent('請填寫資料加入另一個社群，沒接電話所以再打電話提醒你完成申請。', undefined, {
      status: 'matched',
      version: '2026-11-11',
      recordCount: 1,
      matches: [{
        id: 'case-1',
        source: '去識別化測試案例',
        observedAt: '2026-11-08',
        category: '社群導流／個資蒐集',
        matchedSignals: [
          { title: '引導加入另一個社群', detail: '導流警訊。' },
          { title: '要求填寫資料', detail: '個資警訊。' },
          { title: '電話追催', detail: '施壓警訊。' },
        ],
      }],
    })
    expect(result.level).toBe('high')
    expect(result.category).toBe('社群導流／個資蒐集')
    expect(result.summary).toContain('社群詐騙案例')
  })
})
