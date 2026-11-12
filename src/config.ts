export const DEFAULT_REPORT_API_URL = 'https://anxincha-report-api.anti-scam-web.workers.dev'

export function reportApiUrl() {
  return ((import.meta.env.VITE_REPORT_API_URL as string | undefined) || DEFAULT_REPORT_API_URL).replace(/\/$/, '')
}
