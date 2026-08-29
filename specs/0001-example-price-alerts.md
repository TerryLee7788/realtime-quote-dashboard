# 價格到價提醒（Price Alerts）— 範例規格

- **Status**: Example（示範用，非真實待辦功能）
- **建立日期**: 2026-08-28
- **相關 Skill**: market-data-client, auth-flow, dashboard-ui

> 這份規格純粹示範 `TEMPLATE.md` 怎麼被填寫，特別是「架構影響分析」如何把本專案的硬限制轉成
> 具體決策。內容尚未實作，不代表真的排進開發排程。

## 1. 背景與動機

使用者盯盤時常常只在意某個商品漲/跌到特定價位才需要注意，但目前 dashboard 需要一直開著頁面盯著
`TickerHeader` 才會知道。想要「設定一個目標價，價格穿越時提醒我」，不用一直盯盤。

## 2. 目標 / 非目標

**目標**

- 使用者可以針對目前選中的 symbol 設定一個或多個「高於/低於某價位時提醒」的規則。
- 價格觸發規則時，跳出頁內提示（toast）+ 瀏覽器原生通知（若已授權）。
- 已登入的使用者，提醒規則要能跨裝置/重新整理後還在。

**非目標（明確不做）**

- 不做 email / 簡訊通知（超出這個 repo「純前端 + 短生命週期 Server Action」的架構範圍）。
- 不做未登入訪客的雲端同步（訪客版只做 localStorage，見下方架構決策）。
- 不做多商品同時監控的彙總通知中心（先只做單一 toast，多筆疊加是之後的事）。

## 3. 使用者故事與驗收標準

- [ ] Given 使用者已登入且在 dashboard，When 在 TickerHeader 旁點「新增提醒」並輸入一個高於目前價的數字，Then 規則被建立並顯示在提醒清單中。
- [ ] Given 已建立一條「高於 X」的規則，When 該 symbol 的即時價格（`ticker.lastPrice`）第一次穿越 X，Then 畫面跳出 toast 且（若已授權）觸發瀏覽器 Notification，該規則標記為已觸發、不重複提醒。
- [ ] Given 已登入使用者建立過規則，When 重新整理頁面或換裝置登入，Then 規則清單從資料庫還原。
- [ ] Given 未登入訪客，When 建立規則，Then 規則存在 localStorage，重新整理仍在，但登入其他裝置看不到。
- [ ] Given WS 連線中斷重連期間，When 價格暫時沒有更新，Then 不誤觸發、也不遺漏重連後第一筆價格的判斷。

## 4. 架構影響分析

| 項目 | 是否涉及 | 決策 / 理由 |
| --- | --- | --- |
| 需要新的 Binance WS stream 或 REST 欄位？ | 否 | `ticker.lastPrice` 已經在 `marketStore` 裡，不用加新 stream。 |
| 高頻 tick 還是低頻？→ store 還是 pub/sub | 低頻判斷 | 觸發檢查掛在既有 `ticker` 更新上做比較即可，不需要獨立 pub/sub；規則本身變動頻率更低，屬一般 UI 狀態。 |
| 需要新的圖表 series / 繪圖？ | 否 | 只在 TickerHeader 附近加 UI，不動 `TradingChart`。 |
| 需要新的 UI 面板 / 修改既有面板？ | 是 | 在 `TickerHeader` 旁新增「提醒」入口 + 一個提醒清單面板，走 `dashboard-ui` skill 的既有 panel 慣例（`bg-panel`、`cn()`、既有 up/down 色）。 |
| 需要持久化使用者相關資料？ | 是（僅登入者） | 一旦要跨裝置持久化，就必須經過 Postgres + Server Action（Node runtime）。**不**新起 API route 去碰 Binance 或養 WS 連線——判斷仍然在瀏覽器端用既有的 `ticker` 資料做，Server Action 只負責讀寫「規則」這個純使用者資料，跟行情資料流無關。 |
| 需要新的 Postgres 資料表 / 欄位？ | 是 | 新增 `price_alerts` 表（見第 5 節），沿用 `users.ts` 已有的 `ensureSchema()` 慣例，首次查詢時 `CREATE TABLE IF NOT EXISTS`。 |
| 牽涉登入態 / 受保護路由？ | 是 | 提醒清單 CRUD 只在已登入時可用；未登入走 localStorage-only 分支，UI 上要清楚標示「登入後可跨裝置同步」。 |
| 需要在 session JWT payload 加欄位？ | 否 | 規則資料量太大不適合塞進 cookie，一律用 `sub`（user id）查 Postgres，payload 維持現狀 `{sub, username, name}`。 |
| 是否跨 Edge ↔ Node runtime 邊界？ | 否，但要注意 | 提醒的 CRUD Server Action（碰 `db.ts`）跟 `middleware.ts` 完全不相干，維持現有「`db.ts` 只能被 Node runtime 檔案 import」的邊界不變。 |

