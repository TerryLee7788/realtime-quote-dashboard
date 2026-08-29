# 即時報價儀表板 (Realtime Quote Dashboard)

串接 WebSocket 的即時加密貨幣報價網頁，TradingView 風格圖表 + 會員登入系統，
以 **Next.js 14 (App Router)** 打造，可**一鍵部署到 Vercel**。

資料來源為 **Binance 公開 API**（免申請 API Key、支援 CORS）。

---

## 功能

- **即時報價**：K 線、成交價、24h 漲跌 / 高低 / 量、委託簿 (Order Book)、即時成交明細，全部走 WebSocket。
- **TradingView 風格圖表**：使用 TradingView 官方開源的 `lightweight-charts`，蠟燭圖 + 成交量副圖、十字準星、可縮放拖曳。
- **會員註冊 / 登入 / 登出**：任意 username/password 皆可註冊，帳密存放於 Postgres，密碼以 bcrypt
  雜湊後才寫入；JWT (httpOnly cookie) + Edge Middleware 路由保護。
- **多商品 / 多週期切換**：自選清單即時更新、1m ~ 1d 週期切換。
- **自動重連**：WebSocket 斷線以指數退避 (exponential backoff) 自動重連。

---

## 技術決策（重點：為什麼這樣設計才能上 Vercel）

> Vercel 的 Serverless / Edge Functions **無法常駐長連線**，所以「不要」在後端自己開一個 WebSocket server。

本專案的作法是：**瀏覽器直接連到 Binance 的公開 WebSocket / REST**，前端負責訂閱與渲染，
後端（Next.js server）只處理**登入驗證**這種短生命週期的請求。這樣整包天生符合 Vercel 架構，
不需要額外的 socket 伺服器、也不需要付費的常駐服務。

| 層 | 技術 | 執行位置 |
| --- | --- | --- |
| 即時行情 | Binance combined WebSocket stream | 瀏覽器 (client) |
| 歷史 K 線 / 24h 報價 | Binance REST | 瀏覽器 (client) |
| 圖表 | `lightweight-charts` v4 | 瀏覽器 (client) |
| 全域狀態 | Zustand | 瀏覽器 (client) |
| 註冊 / 登入 | Server Actions + bcrypt | Vercel Node runtime |
| 使用者資料 | Postgres（`pg`，任何供應商皆可） | 獨立於 Vercel 的 Postgres |
| 路由保護 | Middleware + `jose` (JWT) | Vercel Edge runtime |

WebSocket 訂閱的串流（以 `btcusdt` 為例）：

```
wss://stream.binance.com:9443/stream?streams=
  btcusdt@kline_1m /       # K 線
  btcusdt@ticker /         # 24h 統計
  btcusdt@trade /          # 逐筆成交
  btcusdt@depth20@100ms    # 委託簿前 20 檔
```

---

## 目錄結構

```
src/
├─ middleware.ts                # Edge：JWT 路由保護
├─ app/
│  ├─ layout.tsx / globals.css
│  ├─ page.tsx                  # 導向 /dashboard
│  ├─ login/page.tsx            # 登入頁 (Server Action 表單)
│  ├─ register/page.tsx         # 註冊頁 (Server Action 表單)
│  └─ dashboard/
│     ├─ layout.tsx             # 驗證 session + Topbar
│     └─ page.tsx               # 交易介面組合
├─ components/
│  ├─ Topbar.tsx
│  └─ market/
│     ├─ MarketSocketProvider.tsx  # 單一 WS 連線，分派 kline/ticker/trade/depth
│     ├─ TradingChart.tsx          # lightweight-charts 圖表
│     ├─ TickerHeader.tsx
│     ├─ Watchlist.tsx
│     ├─ IntervalTabs.tsx
│     ├─ OrderBook.tsx
│     └─ TradesFeed.tsx
├─ lib/
│  ├─ binance.ts                # REST + WS 端點
│  ├─ db.ts                     # Postgres 連線池（DATABASE_URL）+ 自動建表
│  ├─ format.ts / utils.ts
│  └─ auth/
│     ├─ session.ts             # jose 簽 / 驗 JWT（Edge-safe）
│     ├─ users.ts               # 註冊 / 登入查詢 + bcrypt 雜湊比對
│     ├─ actions.ts             # loginAction / registerAction / logoutAction
│     └─ current-user.ts        # server component 讀 session
├─ store/marketStore.ts         # Zustand
└─ types/market.ts
```

---

## 本機開發

需求：Node.js 18.18+。

```bash
# 1. 安裝套件
npm install

# 2. 準備一個 Postgres（擇一）
#    - Neon      https://neon.tech        （免費方案，最快）
#    - Supabase  https://supabase.com
#    - Railway   https://railway.app
#    - 本機 Docker（見下方「本機 Postgres（Docker）」一節）：
#      docker compose up -d

# 3. 設定環境變數
cp .env.example .env.local
#   編輯 .env.local：
#   - AUTH_SECRET   換成一組隨機字串：
#     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
#   - DATABASE_URL  填入上一步拿到的 Postgres 連線字串
#     （本機 Docker 範例：postgres://postgres:postgres@localhost:55432/postgres）

# 4. 啟動
npm run dev
# 開 http://localhost:3000
```

