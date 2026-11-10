import type { CommunitySearchResult } from './community-db'
import type { DatabaseSearchResult } from './threat-db'

export type RiskLevel = 'low' | 'medium' | 'high'

export interface Finding {
  title: string
  detail: string
  weight: number
}

export interface AnalysisResult {
  level: RiskLevel
  score: number
  category: string
  summary: string
  findings: Finding[]
  actions: string[]
  database: DatabaseSearchResult
  community: CommunitySearchResult
}

interface Rule {
  pattern: RegExp
  title: string
  detail: string
  weight: number
  category: string
}

const rules: Rule[] = [
  {
    pattern: /保密|不要告訴|不能跟(家人|別人)說|偵查不公開/i,
    title: '要求你保密',
    detail: '詐騙常用「不能告訴別人」隔離受害者，讓你來不及向家人或警方查證。',
    weight: 24,
    category: '假檢警或冒充身分',
  },
  {
    pattern: /監管帳戶|安全帳戶|配合調查|法院傳票|涉及洗錢|檢察官|警官/i,
    title: '假檢警常見話術',
    detail: '政府機關不會透過通訊軟體要求匯款、交付帳戶或操作 ATM。',
    weight: 32,
    category: '假檢警',
  },
  {
    pattern: /保證獲利|穩賺不賠|內線消息|老師帶單|高報酬|投資群組|飆股/i,
    title: '不合理的獲利承諾',
    detail: '「保證獲利」或陌生人帶你投資，是常見的假投資警訊。',
    weight: 28,
    category: '假投資',
  },
  {
    pattern: /驗證碼|OTP|密碼|帳號登入|重新認證|解除分期|操作ATM/i,
    title: '索取敏感資料或要求操作帳戶',
    detail: '驗證碼、密碼與網銀資料都不能交給任何人，客服也不會索取。',
    weight: 30,
    category: '帳號或金錢詐騙',
  },
  {
    pattern: /立即|馬上|限時|最後機會|帳號將停用|今天內|現在匯款/i,
    title: '刻意製造急迫感',
    detail: '催你立刻行動，是為了讓你沒有時間冷靜查證。',
    weight: 14,
    category: '高壓話術',
  },
  {
    pattern: /匯款|轉帳|點數|虛擬貨幣|USDT|購買禮物卡|面交現金/i,
    title: '要求移轉金錢',
    detail: '陌生人要求匯款、購買點數或虛擬貨幣時，應先停止並查證。',
    weight: 20,
    category: '金錢詐騙',
  },
  {
    pattern: /下載.{0,8}(APP|應用程式|軟體)|遠端控制|AnyDesk|TeamViewer|螢幕共享/i,
    title: '要求安裝或開啟遠端控制',
    detail: '不明 App 與遠端控制工具可能讓對方直接操作你的手機與帳戶。',
    weight: 32,
    category: '遠端控制詐騙',
  },
  {
    pattern: /加LINE|加賴|私訊.{0,4}客服|聯絡專員/i,
    title: '引導到私人通訊管道',
    detail: '詐騙廣告常將人帶往假客服或私人 LINE 帳號。',
    weight: 12,
    category: '社群導流',
  },
]

const suspiciousTlds = new Set(['top', 'xyz', 'click', 'shop', 'vip', 'work', 'live'])

