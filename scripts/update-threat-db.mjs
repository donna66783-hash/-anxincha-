import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const sources = [
  {
    id: 1,
    name: '數位產業署停止解析清單',
    datasetUrl: 'https://data.gov.tw/dataset/165027',
    downloadUrl: 'https://www-api.moda.gov.tw/OpenData/Files/16352',
    format: 'json',
  },
  {
    id: 2,
    name: '165 遭停止解析涉詐網站',
    datasetUrl: 'https://data.gov.tw/dataset/176455',
    downloadUrl: 'https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/29E8E643-88ED-4952-B21E-BD42A3B7108C/resource/A8BB0250-B8E1-40A9-806D-7A8D1BCDB991/download',
    format: 'csv',
  },
  {
    id: 4,
    name: '165 假投資（博弈）網站',
    datasetUrl: 'https://data.gov.tw/dataset/160055',
    downloadUrl: 'https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/033197D4-70F4-45EB-9FB8-6D83532B999A/resource/A00B1802-6A4A-42B4-B842-B66A2D937DAE/download',
    format: 'csv',
  },
]

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      row.push(field)
      field = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(field)
      if (row.some(Boolean)) rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }

  const headers = rows.shift()?.map((header) => header.replace(/^\uFEFF/, '').trim()) ?? []
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ''])))
}

function normalizeDomain(value) {
  let candidate = String(value ?? '').trim().toLowerCase()
  if (!candidate) return null
  candidate = candidate.replace(/^["']|["']$/g, '').replace(/^\*\./, '')

  try {
    const url = new URL(candidate.includes('://') ? candidate : `https://${candidate}`)
    candidate = url.hostname
  } catch {
    candidate = candidate.split('/')[0].split(':')[0]
  }

  candidate = candidate.replace(/^www\./, '').replace(/\.$/, '')
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/i.test(candidate)) return null
  return candidate
}

function normalizeDate(value, isRoc = false) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (isRoc && digits.length >= 5) {
    const rocYear = Number(digits.slice(0, 3))
    return `${rocYear + 1911}${digits.slice(3, 5)}`
  }
  return digits.slice(0, 8)
}

function classify(value) {
  const text = String(value ?? '')
  if (/投資|博弈|金融|保險|虛擬貨幣/.test(text)) return 'investment'
  if (/登入|帳密|驗證|銀行/.test(text)) return 'credential'
  if (/電子商務|購物|電商|賣場|商城/.test(text)) return 'shopping'
  if (/交友/.test(text)) return 'romance'
  return 'other'
}

function addRecord(index, domainValue, sourceId, categoryValue, dateValue) {
  const domain = normalizeDomain(domainValue)
  if (!domain) return
  const existing = index.get(domain) ?? { sourceMask: 0, categories: new Set(), lastSeen: '' }
  existing.sourceMask |= sourceId
  existing.categories.add(classify(categoryValue))
  if (dateValue > existing.lastSeen) existing.lastSeen = dateValue
  index.set(domain, existing)
}

async function download(source) {
  const response = await fetch(source.downloadUrl, { headers: { 'user-agent': 'Anxincha-Data-Updater/0.1' } })
  if (!response.ok) throw new Error(`${source.name} 下載失敗：HTTP ${response.status}`)
  return source.format === 'json' ? response.json() : parseCsv(await response.text())
}

const domainIndex = new Map()
const sourceCounts = {}

for (const source of sources) {
  const rows = await download(source)
  sourceCounts[source.id] = rows.length

  if (source.id === 1) {
    for (const row of rows) addRecord(domainIndex, row['網域名稱'] || row['偽冒網址'], source.id, row['一頁式數位經濟詐騙網站'], normalizeDate(row['接獲通報日期']))
  } else if (source.id === 2) {
    for (const row of rows) addRecord(domainIndex, row['網域'], source.id, row['網站性質'], normalizeDate(row['民國年月'], true))
  } else {
    for (const row of rows) addRecord(domainIndex, row['網址'], source.id, '假投資／博弈', normalizeDate(row['統計結束日期']))
  }
}

const records = [...domainIndex.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([domain, record]) => [domain, record.sourceMask, [...record.categories].sort().join('|'), record.lastSeen])

const generatedAt = new Date().toISOString()
const localDateParts = Object.fromEntries(new Intl.DateTimeFormat('en', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).formatToParts().map((part) => [part.type, part.value]))
const version = `${localDateParts.year}-${localDateParts.month}-${localDateParts.day}`
const database = {
  schemaVersion: 1,
  version,
  generatedAt,
  recordCount: records.length,
  categories: {
    investment: '假投資／金融／博弈',
    credential: '仿冒登入／竊取帳密',
    shopping: '假購物／電子商務',
    romance: '假交友',
    other: '已知涉詐網站',
  },
  sources: sources.map(({ id, name, datasetUrl }) => ({
    id,
    name,
    datasetUrl,
    license: '政府資料開放授權條款－第 1 版',
    importedRows: sourceCounts[id],
  })),
  records,
}

const outputPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'threat-intelligence.json')
await mkdir(dirname(outputPath), { recursive: true })

let existingDatabase
try {
  existingDatabase = JSON.parse(await readFile(outputPath, 'utf8'))
} catch {
  existingDatabase = undefined
}

function comparableDatabase(value) {
  if (!value || typeof value !== 'object') return ''
  const { version: _version, generatedAt: _generatedAt, ...content } = value
  return JSON.stringify(content)
}

if (comparableDatabase(existingDatabase) === comparableDatabase(database)) {
  console.log(`特徵庫內容沒有變更：保留 ${existingDatabase.version} 版本，共 ${records.length.toLocaleString('zh-TW')} 個網域`)
  process.exit(0)
}

await writeFile(outputPath, JSON.stringify(database), 'utf8')

const sizeMb = Buffer.byteLength(JSON.stringify(database)) / 1024 / 1024
console.log(`特徵庫更新完成：${records.length.toLocaleString('zh-TW')} 個網域，${sizeMb.toFixed(2)} MB`)
for (const source of database.sources) console.log(`- ${source.name}：匯入 ${source.importedRows.toLocaleString('zh-TW')} 列`)
