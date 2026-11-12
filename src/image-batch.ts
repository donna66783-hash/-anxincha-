import type { AnalysisResult, DecisionState } from './analyzer'

export interface BatchAnalysisItem {
  order: number
  result: AnalysisResult
}

const priority: Record<DecisionState, number> = {
  HIGH_RISK: 4,
  SUSPICIOUS: 3,
  INSUFFICIENT_EVIDENCE: 2,
  NO_KNOWN_SIGNALS: 1,
}

export function decisionPriority(state: DecisionState) {
  return priority[state]
}

export function selectStrongestImageResult<T extends BatchAnalysisItem>(items: T[]) {
  return [...items].sort((left, right) =>
    decisionPriority(right.result.state) - decisionPriority(left.result.state)
    || right.result.score - left.result.score
    || left.order - right.order,
  )[0]
}

function normalizedLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
}

export function deduplicateConversationTexts(texts: string[]) {
  const combined: string[] = []
  for (const text of texts) {
    const incoming = normalizedLines(text)
    let overlap = 0
    const maxOverlap = Math.min(combined.length, incoming.length)
    for (let size = maxOverlap; size >= 1; size -= 1) {
      const tail = combined.slice(-size).join('\n').toLocaleLowerCase('zh-TW')
      const head = incoming.slice(0, size).join('\n').toLocaleLowerCase('zh-TW')
      if (tail === head) {
        overlap = size
        break
      }
    }
    combined.push(...incoming.slice(overlap))
  }
  return combined.join('\n')
}
