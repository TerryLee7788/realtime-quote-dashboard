"use client";

import { useMarketStore } from "@/store/marketStore";
import { fmtPrice, fmtQty, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TradesFeed() {
  const trades = useMarketStore((s) => s.trades);

  return (
    // min-h-[160px]：委託簿在短視窗下會把這個區塊的 flex-shrink 一路壓到 0（完全消失）。
    // 保留一個最小高度當地板，讓成交明細在任何情況下都至少留一小塊可視 + 可捲動區域；
    // 桌面版空間充足時 flex-1 仍會把它撐到剩餘全部空間，不影響原本版面。
    <div className="flex min-h-[160px] flex-1 flex-col">
      <div className="flex justify-between px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">
        <span>即時成交</span>
        <span>數量</span>
        <span>時間</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {trades.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-muted">
            等待成交資料…
          </div>
        )}
        {trades.map((t, i) => (
          <div
            key={`${t.time}-${i}`}
            className={cn(
              "flex justify-between px-3 py-[3px] text-xs tabular-nums",
              // 每筆新成交都會讓陣列整體往後移一格（key 隨 index 變動而變動），
              // 所以最新一筆（i === 0）掛上去的 DOM 節點永遠是全新掛載，
              // CSS animation 會在 mount 時自動播放一次，不用額外的 JS 狀態機。
              i === 0 && (t.isBuyerMaker ? "animate-flash-down" : "animate-flash-up"),
            )}
          >
            {/* isBuyerMaker=true 代表主動賣單（紅），false 代表主動買單（綠） */}
            <span className={cn(t.isBuyerMaker ? "text-down" : "text-up")}>
              {fmtPrice(t.price)}
            </span>
            <span className="text-muted">{fmtQty(t.qty)}</span>
            <span className="text-muted">{fmtTime(t.time)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
