"use client";

import { useEffect, useRef, useState } from "react";
import { useMarketStore } from "@/store/marketStore";
import type { DepthLevel } from "@/types/market";
import { fmtPrice, fmtQty } from "@/lib/format";
import { cn } from "@/lib/utils";

const ROWS = 10;

function Level({
  level,
  side,
  maxQty,
}: {
  level: DepthLevel;
  side: "ask" | "bid";
  maxQty: number;
}) {
  const width = Math.min(100, (level.qty / maxQty) * 100);

  // 價格或數量變動時短暫閃爍該列背景，給使用者即時更新的視覺回饋。
  const prevRef = useRef({ price: level.price, qty: level.qty });
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    const prev = prevRef.current;
    if (prev.price !== level.price || prev.qty !== level.qty) {
      prevRef.current = { price: level.price, qty: level.qty };
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 500);
      return () => clearTimeout(t);
    }
  }, [level.price, level.qty]);

  return (
    <div
      className={cn(
        "relative flex justify-between px-3 py-[3px] text-xs tabular-nums",
        flashing && (side === "ask" ? "animate-flash-down" : "animate-flash-up"),
      )}
    >
      <div
        className={cn(
          "absolute inset-y-0 right-0",
          side === "ask" ? "bg-down/25" : "bg-up/25",
        )}
        style={{ width: `${width}%` }}
      />
      <span className={cn("relative", side === "ask" ? "text-down" : "text-up")}>
        {fmtPrice(level.price)}
      </span>
      <span className="relative text-muted">{fmtQty(level.qty)}</span>
    </div>
  );
}

export function OrderBook() {
  const depth = useMarketStore((s) => s.depth);
  const ticker = useMarketStore((s) => s.ticker);

  const asks = depth.asks.slice(0, ROWS);
  const bids = depth.bids.slice(0, ROWS);
  const maxQty = Math.max(
    1,
    ...asks.map((a) => a.qty),
    ...bids.map((b) => b.qty),
  );

  const up = (ticker?.priceChangePercent ?? 0) >= 0;

  return (
    <div className="flex flex-col border-b border-border">
      <div className="flex justify-between px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">
        <span>委託簿</span>
        <span>數量</span>
      </div>

      {/* asks：價格高在上，最佳賣價貼近中間 */}
      <div className="flex flex-col-reverse">
        {asks.map((a, i) => (
          <Level key={`a-${i}`} level={a} side="ask" maxQty={maxQty} />
        ))}
      </div>

      <div
        className={cn(
          "border-y border-border px-3 py-1.5 text-center text-sm font-semibold tabular-nums",
          up ? "text-up" : "text-down",
        )}
      >
        {ticker ? fmtPrice(ticker.lastPrice) : "—"}
      </div>

      <div>
        {bids.map((b, i) => (
          <Level key={`b-${i}`} level={b} side="bid" maxQty={maxQty} />
        ))}
      </div>
    </div>
  );
}