資料表會在第一次註冊 / 登入請求時自動建立（見 `src/lib/db.ts` 的 `ensureSchema()`），不需要額外
跑 migration 工具。啟動後到 `/register` 用任意 username/password 建立帳號即可登入。

### 本機 Postgres（Docker）

不想申請雲端 Postgres 帳號，或想要一個跟正式環境（Neon/Supabase/…）完全分開、可以隨意重建的本機
資料庫時，用專案內附的 `docker-compose.yml`：

```bash
# 啟動（背景執行，資料存在 named volume，重開機不會不見）
docker compose up -d

# 查看狀態 / log
docker compose ps
docker compose logs -f postgres

# 停止（資料還在，volume 沒刪）
docker compose stop

# 完全砍掉重練（連資料一起清空，開發時想要一個乾淨的 DB 才用這個）
docker compose down -v
```

對應的 `.env.local`：

```
DATABASE_URL=postgres://postgres:postgres@localhost:55432/postgres
```

用 `55432` 而不是 Postgres 預設的 `5432`，是為了避免跟本機可能已經另外裝著的 Postgres（例如系統
內建的 Postgres 服務）搶 port。這組容器只給本機開發用，帳密是明碼寫在 `docker-compose.yml` 裡的
`postgres`/`postgres`，僅供本機測試用途，**不要**在雲端環境用這組憑證。

---

## 部署到 Vercel

1. 把整包推到 GitHub（`git init && git add . && git commit && git push`）。
2. 到 [vercel.com](https://vercel.com) → **Add New → Project** → 匯入該 repo。
3. Framework 會自動偵測為 **Next.js**，Build 指令與輸出目錄用預設即可。
4. **Settings → Environment Variables** 新增：

   | Name | Value |
   | --- | --- |
   | `AUTH_SECRET` | 一組夠長的隨機字串（例如 `openssl rand -base64 32` 的輸出） |
   | `DATABASE_URL` | 你的 Postgres 連線字串（Neon / Supabase / Railway / 自架皆可，需支援 `sslmode=require`） |

   建議 Production 用一組正式的 Postgres（Neon/Supabase/Railway…）；Preview 另外接一組**獨立**的
   資料庫（見下方「Branch 策略與 Preview 測試」），不要跟 Production 共用同一組 `DATABASE_URL`。

5. **Deploy**。完成後到 `/register` 用任意 username/password 建立帳號即可登入看效果。

> 若用 Vercel CLI：`npm i -g vercel && vercel`，並記得 `vercel env add AUTH_SECRET`、
> `vercel env add DATABASE_URL`。

> Postgres 完全獨立於 Vercel 之外，換供應商只需要換 `DATABASE_URL`，不會被特定平台綁定。

---

## Branch 策略與 Preview 測試

`main` 是 GitHub 的預設 branch，也是 Vercel **Production Branch Tracking** 指向的 branch——合併進
`main` 就會直接部署到 `realtime-quote-dashboard.vercel.app`，接的是正式的 Postgres。**不要直接
push 到 `main`**，正常流程：

1. 從 `main` 開一個 feature branch：`git checkout -b feat/xxx`（或 `fix/`、`chore/`）。
2. Push 上去，Vercel 會自動開一個獨立的 **Preview** 部署網址（開 PR 後會顯示在 PR 的 check 裡）。
   Preview 接的是另一組**獨立的 Neon Postgres**（透過 Vercel Marketplace 佈建，Preview-only 的
   `DATABASE_URL`/`AUTH_SECRET`，跟 Production 的資料庫完全分開）——在 Preview 上測註冊、登入、
   rate limiting 都不會碰到正式站的真實使用者資料。
3. 在 Preview 網址上實際測過一輪，確認沒問題。
4. 開 PR 合併進 `main`，才會觸發正式環境部署。

`main` 目前沒有設定 branch protection rules，技術上仍可以 force push，有需要的話可以去 GitHub
repo 的 Settings → Branches 加。

---

## 從 Demo 到正式環境的升級路徑

驗證已經是「真的資料庫 + bcrypt 雜湊 + 自助註冊」，可以直接上線。要更進一步強化，建議：

- **驗證框架**：若需要 Google / GitHub 等第三方登入，可換成 **Auth.js (NextAuth v5)**，
  現有的 middleware 保護模式可平滑沿用。
- **帳號安全**：補上忘記密碼 / 重設密碼流程、Email 驗證、登入失敗次數限制。
- **行情來源**：正式產品若需私有資料或更高頻率，改接自家行情供應商；
  若供應商不支援瀏覽器直連，再視情況加一層 WebSocket gateway（此時就不適合純 Vercel，
  可考慮常駐服務如 Fly.io / Railway / 自架）。
- **速率限制與錯誤監控**：註冊 / 登入端點加上 rate limit，前端接上 Sentry 之類的監控。
- **資料庫遷移工具**：目前用 `CREATE TABLE IF NOT EXISTS` 自動建表方便快速上手；欄位開始變動頻繁
  後，建議換成正式的 migration 工具（如 drizzle-kit、Prisma Migrate）。

---

## 授權

僅供學習 / 展示用途。行情資料版權屬 Binance；圖表函式庫 `lightweight-charts` 為 Apache-2.0。
