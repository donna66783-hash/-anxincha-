import { describe, expect, it } from 'vitest'
import { escapeRegex, parseBoolean, validateReportFields, type ReportFields } from './index'

const validReport: ReportFields = {
  reportType: 'chat_screenshot',
  reportText: '對方要求改用私人 LINE 並填寫資料。',
  contextText: '',
  analysisState: 'SUSPICIOUS',
  analysisCategory: '社群導流',
  analysisScore: 30,
  consentCaseStorage: true,
  consentResearch: false,
  consentModelTraining: false,
  sourceRightsConfirmed: true,
  attachmentConsent: false,
  honeypot: '',
}

describe('report API validation', () => {
  it('accepts a minimally consented report', () => {
    expect(validateReportFields(validReport)).toEqual([])
  })

  it('requires storage consent and sharing rights', () => {
    const errors = validateReportFields({ ...validReport, consentCaseStorage: false, sourceRightsConfirmed: false })
    expect(errors).toHaveLength(2)
  })

  it('rejects invalid scores and bot honeypots', () => {
    const errors = validateReportFields({ ...validReport, analysisScore: 101, honeypot: 'spam' })
    expect(errors).toHaveLength(2)
  })

  it('escapes approved literal signals before publishing them as regex', () => {
    expect(escapeRegex('LINE (客服)+')).toBe('LINE \\(客服\\)\\+')
    expect(parseBoolean('true')).toBe(true)
  })
})

