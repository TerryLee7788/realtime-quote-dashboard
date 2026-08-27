# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Next.js 14 (App Router) realtime crypto quote dashboard. Client connects directly to Binance's
public WebSocket/REST API (no server-side proxy). TradingView-style candlestick chart via
`lightweight-charts` v4, member login via JWT httpOnly cookies + Edge Middleware. All source is
commented in Traditional Chinese — match that when editing existing files.

## Commands

```bash
npm install
cp .env.example .env.local   # then set AUTH_SECRET and DATABASE_URL (see below)
npm run dev                  # http://localhost:3000
npm run build
npm start
npm run lint
```

No test suite exists in this repo.

`AUTH_SECRET` (HS256 signing key) must be set in `.env.local` for login to work correctly; without
it, `src/lib/auth/session.ts` falls back to an insecure dev default. Generate one with:
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

`DATABASE_URL` (a standard Postgres connection string — Neon, Supabase, Railway, self-hosted, all
work) must be set for register/login to work; `src/lib/db.ts` throws immediately if it's missing.
There are no demo accounts anymore — anyone can create an account at `/register` with any
username/password.

## Architecture

**The core design constraint**: Vercel Serverless/Edge Functions can't hold long-lived
connections, so there is intentionally no backend WebSocket server. The browser connects directly
to Binance's public WebSocket/REST endpoints (CORS-enabled, no API key needed); the Next.js
backend only handles short-lived login requests. Keep this constraint in mind before adding any
server-side market-data logic — it should go in the client instead.

| Layer | Tech | Runs on |
| --- | --- | --- |
| Live market data | Binance combined WebSocket stream | Browser |
| Historical klines / 24h ticker | Binance REST (`src/lib/binance.ts`) | Browser |
| Chart | `lightweight-charts` v4 | Browser |
| Global market state | Zustand (`src/store/marketStore.ts`) | Browser |
| Login / register | Server Actions + bcrypt (`src/lib/auth/actions.ts`) | Vercel Node runtime |
| User accounts | Postgres via `pg` (`src/lib/db.ts`, `src/lib/auth/users.ts`) | Any Postgres host |
| Route protection | Middleware + `jose` JWT (`src/middleware.ts`) | Vercel Edge runtime |

### Market data flow

One WebSocket connection per mounted `MarketSocketProvider` (`src/components/market/MarketSocketProvider.tsx`),
subscribing to a combined stream for the current symbol/interval:

```
wss://stream.binance.com:9443/stream?streams=
  {symbol}@kline_{interval} / {symbol}@ticker / {symbol}@trade / {symbol}@depth20@100ms
```

The provider demuxes incoming messages by stream name and fans them out two ways:
- `ticker`, `trade`, `depth` updates go into the Zustand store (`setTicker`/`pushTrade`/`setDepth`).
- `kline` updates go through a separate pub/sub (`subscribeKline`/`useMarketSocket()`) instead of
  the store, so `TradingChart.tsx` can update on every tick without forcing a React re-render of
  the rest of the dashboard.

Reconnection uses exponential backoff (capped at `MAX_BACKOFF_MS = 15000`) via `ws.onclose`; a
`closedByUs` ref distinguishes intentional teardown (symbol/interval change, unmount) from real
disconnects so it doesn't reconnect after a deliberate close. Changing `symbol` or `interval` in
the store tears down and reopens the whole connection (effect dependency array in the provider).

### Auth flow

- `src/lib/db.ts` — lazily-created `pg.Pool` from `DATABASE_URL`; DB-agnostic (any standard
  Postgres works, not tied to any Vercel Marketplace integration). `ensureSchema()` runs a
  `CREATE TABLE IF NOT EXISTS users` on first query so a fresh Postgres works with zero migration
  steps. Node runtime only — never import from `middleware.ts`.
- `src/lib/auth/session.ts` — signs/verifies the JWT with `jose` (Web Crypto, Edge-safe; no
  `next/headers` import so it can run in Middleware).
- `src/lib/auth/users.ts` — `verifyUser`/`createUser` against the `users` table in Postgres;
  passwords are bcrypt-hashed before being written, never stored in plaintext.
- `src/lib/auth/actions.ts` — `loginAction` and `registerAction` (both Server Actions bound to
  `useFormState` forms; on success write the httpOnly `session` cookie and redirect to
  `callbackUrl` after validating it's a same-site relative path) and `logoutAction`.
- `src/middleware.ts` — Edge Middleware gate: unauthenticated users are redirected to `/login` with
  `callbackUrl` set to the original path; authenticated users hitting `/login` or `/register` are
  redirected to `/dashboard`. Matcher excludes `/api`, `/_next/*`, and static assets.

To move this to a managed auth provider later (e.g. Auth.js/Clerk): the middleware protection
pattern and `users` table schema carry over largely unchanged.

### Directory map

```
src/
├─ middleware.ts                # Edge: JWT route protection
├─ app/
│  ├─ page.tsx                  # redirects to /dashboard
│  ├─ login/page.tsx            # login page (Server Action form)
│  ├─ register/page.tsx         # register page (Server Action form)
│  └─ dashboard/
│     ├─ layout.tsx             # verifies session + renders Topbar
│     └─ page.tsx               # composes the trading UI
├─ components/market/
│  ├─ MarketSocketProvider.tsx  # single WS connection, dispatches kline/ticker/trade/depth
│  ├─ TradingChart.tsx          # lightweight-charts chart
│  ├─ TickerHeader.tsx / Watchlist.tsx / IntervalTabs.tsx / OrderBook.tsx / TradesFeed.tsx
├─ lib/
│  ├─ binance.ts                # REST + WS endpoint constants and fetchers
│  ├─ db.ts                     # Postgres pool (DATABASE_URL) + ensureSchema()
│  └─ auth/                     # session.ts, users.ts, actions.ts, current-user.ts
├─ store/marketStore.ts         # Zustand store (symbol, interval, ticker, trades, depth)
└─ types/market.ts              # Kline / Ticker / Trade / Depth / Interval types
```
