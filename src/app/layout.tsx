import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "即時報價儀表板",
  description:
    "串接 WebSocket 的即時加密貨幣報價，TradingView 風格圖表與會員登入系統。",
};

export const viewport: Viewport = {
  themeColor: "#0e0f14",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen bg-bg text-text antialiased">{children}</body>
    </html>
  );
}
