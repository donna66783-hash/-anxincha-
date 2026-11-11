import type { CommunitySearchResult } from './community-db'
import type { DatabaseSearchResult } from './threat-db'
import type { SemanticSearchResult } from './semantic-analyzer'
import { normalizeForMatching } from './text-normalizer'

export type RiskLevel = 'low' | 'medium' | 'high'
export type DecisionState = 'HIGH_RISK' | 'SUSPICIOUS' | 'NO_KNOWN_SIGNALS' | 'INSUFFICIENT_EVIDENCE'

export interface Finding {
  title: string
  detail: string
  weight: number
  source?: { name: string; url: string }
}

export interface AnalysisResult {
  state: DecisionState
  level: RiskLevel
  score: number
  category: string
  summary: string
  findings: Finding[]
  actions: string[]
  database: DatabaseSearchResult
  community: CommunitySearchResult
  semantic: SemanticSearchResult
  context: AnalysisContext
}

export interface AnalysisContext {
  source?: 'text' | 'image' | 'file'
  ocrConfidence?: number
  ocrPasses?: number
  ocrTextLength?: number
  ocrEngine?: string
  imageWidth?: number
  imageHeight?: number
  qrCodeCount?: number
  ocrFailure?: string
}

interface Rule {
  pattern: RegExp
  title: string
  detail: string
  weight: number
  category: string
  behavior?: string
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
    pattern: /加.{0,10}LINE|加賴|LINE\s*(?:ID|[:：])?\s*@?[a-z0-9_-]{3,}|賴.{0,5}@[a-z0-9_-]{3,}|私訊.{0,4}客服|聯絡專員/i,
    title: '引導到私人通訊管道',
    detail: '詐騙廣告常將人帶往假客服或私人 LINE 帳號。',
    weight: 12,
    category: '社群導流',
    behavior: 'channel-switch',
  },
  {
    pattern: /(?:職缺|徵才|招募|工作機會|應用工程師|FAE|年薪)[\s\S]{0,1200}(?:LINE\s*(?:ID|[:：])?\s*@?[a-z0-9_-]{3,}|賴.{0,5}@[a-z0-9_-]{3,}|私訊.{0,8}(?:聊|聯絡))|(?:LINE\s*(?:ID|[:：])?\s*@?[a-z0-9_-]{3,}|賴.{0,5}@[a-z0-9_-]{3,})[\s\S]{0,1200}(?:職缺|徵才|招募|工作機會|應用工程師|FAE|年薪)/i,
    title: '未具名職缺導向私人聯絡帳號',
    detail: '職缺內容沒有可直接核對的公司名稱或官方徵才頁，卻要求改用私人 LINE／私訊聯絡；這不代表一定是詐騙，但應先向公司官網或公開總機確認招募者身分。',
    weight: 18,
    category: '求職招募導流',
    behavior: 'recruitment-private-contact',
  },
  {
    pattern: /(?:Marketplace|買家|賣家|賣出|商品).{0,80}(?:加.{0,10}LINE|LINE\s*[:：])|(?:加.{0,10}LINE|LINE\s*[:：]).{0,80}(?:Marketplace|買家|賣家|賣出|商品)/i,
    title: '交易被引導離開原平台',
    detail: '買賣對話要求改用私人 LINE 聯絡，會失去原平台的交易紀錄與安全保護，是常見的假買家導流手法。',
    weight: 34,
    category: '假買家／社群導流',
    behavior: 'commerce-off-platform',
  },
  {
    pattern: /(?:未設定|不認識|沒有購買|非本人).{0,18}(?:交易|訂單|扣款)|(?:週期性|定期|自動).{0,8}(?:扣款|續訂)|訂單.{0,8}續訂/i,
    title: '以陌生訂單或續訂扣款製造恐慌',
    detail: '假訂單通知常聲稱已續訂或將定期扣款，再引導受害者聯絡假客服處理。',
    weight: 30,
    category: '假客服／假訂單',
    behavior: 'unauthorized-charge',
  },
  {
    pattern: /(填|提供|留下|回覆).{0,12}(資料|姓名|電話|地址|生日|身分證|暱稱)|Google\s*(表單|問卷)|完成.{0,8}(申請|登記|認證)/i,
    title: '要求填寫或提供個人資料',
    detail: '陌生人以申請、登記或寄送為由要求資料，可能是在建立詐騙名單或準備後續話術。',
    weight: 25,
    category: '個資蒐集',
    behavior: 'personal-data',
  },
  {
    pattern: /(加入|邀請|拉進|移到|轉到).{0,16}(另一個|新的|指定)?\s*(LINE|賴|Telegram|WhatsApp|Discord|社群|群組)|掃描?.{0,8}(QR|二維碼)/i,
    title: '要求轉移到另一個社群或通訊管道',
    detail: '把互動從原平台轉往陌生群組，會降低平台保護並方便對方持續施壓。',
    weight: 20,
    category: '社群導流',
    behavior: 'channel-switch',
  },
  {
    pattern: /(沒接|未接|不回|未回覆|已讀不回).{0,18}(電話|來電|再打|提醒|聯絡)|(打|撥).{0,8}電話.{0,16}(提醒|催|確認)/i,
    title: '未回覆後持續來電或追催',
    detail: '一般社群交流不應在你未回覆時持續以電話或訊息施壓。',
    weight: 16,
    category: '高壓導流',
    behavior: 'persistent-contact',
  },
  {
    pattern: /(免費|贈送|抽獎|領取|試用).{0,16}(禮物|贈品|商品|名額|課程)|寵物投票|毛孩.{0,8}(活動|生活|社群)|免費領養/i,
    title: '以免費贈品或興趣活動吸引互動',
    detail: '免費商品、寵物或興趣活動本身不一定有問題，但常被用來降低戒心並導向私下聯絡。',
    weight: 8,
    category: '誘餌型社交工程',
    behavior: 'lure',
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
    if (/(黑貓|宅急便)/i.test(raw) && !/(^|\.)t-cat\.com\.tw$/i.test(url.hostname)) {
      findings.push({
        title: '網址與黑貓宅急便官方網域不符',
        detail: `畫面提到黑貓宅急便，但辨識到的網域「${url.hostname}」不是官方公告的 t-cat.com.tw；官方也提醒不會透過不明網址要求輸入個資。`,
        weight: 55,
        source: { name: '黑貓宅急便反詐騙公告', url: 'https://www.t-cat.com.tw/Company/article_Detail.aspx?id=2539' },
      })
    }
    return findings
  } catch {
    return [{ title: '網址格式異常', detail: '這段網址無法正常解析，請勿直接開啟。', weight: 18 }]
  }
}

