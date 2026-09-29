# 事故報告：realtime-quote-dashboard 無法登入 / nuxt-github-search 搜尋失效

- 發現日期：2026-09-29
- 影響範圍：
  - `realtime-quote-dashboard.vercel.app` — 登入、註冊全部失敗（HTTP 500）
  - `nuxt-github-search.vercel.app` — 搜尋與 repo 詳細頁全部失敗（HTTP 401 `Bad credentials`）
- 結論：**兩個都不是程式碼 bug**。兩個 repo 的最後一次部署都在事故前好幾週，程式碼沒有變動；
  壞掉的是它們依賴的**外部資源／憑證**，而且兩邊的程式碼都沒有處理「外部依賴失效」的情況，
  所以一個依賴掛掉就直接變成整個功能掛掉。兩件事彼此獨立，只是剛好同時被發現。

---

## 1. realtime-quote-dashboard：登入失敗

### 症狀

在 `/login` 送出表單後得到 500 錯誤頁。Vercel Runtime Logs 裡每一筆 `POST /login` 都是：

```
error: (ENOTFOUND) tenant/user postgres.isrchfelvinlegsfgqgk not found
    at /var/task/node_modules/pg-pool/index.js:45:11
  severity: 'FATAL', code: 'XX000'
```

### 根本原因：Supabase 免費方案專案被自動暫停

Production 的 `DATABASE_URL` 指向 Supabase 專案 `isrchfelvinlegsfgqgk`（經由 Supavisor
connection pooler 連線）。調查當下：

| 檢查 | 結果 | 代表什麼 |
| --- | --- | --- |
| `nslookup isrchfelvinlegsfgqgk.supabase.co` | `Non-existent domain` | 專案的 DNS 紀錄已經被撤掉 |
| `nslookup db.isrchfelvinlegsfgqgk.supabase.co` | `Non-existent domain` | 同上，資料庫主機也不存在 |
| Supavisor pooler 回應 | `tenant/user postgres.isrchfelvinlegsfgqgk not found` | pooler 還在，但已經找不到這個租戶（專案） |
| git 歷史 / 最近部署 | 最後一次 Production 部署是 2026-08-29，之後沒有任何變動 | 不是程式碼改壞的 |

Supabase **免費方案的專案在一段時間（約 7 天）沒有活動後會被自動暫停**。暫停時資料庫 compute
被關掉、專案的 DNS 紀錄被移除，pooler 找不到對應的租戶，就會回 `tenant/user ... not found`。
這個 dashboard 是練習用專案、流量很低，登入以外的功能（行情、K 線）都是瀏覽器直連 Binance、
**完全不碰資料庫**，所以很容易連續 7 天以上沒有任何一個查詢打到 DB，因而被判定為閒置。

後來在 Supabase dashboard 按下 Restore 之後，DNS 恢復解析、`/rest/v1/` 回應 401（沒帶
apikey 時的正常回應），Production 在 2026-09-29 05:25 UTC 出現成功登入
（`POST /login 303` → `GET /dashboard 200`），而且用的是舊帳號——**確認當時是「暫停」而不是
「刪除」，使用者資料沒有遺失**。

### 為什麼是整頁 500，而不是一句錯誤訊息

`loginAction` / `registerAction` 呼叫 `isLoginRateLimited()`、`verifyUser()`、`createUser()`
時沒有任何 try/catch。`pg` 丟出的連線錯誤一路冒到 Next.js，Server Action 就變成 500，
使用者只看到錯誤頁，完全不知道發生什麼事；而且那個錯誤是在第一個 DB 查詢（限流檢查）就發生，
帳密根本還沒開始驗證。

### 修正

- **資料庫**：在 Supabase dashboard 恢復（Restore）暫停的專案。已完成，Production 登入已恢復。
- **程式碼**（branch `fix/login-db-unavailable`）：`src/lib/auth/actions.ts` 把登入／註冊中
  所有碰 DB 的呼叫包進 try/catch，DB 錯誤時：
  - 表單顯示「服務暫時無法使用，請稍後再試」，不再是 500 錯誤頁；
  - 完整錯誤用 `console.error` 寫進 server log（Vercel Runtime Logs 查得到），**不回傳給前端**，
    避免洩漏連線字串等內部細節；
  - `startSession()` / `redirect()` 刻意留在 try 外面——`redirect()` 是用 throw 實作的，
    被 catch 吃掉就不會跳轉。
  - 已在本機以「Postgres 沒開（ECONNREFUSED）」重現 DB 失效情境驗證：表單正確顯示訊息、
    server log 有完整錯誤。

