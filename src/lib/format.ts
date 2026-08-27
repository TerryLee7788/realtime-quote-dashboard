// 數字格式化工具

// 依價格量級決定小數位數：貴的幣（如 BTC）位數少，便宜的幣（如 SHIB）位數多，
// 否則統一固定位數在極端量級下會不是四捨五入到 0 就是塞一堆多餘的 0。
export function pricePrecision(n: number): number {
  if (n == null || !isFinite(n)) return 2;
  return n >= 1000 ? 2 : n >= 1 ? 3 : n >= 0.01 ? 5 : 8;
}

export function fmtPrice(n: number, digits?: number): string {
  if (n == null || !isFinite(n)) return "—";
  const d = digits ?? pricePrecision(n);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

export function fmtCompact(n: number): string {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
}

export function fmtPct(n: number): string {
  if (n == null || !isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function fmtTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

export function fmtQty(n: number, digits = 4): string {
  if (n == null || !isFinite(n)) return "—";
  return n.toFixed(digits);
}
