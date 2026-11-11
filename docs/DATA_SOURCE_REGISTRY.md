# 全球多模態資料來源登錄表

核對日期：2026-11-12  
原則：`未知` 不得解讀為允許；只有 `approved_for_distribution` 的安全衍生資料可進入公開網站。

| source_id | 來源／司法轄區 | 模態與取得方式 | 更新 | 商用 | 再散布 | 訓練 | 目前狀態 | 主要風險與證據 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TW-DIGIAT-DNS | 數產署／台灣 | 網域；官方 JSON/XML | 不定期 | 是* | 是* | 未知 | approved_for_distribution | [資料集 165027](https://data.gov.tw/dataset/165027) 標示政府資料開放授權條款第 1 版、免費；需保留出處與版本。 |
| TW-165-STOPDNS | 警政署／台灣 | 網域；官方 CSV | 不定期 | 是* | 是* | 未知 | approved_for_distribution | [資料集 176455](https://data.gov.tw/dataset/176455) 標示政府資料開放授權條款第 1 版；內容為依法停止解析的涉詐網站。 |
| TW-165-RUMOR | 警政署／台灣 | 防詐公告；官方 CSV | 不定期 | 是* | 是* | 未知 | approved_for_internal | [資料集 38262](https://data.gov.tw/dataset/38262) 標示政府資料開放授權條款第 1 版；只能標記為 `anti_scam_warning`，不可當惡意樣本。 |
| TW-FRAUDBUSTER | 數產署／台灣 | 公開查詢與通報頁 | 未載明 | 未知 | 未知 | 未知 | candidate | [通報查詢網](https://fraudbuster.digiat.org.tw/accessibility/index?listType=N) 提供查詢，但未找到批次 API／再散布授權；禁止爬取。 |
| TW-COFACTS | Cofacts／台灣 | LINE 查核語料；HF/API/資料存檔 | 依快照 | 可，但有條件 | 可，須相同授權 | 可否訓練仍需專案判讀 | candidate | [LEGAL.md](https://github.com/cofacts/opendata/blob/master/LEGAL.md) 指定 CC BY-SA 4.0、逐則來源 URI、顯名與相同方式分享；整合前需完成衍生物隔離設計。 |
| US-FTC-CALLS | FTC／美國 | 未驗證來電投訴；API/週 CSV | 工作日 | 未知 | 未知 | 未知 | approved_for_internal | [FTC API](https://www.ftc.gov/developer/api/v0/endpoints/do-not-call-dnc-reported-calls-data-api) 明示所有投訴未驗證，且 Caller ID 可能不代表實際來電者；不得當黑名單。 |
| GLOBAL-PHISHTANK | Cisco Talos PhishTank／全球 | 釣魚 URL；JSON/CSV/XML | 每小時 | 未知 | 未知 | 未知 | candidate | [Developer Information](https://www.phishtank.org/developer_info.php) 提供下載與 application key；仍須核對使用及再發布條款。 |
| GLOBAL-URLHAUS | abuse.ch／全球 | 惡意程式 URL；需 Auth-Key | 約 5 分鐘 | 可能需付費 | 未知 | 未知 | candidate | [Community API](https://urlhaus.abuse.ch/api/) 明示商業／營利用途可能需要付費方案；且類型是 malware URL，不是一般詐騙大全。 |
| GLOBAL-OPENPHISH | OpenPhish／全球 | 釣魚資料庫；SQLite/方案 | 依方案 | 需詢價 | 未知 | 依方案 | candidate | [Database](https://www.openphish.com/phishing_database.html) 要求聯絡組織信箱取得價格與方案；未核准前不匯入。 |
| GLOBAL-ICFD31K | rishia2220／印度語境 | 合成逐輪通話文字；HF Parquet | 版本式 | 未知 | 未知 | 研究用途待核 | research_only | [資料卡](https://huggingface.co/datasets/rishia2220/icfd-31k) 標示 synthetic、License=`other`；不可當真實案件或商用已授權資料。 |
| GLOBAL-BOTHBOSU | BothBosu／英語 | 合成詐騙／正常電話對話；HF CSV | 版本式 | 看似可* | 看似可* | 看似可* | research_only | [資料卡](https://huggingface.co/datasets/BothBosu/single-agent-scam-conversations) 標示 Apache-2.0、synthetic；仍需核對原始生成與標籤品質。 |
| GLOBAL-PHISH-IMG | Zenodo／全球 | 網站截圖與 URL 特徵；ZIP 5.3 GB | 版本式 | 未知 | 未知 | 未知 | research_only | [Zenodo v2](https://zenodo.org/records/23477065) 顯示 21,311 張網站截圖與 60,000 URL，但 Rights/License 欄未顯示內容；不得下載整包或再發布。 |
| AU-SCAMWATCH | ACCC/NASC／澳洲 | 官方警示與手法摘要；網頁 | 持續 | 未知 | 未知 | 未知 | approved_for_internal | [Scamwatch](https://www.scamwatch.gov.au/) 可供人工萃取自編行為規則；不整篇複製文章。 |
| HK-ADCC | 香港警務處／香港 | 官方防詐警示；網頁 | 持續 | 未知 | 未知 | 未知 | approved_for_internal | [ADCC](https://www.police.gov.hk/ppp_en/04_crime_matters/adcc/) 為官方反詐協調中心；只保留自編規則與來源連結。 |
| SG-SCAMSHIELD | 新加坡政府／新加坡 | 官方警示與手法摘要；網頁 | 持續 | 未知 | 未知 | 未知 | approved_for_internal | [ScamShield](https://www.scamshield.gov.sg/) 為 `.gov.sg` 官方入口；只保留自編規則，不批量重製內容。 |

\*「是／看似可」仍須遵守原授權、顯名、相同方式分享、資料保護及第三方權利限制，不代表所有下游用途都自動核准。

## 目前允許進入公開資料包

- `TW-DIGIAT-DNS`、`TW-165-STOPDNS`：已由現有管線匯入並保留來源、資料日期與授權。
- `TW-165-RUMOR`：授權可用，但尚未匯入；未建立 `anti_scam_warning` 防誤標測試前不得發布。
- 其他來源：目前均不得自動進入 GitHub Pages 資料包。

