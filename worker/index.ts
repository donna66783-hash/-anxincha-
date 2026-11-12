import type { D1Database, R2Bucket } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database
  BUCKET: R2Bucket
  ADMIN_TOKEN: string
  ALLOWED_ORIGIN: string
}

const REPORT_TYPES = new Set(['chat_screenshot', 'social_post', 'email', 'suspicious_url', 'call_transcript', 'other'])
const REPORT_STATUSES = new Set(['pending', 'approved', 'rejected', 'deleted'])
const MAX_TEXT_LENGTH = 12_000
const MAX_CONTEXT_LENGTH = 6_000
const MAX_ATTACHMENTS = 3
const MAX_ATTACHMENT_SIZE = 5_000_000
const ALLOWED_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export interface ReportFields {
  reportType: string
  reportText: string
  contextText: string
  analysisState: string
  analysisCategory: string
  analysisScore: number
  consentCaseStorage: boolean
  consentResearch: boolean
  consentModelTraining: boolean
  sourceRightsConfirmed: boolean
  attachmentConsent: boolean
  honeypot: string
}

export function parseBoolean(value: FormDataEntryValue | null) {
  return value === 'true'
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function validateReportFields(fields: ReportFields) {
  const errors: string[] = []
  if (!REPORT_TYPES.has(fields.reportType)) errors.push('不支援的回報類型')
  if (!fields.reportText.trim()) errors.push('回報內容不可空白')
  if (fields.reportText.length > MAX_TEXT_LENGTH) errors.push('回報內容超過 12,000 字')
  if (fields.contextText.length > MAX_CONTEXT_LENGTH) errors.push('背景說明超過 6,000 字')
  if (!Number.isFinite(fields.analysisScore) || fields.analysisScore < 0 || fields.analysisScore > 100) errors.push('分析分數格式錯誤')
  if (!fields.consentCaseStorage) errors.push('必須同意保存本次匿名案例')
  if (!fields.sourceRightsConfirmed) errors.push('必須確認有權提供這份資料')
  if (fields.honeypot) errors.push('回報格式錯誤')
  return errors
}

function text(form: FormData, key: string, maxLength: number) {
  const value = form.get(key)
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function corsOrigin(request: Request, env: Env) {
  const origin = request.headers.get('Origin')
  if (!origin) return ''
  if (origin === env.ALLOWED_ORIGIN || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin
  return null
}

function responseWithCors(response: Response, origin: string) {
  const headers = new Headers(response.headers)
  if (origin) headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Vary', 'Origin')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'no-referrer')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function isAdmin(request: Request, env: Env) {
  const authorization = request.headers.get('Authorization') ?? ''
  return authorization.startsWith('Bearer ') && authorization.slice(7) === env.ADMIN_TOKEN && env.ADMIN_TOKEN.length >= 24
}

async function createReport(request: Request, env: Env) {
  const form = await request.formData()
  const fields: ReportFields = {
    reportType: text(form, 'reportType', 40),
    reportText: text(form, 'reportText', MAX_TEXT_LENGTH + 1),
    contextText: text(form, 'contextText', MAX_CONTEXT_LENGTH + 1),
    analysisState: text(form, 'analysisState', 40),
    analysisCategory: text(form, 'analysisCategory', 120),
    analysisScore: Number(text(form, 'analysisScore', 3)),
    consentCaseStorage: parseBoolean(form.get('consentCaseStorage')),
    consentResearch: parseBoolean(form.get('consentResearch')),
    consentModelTraining: parseBoolean(form.get('consentModelTraining')),
    sourceRightsConfirmed: parseBoolean(form.get('sourceRightsConfirmed')),
    attachmentConsent: parseBoolean(form.get('attachmentConsent')),
    honeypot: text(form, 'website', 200),
  }
  const errors = validateReportFields(fields)
  const attachments = form.getAll('attachments').filter((item): item is File => item instanceof File && item.size > 0)
  if (attachments.length > MAX_ATTACHMENTS) errors.push(`原始附件最多 ${MAX_ATTACHMENTS} 張`)
  if (attachments.length && !fields.attachmentConsent) errors.push('勾選附件時必須另行同意保存原始圖片')
  for (const attachment of attachments) {
    if (!ALLOWED_MEDIA_TYPES.has(attachment.type)) errors.push('附件僅支援 PNG、JPG 或 WebP')
    if (attachment.size > MAX_ATTACHMENT_SIZE) errors.push('每張回報附件上限 5 MB')
  }
  if (errors.length) return json({ ok: false, errors }, 400)

  const reportId = `report_${crypto.randomUUID()}`
  const deletionToken = randomToken()
  const deletionTokenHash = await sha256(deletionToken)
  const now = new Date().toISOString()
  const uploadedKeys: string[] = []
  try {
    for (const attachment of attachments) {
      const extension = attachment.type === 'image/png' ? 'png' : attachment.type === 'image/webp' ? 'webp' : 'jpg'
      const key = `private-reports/${reportId}/${crypto.randomUUID()}.${extension}`
      await env.BUCKET.put(key, await attachment.arrayBuffer(), {
        httpMetadata: { contentType: attachment.type },
        customMetadata: { reportId, uploadedAt: now },
      })
      uploadedKeys.push(key)
    }

    const statements = [env.DB.prepare(`
      INSERT INTO reports (
        id, status, report_type, report_text, context_text, analysis_state, analysis_category,
        analysis_score, consent_case_storage, consent_research, consent_model_training,
        source_rights_confirmed, attachment_consent, deletion_token_hash, created_at, updated_at
      ) VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      reportId, fields.reportType, fields.reportText, fields.contextText, fields.analysisState,
      fields.analysisCategory, fields.analysisScore, Number(fields.consentCaseStorage),
      Number(fields.consentResearch), Number(fields.consentModelTraining), Number(fields.sourceRightsConfirmed),
      Number(fields.attachmentConsent), deletionTokenHash, now, now,
    )]
    attachments.forEach((attachment, index) => {
      statements.push(env.DB.prepare(`
        INSERT INTO report_attachments (id, report_id, r2_key, media_type, byte_size, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(`attachment_${crypto.randomUUID()}`, reportId, uploadedKeys[index], attachment.type, attachment.size, now))
    })
    await env.DB.batch(statements)
    return json({ ok: true, reportId, deletionToken, status: 'pending' }, 201)
  } catch (error) {
    console.error('Failed to persist report', error)
    await Promise.all(uploadedKeys.map((key) => env.BUCKET.delete(key)))
    return json({ ok: false, error: '回報暫時無法保存，請稍後再試' }, 500)
  }
}

async function deleteOwnReport(request: Request, env: Env, reportId: string) {
  const token = request.headers.get('X-Deletion-Token') ?? ''
  const report = await env.DB.prepare('SELECT deletion_token_hash FROM reports WHERE id = ?').bind(reportId).first<{ deletion_token_hash: string }>()
  if (!report || !token || await sha256(token) !== report.deletion_token_hash) return json({ ok: false, error: '案件編號或撤回碼錯誤' }, 403)
  const attachmentRows = await env.DB.prepare('SELECT r2_key FROM report_attachments WHERE report_id = ?').bind(reportId).all<{ r2_key: string }>()
  await Promise.all(attachmentRows.results.map((row) => env.BUCKET.delete(row.r2_key)))
  const now = new Date().toISOString()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM community_signals WHERE record_id IN (SELECT id FROM community_records WHERE report_id = ?)').bind(reportId),
    env.DB.prepare('DELETE FROM community_records WHERE report_id = ?').bind(reportId),
    env.DB.prepare('DELETE FROM report_attachments WHERE report_id = ?').bind(reportId),
    env.DB.prepare(`UPDATE reports SET status = 'deleted', report_text = NULL, context_text = NULL, reviewer_note = NULL, updated_at = ? WHERE id = ?`).bind(now, reportId),
  ])
  return json({ ok: true, status: 'deleted' })
}

async function listReports(request: Request, env: Env) {
  if (!isAdmin(request, env)) return json({ ok: false, error: '未授權' }, 401)
  const url = new URL(request.url)
  const requestedStatus = url.searchParams.get('status') ?? 'pending'
  const status = REPORT_STATUSES.has(requestedStatus) ? requestedStatus : 'pending'
  const reports = await env.DB.prepare(`
    SELECT id, status, report_type, report_text, context_text, analysis_state, analysis_category,
      analysis_score, consent_research, consent_model_training, source_rights_confirmed,
      attachment_consent, reviewer_note, created_at, reviewed_at
    FROM reports WHERE status = ? ORDER BY created_at DESC LIMIT 50
  `).bind(status).all<Record<string, unknown>>()
  const enriched = await Promise.all(reports.results.map(async (report) => {
    const attachments = await env.DB.prepare('SELECT id, media_type, byte_size FROM report_attachments WHERE report_id = ? ORDER BY created_at').bind(report.id).all<Record<string, unknown>>()
    return { ...report, attachments: attachments.results }
  }))
  return json({ ok: true, reports: enriched })
}

async function viewAttachment(request: Request, env: Env, attachmentId: string) {
  if (!isAdmin(request, env)) return json({ ok: false, error: '未授權' }, 401)
  const attachment = await env.DB.prepare('SELECT r2_key, media_type FROM report_attachments WHERE id = ?').bind(attachmentId).first<{ r2_key: string; media_type: string }>()
  if (!attachment) return json({ ok: false, error: '找不到附件' }, 404)
  const object = await env.BUCKET.get(attachment.r2_key)
  if (!object) return json({ ok: false, error: '找不到附件檔案' }, 404)
  return new Response(object.body as ReadableStream, {
    headers: { 'Content-Type': attachment.media_type, 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline' },
  })
}

interface ApprovalInput {
  category?: unknown
  publicSummary?: unknown
  signals?: unknown
  reviewerNote?: unknown
}

async function reviewReport(request: Request, env: Env, reportId: string, decision: 'approve' | 'reject') {
  if (!isAdmin(request, env)) return json({ ok: false, error: '未授權' }, 401)
  const report = await env.DB.prepare('SELECT id, status, created_at FROM reports WHERE id = ?').bind(reportId).first<{ id: string; status: string; created_at: string }>()
  if (!report || report.status !== 'pending') return json({ ok: false, error: '案件不存在或已完成審核' }, 409)
  const body: ApprovalInput = await request.json<ApprovalInput>().catch(() => ({}))
  const reviewerNote = typeof body.reviewerNote === 'string' ? body.reviewerNote.trim().slice(0, 1000) : ''
  const now = new Date().toISOString()
  if (decision === 'reject') {
    await env.DB.prepare(`UPDATE reports SET status = 'rejected', reviewer_note = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`).bind(reviewerNote, now, now, reportId).run()
    return json({ ok: true, status: 'rejected' })
  }

  const category = typeof body.category === 'string' ? body.category.trim().slice(0, 120) : ''
  const publicSummary = typeof body.publicSummary === 'string' ? body.publicSummary.trim().slice(0, 500) : ''
  const signals: string[] = Array.isArray(body.signals)
    ? body.signals.filter((signal: unknown): signal is string => typeof signal === 'string').map((signal: string) => signal.trim().slice(0, 100)).filter(Boolean)
    : []
  if (!category || !publicSummary || signals.length < 2 || signals.length > 8) {
    return json({ ok: false, error: '核准時需填寫類型、去識別化摘要及 2–8 個文字訊號' }, 400)
  }
  const recordId = `ugc_${crypto.randomUUID()}`
  const statements = [
    env.DB.prepare(`UPDATE reports SET status = 'approved', reviewer_note = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`).bind(reviewerNote, now, now, reportId),
    env.DB.prepare(`
      INSERT INTO community_records (id, report_id, source_label, observed_at, category, public_summary, min_signals, created_at)
      VALUES (?, ?, '使用者自願匿名回報（人工審核）', ?, ?, ?, ?, ?)
    `).bind(recordId, reportId, report.created_at.slice(0, 10), category, publicSummary, Math.min(2, signals.length), now),
  ]
  signals.forEach((signal) => {
    statements.push(env.DB.prepare(`
      INSERT INTO community_signals (id, record_id, literal_pattern, title, detail)
      VALUES (?, ?, ?, ?, ?)
    `).bind(`signal_${crypto.randomUUID()}`, recordId, signal, signal, publicSummary))
  })
  await env.DB.batch(statements)
  return json({ ok: true, status: 'approved', recordId })
}

async function publicCommunityDatabase(env: Env) {
  const records = await env.DB.prepare(`
    SELECT id, source_label, observed_at, category, public_summary, min_signals
    FROM community_records ORDER BY created_at DESC LIMIT 500
  `).all<{ id: string; source_label: string; observed_at: string; category: string; public_summary: string; min_signals: number }>()
  const output = await Promise.all(records.results.map(async (record) => {
    const signals = await env.DB.prepare('SELECT literal_pattern, title, detail FROM community_signals WHERE record_id = ? ORDER BY id').bind(record.id).all<{ literal_pattern: string; title: string; detail: string }>()
    return {
      id: record.id,
      source: record.source_label,
      observedAt: record.observed_at,
      category: record.category,
      minSignals: record.min_signals,
      signals: signals.results.map((signal) => ({ pattern: escapeRegex(signal.literal_pattern), title: signal.title, detail: signal.detail })),
    }
  }))
  return new Response(JSON.stringify({
    schemaVersion: 1,
    version: new Date().toISOString().slice(0, 10),
    recordCount: output.length,
    privacy: '只包含人工核准的去識別化衍生特徵；不公開原始投稿或附件。',
    records: output,
  }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
}

async function handle(request: Request, env: Env) {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/api/health') return json({ ok: true, service: 'anxincha-report-api' })
  if (request.method === 'POST' && url.pathname === '/api/reports') return createReport(request, env)
  const deleteMatch = url.pathname.match(/^\/api\/reports\/([^/]+)\/delete$/)
  if (request.method === 'POST' && deleteMatch) return deleteOwnReport(request, env, deleteMatch[1])
  if (request.method === 'GET' && url.pathname === '/api/admin/reports') return listReports(request, env)
  const attachmentMatch = url.pathname.match(/^\/api\/admin\/attachments\/([^/]+)$/)
  if (request.method === 'GET' && attachmentMatch) return viewAttachment(request, env, attachmentMatch[1])
  const reviewMatch = url.pathname.match(/^\/api\/admin\/reports\/([^/]+)\/(approve|reject)$/)
  if (request.method === 'POST' && reviewMatch) return reviewReport(request, env, reviewMatch[1], reviewMatch[2] as 'approve' | 'reject')
  if (request.method === 'GET' && url.pathname === '/api/community-database') return publicCommunityDatabase(env)
  return json({ ok: false, error: '找不到 API 路徑' }, 404)
}

export default {
  async fetch(request: Request, env: Env) {
    const origin = corsOrigin(request, env)
    if (origin === null) return json({ ok: false, error: '不允許的來源' }, 403)
    if (request.method === 'OPTIONS') {
      return responseWithCors(new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Deletion-Token',
          'Access-Control-Max-Age': '86400',
        },
      }), origin)
    }
    try {
      return responseWithCors(await handle(request, env), origin)
    } catch (error) {
      console.error('Unhandled API request error', error)
      return responseWithCors(json({ ok: false, error: '伺服器暫時無法處理請求' }, 500), origin)
    }
  },
}