function inspectUrl(raw: string): Finding[] {
  const match = raw.match(/https?:\/\/[^\s<>'\"]+|(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/?[^\s<>'\"]*/i)
  if (!match) return []

  try {
    const candidate = match[0].startsWith('http') ? match[0] : `https://${match[0]}`
    const url = new URL(candidate)
    const findings: Finding[] = []
    const labels = url.hostname.split('.')
    const tld = labels.at(-1)?.toLowerCase() ?? ''

    if (url.protocol !== 'https:') {
      findings.push({ title: '網址未使用 HTTPS', detail: '連線可能未受加密保護，不要在此輸入密碼或付款資料。', weight: 18 })
    }
    if (suspiciousTlds.has(tld)) {
      findings.push({ title: '網址結尾需要提高警覺', detail: `「.${tld}」常被短期活動與仿冒網站使用；這不代表一定是詐騙，但應核對官方網址。`, weight: 12 })
    }
    if (url.hostname.includes('xn--') || /\d{1,3}(?:\.\d{1,3}){3}/.test(url.hostname)) {
      findings.push({ title: '網址形式不尋常', detail: '網址使用編碼字元或直接使用 IP 位址，可能在模仿正常網站。', weight: 24 })
    }
    if (labels.length > 4 || url.hostname.length > 38) {
      findings.push({ title: '網址結構過長', detail: '請確認真正的主網域，不要只看網址前半段的品牌名稱。', weight: 10 })
    }
    if (/@/.test(match[0]) || /(login|verify|secure|account|bank).{0,10}(help|update|check)/i.test(url.hostname)) {
      findings.push({ title: '疑似仿冒登入網址', detail: '網址含有誘導登入或驗證的組合字樣，請改由官方 App 或自行輸入官網網址。', weight: 24 })
    }
    return findings
  } catch {
    return [{ title: '網址格式異常', detail: '這段網址無法正常解析，請勿直接開啟。', weight: 18 }]
  }
}

const emptyDatabaseResult: DatabaseSearchResult = { status: 'unavailable', matches: [], searchedDomains: [] }
const emptyCommunityResult: CommunitySearchResult = { status: 'unavailable', matches: [] }

export function analyzeContent(
  content: string,
  database: DatabaseSearchResult = emptyDatabaseResult,
  community: CommunitySearchResult = emptyCommunityResult,
): AnalysisResult {
  const text = content.trim()
  const matchedRules = rules.filter((rule) => rule.pattern.test(text))
  const findings: Finding[] = matchedRules.map(({ title, detail, weight }) => ({ title, detail, weight }))
  findings.push(...inspectUrl(text))
  findings.push(...database.matches.slice(0, 3).map((match) => ({
    title: `政府開放資料命中：${match.domain}`,
    detail: `此網域出現在${match.sources.map((source) => source.name).join('、')}。資料類型：${match.category}${match.lastSeen ? `；資料日期：${match.lastSeen}` : ''}。`,
    weight: 85,
  })))
  findings.push(...community.matches.slice(0, 3).flatMap((match) => match.matchedSignals.map((signal, index) => ({
    title: index === 0 ? `社群案例特徵命中：${match.category}` : signal.title,
    detail: `${signal.detail}（去識別化案例來源：${match.source}）`,
    weight: index === 0 ? 38 : 14,
  }))))

  const score = Math.min(100, findings.reduce((sum, finding) => sum + finding.weight, 0))
  const level: RiskLevel = score >= 55 ? 'high' : score >= 25 ? 'medium' : 'low'
  const categoryCounts = matchedRules.reduce<Record<string, number>>((counts, rule) => {
    counts[rule.category] = (counts[rule.category] ?? 0) + rule.weight
    return counts
  }, {})
  const category = database.matches[0]?.category
    ?? community.matches[0]?.category
    ?? Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    ?? '尚未辨識特定類型'

  const summaries: Record<RiskLevel, string> = {
    high: database.matches.length
      ? '訊息中的網址已出現在政府公開涉詐資料，請勿開啟、登入或付款。'
      : community.matches.length
        ? '內容與已知社群詐騙案例的多項話術特徵相符，請停止提供資料或加入陌生群組。'
      : '出現多項高風險警訊，請先停止互動與付款。',
    medium: '有可疑跡象，繼續操作前請先透過其他管道查證。',
    low: '目前未發現明顯警訊，但這不代表內容一定安全。',
  }

  return {
    level,
    score,
    category,
    summary: summaries[level],
    findings,
    database,
    community,
    actions: level === 'high'
      ? ['不要匯款、點連結或提供驗證碼', '掛斷後自行查找官方電話重新聯絡', '撥打 165，或請可信任的家人一起確認']
      : level === 'medium'
        ? ['暫停操作，不要使用訊息內的聯絡方式', '從官方網站或 App 找到客服並查證', '若涉及金錢，先請家人協助確認']
        : ['仍請核對寄件者與網址', '不要分享密碼、驗證碼或網銀資料', '情況不對勁時可撥打 165 諮詢'],
  }
}

