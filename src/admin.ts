import './admin.css'
import { reportApiUrl } from './config'

interface AttachmentItem {
  id: string
  media_type: string
  byte_size: number
}

interface ReportItem {
  id: string
  status: string
  report_type: string
  report_text: string | null
  context_text: string | null
  analysis_state: string
  analysis_category: string
  analysis_score: number
  consent_research: number
  consent_model_training: number
  attachment_consent: number
  reviewer_note: string | null
  created_at: string
  reviewed_at: string | null
  attachments: AttachmentItem[]
}

const configuredApiUrl = reportApiUrl()
const app = document.querySelector<HTMLElement>('#admin-app')!
app.innerHTML = `
  <header class="admin-header"><h1>安心查案例審核後台</h1><p>查看自願回報、檢查去識別化內容，核准後才會更新公開比對庫。</p></header>
  <div class="admin-shell">
    <section class="admin-login">
      <label>回報 API 網址<input id="api-url" type="url" placeholder="https://…workers.dev" /></label>
      <label>管理權杖（只保留到關閉分頁）<input id="admin-token" type="password" autocomplete="current-password" /></label>
      <label>案件狀態<select id="report-status-filter"><option value="pending">待審核</option><option value="approved">已核准</option><option value="rejected">已拒絕</option><option value="deleted">使用者已撤回</option></select></label>
      <button id="load-reports" type="button">載入案件</button>
    </section>
    <p class="admin-note">核准前請刪除姓名、電話、地址、帳號等個資。公開資料庫只會加入你填寫的摘要與 2–8 個文字特徵；原始投稿與附件不會公開。</p>
    <p id="admin-status" role="status" aria-live="polite"></p>
    <section id="report-list" class="report-list" aria-label="使用者回報案件"></section>
  </div>`

const apiUrlInput = document.querySelector<HTMLInputElement>('#api-url')!
const tokenInput = document.querySelector<HTMLInputElement>('#admin-token')!
const filterInput = document.querySelector<HTMLSelectElement>('#report-status-filter')!
const loadButton = document.querySelector<HTMLButtonElement>('#load-reports')!
const statusMessage = document.querySelector<HTMLElement>('#admin-status')!
const reportList = document.querySelector<HTMLElement>('#report-list')!

apiUrlInput.value = localStorage.getItem('anxinchaAdminApiUrl') || configuredApiUrl
tokenInput.value = sessionStorage.getItem('anxinchaAdminToken') || ''

function apiUrl() {
  return apiUrlInput.value.trim().replace(/\/$/, '')
}

