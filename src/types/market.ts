export interface Kline {
  time: number; // 秒 (UTCTimestamp)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Ticker {
  lastPrice: number;
  open: number;
  priceChange: number;
  priceChangePercent: number;
  high: number;
  low: number;
  volume: number; // 基礎貨幣成交量
  quoteVolume: number; // 計價貨幣成交量 (USDT)
}

export interface Trade {
  price: number;
  qty: number;
  time: number; // ms
  isBuyerMaker: boolean; // true = 主動賣單, false = 主動買單
}

export interface DepthLevel {
  price: number;
  qty: number;
}

export interface Depth {
  bids: DepthLevel[];
  asks: DepthLevel[];
}

export type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
