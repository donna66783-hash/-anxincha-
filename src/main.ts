import './styles.css'
import type { Worker } from 'tesseract.js'
import { analyzeContent, type AnalysisContext, type AnalysisResult, type DecisionState } from './analyzer'
import { searchCommunityDatabase, type CommunitySearchResult } from './community-db'
import { searchSemanticSimilarity, type SemanticProgress, type SemanticSearchResult } from './semantic-analyzer'
import { searchThreatDatabase, type DatabaseSearchResult } from './threat-db'
import { reportApiUrl as configuredReportApiUrl } from './config'
import { deduplicateConversationTexts, selectStrongestImageResult } from './image-batch'
import { effectiveImageText, type CorrectionStatus, type ImageTextSource, type SupplementScope } from './image-analysis-state'

const examples = {
  police: '您好，我是檢察官。您的帳戶涉及洗錢，偵查不公開，不能告訴家人。請今天內把存款匯到監管帳戶配合調查。',
  investment: '老師有內線消息，保證獲利、穩賺不賠。名額有限，馬上加 LINE 並用 USDT 入金。',
  normal: '媽媽，我晚上六點到家。回去前會先到市場買水果，需要幫妳帶什麼嗎？',
  database: '客服通知：請立刻登入 https://tobuyersepc24.com/57vgaqk 完成帳號驗證。',
}

const reportApiUrl = configuredReportApiUrl()

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#top" aria-label="安心查首頁">
      <span class="brand-mark" aria-hidden="true">安</span>
      <span>安心查 <small>防詐風險檢查</small></span>
    </a>
    <nav aria-label="主要導覽">
      <a href="#how-it-works">怎麼運作</a>
      <a href="#trusted-resources">查證管道</a>
      <a href="#privacy">隱私承諾</a>
      <a class="help-link" href="tel:165">有疑問？撥 165</a>
    </nav>
  </header>

  <main id="top">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="eyebrow"><span></span> 不確定，就先查一下</p>
        <h1 id="hero-title">把可疑訊息貼上來，<em>先停、再查、後行動。</em></h1>
        <p class="hero-lead">分析常見詐騙話術與可疑網址，清楚告訴你哪裡需要提高警覺。所有內容只在這台裝置處理。</p>
        <div class="trust-points" aria-label="服務特色">
          <span><b>✓</b> 不需登入</span>
          <span><b>✓</b> 不上傳內容</span>
          <span><b>✓</b> 免費使用</span>
        </div>
      </div>
      <aside class="pause-card" aria-label="防詐提醒">
        <div class="pause-icon">!</div>
        <p>對方只要提到</p>
        <strong>匯款、保密、驗證碼</strong>
        <span>先不要照做，找家人一起確認。</span>
      </aside>
    </section>

    <section class="scanner-section" id="scanner" aria-labelledby="scanner-title">
      <div class="scanner-card">
        <div class="scanner-heading">
          <div>
            <p class="step-label">免費快速檢查</p>
            <h2 id="scanner-title">貼上收到的訊息或網址</h2>
          </div>
          <span class="local-badge"><span></span> 僅在本機分析</span>
        </div>

        <label class="sr-only" for="content-input">可疑訊息或網址</label>
        <textarea id="content-input" maxlength="12000" placeholder="例如：把 LINE 對話、簡訊或可疑網址貼在這裡⋯"></textarea>
        <div class="input-footer">
          <div class="file-actions" aria-label="匯入內容">
            <label class="file-button image-button" for="image-input">
              <span aria-hidden="true">▧</span> 上傳截圖
            </label>
            <input id="image-input" type="file" accept="image/png,image/jpeg,image/webp" multiple />
            <span class="image-limit">可一次選擇最多 10 張</span>
            <label class="file-button" for="file-input">
              <span aria-hidden="true">＋</span> 匯入 LINE .txt
            </label>
            <input id="file-input" type="file" accept=".txt,text/plain" />
            <span id="file-name" aria-live="polite"></span>
          </div>
          <span id="char-count">0 / 12,000</span>
        </div>

        <div class="image-preview" id="image-preview" hidden>
          <div class="image-thumbnails" id="image-thumbnails" aria-label="待辨識的截圖預覽"></div>
          <div class="ocr-details">
            <div class="ocr-heading"><strong id="ocr-title">準備辨識截圖</strong><span id="ocr-percent">0%</span></div>
            <div class="progress-track" role="progressbar" aria-label="截圖文字辨識進度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="ocr-progress"></span></div>
            <p id="ocr-status" aria-live="polite">圖片只會在這台裝置處理，不會上傳。</p>
            <label class="conversation-option"><input type="checkbox" id="same-conversation" /> 這些截圖屬於同一段對話（才會跨圖整合）</label>
            <div class="ocr-actions"><button type="button" class="start-ocr" id="start-ocr-button">開始辨識所選截圖</button><button type="button" class="cancel-ocr" id="cancel-ocr-button" hidden>中止辨識</button><button type="button" class="remove-image" id="remove-image">移除截圖</button></div>
          </div>
        </div>

        <div class="supplement-panel">
          <label for="supplement-text"><strong>補充貼文或對話文字（選填）</strong><span>如果截圖不清楚，可貼上 Facebook 貼文內容、LINE 對話或對方說過的話。</span></label>
          <textarea id="supplement-text" maxlength="6000" placeholder="只會在本機分析，不會自動上傳。"></textarea>
          <label for="supplement-scope">這段文字適用於
            <select id="supplement-scope"><option value="background">獨立背景說明（預設）</option><option value="conversation" disabled>同一段對話的整組補充文字</option></select>
          </label>
          <p id="supplement-hint">預設不會套用到所有圖片；選擇圖片後可指定單一截圖。</p>
        </div>

        <div class="quick-examples">
          <span>試試看：</span>
          <button type="button" data-example="police">假檢警訊息</button>
          <button type="button" data-example="investment">投資群組</button>
          <button type="button" data-example="normal">一般家人訊息</button>
          <button type="button" data-example="database">資料庫命中網址</button>
        </div>

        <label class="semantic-option" for="semantic-toggle">
          <input id="semantic-toggle" type="checkbox" checked />
          <span class="semantic-switch" aria-hidden="true"></span>
          <span><strong>使用本機語意 AI 加強判斷</strong><small id="semantic-status">首次約下載 150 MB，之後由瀏覽器快取；你的訊息不會上傳。</small></span>
        </label>

        <button class="scan-button" id="scan-button" type="button">
          <span>開始檢查</span><span aria-hidden="true">→</span>
        </button>
        <p class="disclaimer">檢查結果為風險提醒，不能保證內容安全，也不取代警方或金融機構的判斷。</p>
      </div>
    </section>

    <section class="result-wrap" id="result-wrap" hidden aria-live="polite"></section>

    <section class="resources-section" id="trusted-resources" aria-labelledby="resources-title">
      <div class="section-heading resources-heading">
        <div>
          <p class="eyebrow"><span></span> 官方與可信查證管道</p>
          <h2 id="resources-title">需要再確認？到可信平台查一查</h2>
          <p>安心查目前不會把你輸入的內容傳給這些網站。點擊後會另開新頁，由你決定是否查詢或通報。</p>
        </div>
        <a class="callout-165" href="tel:165"><small>緊急或已匯款</small><strong>立即撥打 165</strong></a>
      </div>
      <div class="resource-grid">
        <a class="resource-card official" href="https://fraudbuster.digiat.org.tw/accessibility/index" target="_blank" rel="noopener noreferrer">
          <span class="resource-kind">數位發展部</span><span class="external-mark" aria-hidden="true">↗</span>
          <h3>網路詐騙通報查詢網</h3>
          <p>查詢或通報可疑網址、簡訊與網路詐騙內容。</p>
        </a>
        <a class="resource-card official" href="https://165.npa.gov.tw/" target="_blank" rel="noopener noreferrer">
          <span class="resource-kind">警政署</span><span class="external-mark" aria-hidden="true">↗</span>
          <h3>165 全民防騙網</h3>
          <p>查看涉詐資訊公告、常見手法與防詐宣導。</p>
        </a>
        <a class="resource-card official" href="https://165dashboard.tw/" target="_blank" rel="noopener noreferrer">
          <span class="resource-kind">警政署</span><span class="external-mark" aria-hidden="true">↗</span>
          <h3>165 打詐儀錶板</h3>
          <p>瀏覽詐騙趨勢、最新案例與各地統計資訊。</p>
        </a>
        <a class="resource-card official" href="https://www.cib.npa.gov.tw/ch/app/data/list?module=wg138&amp;id=18382" target="_blank" rel="noopener noreferrer">
          <span class="resource-kind">刑事警察局</span><span class="external-mark" aria-hidden="true">↗</span>
          <h3>境外涉詐帳戶查詢</h3>
          <p>查閱刑事局公布的疑涉詐欺境外金融帳戶。</p>
        </a>
        <a class="resource-card" href="https://check.mygopen.com/" target="_blank" rel="noopener noreferrer">
          <span class="resource-kind">第三方查證</span><span class="external-mark" aria-hidden="true">↗</span>
          <h3>MyGoPen 詐騙網址幫你查</h3>
          <p>使用另一項工具交叉檢查可疑網站特徵。</p>
        </a>
        <a class="resource-card" href="https://www.jcic.org.tw/main_ch/fraud1.aspx?uid=1630&amp;pid=1630" target="_blank" rel="noopener noreferrer">
          <span class="resource-kind">聯徵中心</span><span class="external-mark" aria-hidden="true">↗</span>
          <h3>查詢自己的警示帳戶狀態</h3>
          <p>了解如何從個人信用報告查看警示帳戶紀錄。</p>
        </a>
      </div>
      <p class="resource-note">外部網站的查詢結果仍可能有時間差；查無資料不代表安全。不要在陌生頁面輸入密碼、驗證碼或網銀資料。</p>
    </section>

    <section class="how-section" id="how-it-works" aria-labelledby="how-title">
      <div class="section-heading">
        <p class="eyebrow"><span></span> 三個簡單步驟</p>
        <h2 id="how-title">遇到可疑訊息，不用自己猜</h2>
      </div>
      <div class="steps">
        <article><span>01</span><div class="step-icon">貼</div><h3>貼上或上傳</h3><p>複製訊息、網址，或上傳對話截圖與 LINE 文字檔。</p></article>
        <article><span>02</span><div class="step-icon">查</div><h3>本機分析</h3><p>在你的瀏覽器比對常見話術與網址風險。</p></article>
        <article><span>03</span><div class="step-icon">停</div><h3>採取行動</h3><p>看懂可疑原因，再依建議查證或求助。</p></article>
      </div>
    </section>

    <section class="privacy-section" id="privacy">
      <div class="privacy-visual" aria-hidden="true"><span>安</span><i></i><i></i><i></i></div>
      <div>
        <p class="eyebrow light"><span></span> 隱私優先</p>
        <h2>你的對話，只有你看得到。</h2>
        <p>檢查會直接在瀏覽器內完成，不會把訊息、網址或檔案傳到伺服器。關閉頁面後，輸入內容就會消失。</p>
        <ul>
          <li><b>✓</b> 不儲存、不販售你的資料</li>
          <li><b>✓</b> 不要求姓名、電話或帳號</li>
          <li><b>✓</b> 未經同意不會送出任何回報</li>
        </ul>
      </div>
    </section>
  </main>

  <footer>
    <div class="brand footer-brand"><span class="brand-mark">安</span><span>安心查 <small>防詐風險檢查</small></span></div>
    <p>遇到疑似詐騙，請撥打警政署 165 反詐騙諮詢專線。</p>
    <p class="prototype-note">原型 v0.1 · 規則庫為初步示範，不代表政府機關</p>
  </footer>