const emptyDatabaseResult: DatabaseSearchResult = { status: 'unavailable', matches: [], searchedDomains: [] }
const emptyCommunityResult: CommunitySearchResult = { status: 'unavailable', matches: [] }
const emptySemanticResult: SemanticSearchResult = { status: 'disabled', matches: [], model: '' }

export function analyzeContent(
  content: string,
  database: DatabaseSearchResult = emptyDatabaseResult,
  community: CommunitySearchResult = emptyCommunityResult,
  context: AnalysisContext = {},
  semantic: SemanticSearchResult = emptySemanticResult,
): AnalysisResult {
  const text = normalizeForMatching(content.trim())
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
  findings.push(...semantic.matches.slice(0, 2).map((match, index) => ({
    title: index === 0 ? `本機語意 AI 辨識：${match.category}` : `語意近似：${match.category}`,
    detail: `內容與已知「${match.category}」手法的語意相似度為 ${Math.round(match.similarity * 100)}%；這是風險提示，不是司法認定。`,
    weight: match.similarity >= 0.76 ? 36 : 25,
  })))

  const behaviorCount = new Set(matchedRules.flatMap((rule) => rule.behavior ? [rule.behavior] : [])).size
  if (behaviorCount >= 2) {
    findings.push({
      title: '多項社交工程行為同時出現',
      detail: '內容同時包含轉移管道、索取資料、持續追催或誘餌等行為；組合出現時風險會明顯提高。',
      weight: 18,
    })
  }

  const imageEvidenceInsufficient = context.source === 'image'
    && (Boolean(context.ocrFailure) || (context.ocrConfidence ?? 0) < 60 || findings.length === 0)

  if (context.source === 'image' && context.ocrFailure) {
    findings.push({
      title: '截圖無法充分辨識',
      detail: `${context.ocrFailure}。本次不能據此判定未發現風險，請換一張較清晰、完整的截圖或直接貼上文字。`,
      weight: 0,
    })
  } else if (context.source === 'image' && (context.ocrConfidence ?? 0) < 60) {
    findings.push({
      title: '截圖文字辨識可信度不足',
      detail: '部分文字可能沒有被正確讀取，因此不能把「未命中」視為安全，建議核對辨識文字或換清晰截圖。',
      weight: 0,
    })
  } else if (context.source === 'image' && findings.length === 0) {
    findings.push({
      title: '截圖未提供足夠資訊確認安全',
      detail: '圖片辨識可能遺漏關鍵內容；沒有網址或沒有命中案例，不代表對方可信。',
      weight: 0,
    })
  }

  const score = Math.min(100, findings.reduce((sum, finding) => sum + finding.weight, 0))
  const state: DecisionState = database.matches.length > 0 || score >= 55
    ? 'HIGH_RISK'
    : imageEvidenceInsufficient
      ? 'INSUFFICIENT_EVIDENCE'
      : score > 0
        ? 'SUSPICIOUS'
        : 'NO_KNOWN_SIGNALS'
  const level: RiskLevel = state === 'HIGH_RISK'
    ? 'high'
    : state === 'SUSPICIOUS' || state === 'INSUFFICIENT_EVIDENCE'
      ? 'medium'
      : 'low'
  const categoryCounts = matchedRules.reduce<Record<string, number>>((counts, rule) => {
    counts[rule.category] = (counts[rule.category] ?? 0) + rule.weight
    return counts
  }, {})
  const category = database.matches[0]?.category
    ?? community.matches[0]?.category
    ?? semantic.matches[0]?.category
    ?? Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    ?? '尚未辨識特定類型'

  const summaries: Record<DecisionState, string> = {
    HIGH_RISK: database.matches.length
      ? '訊息中的網址已出現在政府公開涉詐資料，請勿開啟、登入或付款。'
      : community.matches.length
        ? '內容與已知社群詐騙案例的多項話術特徵相符，請停止提供資料或加入陌生群組。'
      : '出現多項高風險警訊，請先停止互動與付款。',
    SUSPICIOUS: '發現一項或多項可疑跡象，繼續操作前請先透過其他管道查證。',
    NO_KNOWN_SIGNALS: '在可辨識的內容中未發現已知警訊；這不代表內容一定安全。',
    INSUFFICIENT_EVIDENCE: '圖片或文字證據不足，這次無法充分判斷，請補充較清晰或更完整的內容。',
  }

  return {
    state,
    level,
    score,
    category,
    summary: summaries[state],
    findings,
    database,
    community,
    semantic,
    context,
    actions: level === 'high'
      ? ['不要匯款、點連結或提供驗證碼', '掛斷後自行查找官方電話重新聯絡', '撥打 165，或請可信任的家人一起確認']
      : level === 'medium'
        ? ['暫停操作，不要使用訊息內的聯絡方式', '從官方網站或 App 找到客服並查證', '若涉及金錢，先請家人協助確認']
        : ['仍請核對寄件者與網址', '不要分享密碼、驗證碼或網銀資料', '情況不對勁時可撥打 165 諮詢'],
  }
}