---

## 2. nuxt-github-search：搜尋 / repo 詳細頁失效

### 症狀

首頁、`/favorites` 等頁面本身 200，但所有 API 都失敗：

```
GET /api/search?q=nuxt   → 401 {"statusMessage":"Bad credentials"}
GET /api/repo/nuxt/nuxt  → 401 {"statusMessage":"Bad credentials"}
```

Vercel Runtime Errors 沒有任何紀錄——因為 handler 有把 GitHub 的錯誤轉成 `createError`，
對 Vercel 來說這是「正常回傳 401」，不是 crash，所以不會觸發錯誤告警。

### 根本原因：Vercel 上的 `GITHUB_TOKEN` 失效

`401 Bad credentials` 是 GitHub API 對「帶了 token、但 token 無效」的標準回應（過期、被撤銷、
被刪除都會這樣；完全不帶 token 反而不會 401，只是 rate limit 比較低）。

時間上的線索：這個 Vercel 專案是 2026-08-20 建立的，token 應該就是那時候設定的。
**GitHub fine-grained personal access token 的預設有效期是 30 天**，推算大約在 2026-09-19
到期，跟事故時間吻合。實際原因請到 GitHub → Settings → Developer settings →
Personal access tokens 確認那把 token 的狀態（Expired / Revoked）。

已排除的可能：token 被 commit 進 git 而被 GitHub secret scanning 自動撤銷——兩個 repo 的
完整 git 歷史都搜尋過，沒有任何 token 或連線字串被提交過（只有 `.env.example`）。

### 為什麼一把失效的 token 就讓整個網站掛掉

`GITHUB_TOKEN` 在這個專案裡本來是**選填**的（只是用來把 rate limit 從 60/hr 拉到 5000/hr），
沒設 token app 照樣能跑。但原本的程式是「有設就一定帶上」，token 失效時 GitHub 直接拒絕整個
請求，而不是退回未授權模式——一個選配的優化變成了單點故障。

### 修正

- **程式碼**（nuxt-github-search branch `fix/github-token-fallback`）：新增
  `server/utils/github.ts` 的 `githubFetch()`，兩支 API handler 共用。帶 token 的請求收到 401
  時，自動改用未授權請求重試一次，並在 server log 警告一次（每個程序只警告一次，避免洗版）。
  其他錯誤（404、403 rate limit…）照舊往外丟，行為不變。
  - 本機驗證：用同一把無效 token build，修正前 `/api/search` → 401，修正後 → 200，
    log 出現一次 fallback 警告；不存在的 repo 仍正確回 404。
- **Token**（需手動）：到 GitHub 產生新的 PAT（不需要任何 scope），更新 Vercel 專案的
  `GITHUB_TOKEN`，然後**重新部署**。

### 額外注意：換 token 一定要重新部署

`nuxt.config.ts` 用 `githubToken: process.env.GITHUB_TOKEN` 設定 runtimeConfig，這行是在
**build 時**被求值的，值會被寫死進 build 產物。Nuxt 在執行時只認 `NUXT_` 開頭的環境變數
（`NUXT_GITHUB_TOKEN`）來覆寫 runtimeConfig。所以只在 Vercel 改了 `GITHUB_TOKEN` 而不重新
部署，舊的（失效的）token 會繼續被使用。

---

## 共同教訓與後續建議

1. **外部依賴失效要能降級，不要整個掛掉。** 這次兩個 app 都是「依賴一掛 → 功能全掛 → 使用者
   只看到錯誤」。本次兩個修正都是朝這個方向：DB 掛了給明確訊息、選配的 token 壞了就退回未授權。
2. **免費方案的資源會「自己」失效。** Supabase 閒置暫停、PAT 到期都不需要任何人改動就會發生。
   建議：
   - 若要 Production 長期維持可用，考慮 Supabase 付費方案，或加一個每幾天打一次 DB 的排程
     （例如 Vercel Cron 呼叫一個輕量的 `SELECT 1` 端點）避免被判定閒置；
   - GitHub token 建立時記下到期日，或改用較長效期並設提醒。
3. **401/5xx 要有人看得到。** nuxt-github-search 的 401 不算 runtime error，Vercel 不會告警；
   可以考慮加上 uptime 監控（定期打 `/api/search?q=vue` 檢查回應碼）。
