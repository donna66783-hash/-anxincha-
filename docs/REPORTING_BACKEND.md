# 使用者回報與審核後台

## 資料流程

1. 一般檢查、OCR 與語意分析仍在使用者裝置內完成。
2. 只有使用者展開「自願匿名回報」、編修內容、勾選必要同意並按下送出，資料才會進入回報 API。
3. D1 保存待審文字、同意紀錄與審核狀態；原始圖片只有在另外勾選附件同意後，才會私下存入 R2。
4. 管理者從 `/admin.html` 查看待審案件，移除個資後填寫匿名摘要與 2–8 個可重複辨識的文字特徵。
5. 只有核准後的衍生特徵會出現在 `/api/community-database`，前台最長約五分鐘後即可比對到。原始投稿與附件不會公開。
6. 使用者送出後會取得案件編號及一次性顯示的撤回碼；撤回會刪除原始附件、原文和已產生的公開特徵。

## 第一次啟用（需要 Cloudflare 帳號）

以下步驟會建立外部雲端資源，必須由專案擁有者在終端機登入並確認：

```powershell
npx wrangler login
npx wrangler d1 create anxincha-reports
npx wrangler r2 bucket create anxincha-report-files
```

把 D1 指令回傳的 `database_id` 填入 `wrangler.toml`，取代 `REPLACE_WITH_D1_DATABASE_ID`，再執行：

```powershell
npm run worker:migrate:remote
npx wrangler secret put ADMIN_TOKEN
npm run worker:deploy
```

`ADMIN_TOKEN` 請使用密碼管理器產生至少 32 個隨機字元，不要寫進 Git、`.env`、網頁或對話紀錄。部署完成後會取得 Worker 網址，例如 `https://anxincha-report-api.<帳號>.workers.dev`。

最後到 GitHub repository：

1. `Settings` → `Secrets and variables` → `Actions` → `Variables`。
2. 新增 repository variable：名稱 `REPORT_API_URL`，值為 Worker 網址（結尾不加 `/`）。
3. 在 Actions 重新執行 `Update data and deploy website`，或推送一次程式碼。

完成後，首頁結果區會啟用回報按鈕；後台位於公開網站的 `/admin.html`，但讀取與審核 API 都必須提供 Cloudflare secret 中的管理權杖。權杖只保存在該瀏覽器分頁的 `sessionStorage`，關閉分頁後清除。

## 本機驗證

```powershell
npm run worker:migrate:local
npm run worker:dev
```

另開終端機：

```powershell
$env:VITE_REPORT_API_URL='http://localhost:8787'
npm run dev
```

本機 Worker 需要 `.dev.vars`：

```text
ADMIN_TOKEN=請填至少32字元的本機測試權杖
```

`.dev.vars` 已被 `.gitignore` 排除，不得提交。

## 上線前仍需設定

- 依實際流量在 Cloudflare 設定 API rate limit；大量公開使用前建議再接 Turnstile。
- 定期刪除不必要的拒絕案件與附件，並建立明確的資料保存期限。
- 管理權杖應定期輪替；疑似外洩時立即用 `wrangler secret put ADMIN_TOKEN` 更換。
- 後台核准是必要的人工作業，不能把使用者原文自動加入黑名單。
