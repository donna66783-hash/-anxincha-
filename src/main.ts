import './styles.css'
import { analyzeContent, type AnalysisResult, type RiskLevel } from './analyzer'
import { searchThreatDatabase, type DatabaseSearchResult } from './threat-db'

const examples = {
  police: '您好，我是檢察官。您的帳戶涉及洗錢，偵查不公開，不能告訴家人。請今天內把存款匯到監管帳戶配合調查。',
  investment: '老師有內線消息，保證獲利、穩賺不賠。名額有限，馬上加 LINE 並用 USDT 入金。',
  normal: '媽媽，我晚上六點到家。回去前會先到市場買水果，需要幫妳帶什麼嗎？',
  database: '客服通知：請立刻登入 https://tobuyersepc24.com/57vgaqk 完成帳號驗證。',
}

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
          <div class="file-actions">
            <label class="file-button" for="file-input">
              <span aria-hidden="true">＋</span> 匯入 LINE 對話 .txt
            </label>
            <input id="file-input" type="file" accept=".txt,text/plain" />
            <span id="file-name" aria-live="polite"></span>
          </div>
          <span id="char-count">0 / 12,000</span>
        </div>

        <div class="quick-examples">
          <span>試試看：</span>
          <button type="button" data-example="police">假檢警訊息</button>
          <button type="button" data-example="investment">投資群組</button>
          <button type="button" data-example="normal">一般家人訊息</button>
          <button type="button" data-example="database">資料庫命中網址</button>
        </div>

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
        <article><span>01</span><div class="step-icon">貼</div><h3>貼上內容</h3><p>複製訊息、網址，或匯入 LINE 對話文字檔。</p></article>
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
const fileName = document.querySelector<HTMLSpanElement>('#file-name')!
const scanButton = document.querySelector<HTMLButtonElement>('#scan-button')!
const resultWrap = document.querySelector<HTMLElement>('#result-wrap')!

function updateCounter() {
  counter.textContent = `${input.value.length.toLocaleString('zh-TW')} / 12,000`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'\"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!)
}

const levelCopy: Record<RiskLevel, { label: string; icon: string }> = {
  high: { label: '高度風險', icon: '!' },
  medium: { label: '需要注意', icon: '?' },
  low: { label: '暫無明顯警訊', icon: '✓' },
}

function renderResult(result: AnalysisResult) {
  const copy = levelCopy[result.level]
  const findings = result.findings.length
    ? result.findings.map((finding) => `<li><span>!</span><div><strong>${escapeHtml(finding.title)}</strong><p>${escapeHtml(finding.detail)}</p></div></li>`).join('')
    : '<li class="no-finding"><span>✓</span><div><strong>未比對到常見高風險話術</strong><p>詐騙手法會持續變化，仍請確認對方身分與網址來源。</p></div></li>'
  const databasePanel = renderDatabaseResult(result.database)

  resultWrap.innerHTML = `
    <div class="result-card risk-${result.level}">
      <div class="result-summary">
        <div class="result-icon">${copy.icon}</div>
        <div><p>檢查結果 · 風險分數 ${result.score}</p><h2>${copy.label}</h2><p>${escapeHtml(result.summary)}</p></div>
        <span class="category">可能類型：${escapeHtml(result.category)}</span>
      </div>
      <div class="result-columns">
        <div><h3>為什麼需要注意</h3><ul class="findings">${findings}</ul></div>
        <div class="action-panel"><h3>現在建議你這樣做</h3><ol>${result.actions.map((action) => `<li>${escapeHtml(action)}</li>`).join('')}</ol><a href="tel:165">撥打 165 諮詢</a></div>
      </div>
      ${databasePanel}
      <button type="button" class="reset-button" id="reset-button">檢查另一則內容</button>
    </div>`
  resultWrap.hidden = false
  resultWrap.scrollIntoView({ behavior: 'smooth', block: 'start' })
  document.querySelector<HTMLButtonElement>('#reset-button')?.addEventListener('click', () => {
    input.value = ''
    fileInput.value = ''
    fileName.textContent = ''
    resultWrap.hidden = true
    updateCounter()
    input.focus()
  })
}

function formatDatabaseDate(value: string) {
  if (value.length === 8) return `${value.slice(0, 4)}/${value.slice(4, 6)}/${value.slice(6)}`
  if (value.length === 6) return `${value.slice(0, 4)}/${value.slice(4, 6)}`
  return value || '未提供'
}

function renderDatabaseResult(database: DatabaseSearchResult) {
  const count = database.recordCount?.toLocaleString('zh-TW') ?? '未知數量'
  const meta = database.version ? `資料庫 ${database.version} · ${count} 個網域` : '資料庫狀態未知'

  if (database.status === 'matched') {
    const matches = database.matches.map((match) => `
      <li>
        <div><strong>${escapeHtml(match.domain)}</strong><span>${escapeHtml(match.category)}</span></div>
        <p>來源：${match.sources.map((source) => `<a href="${escapeHtml(source.datasetUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.name)}</a>`).join('、')} · 資料日期：${escapeHtml(formatDatabaseDate(match.lastSeen))}</p>
      </li>`).join('')
    return `<section class="database-panel database-hit"><div class="database-title"><span>!</span><div><h3>政府資料庫命中 ${database.matches.length} 筆</h3><p>${meta}</p></div></div><ul>${matches}</ul><p class="database-warning">命中代表該網域曾被政府資料列為涉詐或停止解析；請勿開啟、登入或付款。</p></section>`
  }

  if (database.status === 'not-matched') {
    return `<section class="database-panel database-miss"><div class="database-title"><span>✓</span><div><h3>政府資料庫未找到相同網域</h3><p>${meta} · 已查詢 ${database.searchedDomains.map(escapeHtml).join('、')}</p></div></div><p class="database-warning">未命中不代表安全；新網站可能尚未被通報，仍須搭配話術與網址特徵判斷。</p></section>`
  }

  if (database.status === 'no-domain') {
    return `<section class="database-panel database-neutral"><div class="database-title"><span>—</span><div><h3>內容中沒有可查詢的網址</h3><p>${meta} · 本次改用話術與行為特徵判斷</p></div></div></section>`
  }

  return `<section class="database-panel database-error"><div class="database-title"><span>!</span><div><h3>政府資料庫暫時無法載入</h3><p>${escapeHtml(database.error ?? '仍已完成本機話術分析')}</p></div></div><p class="database-warning">目前結果未包含資料庫比對，請稍後重試或使用下方官方查證入口。</p></section>`
}

input.addEventListener('input', updateCounter)

document.querySelectorAll<HTMLButtonElement>('[data-example]').forEach((button) => {
  button.addEventListener('click', () => {
    const key = button.dataset.example as keyof typeof examples
    input.value = examples[key]
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
  fileName.textContent = `已匯入：${file.name}`
  updateCounter()
})

scanButton.addEventListener('click', async () => {
  if (!input.value.trim()) {
    input.focus()
    input.setAttribute('aria-invalid', 'true')
    input.placeholder = '請先貼上要檢查的內容'
    return
  }
  input.removeAttribute('aria-invalid')
  scanButton.disabled = true
  scanButton.innerHTML = '<span>正在載入政府資料庫並比對…</span>'
  try {
    const database = await searchThreatDatabase(input.value)
    renderResult(analyzeContent(input.value, database))
  } finally {
    scanButton.disabled = false
    scanButton.innerHTML = '<span>開始檢查</span><span aria-hidden="true">→</span>'
  }
})
