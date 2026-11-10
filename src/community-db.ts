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
  error?: string
}

let databasePromise: Promise<CommunityDatabase> | undefined

function databaseUrl() {
  return new URL('data/community-intelligence.json', document.baseURI).toString()
}

async function loadDatabase() {
  databasePromise ??= fetch(databaseUrl()).then(async (response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json() as Promise<CommunityDatabase>
  })
  return databasePromise
}

export function matchCommunityRecords(content: string, database: CommunityDatabase): CommunitySearchResult {
  const matches = database.records.flatMap((record) => {
    const matchedSignals = record.signals
      .filter((signal) => new RegExp(signal.pattern, 'i').test(content))
      .map(({ title, detail }) => ({ title, detail }))
    if (matchedSignals.length < record.minSignals) return []
    return [{ id: record.id, source: record.source, observedAt: record.observedAt, category: record.category, matchedSignals }]
  })
  return {
    status: matches.length ? 'matched' : 'not-matched',
    matches,
    version: database.version,
    recordCount: database.recordCount,
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
