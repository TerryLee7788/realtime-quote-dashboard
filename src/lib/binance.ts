import type { Kline } from "@/types/market";

/**
 * Binance 公開 REST API。
 * 重點：這些請求「直接由瀏覽器」發出（Binance 公開端點支援 CORS），
 * 因此不需要我們自己的後端 proxy，天然符合 Vercel serverless 架構。
 */
const REST_BASE = "https://api.binance.com/api/v3";

export async function fetchKlines(
  symbol: string,
  interval: string,
  limit = 500,
  endTime?: number,
): Promise<Kline[]> {
  let url = `${REST_BASE}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
  // endTime（ms）用來往回翻歷史頁：只抓「這個時間點之前」的 K 線，串接到目前資料最前面。
  if (endTime !== undefined) url += `&endTime=${endTime}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`klines 請求失敗: ${res.status}`);
  const raw = (await res.json()) as unknown[][];
  return raw.map((r) => ({
    time: Math.floor(Number(r[0]) / 1000),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
  }));
}

export interface Ticker24hr {
  symbol: string;
  lastPrice: number;
  priceChangePercent: number;
}

export async function fetch24hr(symbols: string[]): Promise<Ticker24hr[]> {
  const param = encodeURIComponent(
    JSON.stringify(symbols.map((s) => s.toUpperCase())),
  );
  const res = await fetch(`${REST_BASE}/ticker/24hr?symbols=${param}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`24hr 請求失敗: ${res.status}`);
  const raw = (await res.json()) as Array<Record<string, string>>;
  return raw.map((t) => ({
    symbol: t.symbol,
    lastPrice: Number(t.lastPrice),
    priceChangePercent: Number(t.priceChangePercent),
  }));
}

// Binance 現貨 combined stream 端點
export const WS_STREAM_BASE = "wss://stream.binance.com:9443/stream";
