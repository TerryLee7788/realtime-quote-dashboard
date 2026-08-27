"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type MouseEventParams,
  type UTCTimestamp,
} from "lightweight-charts";
import { useMarketStore } from "@/store/marketStore";
import { useMarketSocket } from "./MarketSocketProvider";
import { fetchKlines } from "@/lib/binance";
import { fmtPrice, fmtCompact, pricePrecision } from "@/lib/format";
import type { Kline } from "@/types/market";

const UP = "#26a69a";
const DOWN = "#ef5350";
const VOL_UP = "rgba(38,166,154,0.5)";
const VOL_DOWN = "rgba(239,83,80,0.5)";

const HISTORY_PAGE_SIZE = 500;
// 可視範圍的左邊界離已載入資料開頭少於這個 bar 數時，就觸發往回多抓一頁
// （仿 TradingView：手動往左拖曳歷史資料時自動補載入）。
const LOAD_MORE_THRESHOLD = 20;
// 使用者一次拖曳跳過太大範圍時，單頁 HISTORY_PAGE_SIZE 補不完，loadMoreHistory
// 會自我遞迴連續補頁直到追上可視範圍；這裡設一個安全上限避免意外無限迴圈。
const MAX_LOAD_MORE_CHAIN = 20;

function toCandlePoint(b: Kline) {
  return {
    time: b.time as UTCTimestamp,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  };
}

function toVolumePoint(b: Kline) {
  return {
    time: b.time as UTCTimestamp,
    value: b.volume,
    color: b.close >= b.open ? VOL_UP : VOL_DOWN,
  };
}

