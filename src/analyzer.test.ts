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
    expect(result.state).toBe('NO_KNOWN_SIGNALS')
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

  it('detects an unseen social-engineering combination without database history', () => {
    const result = analyzeContent('活動小編說要留下姓名電話完成登記，再邀請我轉到新的 Telegram 群組，沒回覆還會打電話確認。')
    expect(result.level).toBe('high')
    expect(result.findings.some((finding) => finding.title.includes('個人資料'))).toBe(true)
    expect(result.findings.some((finding) => finding.title.includes('另一個社群'))).toBe(true)
    expect(result.findings.some((finding) => finding.title.includes('多項社交工程'))).toBe(true)
  })

  it('flags form-based personal-data collection even without a URL', () => {
    const result = analyzeContent('請填寫姓名、電話與地址完成活動登記。')
    expect(result.level).toBe('medium')
    expect(result.category).toBe('個資蒐集')
  })

  it('does not show a green result when screenshot OCR confidence is low', () => {
    const result = analyzeContent('晚點再聯絡', undefined, undefined, { source: 'image', ocrConfidence: 42 })
    expect(result.level).toBe('medium')
    expect(result.state).toBe('INSUFFICIENT_EVIDENCE')
    expect(result.findings.some((finding) => finding.title.includes('可信度不足'))).toBe(true)
  })

  it('uses a cautious result for an otherwise unmatched screenshot', () => {
    const result = analyzeContent('明天下午三點見面', undefined, undefined, { source: 'image', ocrConfidence: 91 })
    expect(result.level).toBe('medium')
    expect(result.state).toBe('INSUFFICIENT_EVIDENCE')
    expect(result.findings.some((finding) => finding.title.includes('足夠資訊'))).toBe(true)
  })

  it('returns insufficient evidence when screenshot OCR fails', () => {
    const result = analyzeContent('', undefined, undefined, {
      source: 'image',
      ocrConfidence: 0,
      ocrFailure: '圖片中沒有辨識到文字',
    })
    expect(result.state).toBe('INSUFFICIENT_EVIDENCE')
    expect(result.score).toBe(0)
    expect(result.summary).toContain('無法充分判斷')
  })

  it('uses suspicious state for a weak but known signal', () => {
    const result = analyzeContent('請加 LINE：abc123')
    expect(result.state).toBe('SUSPICIOUS')
    expect(result.level).toBe('medium')
  })

  it('uses a local semantic match when fixed keywords do not match', () => {
    const result = analyzeContent(
      '對方用很繞的方式叫我去別的地方聊，還希望我先交一些聯絡資訊。',
      undefined,
      undefined,
      { source: 'text' },
      {
        status: 'matched',
        model: 'test-model',
        matches: [{ category: '社群導流／個資蒐集', similarity: 0.72, example: '測試案例' }],
      },
    )
    expect(result.level).toBe('medium')
    expect(result.category).toBe('社群導流／個資蒐集')
    expect(result.findings.some((finding) => finding.title.includes('本機語意 AI'))).toBe(true)
  })

  it('normalizes spaced screenshot OCR and flags off-platform marketplace contact', () => {
    const result = analyzeContent('Marketplace 上 架 商 品 有 賣 出 了 嗎 我 家 人 要 買 麻 煩 您 加 下 她 的 LINE : z9617', undefined, undefined, { source: 'image', ocrConfidence: 81, ocrPasses: 2 })
    expect(result.level).toBe('high')
    expect(result.category).toBe('假買家／社群導流')
    expect(result.findings.some((finding) => finding.title.includes('離開原平台'))).toBe(true)
  })

  it('uses an official brand-domain mismatch as high-risk evidence', () => {
    const result = analyzeContent('vip-tcat.whds.shop 宅 急 便 填 寫 收 件 資 料 姓 名 電 話', undefined, undefined, { source: 'image', ocrConfidence: 71, ocrPasses: 2 })
    expect(result.level).toBe('high')
    expect(result.findings.some((finding) => finding.source?.name.includes('黑貓'))).toBe(true)
  })

  it('flags a fake recurring-order notice that diverts to LINE support', () => {
    const result = analyzeContent('訂 單 續 訂 時 間 後 續 將 週 期 性 扣 款 若 您 並 未 設 定 此 筆 交 易 聯 絡 客 服 LINE : am545gce', undefined, undefined, { source: 'image', ocrConfidence: 81, ocrPasses: 2 })
    expect(result.level).toBe('high')
    expect(result.category).toBe('假客服／假訂單')
  })

  it('flags an unnamed high-salary job post that diverts applicants to a private LINE ID', () => {
    const result = analyzeContent(`外商半導體測試設備商的應用工程師 FAE，年薪 150–200 萬，新竹、高雄都有缺。
條件符合的話留言或私訊我聊。
賴👉@aaa886`)
    expect(result.level).toBe('medium')
    expect(result.score).toBeGreaterThanOrEqual(40)
    expect(result.category).toBe('求職招募導流')
    expect(result.findings.some((finding) => finding.title.includes('未具名職缺'))).toBe(true)
  })

  it('does not flag a normal job-page announcement without private contact diversion', () => {
    const result = analyzeContent('本公司公開招募應用工程師，職務內容與投遞方式請查看 https://careers.example.com/jobs/123。')
    expect(result.level).toBe('low')
  })
})
