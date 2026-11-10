import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const databasePath = resolve('public', 'data', 'threat-intelligence.json')
const database = JSON.parse(await readFile(databasePath, 'utf8'))
const failures = []

function requireCondition(condition, message) {
  if (!condition) failures.push(message)
}

requireCondition(database.schemaVersion === 1, 'schemaVersion 必須是 1')
requireCondition(/^\d{4}-\d{2}-\d{2}$/.test(database.version), 'version 必須是 YYYY-MM-DD')
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

if (failures.length) {
  console.error('特徵庫驗證失敗：')
  for (const failure of failures.slice(0, 30)) console.error(`- ${failure}`)
  if (failures.length > 30) console.error(`- 另有 ${failures.length - 30} 個錯誤未顯示`)
  process.exit(1)
}

console.log(`特徵庫驗證通過：${database.recordCount.toLocaleString('zh-TW')} 個唯一網域、${database.sources.length} 個政府資料來源、版本 ${database.version}`)
