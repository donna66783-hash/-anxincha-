# 安心查（防詐 App 網頁原型）

「安心查」是依據 `GPT專案交接prompt.md` 建立的第一階段網頁原型。使用者可以貼上可疑文字、網址、上傳對話截圖，或匯入 LINE 對話 `.txt`，在瀏覽器本機取得風險提醒、可疑原因與建議行動。

## 本機啟動

需求：Node.js 20.19+ 或 22.12+、npm。

```powershell
npm install
npm run dev
```

終端機會顯示本機網址，通常是 `http://localhost:5173/`。

## 驗證

```powershell
npm test
npm run build
npm run preview
```

## 更新政府資料庫

以下指令會下載三份採政府資料開放授權條款第 1 版的資料集，正規化、去重後輸出至 `public/data/threat-intelligence.json`：

```powershell
npm run data:update
```

掃描時只會讀取網站隨附的本機資料庫，不會把使用者輸入傳給政府或第三方網站。

更新完成後可驗證資料筆數、來源、排序、重複值與欄位格式：

```powershell
npm run data:verify
```

`.github/workflows/update-threat-db.yml` 會在推送程式碼時部署 GitHub Pages，並於每天台灣時間 11:20 自動執行資料更新、驗證、測試、建置與重新部署；只有資料內容真的改變時才會建立提交。

## 目前範圍

- 文字與網址規則掃描
- PNG、JPG、WebP 截圖 OCR（上限 10 MB；首次使用會下載繁中與英文辨識模型）
- 搜尋由三份政府開放資料合併的本機涉詐網域資料庫
- LINE `.txt` 匯入（上限 1 MB，最多分析前 12,000 字）
- 高／中／低風險與可解釋原因
- 建議行動與 165 快速撥號
- 本機處理，不上傳、不儲存輸入內容
- 官方與可信第三方查證入口（只提供外部連結，不自動傳送輸入內容）
- 響應式、鍵盤操作與降低動態效果支援

## 尚未納入

- 語音轉文字
- 使用者回報與家人守護
- Android 通知監聽
- 可量化準確率測試集

目前規則僅供產品原型驗證，不應作為正式安全保證。
