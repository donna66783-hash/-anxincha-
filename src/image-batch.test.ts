import { describe, expect, it } from 'vitest'
import { analyzeContent } from './analyzer'
import { deduplicateConversationTexts, selectStrongestImageResult } from './image-batch'

describe('image batch analysis', () => {
  it('uses the required decision-state priority before score', () => {
    const items = [
      { order: 1, result: analyzeContent('一般對話') },
      { order: 2, result: analyzeContent('請加 LINE：abc123') },
      { order: 3, result: analyzeContent('', undefined, undefined, { source: 'image', ocrFailure: '沒有文字' }) },
    ]
    expect(selectStrongestImageResult(items)?.order).toBe(2)
  })

  it('does not combine weak signals when images are independent', () => {
    const items = [
      { order: 1, result: analyzeContent('立即加 LINE：abc123') },
      { order: 2, result: analyzeContent('請填寫姓名與電話完成登記') },
    ]
    expect(items.every((item) => item.result.state === 'SUSPICIOUS')).toBe(true)
    expect(selectStrongestImageResult(items)?.result.state).toBe('SUSPICIOUS')
    expect(analyzeContent('立即加 LINE：abc123\n請填寫姓名與電話完成登記').state).toBe('HIGH_RISK')
  })

  it('removes only adjacent line overlap in one conversation', () => {
    expect(deduplicateConversationTexts([
      '您好\n請問商品還在嗎\n請加 LINE',
      '請問商品還在嗎\n請加 LINE\n帳號 abc123',
    ])).toBe('您好\n請問商品還在嗎\n請加 LINE\n帳號 abc123')
  })

  it('keeps a successful high-risk image visible when another image fails', () => {
    const items = [
      { order: 1, result: analyzeContent('', undefined, undefined, { source: 'image', ocrFailure: '沒有文字' }) },
      { order: 2, result: analyzeContent('我是檢察官，今天內請匯款到監管帳戶。', undefined, undefined, { source: 'image', ocrConfidence: 90, ocrTextLength: 22 }) },
    ]
    expect(selectStrongestImageResult(items)?.order).toBe(2)
    expect(selectStrongestImageResult(items)?.result.state).toBe('HIGH_RISK')
  })
})