function adminHeaders(json = false) {
  const headers: Record<string, string> = { Authorization: `Bearer ${tokenInput.value}` }
  if (json) headers['Content-Type'] = 'application/json'
  return headers
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  if (className) node.className = className
  return node
}

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${apiUrl()}${path}`, init)
  const body = await response.json() as { ok?: boolean; error?: string; reports?: ReportItem[] }
  if (!response.ok || body.ok === false) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

function addReviewFields(card: HTMLElement, report: ReportItem) {
  if (report.status !== 'pending') return
  const fields = element('div', undefined, 'review-fields')
  const categoryLabel = element('label', '公開類型')
  const category = element('input')
  category.value = report.analysis_category || ''
  category.maxLength = 120
  categoryLabel.append(category)
  const summaryLabel = element('label', '去識別化摘要')
  const summary = element('textarea')
  summary.placeholder = '只能描述手法，不能包含姓名、電話、帳號或可識別個人的內容。'
  summary.maxLength = 500
  summaryLabel.append(summary)
  const signalsLabel = element('label', '文字特徵（每行一項，2–8 項；只填可重複辨識的話術）')
  const signals = element('textarea')
  signals.placeholder = '例如：要求加 LINE 聯絡\n例如：先支付保證金'
  signalsLabel.append(signals)
  const noteLabel = element('label', '內部審核備註（不公開）')
  const note = element('textarea')
  note.maxLength = 1000
  noteLabel.append(note)
  fields.append(categoryLabel, summaryLabel, signalsLabel, noteLabel)
  card.append(fields)

  const actions = element('div', undefined, 'review-actions')
  const approve = element('button', '核准並更新匿名比對庫')
  const reject = element('button', '拒絕回報', 'reject')
  approve.type = reject.type = 'button'
  actions.append(approve, reject)
  card.append(actions)

  approve.addEventListener('click', async () => {
    const signalList = signals.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
    if (!category.value.trim() || !summary.value.trim() || signalList.length < 2 || signalList.length > 8) {
      statusMessage.textContent = '核准前必須填寫類型、摘要，以及 2–8 個文字特徵。'
      return
    }
    if (!confirm('確認內容已去除個資，並將這些衍生特徵加入公開比對庫？')) return
    approve.disabled = true
    try {
      await request(`/api/admin/reports/${encodeURIComponent(report.id)}/approve`, {
        method: 'POST', headers: adminHeaders(true), body: JSON.stringify({
          category: category.value, publicSummary: summary.value, signals: signalList, reviewerNote: note.value,
        }),
      })
      statusMessage.textContent = '已核准；公開比對庫會在最多約 5 分鐘的快取時間後更新。'
      await loadReports()
    } catch (error) {
      approve.disabled = false
      statusMessage.textContent = `核准失敗：${error instanceof Error ? error.message : '請稍後再試'}`
    }
  })

  reject.addEventListener('click', async () => {
    if (!confirm('確定拒絕這筆回報？')) return
    reject.disabled = true
    try {
      await request(`/api/admin/reports/${encodeURIComponent(report.id)}/reject`, {
        method: 'POST', headers: adminHeaders(true), body: JSON.stringify({ reviewerNote: note.value }),
      })
      statusMessage.textContent = '已拒絕此回報，未更新公開比對庫。'
      await loadReports()
    } catch (error) {
      reject.disabled = false
      statusMessage.textContent = `拒絕失敗：${error instanceof Error ? error.message : '請稍後再試'}`
    }
  })
}

async function viewAttachment(attachment: AttachmentItem) {
  const response = await fetch(`${apiUrl()}/api/admin/attachments/${encodeURIComponent(attachment.id)}`, { headers: adminHeaders() })
  if (!response.ok) throw new Error(`附件載入失敗（HTTP ${response.status}）`)
  const url = URL.createObjectURL(await response.blob())
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  if (!opened) URL.revokeObjectURL(url)
  else window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function renderReport(report: ReportItem) {
  const card = element('article', undefined, 'report-card')
  const meta = element('div', undefined, 'report-meta')
  meta.append(
    element('span', `${report.status} · ${report.report_type} · ${new Date(report.created_at).toLocaleString('zh-TW')}`),
    element('span', `${report.analysis_state} · ${report.analysis_category} · 分數 ${report.analysis_score}`),
  )
  card.append(meta, element('h2', report.id))
  const rawTitle = element('strong', '使用者提供的文字')
  const raw = element('div', report.report_text || '（內容已撤回）', 'raw-content')
  card.append(rawTitle, raw)
  if (report.context_text) card.append(element('p', `補充說明：${report.context_text}`, 'context'))
  card.append(element('p', `研究同意：${report.consent_research ? '是' : '否'}；模型訓練同意：${report.consent_model_training ? '是' : '否'}；原圖保存同意：${report.attachment_consent ? '是' : '否'}`, 'context'))
  if (report.reviewer_note) card.append(element('p', `內部備註：${report.reviewer_note}`, 'context'))
  if (report.attachments.length) {
    const attachments = element('div', undefined, 'attachment-list')
    report.attachments.forEach((attachment, index) => {
      const button = element('button', `檢視附件 ${index + 1}（${Math.round(attachment.byte_size / 1024)} KB）`, 'secondary')
      button.type = 'button'
      button.addEventListener('click', () => void viewAttachment(attachment).catch((error) => {
        statusMessage.textContent = error instanceof Error ? error.message : '附件載入失敗'
      }))
      attachments.append(button)
    })
    card.append(attachments)
  }
  addReviewFields(card, report)
  return card
}

async function loadReports() {
  if (!apiUrl() || !tokenInput.value) {
    statusMessage.textContent = '請先填寫 API 網址與管理權杖。'
    return
  }
  localStorage.setItem('anxinchaAdminApiUrl', apiUrl())
  sessionStorage.setItem('anxinchaAdminToken', tokenInput.value)
  loadButton.disabled = true
  statusMessage.textContent = '正在載入案件…'
  reportList.replaceChildren()
  try {
    const body = await request(`/api/admin/reports?status=${encodeURIComponent(filterInput.value)}`, { headers: adminHeaders() })
    const reports = body.reports ?? []
    reports.forEach((report) => reportList.append(renderReport(report)))
    statusMessage.textContent = reports.length ? `共載入 ${reports.length} 筆案件。` : '目前沒有符合狀態的案件。'
  } catch (error) {
    statusMessage.textContent = `載入失敗：${error instanceof Error ? error.message : '請檢查 API 與權杖'}`
  } finally {
    loadButton.disabled = false
  }
}

loadButton.addEventListener('click', () => void loadReports())
