import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const databasePath = resolve('public', 'data', 'threat-intelligence.json')
const database = JSON.parse(await readFile(databasePath, 'utf8'))
const communityPath = resolve('public', 'data', 'community-intelligence.json')
const community = JSON.parse(await readFile(communityPath, 'utf8'))
const failures = []

function requireCondition(condition, message) {
  if (!condition) failures.push(message)
}

requireCondition(database.schemaVersion === 1, 'schemaVersion 必須是 1')
requireCondition(/^\d{4}-\d{2}-\d{2}$/.test(database.version), 'version 必須是 YYYY-MM-DD')
requireCondition(!Number.isNaN(Date.parse(database.generatedAt)), 'generatedAt 必須是有效時間')
requireCondition(!Number.isNaN(Date.parse(database.lastSuccessfulDownloadAt)), 'lastSuccessfulDownloadAt 必須是有效時間')
requireCondition(!Number.isNaN(Date.parse(database.lastVerifiedAt)), 'lastVerifiedAt 必須是有效時間')
requireCondition(Array.isArray(database.records), 'records 必須是陣列')
requireCondition(database.recordCount === database.records?.length, 'recordCount 與實際筆數不一致')
requireCondition(database.recordCount >= 100_000, '網域總數異常少於 100,000，拒絕發布')
requireCondition(Array.isArray(database.sources) && database.sources.length === 3, '資料來源應為 3 個')

const expectedSources = new Map([[1, 1_000], [2, 50_000], [4, 10_000]])
for (const source of database.sources ?? []) {
  const minimumRows = expectedSources.get(source.id)
  requireCondition(minimumRows !== undefined, `未知的來源 ID：${source.id}`)
  if (minimumRows !== undefined) requireCondition(source.importedRows >= minimumRows, `${source.name} 匯入筆數異常少於 ${minimumRows}`)
  requireCondition(source.license === '政府資料開放授權條款－第 1 版', `${source.name} 授權標示不符`)
  requireCondition(typeof source.metadataUpdatedAt === 'string' && source.metadataUpdatedAt.length > 0, `${source.name} 缺少官方詮釋資料更新時間或未知標示`)
  requireCondition(source.contentUpdatedAt === '未知' || /^\d{6}(?:\d{2})?$/.test(source.contentUpdatedAt), `${source.name} 來源內容版本格式不符`)
  requireCondition(!Number.isNaN(Date.parse(source.downloadedAt)), `${source.name} 下載時間無效`)
  requireCondition(!Number.isNaN(Date.parse(source.verifiedAt)), `${source.name} 確認時間無效`)
}

let previousDomain = ''
const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/
for (let index = 0; index < (database.records?.length ?? 0); index += 1) {
  const record = database.records[index]
  if (!Array.isArray(record) || record.length !== 4) {
    failures.push(`第 ${index + 1} 筆資料格式錯誤`)
    continue
  }
  const [domain, sourceMask, categories, lastSeen] = record
  requireCondition(domainPattern.test(domain), `無效網域：${domain}`)
  requireCondition(domain > previousDomain, `網域未排序或重複：${domain}`)
  requireCondition(Number.isInteger(sourceMask) && sourceMask >= 1 && sourceMask <= 7, `${domain} 的來源遮罩無效`)
  requireCondition(typeof categories === 'string' && categories.length > 0, `${domain} 缺少分類`)
  requireCondition(lastSeen === '' || /^\d{6}(?:\d{2})?$/.test(lastSeen), `${domain} 的日期格式無效`)
  previousDomain = domain
}

requireCondition(community.schemaVersion === 1, '社群案例庫 schemaVersion 必須是 1')
requireCondition(/^\d{4}-\d{2}-\d{2}$/.test(community.version), '社群案例庫 version 必須是 YYYY-MM-DD')
requireCondition(Array.isArray(community.records), '社群案例庫 records 必須是陣列')
requireCondition(community.recordCount === community.records?.length, '社群案例庫 recordCount 與實際筆數不一致')
requireCondition(typeof community.privacy === 'string' && community.privacy.includes('去識別化'), '社群案例庫必須說明去識別化原則')

for (const [index, record] of (community.records ?? []).entries()) {
  requireCondition(typeof record.id === 'string' && record.id.length > 0, `社群案例第 ${index + 1} 筆缺少 id`)
  requireCondition(typeof record.source === 'string' && record.source.length > 0, `社群案例 ${record.id} 缺少來源`)
  requireCondition(/^\d{4}-\d{2}-\d{2}$/.test(record.observedAt), `社群案例 ${record.id} 日期格式錯誤`)
  requireCondition(Number.isInteger(record.minSignals) && record.minSignals >= 2, `社群案例 ${record.id} 至少需要兩項訊號`)
  requireCondition(Array.isArray(record.signals) && record.signals.length >= record.minSignals, `社群案例 ${record.id} 訊號不足`)
  for (const signal of record.signals ?? []) {
    requireCondition(typeof signal.pattern === 'string' && signal.pattern.length > 0, `社群案例 ${record.id} 含空白規則`)
    try { new RegExp(signal.pattern, 'i') } catch { failures.push(`社群案例 ${record.id} 含無效規則`) }
  }
}

if (failures.length) {
  console.error('特徵庫驗證失敗：')
  for (const failure of failures.slice(0, 30)) console.error(`- ${failure}`)
  if (failures.length > 30) console.error(`- 另有 ${failures.length - 30} 個錯誤未顯示`)
  process.exit(1)
}

console.log(`特徵庫驗證通過：${database.recordCount.toLocaleString('zh-TW')} 個唯一網域、${community.recordCount.toLocaleString('zh-TW')} 筆去識別化社群案例、版本 ${database.version}`)
