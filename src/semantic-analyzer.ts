import type { FeatureExtractionPipeline } from '@huggingface/transformers'

export const SEMANTIC_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'

export interface SemanticMatch {
  category: string
  similarity: number
  example: string
}

export interface SemanticSearchResult {
  status: 'matched' | 'not-matched' | 'disabled' | 'unavailable'
  matches: SemanticMatch[]
  model: string
  error?: string
}

export interface SemanticProgress {
  percent: number | null
  message: string
}

interface Prototype {
  category: string
  text: string
}

const prototypes: Prototype[] = [
  { category: '社群導流／個資蒐集', text: '為了參加活動或領取贈品，請填寫姓名電話等資料，再加入另一個新的群組，沒有回覆還會打電話提醒。' },
  { category: '社群導流／個資蒐集', text: '請提供個人資料完成登記，掃描 QR code 轉到私人通訊軟體聯絡專員。' },
  { category: '假投資', text: '投資老師保證獲利，邀請加入群組跟單，要求使用虛擬貨幣入金。' },
  { category: '假檢警', text: '自稱警察或檢察官說帳戶涉案，要求保密並把錢轉到監管帳戶接受調查。' },
  { category: '假客服／解除分期', text: '假冒客服聲稱訂單設定錯誤或重複扣款，要求操作網路銀行或 ATM 解除分期。' },
  { category: '帳號釣魚', text: '帳號即將停用，請立即點擊連結重新登入驗證，並輸入密碼與簡訊驗證碼。' },
  { category: '遠端控制詐騙', text: '要求下載遠端控制軟體並開啟螢幕共享，讓客服協助操作手機或網路銀行。' },
  { category: '網路購物詐騙', text: '賣家要求離開購物平台私下交易，先匯款後才寄貨，或聲稱金流認證失敗。' },
  { category: '交友／感情詐騙', text: '網路認識的對象培養感情後，以急難、包裹或投資為由要求匯款。' },
  { category: '冒充親友', text: '突然用新帳號自稱親友，說手機壞了或遇到急事，要求立刻代墊或轉帳。' },
]

const benignExamples = [
  '媽媽我六點回家，路上會買水果，需要幫忙帶什麼嗎？',
  '請填寫課程問卷，下週改到新的教室上課。',
  '公司人資請同仁到內部系統更新緊急聯絡電話。',
  '朋友換了新手機號碼，問我要不要週末一起吃飯。',
  '官方活動報名表需要姓名與電話，資料只用於活動聯絡。',
  '明天下午三點在圖書館見面，記得帶上次的筆記。',
]

const MATCH_THRESHOLD = 0.48
const BENIGN_MARGIN = 0.04
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null
let prototypeEmbeddingsPromise: Promise<number[][]> | null = null
let benignEmbeddingsPromise: Promise<number[][]> | null = null

function describeProgress(status: string) {
  const messages: Record<string, string> = {
    initiate: '準備下載本機語意模型…',
    download: '正在下載本機語意模型…',
    progress: '正在下載本機語意模型…',
    progress_total: '正在下載本機語意模型…',
    done: '模型檔案下載完成，正在初始化…',
    ready: '本機語意模型已就緒',
  }
  return messages[status] ?? '正在準備本機語意分析…'
}

async function getExtractor(onProgress?: (progress: SemanticProgress) => void) {
  if (!extractorPromise) {
    extractorPromise = import('@huggingface/transformers').then(({ pipeline }) => pipeline(
      'feature-extraction',
      SEMANTIC_MODEL,
      {
        dtype: 'q8',
        progress_callback: (info) => {
          const percent = 'progress' in info && typeof info.progress === 'number'
            ? Math.round(info.progress)
            : null
          onProgress?.({ percent, message: describeProgress(info.status) })
        },
      },
    ))
    extractorPromise.catch(() => {
      extractorPromise = null
      prototypeEmbeddingsPromise = null
      benignEmbeddingsPromise = null
    })
  }
  return extractorPromise
}

function tensorRows(data: ArrayLike<number>, rows: number, columns: number) {
  return Array.from({ length: rows }, (_, row) => Array.from(
    { length: columns },
    (_, column) => Number(data[row * columns + column]),
  ))
}

function cosineSimilarity(left: number[], right: number[]) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0)
}

async function embed(texts: string[], onProgress?: (progress: SemanticProgress) => void) {
  const extractor = await getExtractor(onProgress)
  const output = await extractor(texts, { pooling: 'mean', normalize: true })
  const rows = output.dims[0]
  const columns = output.dims[1]
  return tensorRows(output.data as Float32Array, rows, columns)
}

async function getPrototypeEmbeddings(onProgress?: (progress: SemanticProgress) => void) {
  if (!prototypeEmbeddingsPromise) {
    prototypeEmbeddingsPromise = embed(prototypes.map((prototype) => prototype.text), onProgress)
    prototypeEmbeddingsPromise.catch(() => {
      prototypeEmbeddingsPromise = null
    })
  }
  return prototypeEmbeddingsPromise
}

async function getBenignEmbeddings(onProgress?: (progress: SemanticProgress) => void) {
  if (!benignEmbeddingsPromise) {
    benignEmbeddingsPromise = embed(benignExamples, onProgress)
    benignEmbeddingsPromise.catch(() => {
      benignEmbeddingsPromise = null
    })
  }
  return benignEmbeddingsPromise
}

export async function searchSemanticSimilarity(
  content: string,
  enabled: boolean,
  onProgress?: (progress: SemanticProgress) => void,
): Promise<SemanticSearchResult> {
  if (!enabled) return { status: 'disabled', matches: [], model: SEMANTIC_MODEL }
  if (!content.trim()) return { status: 'not-matched', matches: [], model: SEMANTIC_MODEL }

  try {
    const [prototypeEmbeddings, benignEmbeddings] = await Promise.all([
      getPrototypeEmbeddings(onProgress),
      getBenignEmbeddings(onProgress),
    ])
    const [contentEmbedding] = await embed([content.slice(0, 4000)], onProgress)
    const closestBenign = Math.max(...benignEmbeddings.map((embedding) => cosineSimilarity(contentEmbedding, embedding)))
    const bestByCategory = new Map<string, SemanticMatch>()
    prototypes.forEach((prototype, index) => {
      const similarity = cosineSimilarity(contentEmbedding, prototypeEmbeddings[index])
      const existing = bestByCategory.get(prototype.category)
      if (!existing || similarity > existing.similarity) {
        bestByCategory.set(prototype.category, { category: prototype.category, similarity, example: prototype.text })
      }
    })
    const matches = [...bestByCategory.values()]
      .filter((match) => match.similarity >= MATCH_THRESHOLD && match.similarity - closestBenign >= BENIGN_MARGIN)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, 1)
    return { status: matches.length ? 'matched' : 'not-matched', matches, model: SEMANTIC_MODEL }
  } catch (error) {
    return {
      status: 'unavailable',
      matches: [],
      model: SEMANTIC_MODEL,
      error: error instanceof Error ? error.message : '本機語意模型無法載入',
    }
  }
}

