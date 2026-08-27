"use client";

import { useEffect, useRef, useState } from "react";
import { useMarketStore } from "@/store/marketStore";
import { useMarketSocket, type ConnectionStatus } from "./MarketSocketProvider";
import { Watchlist } from "./Watchlist";
import { fmtPrice, fmtCompact, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

function ConnectionDot({ status }: { status: ConnectionStatus }) {
  const map: Record<ConnectionStatus, { color: string; label: string }> = {
    open: { color: "bg-up", label: "即時連線中" },
    connecting: { color: "bg-yellow-400", label: "連線中…" },
    closed: { color: "bg-down", label: "已斷線，重連中…" },
  };
  const { color, label } = map[status];
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted" title={label}>
      <span className={cn("h-2 w-2 rounded-full", color, status !== "open" && "animate-pulse")} />
      {label}
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <span
        className={cn(
          "text-sm tabular-nums",
          tone === "up" && "text-up",
          tone === "down" && "text-down",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function TickerHeader() {
  const symbol = useMarketStore((s) => s.symbol);
  const t = useMarketStore((s) => s.ticker);
  const { status } = useMarketSocket();

  const up = (t?.priceChangePercent ?? 0) >= 0;

  // 窄螢幕（<lg）沒有側邊 Watchlist，改用這裡的下拉面板切換商品。
  const [mobileListOpen, setMobileListOpen] = useState(false);

  // TradingView 風格：把即時價格同步到瀏覽器分頁標題
  useEffect(() => {
    if (t) {
      document.title = `${symbol} | ${fmtPrice(t.lastPrice)}`;
    } else {
      document.title = `${symbol} | 即時報價`;
    }
  }, [t, symbol]);

  // 切換商品後自動收起下拉面板（初次掛載時 mobileListOpen 本來就是 false，不受影響）。
  useEffect(() => {
    setMobileListOpen(false);
  }, [symbol]);

  // 價格變動時短暫閃爍背景色。
  const prevPrice = useRef<number | undefined>(t?.lastPrice);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (!t) return;
    const prev = prevPrice.current;
    if (prev !== undefined && t.lastPrice !== prev) {
      setFlash(t.lastPrice > prev ? "up" : "down");
      const timer = setTimeout(() => setFlash(null), 500);
      prevPrice.current = t.lastPrice;
      return () => clearTimeout(timer);
    }
    prevPrice.current = t.lastPrice;
  }, [t]);

  return (
    <div className="relative flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-border px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-lg font-semibold">
          {symbol.replace("USDT", "")}
          <span className="text-sm text-muted">/USDT</span>
        </span>
        <ConnectionDot status={status} />

        {/* 小螢幕才顯示的商品切換入口，取代被隱藏的側邊 Watchlist */}
        <button
          type="button"
          onClick={() => setMobileListOpen((v) => !v)}
          aria-expanded={mobileListOpen}
          aria-label="切換交易對"
          className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-muted transition-colors hover:bg-white/5 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 lg:hidden"
        >
          切換
          <span className={cn("transition-transform", mobileListOpen && "rotate-180")}>
            ▾
          </span>
        </button>
      </div>

      {mobileListOpen && (
        <>
          {/* 點擊背景收起面板 */}
          <button
            type="button"
            aria-label="收起商品清單"
            onClick={() => setMobileListOpen(false)}
            className="fixed inset-0 z-40 cursor-default lg:hidden"
          />
          <div className="absolute left-4 top-full z-50 mt-1 h-80 w-64 overflow-hidden rounded border border-border bg-panel shadow-lg lg:hidden">
            <Watchlist />
          </div>
        </>
      )}

      <div
        className={cn(
          "rounded px-1 text-2xl font-bold tabular-nums",
          up ? "text-up" : "text-down",
          flash === "up" && "animate-flash-up",
          flash === "down" && "animate-flash-down",
        )}
      >
        {t ? fmtPrice(t.lastPrice) : "—"}
      </div>

      <Stat
        label="24h 漲跌"
        value={t ? fmtPct(t.priceChangePercent) : "—"}
        tone={up ? "up" : "down"}
      />
      <Stat label="24h 最高" value={t ? fmtPrice(t.high) : "—"} />
      <Stat label="24h 最低" value={t ? fmtPrice(t.low) : "—"} />
      <Stat
        label="24h 量 (USDT)"
        value={t ? fmtCompact(t.quoteVolume) : "—"}
      />
    </div>
  );
}
