"use client";

import { useEffect, useRef, useState } from "react";
import { useMarketStore } from "@/store/marketStore";
import { fetch24hr } from "@/lib/binance";
import { fmtPrice, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export const SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
];

interface Row {
  price: number;
  pct: number;
}

function WatchlistRow({
  s,
  r,
  isActive,
  onSelect,
}: {
  s: string;
  r: Row | undefined;
  isActive: boolean;
  onSelect: () => void;
}) {
  const up = (r?.pct ?? 0) >= 0;
  const prevPrice = useRef<number | undefined>(r?.price);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  // 價格較上一次輪詢變動時短暫閃爍背景色，漲綠跌紅，setTimeout 後自動移除。
  useEffect(() => {
    if (r === undefined) return;
    const prev = prevPrice.current;
    if (prev !== undefined && r.price !== prev) {
      setFlash(r.price > prev ? "up" : "down");
      const t = setTimeout(() => setFlash(null), 500);
      prevPrice.current = r.price;
      return () => clearTimeout(t);
    }
    prevPrice.current = r.price;
  }, [r]);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50",
        isActive && "bg-white/[0.08]",
        flash === "up" && "animate-flash-up",
        flash === "down" && "animate-flash-down",
      )}
    >
      <div className="flex items-center gap-2">
        {isActive && <span className="h-4 w-0.5 rounded bg-accent" />}
        <span className="text-sm font-medium">
          {s.replace("USDT", "")}
          <span className="text-xs text-muted">/USDT</span>
        </span>
      </div>
      <div className="text-right">
        <div className="text-sm tabular-nums">{r ? fmtPrice(r.price) : "—"}</div>
        <div className={cn("text-xs tabular-nums", up ? "text-up" : "text-down")}>
          {r ? fmtPct(r.pct) : ""}
        </div>
      </div>
    </button>
  );
}

export function Watchlist() {
  const symbol = useMarketStore((s) => s.symbol);
  const setSymbol = useMarketStore((s) => s.setSymbol);
  const [rows, setRows] = useState<Record<string, Row>>({});

  useEffect(() => {
    let active = true;
    const load = () =>
      fetch24hr(SYMBOLS)
        .then((arr) => {
          if (!active) return;
          const next: Record<string, Row> = {};
          arr.forEach((x) => {
            next[x.symbol] = { price: x.lastPrice, pct: x.priceChangePercent };
          });
          setRows(next);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 8000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">
        自選清單
      </div>
      <div className="flex-1 overflow-y-auto">
        {SYMBOLS.map((s) => (
          <WatchlistRow
            key={s}
            s={s}
            r={rows[s]}
            isActive={symbol === s}
            onSelect={() => setSymbol(s)}
          />
        ))}
      </div>
    </div>
  );
}
