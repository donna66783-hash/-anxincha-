import { describe, expect, it } from 'vitest'
import { matchCommunityRecords, type CommunityDatabase } from './community-db'
import publishedDatabaseJson from '../public/data/community-intelligence.json'

const database: CommunityDatabase = {
  schemaVersion: 1,
  version: '2026-11-11',
  recordCount: 1,
  privacy: '去識別化',
  records: [{
    id: 'case-1',
    source: '測試來源',
    observedAt: '2026-11-08',
    category: '社群導流／個資蒐集',
    minSignals: 2,
    signals: [
      { pattern: '加入.{0,8}社群', title: '加入社群', detail: '導流' },
      { pattern: '填寫.{0,8}資料', title: '填資料', detail: '個資' },
      { pattern: '電話.{0,8}提醒', title: '電話追催', detail: '施壓' },
    ],
  }],
}

describe('matchCommunityRecords', () => {
  it('matches when enough independent signals appear', () => {
    const result = matchCommunityRecords('請填寫資料，我們會邀請你加入新的社群。', database)
    expect(result.status).toBe('matched')
    expect(result.matches[0].matchedSignals).toHaveLength(2)
  })

  it('does not match an isolated generic phrase', () => {
    const result = matchCommunityRecords('歡迎加入社群一起分享照片。', database)
    expect(result.status).toBe('not-matched')
  })

  it('matches the submitted screenshot wording with the published case database', () => {
    const publishedDatabase = publishedDatabaseJson as CommunityDatabase
    const screenshotText = '一直要我填寫資料加入另一個社群，我不理他還直接來電。我來邀請您加入社群商品資訊，收到後會幫您加入社群。之前打電話沒接，所以打電話提醒您完成申請。'
    const result = matchCommunityRecords(screenshotText, publishedDatabase)
    expect(result.status).toBe('matched')
    expect(result.matches[0].matchedSignals.length).toBeGreaterThanOrEqual(2)
  })

  it('matches CJK text even when screenshot OCR inserts spaces', () => {
    const result = matchCommunityRecords('邀 請 您 加 入 社 群 看 商 品 資 訊 所 以 打 電 話 提 醒 妳 完 成 申 請', database)
    expect(result.status).toBe('matched')
    expect(result.matches[0].matchedSignals.length).toBeGreaterThanOrEqual(2)
  })
})