## 5. 資料契約

**Postgres schema（新增，於 `src/lib/db.ts` 的 `ensureSchema()` 一併建立）**

```sql
CREATE TABLE IF NOT EXISTS price_alerts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
  target_price NUMERIC NOT NULL,
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Server Actions（`src/lib/alerts/actions.ts`，仿 `auth/actions.ts` 的寫法）**

- `createAlertAction(symbol, direction, targetPrice)` → 寫入一列，回傳新規則
- `deleteAlertAction(id)` → 刪除（需檢查 `user_id` 屬於目前 session）
- `listAlertsAction()` 或直接在 Server Component 用 `getSession()` + `query()` 讀出

**Client 端型別（`src/types/alerts.ts`）**

```ts
interface PriceAlert {
  id: string;
  symbol: string;
  direction: "above" | "below";
  targetPrice: number;
  triggeredAt: number | null;
}
```

## 6. Edge Cases / 錯誤處理

- WS 重連期間沒有新 `ticker` → 不判斷、不誤觸發；重連後第一筆價格要跟目標價正常比較一次。
- 使用者切換 symbol → 只檢查目前 `symbol` 的規則，其餘規則背景不檢查（因為沒有其他 symbol 的
  即時價格可用）；清單 UI 要標示「僅監控目前選中商品」。
- 已觸發的規則預設不重複提醒，但允許使用者手動「重置」。
- Postgres 寫入失敗（例如短暫斷線）→ 前端顯示錯誤 toast，規則清單保留使用者輸入不清空，允許重試。

## 7. Out of Scope

- 監控「目前未選中」的 symbol（需要額外輪詢或訂閱，之後可能要開一條獨立的輕量 REST 輪詢）。
- Email / 簡訊等站外通知管道。
- 提醒規則的分享 / 匯出。

## 8. 驗證計畫

1. 未登入狀態下建立一條規則 → 重新整理頁面 → 規則仍在（localStorage）→ 換一個瀏覽器 profile
   確認規則不存在（未同步）。
2. 登入 → 建立一條「高於目前價 0.1%」的規則 → 等待價格波動觸發 → 確認 toast + 瀏覽器通知
   （先手動允許通知權限）都出現，且只出現一次。
3. 觸發後重新整理頁面 → 規則顯示為「已觸發」，不再重複跳提示。
4. 開兩個分頁登入同帳號，其中一個建立規則 → 另一個重新整理後看得到。
5. 手動斷網數秒（模擬 WS 重連）→ 確認重連後價格判斷正常、沒有補發一次假觸發。

## 9. Rollout / 風險

- 風險：`ticker` 更新頻率高，若提醒檢查邏輯寫在 `MarketSocketProvider` 的 `onmessage` 裡且規則
  數量多，可能拖慢分流效能——應在 `TickerHeader` 或獨立 hook 裡對 `ticker` 做訂閱比較，而不是
  塞進 provider 本身，維持 provider 只做「demux + 分發」的單一職責。
- 可分階段上線：先做 localStorage-only（訪客）版本驗證 UX，再接 Postgres 持久化。

## 變更記錄

（本規格為範例，未實際進入實作，故無變更記錄。）