export function TradingChart() {
  const symbol = useMarketStore((s) => s.symbol);
  const interval = useMarketStore((s) => s.interval);
  const { subscribeKline } = useMarketSocket();

  const containerRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  // 剛切換 symbol/interval、初始資料載入完成當下的可視邏輯範圍（含縮放程度，不只是
  // 位置）。scrollToPosition 只會處理平移，不會處理使用者滾輪/縮放改掉的 bar 間距，
  // 所以「重設圖表顯示」要重放這組 range 才能真的連縮放一起還原。
  const initialRangeRef = useRef<LogicalRange | null>(null);

  // 還原成剛切換 symbol 時的顯示狀態：跟初始載入完成時（見下方 fetchKlines().then）
  // 套用的是同一套邏輯 —— 恢復價格軸自動縮放、套用當時記錄下來的可視範圍（位置+縮放）。
  function resetChartView() {
    const chart = chartRef.current;
    if (!chart) return;
    chart.priceScale("right").applyOptions({ autoScale: true });
    if (initialRangeRef.current) {
      chart.timeScale().setVisibleLogicalRange(initialRangeRef.current);
    } else {
      chart.timeScale().scrollToPosition(0, false);
    }
  }

  // 選單開著時，點擊選單以外的地方或按 Escape 就關閉。
  useEffect(() => {
    if (!contextMenu) return;
    function close() {
      setContextMenu(null);
    }
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("click", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  // 建立圖表（只執行一次）
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#b2b5be",
        fontFamily: "inherit",
      },
      grid: {
        vertLines: { color: "rgba(42,46,57,0.4)" },
        horzLines: { color: "rgba(42,46,57,0.4)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(42,46,57,0.8)" },
      timeScale: {
        borderColor: "rgba(42,46,57,0.8)",
        timeVisible: true,
        secondsVisible: false,
        // 仿 TradingView：最新一根 K 棒右邊留一點空間，而不是貼齊圖表最右緣。
        rightOffset: 12,
      },
    });

    const candle = chart.addCandlestickSeries({
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });

    const volume = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    candleRef.current = candle;
    volumeRef.current = volume;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
    };
  }, []);

  // 依 symbol / interval 載入歷史 + 訂閱即時更新
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setContextMenu(null);
    // 舊 symbol/interval 記錄的初始範圍已經不適用新資料，載入完成前先清掉，讓這段
    // 期間內按「重設」退回 scrollToPosition 的保守 fallback，而不是套用不搭的舊範圍。
    initialRangeRef.current = null;

    // 目前已載入的全部歷史 bar（依時間升冪排列），往左拖曳補頁時會被往前插入。
    let bars: Kline[] = [];
    let fetchingMore = false;
    let noMoreHistory = false;
    // 目前是否正在 hover 圖表（有 crosshair）：有的話 legend 顯示 hover 中那根 bar，
    // 沒有的話 fallback 顯示最新一根，即時 tick 更新時才需要看這個旗標。
    let hovering = false;

    const chart = chartRef.current;

    function updateLegend(bar: Kline | null) {
      if (!legendRef.current) return;
      if (!bar) {
        legendRef.current.innerHTML = "";
        return;
      }
      const closeTone = bar.close >= bar.open ? "text-up" : "text-down";
      legendRef.current.innerHTML = `
        <span class="text-muted">${symbol} · ${interval}</span>
        <span class="ml-2">O <b class="tabular-nums font-normal">${fmtPrice(bar.open)}</b></span>
        <span class="ml-2">H <b class="tabular-nums font-normal">${fmtPrice(bar.high)}</b></span>
        <span class="ml-2">L <b class="tabular-nums font-normal">${fmtPrice(bar.low)}</b></span>
        <span class="ml-2">C <b class="tabular-nums font-normal ${closeTone}">${fmtPrice(bar.close)}</b></span>
        <span class="ml-2 text-muted">Vol <b class="tabular-nums font-normal text-text">${fmtCompact(bar.volume)}</b></span>
      `;
    }

    function latestBar(): Kline | null {
      return bars.length > 0 ? bars[bars.length - 1] : null;
    }

    async function loadMoreHistory(depth = 0) {
      if (fetchingMore || noMoreHistory || bars.length === 0) return;
      // 安全上限：正常情況下一次拖曳不可能連續補到這麼多頁，防止萬一邏輯出錯
      // 或 Binance 一直回傳資料時卡在無限迴圈。
      if (depth > MAX_LOAD_MORE_CHAIN) return;
      fetchingMore = true;

      const oldest = bars[0].time;
      try {
        const older = await fetchKlines(symbol, interval, HISTORY_PAGE_SIZE, oldest * 1000 - 1);
        if (!active || !candleRef.current || !volumeRef.current) return;

        if (older.length === 0) {
          noMoreHistory = true;
          return;
        }

        bars = [...older, ...bars];
        candleRef.current.setData(bars.map(toCandlePoint));
        volumeRef.current.setData(bars.map(toVolumePoint));

        // setData 會重置可視範圍，往前插入了幾根 bar 就把邏輯範圍往右平移
        // 幾格，讓使用者感覺不到畫面跳動（TradingView 風格的無感補載入）。
        const prevRange = chart?.timeScale().getVisibleLogicalRange();
        if (prevRange) {
          chart?.timeScale().setVisibleLogicalRange({
            from: prevRange.from + older.length,
            to: prevRange.to + older.length,
          });
        }
      } catch {
        // 補頁失敗就靜默放棄這次嘗試，使用者再往左拖會重試，不用跳錯誤訊息干擾看盤。
      } finally {
        fetchingMore = false;
      }

      // 補頁完成後（不論成功、失敗或已無更多歷史）重新檢查目前可視範圍：使用者若
      // 一次拖曳跳過太大範圍，單頁 HISTORY_PAGE_SIZE 可能追不上，這裡再檢查一次、
      // 不足就繼續補下一頁，直到追上可視範圍或撞到安全上限 / 沒有更多歷史為止。
      // 這裡不能依賴 subscribeVisibleLogicalRangeChange 再次觸發：setVisibleLogicalRange
      // 是同步呼叫，重入的 handleVisibleRangeChange 在這個 finally 執行完之前就已經
      // 被 fetchingMore guard 擋掉、不會排隊重試。
      if (!active) return;
      const range = chart?.timeScale().getVisibleLogicalRange();
      if (range && range.from < LOAD_MORE_THRESHOLD) {
        await loadMoreHistory(depth + 1);
      }
    }

    function handleVisibleRangeChange(range: LogicalRange | null) {
      if (!range) return;
      if (range.from < LOAD_MORE_THRESHOLD) {
        void loadMoreHistory();
      }
    }

    chart?.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);

    function handleCrosshairMove(param: MouseEventParams) {
      const candleSeries = candleRef.current;
      if (!candleSeries) return;
      hovering = param.time !== undefined;
      if (!hovering) {
        updateLegend(latestBar());
        return;
      }
      const c = param.seriesData.get(candleSeries) as CandlestickData | undefined;
      if (!c) {
        updateLegend(latestBar());
        return;
      }
      const volumeSeries = volumeRef.current;
      const v = volumeSeries
        ? (param.seriesData.get(volumeSeries) as HistogramData | undefined)
        : undefined;
      updateLegend({
        time: c.time as unknown as number,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: v?.value ?? 0,
      });
    }

    chart?.subscribeCrosshairMove(handleCrosshairMove);

    fetchKlines(symbol, interval, HISTORY_PAGE_SIZE)
      .then((initialBars) => {
        if (!active || !candleRef.current || !volumeRef.current) return;
        bars = initialBars;
        candleRef.current.setData(bars.map(toCandlePoint));
        volumeRef.current.setData(bars.map(toVolumePoint));
        // 右側價格軸/十字線價格標籤預設不會加千分位，改用自訂 formatter 套用跟
        // OHLC legend 一樣的 fmtPrice()。位數依這個 symbol 目前價格量級固定一次，
        // 避免同一支圖表上下每個刻度小數位數不一致。
        const digits = pricePrecision(bars[bars.length - 1]?.close ?? 0);
        candleRef.current.applyOptions({
          priceFormat: {
            type: "custom",
            minMove: 10 ** -digits,
            formatter: (price: number) => fmtPrice(price, digits),
          },
        });
        // 使用者若曾手動拖曳價格軸，lightweight-charts 會鎖住該價格區間
        // (autoScale: false)。換商品時強制恢復自動縮放，避免新商品的價格
        // 落在舊區間之外而「消失」（例如切到價位差異很大的 ADA）。
        chart?.priceScale("right").applyOptions({ autoScale: true });
        // 不用 fitContent()：那會把全部 500 根 K 棒硬塞進畫面寬度，擠成一團。
        // 也不用 scrollToRealTime()：它一定會播放捲動動畫，動畫過程中可視範圍會
        // 暫時掃過「from 很小」的中間值，誤觸下面的 loadMoreHistory，還會讓補頁
        // 用到動畫途中的暫態範圍，導致最終停在錯的位置。改用 scrollToPosition(0,
        // false) 走同樣的「靠右對齊、套用 rightOffset」邏輯，但不經動畫、一次到位。
        chart?.timeScale().scrollToPosition(0, false);
        // scrollToPosition 是同步的，呼叫完當下的可視範圍（位置+縮放程度）就是這個
        // symbol/interval 的「預設樣貌」，記下來給「重設圖表顯示」用。
        initialRangeRef.current = chart?.timeScale().getVisibleLogicalRange() ?? null;
        updateLegend(latestBar());
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        // 抓取失敗時清空圖表現有資料，避免切換商品失敗時殘留舊商品的 K 線，
        // 誤導使用者以為那是新商品的走勢。
        candleRef.current?.setData([]);
        volumeRef.current?.setData([]);
        updateLegend(null);
        setError("歷史資料載入失敗，請稍後重試");
        setLoading(false);
      });

    const unsubscribe = subscribeKline((k) => {
      // 即時 tick 若剛好收在最舊那根之前（理論上不會，防禦用），不更新歷史陣列，
      // 避免 bars[0] 被覆蓋成一個比實際更晚的時間，打亂補頁的 endTime 判斷。
      if (bars.length > 0 && k.time >= bars[0].time) {
        if (k.time === bars[bars.length - 1]?.time) {
          bars[bars.length - 1] = k;
        } else if (k.time > bars[bars.length - 1]?.time) {
          bars.push(k);
        }
      }
      candleRef.current?.update({
        time: k.time as UTCTimestamp,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
      });
      volumeRef.current?.update({
        time: k.time as UTCTimestamp,
        value: k.volume,
        color: k.close >= k.open ? VOL_UP : VOL_DOWN,
      });
      // 沒有 hover 中的 bar 時，legend 跟著最新 tick 更新（fallback 顯示最新一根）。
      if (!hovering) {
        updateLegend(latestBar());
      }
    });

    return () => {
      active = false;
      unsubscribe();
      chart?.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
      chart?.unsubscribeCrosshairMove(handleCrosshairMove);
    };
  }, [symbol, interval, subscribeKline]);

  return (
    <div
      className="relative h-full w-full"
      onContextMenu={(e) => {
        e.preventDefault();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        // 用估計的選單尺寸把位置夾在容器範圍內，避免在靠邊緣右鍵時選單被裁掉。
        const MENU_W = 190;
        const MENU_H = 40;
        const x = Math.min(e.clientX - rect.left, rect.width - MENU_W - 8);
        const y = Math.min(e.clientY - rect.top, rect.height - MENU_H - 8);
        setContextMenu({ x: Math.max(8, x), y: Math.max(8, y) });
      }}
    >
      <div ref={containerRef} className="h-full w-full" />
      {/* OHLC/成交量 legend：hover 時顯示 crosshair 對應那根 bar，否則 fallback 顯示最新一根。
          內容由 updateLegend() 以 innerHTML imperatively 寫入（比照本檔案其餘圖表資料的做法，
          不走 React state，避免高頻 tick 造成整個元件重新渲染）。 */}
      <div
        ref={legendRef}
        className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-panel/70 px-2 py-1 text-xs backdrop-blur-sm"
      />
      {loading && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center gap-2 text-sm text-muted">
          <div className="flex flex-col items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent" />
            <span>載入 K 線資料…</span>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-x-0 top-2 mx-auto w-fit rounded bg-down/20 px-3 py-1 text-xs text-down">
          {error}
        </div>
      )}
      {contextMenu && (
        <div
          className="absolute z-20 min-w-[190px] rounded-md border border-border bg-panel py-1 text-xs shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-text hover:bg-white/5"
            onClick={() => {
              resetChartView();
              setContextMenu(null);
            }}
          >
            重設圖表顯示
          </button>
        </div>
      )}
    </div>
  );
}
