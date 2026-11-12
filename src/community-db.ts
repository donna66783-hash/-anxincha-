import { reportApiUrl as configuredReportApiUrl } from './config'

export interface CommunitySignal {
  pattern: string
  title: string
  detail: string
}

export interface CommunityRecord {
  id: string
  source: string
  observedAt: string
  category: string
  minSignals: number
  signals: CommunitySignal[]
}

export interface CommunityDatabase {
  schemaVersion: number
  version: string
  recordCount: number
  privacy: string
  records: CommunityRecord[]
}

export interface CommunityMatch {
  id: string
  source: string
  observedAt: string
  category: string
  matchedSignals: Array<Omit<CommunitySignal, 'pattern'>>
}

export interface CommunitySearchResult {
  status: 'matched' | 'not-matched' | 'unavailable'
  matches: CommunityMatch[]
  version?: string
  recordCount?: number
  privacy?: string
  error?: string
}

let databasePromise: Promise<CommunityDatabase> | undefined
const reportApiUrl = configuredReportApiUrl()

function databaseUrl() {
  return new URL('data/community-intelligence.json', document.baseURI).toString()
}

async function loadDatabase() {
  databasePromise ??= fetch(databaseUrl()).then(async (response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const local = await response.json() as CommunityDatabase
    if (!reportApiUrl) return local
    try {
      const remoteResponse = await fetch(`${reportApiUrl}/api/community-database`)
      if (!remoteResponse.ok) return local
      const remote = await remoteResponse.json() as CommunityDatabase
      const records = [...new Map([...local.records, ...remote.records].map((record) => [record.id, record])).values()]
      return {
        ...local,
        version: `${local.version} + 使用者核准庫 ${remote.version}`,
        recordCount: records.length,
        privacy: `${local.privacy} ${remote.privacy}`.trim(),
        records,
      }
    } catch {
      return local
    }
  })
  return databasePromise
}

export function matchCommunityRecords(content: string, database: CommunityDatabase): CommunitySearchResult {
  const normalizedContent = normalizeForMatching(content)
  const matches = database.records.flatMap((record) => {
    const matchedSignals = record.signals
      .filter((signal) => new RegExp(signal.pattern, 'i').test(normalizedContent))
      .map(({ title, detail }) => ({ title, detail }))
    if (matchedSignals.length < record.minSignals) return []
    return [{ id: record.id, source: record.source, observedAt: record.observedAt, category: record.category, matchedSignals }]
  })
  return {
    status: matches.length ? 'matched' : 'not-matched',
    matches,
    version: database.version,
    recordCount: database.recordCount,
    privacy: database.privacy,
  }
}

export async function searchCommunityDatabase(content: string): Promise<CommunitySearchResult> {
  try {
    return matchCommunityRecords(content, await loadDatabase())
  } catch (error) {
    return {
      status: 'unavailable',
      matches: [],
      error: error instanceof Error ? error.message : '社群案例庫載入失敗',
    }
  }
}
import { normalizeForMatching } from './text-normalizer'

