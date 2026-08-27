"use client";

import { useMarketStore } from "@/store/marketStore";
import type { Interval } from "@/types/market";
import { cn } from "@/lib/utils";

const INTERVALS: Interval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

export function IntervalTabs() {
  const interval = useMarketStore((s) => s.interval);
  const setInterval = useMarketStore((s) => s.setInterval);

  return (
    <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
      <span className="mr-1 text-xs text-muted">週期</span>
      {INTERVALS.map((i) => (
        <button
          key={i}
          onClick={() => setInterval(i)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
            interval === i
              ? "bg-white/10 text-text"
              : "text-muted hover:bg-white/5 hover:text-text",
          )}
        >
          {i}
        </button>
      ))}
    </div>
  );
}
