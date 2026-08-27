"use client";

import { MarketSocketProvider } from "@/components/market/MarketSocketProvider";
import { Watchlist } from "@/components/market/Watchlist";
import { TickerHeader } from "@/components/market/TickerHeader";
import { IntervalTabs } from "@/components/market/IntervalTabs";
import { TradingChart } from "@/components/market/TradingChart";
import { OrderBook } from "@/components/market/OrderBook";
import { TradesFeed } from "@/components/market/TradesFeed";

export default function DashboardPage() {
  return (
    <MarketSocketProvider>
      <div className="grid h-full grid-cols-1 gap-px bg-border lg:grid-cols-[220px_1fr_280px]">
        {/* 左：自選清單 */}
        <aside className="hidden min-h-0 bg-bg lg:block">
          <Watchlist />
        </aside>

        {/* 中：報價 + 圖表 */}
        <main className="flex min-h-0 flex-col bg-bg">
          <TickerHeader />
          <IntervalTabs />
          <div className="min-h-0 flex-1">
            <TradingChart />
          </div>
        </main>

        {/* 右：委託簿 + 即時成交。矮視窗（如 900×700）下兩區塊加總會超出可視高度，
            改成整欄可捲動，不然內容會被 overflow-hidden 直接裁掉、無法捲動查看。 */}
        <aside className="flex min-h-0 flex-col overflow-y-auto bg-bg">
          <OrderBook />
          <TradesFeed />
        </aside>
      </div>
    </MarketSocketProvider>
  );
}
