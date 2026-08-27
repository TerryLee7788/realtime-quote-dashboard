import { create } from "zustand";
import type { Ticker, Trade, Depth, Interval } from "@/types/market";

interface MarketState {
  symbol: string;
  interval: Interval;
  ticker: Ticker | null;
  trades: Trade[];
  depth: Depth;

  setSymbol: (symbol: string) => void;
  setInterval: (interval: Interval) => void;
  setTicker: (ticker: Ticker) => void;
  pushTrade: (trade: Trade) => void;
  setDepth: (depth: Depth) => void;
  resetMarket: () => void;
}

const MAX_TRADES = 30;

export const useMarketStore = create<MarketState>((set) => ({
  symbol: "BTCUSDT",
  interval: "1d",
  ticker: null,
  trades: [],
  depth: { bids: [], asks: [] },

  setSymbol: (symbol) => set({ symbol }),
  setInterval: (interval) => set({ interval }),
  setTicker: (ticker) => set({ ticker }),
  pushTrade: (trade) =>
    set((s) => ({ trades: [trade, ...s.trades].slice(0, MAX_TRADES) })),
  setDepth: (depth) => set({ depth }),
  resetMarket: () =>
    set({ ticker: null, trades: [], depth: { bids: [], asks: [] } }),
}));
