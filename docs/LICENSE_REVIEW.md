# 資料授權與發布審核

核對日期：2026-11-12

## 審核規則

1. `null／未知` 一律視為未核准，不得推定可商用、再散布或訓練。
2. 網站可查詢不等於可以批次下載；API 可使用不等於資料可以重新發布。
3. 原始私人截圖、姓名、電話、LINE ID、通話與社群貼文不得進入公開 repository。
4. 防詐公告必須標為 `anti_scam_warning`，投訴必須標為 `unverified_report`，合成資料必須標為 `synthetic`。
5. 公開資料包只接受 `approval_status=approved_for_distribution` 且 `privacy_review_status=passed` 的安全衍生記錄。

## 已核准

| source_id | 核准範圍 | 依據 | 限制 |
| --- | --- | --- | --- |
| TW-DIGIAT-DNS | 公開發布正規化網域與來源 metadata | [政府資料集頁](https://data.gov.tw/dataset/165027) | 政府資料開放授權條款第 1 版；保留出處、日期，不主動造訪網域。 |
| TW-165-STOPDNS | 公開發布正規化網域與來源 metadata | [政府資料集頁](https://data.gov.tw/dataset/176455) | 同上；保留法律／來源意義，不把上層正常平台整體誤列。 |

## 僅限內部規則研究

| source_id | 原因 | 下一個核准條件 |
| --- | --- | --- |
| TW-165-RUMOR | 公告文字可能含「匯款、LINE」等高風險詞，直接匯入會把防詐宣導誤標為詐騙。 | 建立 `anti_scam_warning` 標籤、否定語境與回歸測試。 |
| US-FTC-CALLS | FTC 明示資料是未驗證消費者投訴。 | adapter 必須保留 `unverified_report`，禁止輸出 confirmed scam 或號碼持有人指控。 |
| AU-SCAMWATCH／HK-ADCC／SG-SCAMSHIELD | 官方內容可作手法研究，但未核對批量重製授權。 | 僅人工撰寫短規則與來源連結；若要匯入原文，需另行取得權利依據。 |

## 尚未核准或研究隔離

- `TW-FRAUDBUSTER`：未找到公開批次 API 與再散布許可；不可爬取。
- `TW-COFACTS`：CC BY-SA 4.0 且要求逐則 URI、顯名及相同方式分享；需先決定程式碼／衍生資料隔離與授權相容性。
- `GLOBAL-PHISHTANK`：已確認下載格式與 application key，尚未確認再散布與商用條款。
- `GLOBAL-URLHAUS`：Auth-Key 必要，商業用途可能需要付費；未取得擁有者費用核准。
- `GLOBAL-OPENPHISH`：方案與價格需聯絡取得；未核准。
- `GLOBAL-ICFD31K`：License=`other`、合成資料；只可研究隔離。
- `GLOBAL-BOTHBOSU`：資料卡標示 Apache-2.0，但仍需核對資料生成與品質；只可研究隔離。
- `GLOBAL-PHISH-IMG`：Zenodo 頁面未顯示實際 License，且檔案 5.3 GB；不下載。

