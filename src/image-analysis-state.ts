import { deduplicateConversationTexts } from './image-batch'

export type CorrectionStatus = 'original' | 'corrected' | 'restored'
export type ImageTextSource = 'automatic-ocr' | 'user-corrected-ocr' | 'user-supplied' | 'mixed'
export type SupplementScope = 'background' | 'conversation' | 'single-image'

export interface EditableImageText {
  imageId: string
  imageIndex: number
  ocrOriginalText: string
  userCorrectedText: string
  correctionStatus: CorrectionStatus
  supplementalText?: string
}

export function effectiveImageText(item: EditableImageText) {
  const primary = item.correctionStatus === 'corrected' ? item.userCorrectedText : item.ocrOriginalText
  const text = deduplicateConversationTexts([primary, item.supplementalText ?? ''])
  const textSource: ImageTextSource = item.supplementalText
    ? primary.trim() ? 'mixed' : 'user-supplied'
    : item.correctionStatus === 'corrected' ? 'user-corrected-ocr' : 'automatic-ocr'
  return { text, textSource }
}

export function applyCorrection<T extends EditableImageText>(items: T[], imageId: string, correctedText: string) {
  return items.map((item) => item.imageId === imageId
    ? { ...item, userCorrectedText: correctedText, correctionStatus: 'corrected' as const }
    : item)
}

export function restoreOriginal<T extends EditableImageText>(items: T[], imageId: string) {
  return items.map((item) => item.imageId === imageId
    ? { ...item, userCorrectedText: '', correctionStatus: 'restored' as const }
    : item)
}
