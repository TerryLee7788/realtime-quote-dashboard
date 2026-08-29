# [功能名稱]

- **Status**: Draft
- **建立日期**: YYYY-MM-DD
- **相關 Skill**: auth-flow / market-data-client / trading-chart / dashboard-ui （刪掉不相關的）

## 1. 背景與動機

這個功能要解決什麼問題？誰會用？現況（沒有這功能）痛點是什麼？

## 2. 目標 / 非目標

**目標**

- ...

**非目標（明確不做）**

- ...

## 3. 使用者故事與驗收標準

用 Given / When / Then 寫，每一條都要能被勾選，不能只是形容詞。

- [ ] Given ... When ... Then ...
- [ ] Given ... When ... Then ...

## 4. 架構影響分析（本專案專屬，不能跳過）

逐項回答，答不出來代表這個決策還沒想清楚，不要留到實作時才決定。

| 項目 | 是否涉及 | 決策 / 理由 |
| --- | --- | --- |
| 需要新的 Binance WS stream 或 REST 欄位？ | 是/否 | |
| 資料屬於高頻 tick（跟 kline 一樣）還是低頻？→ 決定進 `marketStore` 還是走 pub/sub | | |
| 需要新的圖表 series / 繪圖？ | 是/否 | |
| 需要新的 UI 面板 / 修改既有面板？ | 是/否 | |
| 需要持久化使用者相關資料？ | 是/否 | 是的話：必須經過 Postgres + Server Action（Node runtime），禁止另起 API route 碰 Binance 或養 WS 連線 |
| 需要新的 Postgres 資料表 / 欄位？ | 是/否 | schema 草稿寫在「五、資料契約」 |
| 牽涉登入態 / 受保護路由？ | 是/否 | |
| 需要在 session JWT payload 加欄位？ | 是/否 | 預設不要；payload 要保持精簡，優先考慮存 DB 用 user id 查 |
| 是否有東西會跨 Edge ↔ Node runtime 邊界？ | 是/否 | `db.ts` / `pg` 相關程式碼禁止被 `middleware.ts` import |

## 5. 資料契約

- `types/market.ts` 或其他 type 異動：
- 新的 Server Action 簽章（輸入 / 輸出）：
- 新的 Postgres schema（如果有）：

## 6. Edge Cases / 錯誤處理

- WS 斷線時這個功能的行為？
- 資料為空 / 載入中的畫面？
- 錯誤發生時要不要打斷使用者看盤？

## 7. Out of Scope

明確列出這次不處理、以後再說的部分，避免範圍蔓延。

## 8. 驗證計畫

這個 repo 沒有測試套件，用「手動驗證步驟」取代單元測試，實作完成後照這份清單走一遍
（可交給 `qa-agent` 執行）：

1. ...
2. ...

## 9. Rollout / 風險

有沒有需要分階段上線？有沒有會影響到既有功能（例如既有 WS 連線、既有面板）的風險？

## 變更記錄

實作過程中如果跟本規格有出入，記在這裡，不要回頭偷改驗收標準。

- YYYY-MM-DD — ...
