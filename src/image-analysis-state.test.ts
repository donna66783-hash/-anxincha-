import { describe, expect, it } from 'vitest'
import { applyCorrection, effectiveImageText, restoreOriginal, type EditableImageText } from './image-analysis-state'

function items(count = 10): EditableImageText[] {
  return Array.from({ length: count }, (_, index) => ({
    imageId: `image-${index + 1}`,
    imageIndex: index + 1,
    ocrOriginalText: `原始文字 ${index + 1}`,
    userCorrectedText: '',
    correctionStatus: 'original',
  }))
}

describe('editable image analysis state', () => {
  it('changes only the selected image among ten', () => {
    const updated = applyCorrection(items(), 'image-6', '人工確認的交易文字')
    expect(updated.filter((item) => item.correctionStatus === 'corrected')).toHaveLength(1)
    expect(updated[5]?.userCorrectedText).toBe('人工確認的交易文字')
    expect(updated[4]?.ocrOriginalText).toBe('原始文字 5')
  })

  it('keeps original OCR separate from the correction', () => {
    const [updated] = applyCorrection(items(1), 'image-1', '修正後文字')
    expect(updated?.ocrOriginalText).toBe('原始文字 1')
    expect(effectiveImageText(updated!).text).toBe('修正後文字')
    expect(effectiveImageText(updated!).textSource).toBe('user-corrected-ocr')
  })

  it('restores original OCR deterministically', () => {
    const corrected = applyCorrection(items(1), 'image-1', '修正後文字')
    const [restored] = restoreOriginal(corrected, 'image-1')
    expect(effectiveImageText(restored!).text).toBe('原始文字 1')
    expect(effectiveImageText(restored!).textSource).toBe('automatic-ocr')
  })

  it('deduplicates identical supplemental text instead of scoring it twice', () => {
    const item = { ...items(1)[0]!, supplementalText: '原始文字 1' }
    expect(effectiveImageText(item).text).toBe('原始文字 1')
    expect(effectiveImageText(item).textSource).toBe('mixed')
  })

  it('allows user text when OCR is empty', () => {
    const item = { ...items(1)[0]!, ocrOriginalText: '', userCorrectedText: '人工補上的可疑交易內容', correctionStatus: 'corrected' as const }
    expect(effectiveImageText(item)).toEqual({ text: '人工補上的可疑交易內容', textSource: 'user-corrected-ocr' })
  })
})
