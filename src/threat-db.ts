export interface ThreatSource {
  id: number
  name: string
  datasetUrl: string
  license: string
  importedRows: number
  metadataUpdatedAt?: string
  contentUpdatedAt?: string
  downloadedAt?: string
  verifiedAt?: string
}

type ThreatRecord = [domain: string, sourceMask: number, categories: string, lastSeen: string]

export interface ThreatDatabase {
  schemaVersion: number
  version: string
  generatedAt: string
  lastSuccessfulDownloadAt?: string
  lastVerifiedAt?: string
  recordCount: number
  categories: Record<string, string>
  sources: ThreatSource[]
  records: ThreatRecord[]
}

export interface DatabaseMatch {
  domain: string
  inputDomain: string
  originalInput?: string
  matchType?: 'exact-hostname' | 'parent-domain'
  category: string
  lastSeen: string
  sources: ThreatSource[]
}

export type DatabaseStatus = 'matched' | 'not-matched' | 'no-domain' | 'unavailable'

export interface DatabaseSearchResult {
  status: DatabaseStatus
  matches: DatabaseMatch[]
  searchedDomains: string[]
  searchedInputs?: Array<{ original: string; normalized: string }>
  version?: string
  recordCount?: number
  generatedAt?: string
  lastSuccessfulDownloadAt?: string
  lastVerifiedAt?: string
  sources?: ThreatSource[]
  error?: string
}

let databasePromise: Promise<ThreatDatabase> | undefined

const sharedPlatformRoots = new Set([
  'bit.ly', 'docs.google.com', 'drive.google.com', 'facebook.com', 'forms.gle',
  'instagram.com', 'line.me', 'linktr.ee', 'm.facebook.com', 't.co',
  'threads.net', 'tinyurl.com',
])

const sharedHostingSuffixes = ['github.io', 'notion.site']

export function normalizeDomain(value: string) {
  let candidate = value.trim().toLowerCase()
    .replace(/[。．｡]/g, '.')
    .replace(/[，！？、；：）】》〉\]}>,!?;:'"]+$/g, '')
  try {
    const url = new URL(candidate.includes('://') ? candidate : `https://${candidate}`)
    candidate = url.hostname
  } catch {
    candidate = candidate.split('/')[0]
  }
  return candidate.replace(/^www\./, '').replace(/\.$/, '')
}

export function extractDomainInputs(content: string) {
  const explicitUrls = content.match(/https?:\/\/[^\s<>"']+/giu) ?? []
  const remaining = explicitUrls.reduce((text, url) => text.replace(url, ' '), content)
  const bareDomains = remaining.match(/(?<![\p{L}\p{N}-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?[.。．｡])+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})(?:\/[^\s<>"']*)?/giu) ?? []
  const matches = [...explicitUrls, ...bareDomains]
  const unique = new Map<string, { original: string; normalized: string }>()
  matches.forEach((original) => {
    const normalized = normalizeDomain(original)
    const rawHost = original.match(/^https?:\/\/([^/]+)/iu)?.[1]
    const preservedOriginal = rawHost?.endsWith('.')
      ? (original.match(/^https?:\/\/[^/]+/iu)?.[0] ?? original).replace(/\.$/, '')
      : original.replace(/[，！？、；：）】》〉\]}>,!?;:'"]+$/gu, '')
    if (normalized.includes('.') && !unique.has(normalized)) unique.set(normalized, { original: preservedOriginal, normalized })
  })
  return [...unique.values()]
}

export function extractDomains(content: string) {
  return extractDomainInputs(content).map(({ normalized }) => normalized)
}

function candidateDomains(domain: string) {
  if (sharedPlatformRoots.has(domain) || sharedHostingSuffixes.some((suffix) => domain === suffix || domain.endsWith(`.${suffix}`))) return [domain]
  const labels = domain.split('.')
  const candidates = [domain]
  for (let index = 1; index < labels.length - 1; index += 1) candidates.push(labels.slice(index).join('.'))
  return candidates
}

function buildMatch(
  originalInput: string,
  inputDomain: string,
  matchType: DatabaseMatch['matchType'],
  record: ThreatRecord,
  database: Pick<ThreatDatabase, 'categories' | 'sources'>,
): DatabaseMatch {
  const [domain, sourceMask, categoryCodes, lastSeen] = record
  const categories = categoryCodes.split('|').map((code) => database.categories[code]).filter(Boolean)
  return {
    domain,
    inputDomain,
    originalInput,
    matchType,
    category: categories.join('、') || '已知涉詐網站',
    lastSeen,
    sources: database.sources.filter((source) => (sourceMask & source.id) !== 0),
  }
}

export function searchRecords(
  content: string,
  database: Pick<ThreatDatabase, 'version' | 'recordCount' | 'categories' | 'sources' | 'records'> & Partial<Pick<ThreatDatabase, 'generatedAt' | 'lastSuccessfulDownloadAt' | 'lastVerifiedAt'>>,
): DatabaseSearchResult {
  const searchedInputs = extractDomainInputs(content)
  const searchedDomains = searchedInputs.map(({ normalized }) => normalized)
  if (!searchedDomains.length) {
    return { status: 'no-domain', matches: [], searchedDomains, searchedInputs, version: database.version, recordCount: database.recordCount, generatedAt: database.generatedAt, lastSuccessfulDownloadAt: database.lastSuccessfulDownloadAt, lastVerifiedAt: database.lastVerifiedAt, sources: database.sources }
  }

  const index = new Map(database.records.map((record) => [record[0], record]))
  const matches = searchedInputs.flatMap(({ original, normalized: inputDomain }) => {
    for (const candidate of candidateDomains(inputDomain)) {
      const record = index.get(candidate)
      if (record && !sharedPlatformRoots.has(record[0])) {
        return [buildMatch(original, inputDomain, candidate === inputDomain ? 'exact-hostname' : 'parent-domain', record, database)]
      }
    }
    return []
  })

  return {
    status: matches.length ? 'matched' : 'not-matched',
    matches,
    searchedDomains,
    searchedInputs,
    version: database.version,
    recordCount: database.recordCount,
    generatedAt: database.generatedAt,
    lastSuccessfulDownloadAt: database.lastSuccessfulDownloadAt,
    lastVerifiedAt: database.lastVerifiedAt,
    sources: database.sources,
  }
}

async function loadDatabase() {
  if (!databasePromise) {
    const databaseUrl = new URL('./data/threat-intelligence.json', document.baseURI)
    databasePromise = fetch(databaseUrl, { cache: 'no-cache' }).then(async (response) => {
      if (!response.ok) throw new Error(`資料庫載入失敗（HTTP ${response.status}）`)
      const database = await response.json() as ThreatDatabase
      if (database.schemaVersion !== 1 || !Array.isArray(database.records)) throw new Error('資料庫格式不相容')
      return database
    })
  }
  return databasePromise
}

export async function searchThreatDatabase(content: string): Promise<DatabaseSearchResult> {
  try {
    return searchRecords(content, await loadDatabase())
  } catch (error) {
    return {
      status: 'unavailable',
      matches: [],
      searchedDomains: extractDomains(content),
      error: error instanceof Error ? error.message : '無法載入資料庫',
    }
  }
}