`

const input = document.querySelector<HTMLTextAreaElement>('#content-input')!
const counter = document.querySelector<HTMLSpanElement>('#char-count')!
const fileInput = document.querySelector<HTMLInputElement>('#file-input')!
const imageInput = document.querySelector<HTMLInputElement>('#image-input')!
const fileName = document.querySelector<HTMLSpanElement>('#file-name')!
const imagePreview = document.querySelector<HTMLElement>('#image-preview')!
const imageThumbnails = document.querySelector<HTMLElement>('#image-thumbnails')!
const ocrTitle = document.querySelector<HTMLElement>('#ocr-title')!
const ocrPercent = document.querySelector<HTMLElement>('#ocr-percent')!
const ocrStatus = document.querySelector<HTMLElement>('#ocr-status')!
const ocrProgress = document.querySelector<HTMLElement>('#ocr-progress')!
const progressTrack = document.querySelector<HTMLElement>('.progress-track')!
const removeImageButton = document.querySelector<HTMLButtonElement>('#remove-image')!
const startOcrButton = document.querySelector<HTMLButtonElement>('#start-ocr-button')!
const cancelOcrButton = document.querySelector<HTMLButtonElement>('#cancel-ocr-button')!
const sameConversationInput = document.querySelector<HTMLInputElement>('#same-conversation')!
const supplementTextInput = document.querySelector<HTMLTextAreaElement>('#supplement-text')!
const supplementScopeInput = document.querySelector<HTMLSelectElement>('#supplement-scope')!
const scanButton = document.querySelector<HTMLButtonElement>('#scan-button')!
const semanticToggle = document.querySelector<HTMLInputElement>('#semantic-toggle')!
const semanticStatus = document.querySelector<HTMLElement>('#semantic-status')!
const resultWrap = document.querySelector<HTMLElement>('#result-wrap')!
let previewUrls: string[] = []
let selectedImageFiles: File[] = []
let ocrWorkerPromise: Promise<Worker> | null = null
let ocrWorkerLanguageMode: 'full' | 'english' = 'full'
let analysisContext: AnalysisContext = { source: 'text' }
let batchProgressPrefix = ''
let imagesSameConversation = false
let ocrCancelled = false
let supplementalAnalysis: { text: string; scope: SupplementScope; targetIndex?: number; result?: AnalysisResult } | null = null

interface OcrCandidateResult {
  label: string
  confidence: number
  text: string
  characters: number
  durationMs: number
}

interface ImageAnalysisItem {
  imageId: string
  imageIndex: number
  order: number
  fileName: string
  text: string
  confidence: number
  passes: number
  width: number
  height: number
  engine: string
  qrCodeCount: number
  result: AnalysisResult
  failure?: string
  ocrOriginalText: string
  userCorrectedText: string
  correctionStatus: CorrectionStatus
  textSource: ImageTextSource
  supplementalText?: string
  candidates: OcrCandidateResult[]
  processingMs: number
  stableCandidateCount: number
}

let imageAnalysisItems: ImageAnalysisItem[] = []

function updateCounter() {
  counter.textContent = `${input.value.length.toLocaleString('zh-TW')} / 12,000`
}

function updateOcrProgress(progress: number, status: string) {
  const percent = Math.max(0, Math.min(100, Math.round(progress * 100)))
  const statusLabels: Record<string, string> = {
    'loading tesseract core': '載入文字辨識引擎',
    'initializing tesseract': '初始化文字辨識引擎',
    'loading language traineddata': '首次下載繁中辨識模型',
    'initializing api': '準備辨識繁體中文與英文',
    'recognizing text': '正在讀取截圖文字',
  }
  ocrPercent.textContent = `${percent}%`
  ocrProgress.style.width = `${percent}%`
  progressTrack.setAttribute('aria-valuenow', String(percent))
  ocrStatus.textContent = `${batchProgressPrefix}${statusLabels[status] ?? '正在準備文字辨識…'}`
}

function resetImageUpload() {
  imageInput.value = ''
  imagePreview.hidden = true
  previewUrls.forEach((url) => URL.revokeObjectURL(url))
  previewUrls = []
  selectedImageFiles = []
  imageAnalysisItems = []
  imagesSameConversation = false
  supplementalAnalysis = null
  sameConversationInput.checked = false
  imageThumbnails.replaceChildren()
  updateSupplementTargets()
  batchProgressPrefix = ''
  updateOcrProgress(0, '')
}

function updateSupplementTargets() {
  const previous = supplementScopeInput.value
  supplementScopeInput.querySelectorAll('option[data-image-option]').forEach((option) => option.remove())
  selectedImageFiles.forEach((_, index) => {
    const option = document.createElement('option')
    option.value = `image-${index + 1}`
    option.dataset.imageOption = 'true'
    option.textContent = `只套用到第 ${index + 1} 張截圖`
    supplementScopeInput.append(option)
  })
  if ([...supplementScopeInput.options].some((option) => option.value === previous)) supplementScopeInput.value = previous
}

function renderImageThumbnails(files: File[], allowReorder = true) {
  previewUrls.forEach((url) => URL.revokeObjectURL(url))
  previewUrls = []
  imageThumbnails.replaceChildren()
  files.forEach((file, index) => {
    const url = URL.createObjectURL(file)
    previewUrls.push(url)
    const figure = document.createElement('figure')
    const image = document.createElement('img')
    const caption = document.createElement('figcaption')
    image.src = url
    image.alt = `第 ${index + 1} 張待辨識截圖`
    caption.textContent = `第 ${index + 1} 張`
    figure.append(image, caption)
    if (allowReorder && files.length > 1) {
      const controls = document.createElement('div')
      controls.className = 'thumbnail-order'
      const up = document.createElement('button')
      const down = document.createElement('button')
      up.type = down.type = 'button'
      up.textContent = '←'
      down.textContent = '→'
      up.title = `將第 ${index + 1} 張往前移`
      down.title = `將第 ${index + 1} 張往後移`
      up.disabled = index === 0
      down.disabled = index === files.length - 1
      up.addEventListener('click', () => moveSelectedImage(index, index - 1))
      down.addEventListener('click', () => moveSelectedImage(index, index + 1))
      controls.append(up, down)
      figure.append(controls)
    }
    imageThumbnails.append(figure)
  })
}

function moveSelectedImage(from: number, to: number) {
  if (to < 0 || to >= selectedImageFiles.length || imageAnalysisItems.length) return
  const reordered = [...selectedImageFiles]
  const [moved] = reordered.splice(from, 1)
  if (!moved) return
  reordered.splice(to, 0, moved)
  selectedImageFiles = reordered
  renderImageThumbnails(selectedImageFiles)
}

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerLanguageMode = 'full'
    ocrWorkerPromise = import('tesseract.js').then(({ createWorker }) => createWorker(['chi_tra', 'eng'], undefined, {
      logger: ({ progress, status }) => updateOcrProgress(progress, status),
    }))
  }
  return ocrWorkerPromise
}

async function releaseOcrWorker() {
  const pendingWorker = ocrWorkerPromise
  ocrWorkerPromise = null
  ocrWorkerLanguageMode = 'full'
  if (pendingWorker) await pendingWorker.then((worker) => worker.terminate()).catch(() => undefined)
}

async function canvasCandidate(
  bitmap: ImageBitmap,
  label: string,
  source: { x: number; y: number; width: number; height: number },
  target: { width: number; height: number },
  mode: 'color' | 'contrast' = 'color',
) {
  const canvas = document.createElement('canvas')
  canvas.width = target.width
  canvas.height = target.height
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: mode === 'contrast' })
  if (!context) throw new Error('瀏覽器無法建立圖片處理畫布')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, source.x, source.y, source.width, source.height, 0, 0, target.width, target.height)
  if (mode === 'contrast') {
    const pixels = context.getImageData(0, 0, target.width, target.height)
    for (let index = 0; index < pixels.data.length; index += 4) {
      const luminance = 0.299 * pixels.data[index]! + 0.587 * pixels.data[index + 1]! + 0.114 * pixels.data[index + 2]!
      const adjusted = Math.max(0, Math.min(255, (luminance - 128) * 1.55 + 128))
      pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = adjusted
    }
    context.putImageData(pixels, 0, 0)
  }
  const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!image) throw new Error('圖片前處理失敗')
  return { image, label, width: target.width, height: target.height }
}

async function prepareOcrCandidates(file: File) {
  const bitmap = await createImageBitmap(file)
  const width = bitmap.width
  const height = bitmap.height
  const maxPixels = 12_000_000
  const baseScale = Math.min(1, Math.sqrt(maxPixels / Math.max(1, width * height)))
  const candidates: Array<{ image: Blob; label: string; width: number; height: number }> = []
  const maxDimension = Math.max(width, height)
  const fullSource = { x: 0, y: 0, width, height }
  try {
    if (baseScale < 1) {
      const target = { width: Math.round(width * baseScale), height: Math.round(height * baseScale) }
      candidates.push(await canvasCandidate(bitmap, '原圖等比例限制（1200 萬像素）', fullSource, target))
    } else {
      candidates.push({ image: file, label: '原始圖片', width, height })
    }
    if (maxDimension < 900) {
      const scale = Math.min(3, 2200 / maxDimension)
      const target = { width: Math.round(width * scale), height: Math.round(height * scale) }
      candidates.push(await canvasCandidate(bitmap, `自適應放大 ${scale.toFixed(1)}×`, fullSource, target))
      candidates.push(await canvasCandidate(bitmap, '放大＋灰階對比', fullSource, target, 'contrast'))
    } else if (height / width > 2.1 || height > 2200) {
      const segmentHeight = Math.min(height, Math.max(width * 1.35, 1100))
      const starts = [0, Math.max(0, height - segmentHeight)]
      for (const [index, start] of [...new Set(starts.map(Math.round))].entries()) {
        const cropHeight = Math.min(segmentHeight, height - start)
        candidates.push(await canvasCandidate(bitmap, `長圖分段 ${index + 1}`, { x: 0, y: start, width, height: cropHeight }, { width, height: Math.round(cropHeight) }))
      }
    } else {
      candidates.push(await canvasCandidate(bitmap, '灰階對比增強', fullSource, { width, height }, 'contrast'))
    }
  } finally {
    bitmap.close()
  }
  return candidates.slice(0, 3)
}

async function decodeQrCode(image: Blob) {
  const bitmap = await createImageBitmap(image)
  const maxDimension = 1400
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
  if (!context) {
    bitmap.close()
    return ''
  }
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const pixels = context.getImageData(0, 0, width, height)
  const { default: jsQR } = await import('jsqr')
  return jsQR(pixels.data, width, height, { inversionAttempts: 'attemptBoth' })?.data.trim() ?? ''
}

async function recognizeScreenshot(file: File) {
  const startedAt = performance.now()
  const candidates = await prepareOcrCandidates(file)
  const qrDataPromise = decodeQrCode(candidates[0]!.image).catch(() => '')
  const worker = await getOcrWorker()
  if (ocrWorkerLanguageMode !== 'full') {
    await worker.reinitialize('chi_tra+eng')
    ocrWorkerLanguageMode = 'full'
  }
  const candidateResults: OcrCandidateResult[] = []
  const { PSM } = await import('tesseract.js')
  for (const [index, candidate] of candidates.entries()) {
    if (ocrCancelled) throw new Error('使用者已取消辨識')
    ocrStatus.textContent = `${batchProgressPrefix}${candidate.label}（${index + 1}/${candidates.length}）`
    await worker.setParameters({ tessedit_pageseg_mode: index === 0 ? PSM.AUTO : PSM.SPARSE_TEXT })
    const candidateStartedAt = performance.now()
    const recognized = await worker.recognize(candidate.image)
    const text = recognized.data.text.trim()
    candidateResults.push({
      label: candidate.label,
      confidence: recognized.data.confidence,
      text,
      characters: text.replace(/\s/g, '').length,
      durationMs: Math.round(performance.now() - candidateStartedAt),
    })
  }
  const qrData = await qrDataPromise
  const best = [...candidateResults].sort((left, right) =>
    (right.confidence + Math.min(10, right.characters / 60)) - (left.confidence + Math.min(10, left.characters / 60)),
  )[0]!
  const urlCandidates = [...new Set(candidateResults.flatMap((candidate) => candidate.text.match(/https?:\/\/[^\s<>"']+/gi) ?? []))]
  const text = [best.text, ...urlCandidates.filter((url) => !best.text.includes(url)), qrData ? `QR:${qrData}` : ''].filter(Boolean).join('\n')
  const bestTokens = new Set(best.text.normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter((token) => token.length >= 2))
  const stableCandidateCount = candidateResults.filter((candidate) => {
    const tokens = new Set(candidate.text.normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter((token) => token.length >= 2))
    const shared = [...tokens].filter((token) => bestTokens.has(token)).length
    return shared / Math.max(1, Math.min(tokens.size, bestTokens.size)) >= 0.45
  }).length
  return {
    text,
    confidence: best.confidence,
    passes: candidateResults.length,
    width: candidates[0]!.width,
    height: candidates[0]!.height,
    engine: 'Tesseract.js 7',
    qrCodeCount: qrData ? 1 : 0,
    candidates: candidateResults,
    processingMs: Math.round(performance.now() - startedAt),
    stableCandidateCount,
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'\"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!)
}

const stateCopy: Record<DecisionState, { label: string; icon: string }> = {
  HIGH_RISK: { label: '高度風險', icon: '!' },
  SUSPICIOUS: { label: '可疑，請先查證', icon: '?' },
  NO_KNOWN_SIGNALS: { label: '未發現已知特徵', icon: '—' },
  INSUFFICIENT_EVIDENCE: { label: '無法充分判斷', icon: '?' },
}

function renderImageBatchPanel(items: ImageAnalysisItem[], sameConversation: boolean) {
  if (!items.length) return ''
  const strongest = selectStrongestImageResult([
    ...items,
    ...(supplementalAnalysis?.scope === 'background' && supplementalAnalysis.result
      ? [{ order: items.length + 1, result: supplementalAnalysis.result }]
      : []),
  ])
  const cards = items.map((item, index) => {
    const copy = stateCopy[item.result.state]
    const evidence = item.result.findings
      .filter((finding) => finding.weight > 0)
      .map((finding) => `<li>${escapeHtml(finding.title)}</li>`)
      .join('') || '<li>未命中已知風險證據</li>'
    const quality = item.failure
      ? '未取得文字'
      : item.confidence >= 80 ? '較高' : item.confidence >= 60 ? '中等' : '偏低'
    const effective = effectiveImageText(item)
    const sourceLabels = [
      item.correctionStatus === 'corrected' ? '人工修正 OCR' : '自動 OCR',
      item.supplementalText ? '使用者補充文字' : '',
      item.qrCodeCount ? 'QR Code 解析' : '',
    ].filter(Boolean).join('、')
    const candidateRows = item.candidates.map((candidate) => `<li>${escapeHtml(candidate.label)}：${Math.round(candidate.confidence)}% · ${candidate.characters} 字 · ${(candidate.durationMs / 1000).toFixed(1)} 秒</li>`).join('')
    return `<article class="image-result-card state-${item.result.state.toLowerCase()}" data-image-card="${escapeHtml(item.imageId)}">
      ${previewUrls[index] ? `<img src="${escapeHtml(previewUrls[index])}" alt="第 ${item.order} 張截圖縮圖" />` : ''}
      <div>
        <p class="image-result-meta">第 ${item.order} 張 · ${escapeHtml(item.fileName)} · OCR 品質${quality}${item.failure ? '' : `（${Math.round(item.confidence)}%）`}</p>
        <h4>${escapeHtml(copy.label)} <span>${escapeHtml(item.result.state)} · 證據分數 ${item.result.score}</span></h4>
        <p>${escapeHtml(item.failure ?? item.result.summary)}</p>
        <p class="source-tags"><strong>文字來源：</strong>${escapeHtml(sourceLabels)} · 證據完整度：${escapeHtml(item.result.completeness)}</p>
        <ul>${evidence}</ul>
        <details><summary>查看辨識文字與候選品質</summary><pre>${escapeHtml(item.ocrOriginalText || '沒有自動辨識文字')}</pre><ul class="candidate-metrics">${candidateRows || '<li>沒有 OCR 候選結果</li>'}</ul></details>
        <details class="correction-editor" ${item.correctionStatus === 'corrected' ? 'open' : ''}><summary>修正辨識文字</summary>
          <label>第 ${item.order} 張修正內容<textarea data-correction-text="${escapeHtml(item.imageId)}" maxlength="12000">${escapeHtml(item.correctionStatus === 'corrected' ? item.userCorrectedText : item.ocrOriginalText)}</textarea></label>
          <p>${item.correctionStatus === 'corrected' ? '目前依使用者修正文字分析；OCR 信心值未被提高。' : '原始 OCR 會保留；即使沒有辨識文字也可手動輸入。'}</p>
          <div class="correction-actions"><button type="button" data-reanalyze-image="${escapeHtml(item.imageId)}">重新分析這一張</button><button type="button" data-restore-image="${escapeHtml(item.imageId)}" ${item.correctionStatus === 'corrected' ? '' : 'disabled'}>恢復原始 OCR</button></div>
        </details>
        ${effective.textSource !== 'automatic-ocr' ? `<p class="correction-notice">依使用者${effective.textSource === 'mixed' ? '修正／補充' : '修正'}文字分析；不代表 OCR 自動辨識成功。</p>` : ''}
      </div>
    </article>`
  }).join('')
  return `<section class="image-batch-panel">
    <div class="image-batch-heading"><div><p>多張截圖分析</p><h3>每張獨立結果與整批結論</h3></div><span>${sameConversation ? '同一段對話（重疊文字已去除）' : '各張獨立（預設）'}</span></div>
    <p class="batch-conclusion">${sameConversation
      ? '整批結論會額外分析去除相鄰重疊文字後的完整對話；下方仍保留每張獨立結果。'
      : strongest && strongest.order > items.length
        ? '整批不會把不同圖片的弱訊號相加；目前由獨立背景說明提供最高警示。'
        : `整批不會把不同圖片的弱訊號相加；目前依優先序取第 ${strongest?.order ?? 1} 張作為整批警示。`}</p>
    <div class="image-result-list">${cards}</div>
    ${renderSupplementalAnalysis()}
  </section>`
}

function renderSupplementalAnalysis() {
  if (!supplementalAnalysis?.text.trim()) return ''
  const scopeLabels: Record<SupplementScope, string> = {
    background: '獨立背景說明', conversation: '同一段對話整組補充', 'single-image': `第 ${supplementalAnalysis.targetIndex ?? 1} 張補充`,
  }
  return `<article class="supplement-result"><strong>使用者補充文字 · ${scopeLabels[supplementalAnalysis.scope]}</strong><p>這是使用者提供的分析脈絡，不是已獨立查證的案件證據。</p>${supplementalAnalysis.result ? `<span>${supplementalAnalysis.result.state} · 證據分數 ${supplementalAnalysis.result.score}</span>` : ''}</article>`
}

function renderResult(result: AnalysisResult) {
  const copy = stateCopy[result.state]
  const findings = result.findings.length
    ? result.findings.map((finding) => `<li><span>!</span><div><strong>${escapeHtml(finding.title)}</strong><p>${escapeHtml(finding.detail)}${finding.source ? ` <a href="${escapeHtml(finding.source.url)}" target="_blank" rel="noopener noreferrer">查看${escapeHtml(finding.source.name)} ↗</a>` : ''}</p></div></li>`).join('')
    : '<li class="no-finding"><span>✓</span><div><strong>未比對到常見高風險話術</strong><p>詐騙手法會持續變化，仍請確認對方身分與網址來源。</p></div></li>'
  const databasePanel = renderDatabaseResult(result.database)
  const communityPanel = renderCommunityResult(result.community)
  const semanticPanel = renderSemanticResult(result.semantic)
  const evidencePanel = renderEvidencePanel(result)

  resultWrap.innerHTML = `
    <div class="result-card risk-${result.level}">
      <div class="result-summary">
        <div class="result-icon">${copy.icon}</div>
        <div><p>檢查結果 · ${escapeHtml(result.state)} · 證據分數 ${result.score} · 證據完整度 ${escapeHtml(result.completeness)}</p><h2>${copy.label}</h2><p>${escapeHtml(result.summary)}</p></div>
        <span class="category">可能類型：${escapeHtml(result.category)}</span>
      </div>
      <div class="result-columns">
        <div><h3>為什麼需要注意</h3><ul class="findings">${findings}</ul></div>
        <div class="action-panel"><h3>現在建議你這樣做</h3><ol>${result.actions.map((action) => `<li>${escapeHtml(action)}</li>`).join('')}</ol><a href="tel:165">撥打 165 諮詢</a></div>
      </div>
      ${renderImageBatchPanel(imageAnalysisItems, imagesSameConversation)}
      ${databasePanel}
      ${communityPanel}
      ${semanticPanel}
      ${evidencePanel}
      ${renderReportPanel(result)}
      <button type="button" class="reset-button" id="reset-button">檢查另一則內容</button>
    </div>`
  resultWrap.hidden = false
  resultWrap.scrollIntoView({ behavior: 'smooth', block: 'start' })
  bindReportForm(result)
  bindImageCorrectionControls()
  document.querySelector<HTMLButtonElement>('#reset-button')?.addEventListener('click', () => {
    input.value = ''
    analysisContext = { source: 'text' }
    fileInput.value = ''
    resetImageUpload()
    supplementTextInput.value = ''
    supplementScopeInput.value = 'background'
    fileName.textContent = ''
    resultWrap.hidden = true
    updateCounter()
    input.focus()
  })
}

function renderReportPanel(result: AnalysisResult) {
  const unavailable = reportApiUrl
    ? ''
    : '<p class="report-unavailable">回報後端尚未完成啟用；目前仍可使用本機檢查，但此頁不會送出資料。</p>'
  return `<section class="report-panel">
    <details>
      <summary><span>這則內容值得補進案例庫？</span><strong>自願匿名回報</strong></summary>
      <div class="report-body">
        <p>只有按下「送出回報」才會上傳。請先刪除姓名、電話、地址、帳號等個資；回報會先由管理者審核，不會直接成為黑名單。</p>
        ${unavailable}
        <form id="report-form">
          <label>資料類型
            <select name="reportType" required>
              <option value="chat_screenshot">聊天／簡訊</option>
              <option value="social_post">社群貼文</option>
              <option value="email">電子郵件</option>
              <option value="suspicious_url">可疑網址</option>
              <option value="call_transcript">通話內容</option>
              <option value="other">其他</option>
            </select>
          </label>
          <label>要提供審核的文字（可自行刪除個資）
            <textarea name="reportText" maxlength="12000" required>${escapeHtml(input.value)}</textarea>
          </label>
          <label>補充說明（選填）
            <textarea name="contextText" maxlength="6000" placeholder="例如：在哪個平台看到、對方要求做什麼。請勿填寫被害人個資。"></textarea>
          </label>
          ${selectedImageFiles.length ? `<label class="report-check attachment-consent"><input type="checkbox" name="attachmentConsent" /> <span>另外同意保存本次原始截圖供管理者審核（最多 3 張、每張 5 MB；目前已選 ${selectedImageFiles.length} 張）</span></label>` : ''}
          <label class="report-check"><input type="checkbox" name="consentCaseStorage" required /> <span>我同意保存這次匿名案例，並了解可用送出後取得的撤回碼刪除。</span></label>
          <label class="report-check"><input type="checkbox" name="sourceRightsConfirmed" required /> <span>我確認有權提供這份內容，且已盡量移除無關第三人的個資。</span></label>
          <fieldset>
            <legend>額外用途（全部選填，不影響案件審核）</legend>
            <label class="report-check"><input type="checkbox" name="consentResearch" /> <span>同意用於去識別化的防詐研究與統計。</span></label>
            <label class="report-check"><input type="checkbox" name="consentModelTraining" /> <span>同意用於改善偵測模型；未勾選就不會用於模型訓練。</span></label>
          </fieldset>
          <div class="report-actions">
            <button type="submit" ${reportApiUrl ? '' : 'disabled'}>送出回報供人工審核</button>
            <span id="report-status" role="status" aria-live="polite">本次檢查結果：${escapeHtml(result.state)}，證據分數 ${result.score}</span>
          </div>
        </form>
      </div>
    </details>
  </section>`
}

function bindReportForm(result: AnalysisResult) {
  const form = document.querySelector<HTMLFormElement>('#report-form')
  const status = document.querySelector<HTMLElement>('#report-status')
  if (!form || !status || !reportApiUrl) return
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!
    const fields = new FormData(form)
    const includeAttachments = fields.get('attachmentConsent') === 'on'
    if (includeAttachments && selectedImageFiles.length > 3) {
      status.textContent = '原始附件最多 3 張；請先回到上方只選取要提供的 3 張，再重新檢查。'
      return
    }
    const payload = new FormData()
    for (const key of ['reportType', 'reportText', 'contextText']) payload.set(key, String(fields.get(key) ?? ''))
    payload.set('analysisState', result.state)
    payload.set('analysisCategory', result.category)
    payload.set('analysisScore', String(result.score))
    for (const key of ['consentCaseStorage', 'consentResearch', 'consentModelTraining', 'sourceRightsConfirmed', 'attachmentConsent']) {
      payload.set(key, String(fields.get(key) === 'on'))
    }
    payload.set('website', '')
    if (includeAttachments) selectedImageFiles.forEach((file) => payload.append('attachments', file, file.name))
    submit.disabled = true
    status.textContent = '正在安全送出回報…'
    try {
      const response = await fetch(`${reportApiUrl}/api/reports`, { method: 'POST', body: payload })
      const body = await response.json() as { ok?: boolean; reportId?: string; deletionToken?: string; error?: string; errors?: string[] }
      if (!response.ok || !body.ok) throw new Error(body.errors?.join('、') || body.error || `HTTP ${response.status}`)
      form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select').forEach((control) => { control.disabled = true })
      status.innerHTML = `已送交人工審核。案件編號：<code>${escapeHtml(body.reportId ?? '')}</code><br>撤回碼：<code>${escapeHtml(body.deletionToken ?? '')}</code><br><strong>請立即另存這兩項資料；基於隱私，系統不會再次顯示撤回碼。</strong>`
    } catch (error) {
      submit.disabled = false
      status.textContent = `回報未送出：${error instanceof Error ? error.message : '請稍後再試'}`
    }
  })
}

function renderSemanticResult(semantic: SemanticSearchResult) {
  if (semantic.status === 'matched') {
    const matches = semantic.matches.map((match) => `<li><div><strong>${escapeHtml(match.category)}</strong><span>${Math.round(match.similarity * 100)}% 相似</span></div><p>與去識別化的常見詐騙手法語意接近；請搭配其他警訊與官方查證結果判斷。</p></li>`).join('')
    return `<section class="database-panel semantic-hit"><div class="database-title"><span>AI</span><div><h3>本機語意模型找到相似手法</h3><p>多語語意比對已在這台裝置完成，訊息沒有上傳</p></div></div><ul>${matches}</ul><p class="database-warning">語意相似不代表對方已被認定涉詐，也可能有誤判；請勿只憑單一分數決定。</p></section>`
  }
  if (semantic.status === 'unavailable') {
    return `<section class="database-panel database-error"><div class="database-title"><span>!</span><div><h3>本機語意模型暫時無法使用</h3><p>本次仍已完成話術、網址、政府與社群案例庫比對</p></div></div></section>`
  }
  if (semantic.status === 'not-matched' && semantic.closestCandidate) {
    return `<section class="database-panel database-neutral"><div class="database-title"><span>AI</span><div><h3>本機語意模型未達警示門檻</h3><p>最接近「${escapeHtml(semantic.closestCandidate.category)}」${Math.round(semantic.closestCandidate.similarity * 100)}%；最接近正常語句 ${Math.round((semantic.closestBenignSimilarity ?? 0) * 100)}%</p></div></div><p class="database-warning">相似度僅供診斷，不代表安全或詐騙認定。</p></section>`
  }
  return ''
}

function renderEvidencePanel(result: AnalysisResult) {
  const database = result.database
  const databaseStatus: Record<DatabaseSearchResult['status'], string> = {
    matched: `命中 ${database.matches.length} 筆；命中的是完整網域或其上層網域。`,
    'not-matched': `已查詢 ${database.searchedDomains.map(escapeHtml).join('、') || '辨識到的網址'}，未找到相同網域。未命中不代表安全。`,
    'no-domain': 'OCR／文字中沒有辨識出可供精確比對的網域，因此沒有進行網域命中判定。',
    unavailable: `資料庫無法載入：${escapeHtml(database.error ?? '原因不明')}。`,
  }
  const sourceRows = (database.sources ?? []).map((source) => `
    <li><a href="${escapeHtml(source.datasetUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.name)} ↗</a><span>本版匯入 ${source.importedRows.toLocaleString('zh-TW')} 列 · ${escapeHtml(source.license)} · 官方詮釋資料更新：${escapeHtml(source.metadataUpdatedAt ?? '未知')} · 來源內容版本：${escapeHtml(source.contentUpdatedAt ?? '未知')} · 下載：${formatIsoTimestamp(source.downloadedAt)} · 確認：${formatIsoTimestamp(source.verifiedAt)}</span></li>`).join('')
  const communityStatus = result.community.status === 'matched'
    ? `命中 ${result.community.matches.length} 筆去識別化案例。`
    : result.community.status === 'not-matched'
      ? '未命中目前的去識別化案例。案例庫規模有限，未命中不代表安全。'
      : `案例庫無法載入：${escapeHtml(result.community.error ?? '原因不明')}。`
  const semanticStatus = result.semantic.status === 'matched'
    ? `本機模型找到「${escapeHtml(result.semantic.matches[0]?.category ?? '相似手法')}」語意近似。`
    : result.semantic.status === 'not-matched'
      ? `本機模型未達語意相似門檻${result.semantic.closestCandidate ? `；最接近「${escapeHtml(result.semantic.closestCandidate.category)}」${Math.round(result.semantic.closestCandidate.similarity * 100)}%，正常語句 ${Math.round((result.semantic.closestBenignSimilarity ?? 0) * 100)}%` : ''}。`
      : result.semantic.status === 'skipped'
        ? '規則、網址或案例已提供足夠風險證據，本次免載入大型模型。'
      : result.semantic.status === 'disabled'
        ? '使用者已關閉本機語意模型。'
        : '本機語意模型無法載入。'
  const ocrRow = result.context.source === 'image'
    ? `<li><strong>截圖文字與 QR 擷取</strong><span>${result.context.ocrFailure ? `辨識失敗：${escapeHtml(result.context.ocrFailure)}` : `${result.context.imageCount ?? 1} 張中完成 ${result.context.ocrCompletedCount ?? 1} 張${result.context.ocrFailedCount ? `、失敗 ${result.context.ocrFailedCount} 張` : ''} · 平均 OCR 信心 ${Math.round(result.context.ocrConfidence ?? 0)}% · 擷取 ${result.context.ocrTextLength ?? 0} 字 · ${result.context.ocrPasses ?? 0} 次辨識 · 候選 ${result.context.ocrCandidateCount ?? result.context.ocrPasses ?? 0} 個／穩定 ${result.context.ocrStableCandidateCount ?? 0} 個 · ${result.context.ocrProcessingMs ? `${(result.context.ocrProcessingMs / 1000).toFixed(1)} 秒 · ` : ''}QR ${result.context.qrCodeCount ?? 0} 個 · ${escapeHtml(result.context.ocrEngine ?? 'OCR 引擎未知')}`}；文字來源：${escapeHtml(result.context.textSource ?? 'automatic-ocr')}；圖片依序在本機處理，QR 不會自動開啟；信心值不是詐騙機率，人工修正不會提高信心。</span></li>`
    : `<li><strong>輸入內容</strong><span>${result.context.source === 'file' ? '由文字檔匯入' : '由使用者貼上'}，直接進行本機比對。</span></li>`
  const officialReferences = [...new Map(result.findings
    .filter((finding) => finding.source)
    .map((finding) => [finding.source!.url, finding.source!])).values()]
    .map((source) => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.name)} ↗</a><span>用於核對官方網域或官方防詐聲明。</span></li>`).join('')

  return `<section class="evidence-panel">
    <div class="evidence-heading"><div><p>可追溯的判斷依據</p><h3>本次實際查了哪些資料</h3></div><span>證據分數 ≠ 詐騙機率</span></div>
    <ol class="evidence-steps">
      ${ocrRow}
      <li><strong>政府涉詐網域快照</strong><span>${databaseStatus[database.status]} 資料版次 ${escapeHtml(database.version ?? '未知')}，共 ${(database.recordCount ?? 0).toLocaleString('zh-TW')} 個去重網域。系統最後成功下載：${formatIsoTimestamp(database.lastSuccessfulDownloadAt ?? database.generatedAt)}；最後確認：${formatIsoTimestamp(database.lastVerifiedAt)}。</span></li>
      <li><strong>社群案例話術庫</strong><span>${communityStatus} 版次 ${escapeHtml(result.community.version ?? '未知')}，共 ${result.community.recordCount ?? 0} 筆。</span></li>
      <li><strong>本機語意 AI</strong><span>${semanticStatus} 只在裝置內運算，不是外部資料庫查詢。</span></li>
    </ol>
    ${sourceRows || officialReferences ? `<div class="source-ledger"><h4>資料來源與官方核對</h4><ul>${sourceRows}${officialReferences}</ul></div>` : ''}
    <p class="evidence-limit">本工具目前不會自動把內容送到 165 網站搜尋、MyGoPen 或 Google Safe Browsing；下方僅提供外部查證連結。所有「未命中」都只代表在上述版本與可辨識內容中沒有找到相同資料，不能解讀為安全。</p>
  </section>`
}

function renderCommunityResult(community: CommunitySearchResult) {
  if (community.status !== 'matched') return ''
  const matches = community.matches.map((match) => `
    <li>
      <div><strong>${escapeHtml(match.category)}</strong><span>${escapeHtml(match.observedAt)}</span></div>
      <p>${match.matchedSignals.map((signal) => escapeHtml(signal.title)).join('、')}</p>
      <p>來源：${escapeHtml(match.source)}；僅保存去識別化話術特徵，不保存發文者資料或原始截圖。</p>
    </li>`).join('')
  return `<section class="database-panel community-hit"><div class="database-title"><span>!</span><div><h3>社群案例話術庫命中 ${community.matches.length} 筆</h3><p>案例庫 ${escapeHtml(community.version ?? '未知版本')} · ${community.recordCount ?? community.matches.length} 筆去識別化案例</p></div></div><ul>${matches}</ul><p class="database-warning">社群案例只作為風險特徵參考；不代表貼文中的任何個人或組織已被司法認定涉詐。</p></section>`
}

function formatDatabaseDate(value: string) {
  if (value.length === 8) return `${value.slice(0, 4)}/${value.slice(4, 6)}/${value.slice(6)}`
  if (value.length === 6) return `${value.slice(0, 4)}/${value.slice(4, 6)}`
  return value || '未提供'
}

function formatRocRecordDate(value: string) {
  if (!/^\d{6,8}$/.test(value)) return '未知'
  const year = Number(value.slice(0, 4)) - 1911
  const month = Number(value.slice(4, 6))
  return year > 0 && month >= 1 && month <= 12 ? `民國 ${year} 年 ${month} 月` : '未知'
}

function formatIsoTimestamp(value?: string) {
  if (!value) return '未知'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? escapeHtml(value) : parsed.toLocaleString('zh-TW', { hour12: false })
}

function renderDatabaseResult(database: DatabaseSearchResult) {
  const count = database.recordCount?.toLocaleString('zh-TW') ?? '未知數量'
  const meta = database.version ? `資料庫 ${database.version} · ${count} 個網域` : '資料庫狀態未知'

  if (database.status === 'matched') {
    const matches = database.matches.map((match) => `
      <li>
        <div><strong>${escapeHtml(match.domain)}</strong><span>${escapeHtml(match.category)}</span></div>
        <p>原始輸入：<code>${escapeHtml(match.originalInput ?? match.inputDomain)}</code> · 正規化主機：<code>${escapeHtml(match.inputDomain)}</code> · 比對規則：${match.matchType === 'parent-domain' ? '母網域歷史紀錄' : '完整主機名稱'}</p>
        <p>來源：${match.sources.map((source) => `<a href="${escapeHtml(source.datasetUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.name)}</a>`).join('、')} · 個別網域記錄日期：${escapeHtml(formatDatabaseDate(match.lastSeen))}</p>
        <p><strong>此網域曾被官方列入涉詐停止解析清單（資料時間：${escapeHtml(formatRocRecordDate(match.lastSeen))}），請進一步確認目前網站狀態。</strong></p>
      </li>`).join('')
    return `<section class="database-panel database-hit"><div class="database-title"><span>!</span><div><h3>政府歷史資料命中 ${database.matches.length} 筆</h3><p>${meta}</p></div></div><ul>${matches}</ul><p class="database-warning">命中只代表過去曾列入官方來源，不代表目前網站仍由同一人控制或仍為詐騙。停止解析措施可能撤銷、廢止或屆期，請使用官方管道確認現況。</p></section>`
  }

  if (database.status === 'not-matched') {
    return `<section class="database-panel database-miss"><div class="database-title"><span>✓</span><div><h3>政府資料庫未找到相同網域</h3><p>${meta} · 已查詢 ${database.searchedDomains.map(escapeHtml).join('、')}</p></div></div><p class="database-warning">未命中不代表安全；新網站可能尚未被通報，仍須搭配話術與網址特徵判斷。</p></section>`
  }

  if (database.status === 'no-domain') {
    return `<section class="database-panel database-neutral"><div class="database-title"><span>—</span><div><h3>內容中沒有可查詢的網址</h3><p>${meta} · 本次改用話術與行為特徵判斷</p></div></div></section>`
  }

  return `<section class="database-panel database-error"><div class="database-title"><span>!</span><div><h3>政府資料庫暫時無法載入</h3><p>${escapeHtml(database.error ?? '仍已完成本機話術分析')}</p></div></div><p class="database-warning">目前結果未包含資料庫比對，請稍後重試或使用下方官方查證入口。</p></section>`
}

input.addEventListener('input', () => {
  analysisContext = { source: 'text' }
  imageAnalysisItems = []
  updateCounter()
})

document.querySelectorAll<HTMLButtonElement>('[data-example]').forEach((button) => {
  button.addEventListener('click', () => {
    const key = button.dataset.example as keyof typeof examples
    input.value = examples[key]
    analysisContext = { source: 'text' }
    updateCounter()
    input.focus()
  })
})

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0]
  if (!file) return
  if (file.size > 1_000_000) {
    fileName.textContent = '檔案超過 1 MB，請縮小後再試。'
    return
  }
  input.value = (await file.text()).slice(0, 12000)
  analysisContext = { source: 'file' }
  fileName.textContent = `已匯入：${file.name}`
  updateCounter()
})

removeImageButton.addEventListener('click', resetImageUpload)

imageInput.addEventListener('change', () => {
  const selectedFiles = Array.from(imageInput.files ?? [])
  if (!selectedFiles.length) return
  if (selectedFiles.length > 10) {
    fileName.textContent = '一次最多選擇 10 張截圖，請分批處理。'
    resetImageUpload()
    return
  }
  if (selectedFiles.some((file) => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) {
    fileName.textContent = '僅支援 PNG、JPG 或 WebP 圖片。'
    resetImageUpload()
    return
  }
  if (selectedFiles.some((file) => file.size > 20_000_000)) {
    fileName.textContent = '每張圖片上限 20 MB，請先在手機裁切或縮小後再試。'
    resetImageUpload()
    return
  }
  if (selectedFiles.reduce((total, file) => total + file.size, 0) > 80_000_000) {
    fileName.textContent = '本批圖片總大小超過 80 MB，請分成兩批處理。'
    resetImageUpload()
    return
  }

  selectedImageFiles = selectedFiles
  updateSupplementTargets()
  renderImageThumbnails(selectedFiles)
  imagePreview.hidden = false
  fileName.textContent = ''
  ocrTitle.textContent = `準備辨識 ${selectedFiles.length} 張截圖`
  updateOcrProgress(0, '')
  ocrStatus.textContent = '可先用箭頭調整順序；圖片只會在這台裝置處理。'
})

async function analyzeTextContent(content: string, context: AnalysisContext, updateProgress?: (progress: SemanticProgress) => void) {
  const [database, community] = await Promise.all([
    searchThreatDatabase(content),
    searchCommunityDatabase(content),
  ])
  const semanticSkipped: SemanticSearchResult = {
    status: semanticToggle.checked ? 'skipped' : 'disabled',
    matches: [],
    model: '',
    skipReason: semanticToggle.checked ? 'deterministic-evidence' : undefined,
  }
  const baseResult = analyzeContent(content, database, community, context, semanticSkipped)
  const semantic = semanticToggle.checked && content.trim() && baseResult.score < 25
    ? await searchSemanticSimilarity(content, true, updateProgress)
    : semanticSkipped
  return analyzeContent(content, database, community, context, semantic)
}

function analysisContextForItem(item: ImageAnalysisItem, textSource: ImageTextSource, text: string): AnalysisContext {
  return {
    source: 'image', textSource,
    ocrConfidence: item.confidence, ocrPasses: item.passes, ocrTextLength: text.length,
    ocrEngine: item.engine, imageCount: 1,
    ocrCompletedCount: item.ocrOriginalText.trim() ? 1 : 0,
    ocrFailedCount: item.ocrOriginalText.trim() ? 0 : 1,
    imageWidth: item.width, imageHeight: item.height, qrCodeCount: item.qrCodeCount,
    ocrCandidateCount: item.candidates.length, ocrStableCandidateCount: item.stableCandidateCount,
    ocrProcessingMs: item.processingMs,
    ocrFailure: text.trim() ? undefined : item.failure,
    supplementalScope: item.supplementalText ? 'single-image' : undefined,
  }
}

async function analyzeImageItem(item: ImageAnalysisItem) {
  const effective = effectiveImageText(item)
  const result = await analyzeTextContent(effective.text, analysisContextForItem(item, effective.textSource, effective.text))
  return { ...item, text: effective.text, textSource: effective.textSource, result }
}

async function recomputeBatchResult() {
  const successful = imageAnalysisItems.filter((item) => item.text.trim())
  if (supplementalAnalysis?.scope === 'background' && supplementalAnalysis.text.trim()) {
    supplementalAnalysis.result = await analyzeTextContent(supplementalAnalysis.text, { source: 'text', textSource: 'user-supplied', supplementalScope: 'background' })
  }
  if (imagesSameConversation && successful.length) {
    const texts = successful.map((item) => item.text)
    if (supplementalAnalysis?.scope === 'conversation') texts.push(supplementalAnalysis.text)
    const combined = deduplicateConversationTexts(texts)
    const averageConfidence = successful.reduce((sum, item) => sum + item.confidence, 0) / successful.length
    analysisContext = {
      source: 'image', textSource: supplementalAnalysis?.scope === 'conversation' ? 'mixed' : successful.some((item) => item.textSource !== 'automatic-ocr') ? 'mixed' : 'automatic-ocr',
      ocrConfidence: averageConfidence, ocrPasses: successful.reduce((sum, item) => sum + item.passes, 0),
      ocrTextLength: combined.length, ocrEngine: successful[0]?.engine ?? 'Tesseract.js 7', imageCount: selectedImageFiles.length,
      ocrCompletedCount: successful.filter((item) => item.ocrOriginalText.trim()).length,
      ocrFailedCount: imageAnalysisItems.filter((item) => !item.ocrOriginalText.trim()).length,
      qrCodeCount: successful.reduce((sum, item) => sum + item.qrCodeCount, 0),
      ocrCandidateCount: successful.reduce((sum, item) => sum + item.candidates.length, 0),
      ocrStableCandidateCount: successful.reduce((sum, item) => sum + item.stableCandidateCount, 0),
      ocrProcessingMs: successful.reduce((sum, item) => sum + item.processingMs, 0), supplementalScope: supplementalAnalysis?.scope,
    }
    return analyzeTextContent(combined, analysisContext)
  }
  const candidates = [
    ...imageAnalysisItems,
    ...(supplementalAnalysis?.scope === 'background' && supplementalAnalysis.result
      ? [{ order: imageAnalysisItems.length + 1, result: supplementalAnalysis.result }]
      : []),
  ]
  const strongest = selectStrongestImageResult(candidates)
  const fallback = analyzeContent('', undefined, undefined, { source: 'image', textSource: 'automatic-ocr', ocrFailure: '圖片中沒有辨識到文字' })
  analysisContext = strongest?.result.context ?? fallback.context
  return strongest?.result ?? fallback
}

function bindImageCorrectionControls() {
  document.querySelectorAll<HTMLButtonElement>('[data-reanalyze-image]').forEach((button) => {
    button.addEventListener('click', async () => {
      const imageId = button.dataset.reanalyzeImage!
      const itemIndex = imageAnalysisItems.findIndex((item) => item.imageId === imageId)
      const editor = document.querySelector<HTMLTextAreaElement>(`[data-correction-text="${CSS.escape(imageId)}"]`)
      if (itemIndex < 0 || !editor) return
      button.disabled = true
      const current = imageAnalysisItems[itemIndex]!
      imageAnalysisItems[itemIndex] = await analyzeImageItem({
        ...current, userCorrectedText: editor.value, correctionStatus: 'corrected', failure: editor.value.trim() ? undefined : current.failure,
      })
      const batchResult = await recomputeBatchResult()
      renderResult(batchResult)
    })
  })
  document.querySelectorAll<HTMLButtonElement>('[data-restore-image]').forEach((button) => {
    button.addEventListener('click', async () => {
      const imageId = button.dataset.restoreImage!
      const itemIndex = imageAnalysisItems.findIndex((item) => item.imageId === imageId)
      if (itemIndex < 0) return
      button.disabled = true
      const current = imageAnalysisItems[itemIndex]!
      imageAnalysisItems[itemIndex] = await analyzeImageItem({ ...current, userCorrectedText: '', correctionStatus: 'restored' })
      const batchResult = await recomputeBatchResult()
      renderResult(batchResult)
    })
  })
}

cancelOcrButton.addEventListener('click', () => {
  ocrCancelled = true
  cancelOcrButton.disabled = true
  ocrStatus.textContent = '正在中止；目前這一輪完成後會停止，不會處理下一張。'
  void releaseOcrWorker()
})

sameConversationInput.addEventListener('change', () => {
  const conversationOption = [...supplementScopeInput.options].find((option) => option.value === 'conversation')
  if (conversationOption) conversationOption.disabled = !sameConversationInput.checked
  if (!sameConversationInput.checked && supplementScopeInput.value === 'conversation') {
    supplementScopeInput.value = 'background'
    document.querySelector<HTMLElement>('#supplement-hint')!.textContent = '整組補充文字需先勾選「同一段對話」；目前已改回獨立背景說明。'
  }
})

startOcrButton.addEventListener('click', async () => {
  if (!selectedImageFiles.length) return
  imageAnalysisItems = []
  imagesSameConversation = sameConversationInput.checked
  ocrCancelled = false
  supplementalAnalysis = null
  const supplementText = supplementTextInput.value.trim()
  const selectedScope = supplementScopeInput.value
  if (selectedScope === 'conversation' && !imagesSameConversation) {
    document.querySelector<HTMLElement>('#supplement-hint')!.textContent = '請先勾選「這些截圖屬於同一段對話」，才能把文字套用到整組。'
    sameConversationInput.focus()
    return
  }
  if (supplementText) {
    supplementalAnalysis = selectedScope.startsWith('image-')
      ? { text: supplementText, scope: 'single-image', targetIndex: Number(selectedScope.slice(6)) }
      : { text: supplementText, scope: selectedScope as SupplementScope }
  }
  imageInput.disabled = true
  startOcrButton.disabled = true
  sameConversationInput.disabled = true
  cancelOcrButton.hidden = false
  cancelOcrButton.disabled = false
  scanButton.disabled = true
  semanticToggle.disabled = true
  renderImageThumbnails(selectedImageFiles, false)
  try {
    for (const [index, file] of selectedImageFiles.entries()) {
      if (ocrCancelled) break
      batchProgressPrefix = `第 ${index + 1}/${selectedImageFiles.length} 張：`
      ocrTitle.textContent = `辨識並分析：第 ${index + 1} 張，共 ${selectedImageFiles.length} 張`
      updateOcrProgress(0, '')
      let recognized: Awaited<ReturnType<typeof recognizeScreenshot>> | undefined
      let failure = ''
      try {
        recognized = await recognizeScreenshot(file)
        if (!recognized.text.trim()) failure = '圖片中沒有辨識到文字'
      } catch (firstError) {
        if (ocrCancelled || (firstError instanceof Error && firstError.message === '使用者已取消辨識')) break
        await releaseOcrWorker()
        batchProgressPrefix = `第 ${index + 1}/${selectedImageFiles.length} 張重試：`
        ocrStatus.textContent = `${batchProgressPrefix}重新啟動本機辨識引擎`
        try {
          recognized = await recognizeScreenshot(file)
          if (!recognized.text.trim()) failure = '圖片中沒有辨識到文字'
        } catch (retryError) {
          if (ocrCancelled || (retryError instanceof Error && retryError.message === '使用者已取消辨識')) break
          console.warn('Screenshot OCR failed after one retry', { firstError, retryError })
          failure = '文字辨識途中中斷'
        }
      }

      if (recognized?.text.trim()) {
        const supplementalText = supplementalAnalysis?.scope === 'single-image' && supplementalAnalysis.targetIndex === index + 1
          ? supplementalAnalysis.text : undefined
        const baseItem: ImageAnalysisItem = {
          imageId: `image-${index + 1}-${Date.now()}`, imageIndex: index, order: index + 1, fileName: file.name,
          ...recognized, result: undefined as unknown as AnalysisResult, failure: undefined,
          ocrOriginalText: recognized.text, userCorrectedText: '', correctionStatus: 'original',
          textSource: supplementalText ? 'mixed' : 'automatic-ocr', supplementalText,
        }
        imageAnalysisItems.push(await analyzeImageItem(baseItem))
      } else {
        const supplementalText = supplementalAnalysis?.scope === 'single-image' && supplementalAnalysis.targetIndex === index + 1
          ? supplementalAnalysis.text : undefined
        const baseItem: ImageAnalysisItem = {
          imageId: `image-${index + 1}-${Date.now()}`, imageIndex: index, order: index + 1, fileName: file.name,
          text: '', confidence: 0, passes: 0, width: 0, height: 0, engine: 'Tesseract.js 7', qrCodeCount: 0,
          failure: failure || '圖片中沒有辨識到文字', result: undefined as unknown as AnalysisResult,
          ocrOriginalText: '', userCorrectedText: '', correctionStatus: 'original',
          textSource: supplementalText ? 'user-supplied' : 'automatic-ocr', supplementalText,
          candidates: [], processingMs: 0, stableCandidateCount: 0,
        }
        imageAnalysisItems.push(await analyzeImageItem(baseItem))
      }
    }
    await releaseOcrWorker()
    const successful = imageAnalysisItems.filter((item) => item.text.trim())
    const displayText = successful.map((item) => `[截圖 ${item.order}/${selectedImageFiles.length}]\n${item.text.trim()}`).join('\n\n')
    input.value = displayText.slice(0, 12000)
    updateCounter()

    const batchResult = await recomputeBatchResult()
    batchProgressPrefix = ''
    updateOcrProgress(1, 'recognizing text')
    ocrTitle.textContent = ocrCancelled
      ? `已中止：完成 ${imageAnalysisItems.length}/${selectedImageFiles.length} 張`
      : `${successful.length} 張取得可分析文字、${imageAnalysisItems.length - successful.length} 張未取得文字`
    ocrStatus.textContent = ocrCancelled
      ? '已保留中止前完成的結果；未處理的圖片沒有被判定為安全。'
      : imagesSameConversation
      ? '已保留每張獨立結果，並以去除相鄰重疊文字後的對話產生整批結論。'
      : '已逐張獨立分析；整批只採最高警示，不會把不同圖片的弱訊號相加。'
    renderResult(batchResult)
  } finally {
    await releaseOcrWorker()
    batchProgressPrefix = ''
    imageInput.disabled = false
    startOcrButton.disabled = false
    sameConversationInput.disabled = false
    cancelOcrButton.hidden = true
    cancelOcrButton.disabled = false
    scanButton.disabled = false
    semanticToggle.disabled = false
  }
})

async function runScan() {
  if (!input.value.trim()) {
    input.focus()
    input.setAttribute('aria-invalid', 'true')
    input.placeholder = '請先貼上要檢查的內容'
    return
  }
  input.removeAttribute('aria-invalid')
  scanButton.disabled = true
  semanticToggle.disabled = true
  scanButton.innerHTML = '<span>正在載入資料庫並比對…</span>'
  const updateSemanticProgress = ({ percent, message }: SemanticProgress) => {
    const progress = percent === null ? '' : ` ${percent}%`
    semanticStatus.textContent = `${message}${progress}；訊息仍只在本機處理。`
    scanButton.innerHTML = `<span>${escapeHtml(message)}${progress}</span>`
  }
  try {
    const result = await analyzeTextContent(input.value, analysisContext, updateSemanticProgress)
    if (result.semantic.status === 'unavailable') {
      semanticStatus.textContent = '模型載入失敗；目前仍會使用話術、網址與案例資料庫判斷。'
    } else if (result.semantic.status === 'skipped') {
      semanticStatus.textContent = '規則或資料庫已有風險證據，本次免下載大型 AI 模型。'
    } else if (result.semantic.status !== 'disabled') {
      semanticStatus.textContent = '本機語意模型已就緒；你的訊息不會上傳。'
    }
    renderResult(result)
  } finally {
    scanButton.disabled = false
    semanticToggle.disabled = false
    scanButton.innerHTML = '<span>開始檢查</span><span aria-hidden="true">→</span>'
  }
}

scanButton.addEventListener('click', runScan)

window.addEventListener('pagehide', () => {
  void ocrWorkerPromise?.then((worker) => worker.terminate())
})
