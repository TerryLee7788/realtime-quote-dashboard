"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMarketStore } from "@/store/marketStore";
import { WS_STREAM_BASE } from "@/lib/binance";
import type { Kline } from "@/types/market";

export type ConnectionStatus = "connecting" | "open" | "closed";

type KlineListener = (kline: Kline, isFinal: boolean) => void;

interface MarketSocketContextValue {
  status: ConnectionStatus;
  /** 訂閱即時 K 線更新（給圖表用，避免每個 tick 都觸發 React re-render）。回傳取消訂閱函式。 */
  subscribeKline: (listener: KlineListener) => () => void;
}

const MarketSocketContext = createContext<MarketSocketContextValue | null>(null);

export function useMarketSocket(): MarketSocketContextValue {
  const ctx = useContext(MarketSocketContext);
  if (!ctx) {
    throw new Error("useMarketSocket 必須在 <MarketSocketProvider> 內使用");
  }
  return ctx;
}

const MAX_BACKOFF_MS = 15_000;

/**
 * 開啟一條會自動重連（指數退避，上限 MAX_BACKOFF_MS）的 combined stream WebSocket。
 * 抽成共用函式讓 ticker/trade/depth 那條連線跟 kline 那條連線共用同一套重連邏輯，
 * 不用各自複製一份。回傳的 cleanup function 會標記 closedByUs，避免 onclose 誤判成
 * 意外斷線而觸發不必要的重連。
 */
function openManagedSocket(
  url: string,
  onStatusChange: (status: ConnectionStatus) => void,
  onMessage: (msg: { stream?: string; data?: unknown }) => void,
): () => void {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let closedByUs = false;

  const connect = () => {
    onStatusChange("connecting");
    const socket = new WebSocket(url);
    ws = socket;

    socket.onopen = () => {
      attempt = 0;
      onStatusChange("open");
    };

    socket.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);
        onMessage(msg);
      } catch {
        // 忽略單筆解析錯誤
      }
    };

    socket.onclose = () => {
      if (closedByUs) return;
      onStatusChange("closed");
      const delay = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
      attempt += 1;
      reconnectTimer = setTimeout(connect, delay);
    };

    socket.onerror = () => {
      // 讓 onclose 接手重連邏輯
      socket.close();
    };
  };

  connect();

  return () => {
    closedByUs = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
    ws = null;
  };
}

export function MarketSocketProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const symbol = useMarketStore((s) => s.symbol);
  const interval = useMarketStore((s) => s.interval);
  const setTicker = useMarketStore((s) => s.setTicker);
  const pushTrade = useMarketStore((s) => s.pushTrade);
  const setDepth = useMarketStore((s) => s.setDepth);
  const resetMarket = useMarketStore((s) => s.resetMarket);

  // ticker/trade/depth 連線跟 kline 連線各自的連線狀態，UI 顯示的整體 status 取兩者
  // 較差的那個（closed > connecting > open），任一條斷線就提示使用者。
  const [tickerStatus, setTickerStatus] = useState<ConnectionStatus>("connecting");
  const [klineStatus, setKlineStatus] = useState<ConnectionStatus>("connecting");
  const status: ConnectionStatus = useMemo(() => {
    if (tickerStatus === "closed" || klineStatus === "closed") return "closed";
    if (tickerStatus === "connecting" || klineStatus === "connecting") return "connecting";
    return "open";
  }, [tickerStatus, klineStatus]);

  const klineListeners = useRef<Set<KlineListener>>(new Set());

  const subscribeKline = useCallback((listener: KlineListener) => {
    klineListeners.current.add(listener);
    return () => {
      klineListeners.current.delete(listener);
    };
  }, []);

  // 連線一：ticker + trade + depth，只依 symbol 開關。這三個 stream 跟 K 線週期無關，
  // 換 interval 不該讓委託簿/成交明細/24h 統計整個清空重連。
  useEffect(() => {
    const sym = symbol.toLowerCase();
    const streams = [`${sym}@ticker`, `${sym}@trade`, `${sym}@depth20@100ms`].join("/");
    const url = `${WS_STREAM_BASE}?streams=${streams}`;

    resetMarket();

    return openManagedSocket(url, setTickerStatus, (msg) => {
      const stream = msg.stream ?? "";
      const data = msg.data as Record<string, unknown> | undefined;
      if (!data) return;

      if (stream.endsWith("@ticker")) {
        setTicker({
          lastPrice: Number(data.c),
          open: Number(data.o),
          priceChange: Number(data.p),
          priceChangePercent: Number(data.P),
          high: Number(data.h),
          low: Number(data.l),
          volume: Number(data.v),
          quoteVolume: Number(data.q),
        });
      } else if (stream.endsWith("@trade")) {
        pushTrade({
          price: Number(data.p),
          qty: Number(data.q),
          time: Number(data.T),
          isBuyerMaker: Boolean(data.m),
        });
      } else if (stream.includes("@depth")) {
        setDepth({
          bids: (data.bids as string[][])
            .slice(0, 12)
            .map((b) => ({ price: Number(b[0]), qty: Number(b[1]) })),
          asks: (data.asks as string[][])
            .slice(0, 12)
            .map((a) => ({ price: Number(a[0]), qty: Number(a[1]) })),
        });
      }
    });
  }, [symbol, setTicker, pushTrade, setDepth, resetMarket]);

  // 連線二：kline，依 symbol + interval 開關（換週期只重開這一條，不動 ticker/trade/depth）。
  useEffect(() => {
    const sym = symbol.toLowerCase();
    const url = `${WS_STREAM_BASE}?streams=${sym}@kline_${interval}`;

    return openManagedSocket(url, setKlineStatus, (msg) => {
      const stream = msg.stream ?? "";
      const data = msg.data as Record<string, unknown> | undefined;
      if (!data || !stream.includes("@kline")) return;

      const k = data.k as Record<string, unknown>;
      const kline: Kline = {
        time: Math.floor(Number(k.t) / 1000),
        open: Number(k.o),
        high: Number(k.h),
        low: Number(k.l),
        close: Number(k.c),
        volume: Number(k.v),
      };
      klineListeners.current.forEach((fn) => fn(kline, Boolean(k.x)));
    });
  }, [symbol, interval]);

  return (
    <MarketSocketContext.Provider value={{ status, subscribeKline }}>
      {children}
    </MarketSocketContext.Provider>
  );
}
