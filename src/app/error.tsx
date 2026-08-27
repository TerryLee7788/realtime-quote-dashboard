"use client";

import { useEffect } from "react";

// App Router 的路由層錯誤邊界：任何頁面渲染或 Server Action 拋出未攔截的例外，
// 都會落到這裡，取代 Next.js 預設那個沒有樣式、直接印堆疊路徑的錯誤畫面。
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-panel p-7 text-center shadow-2xl">
        <div className="mb-1 flex items-center justify-center gap-2">
          <span className="inline-block h-5 w-1.5 rounded bg-down" />
          <h1 className="text-xl font-semibold">發生錯誤</h1>
        </div>
        <p className="mt-2 text-sm text-muted">
          系統暫時無法處理這個請求，請稍後再試一次。
        </p>
        {error.digest && (
          <p className="mt-3 text-xs text-muted">錯誤代碼：{error.digest}</p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-6 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
        >
          再試一次
        </button>
      </div>
    </main>
  );
}
