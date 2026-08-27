"use client";

// 只有在 RootLayout 本身（src/app/layout.tsx）渲染失敗時才會用到這個，
// 所以要自己補回 <html>/<body>——這個檔案會整個取代掉 layout.tsx。
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen bg-bg text-text antialiased">
        <main className="grid min-h-screen place-items-center px-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-panel p-7 text-center shadow-2xl">
            <div className="mb-1 flex items-center justify-center gap-2">
              <span className="inline-block h-5 w-1.5 rounded bg-down" />
              <h1 className="text-xl font-semibold">發生錯誤</h1>
            </div>
            <p className="mt-2 text-sm text-muted">
              系統暫時無法載入，請稍後再試一次。
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
      </body>
    </html>
  );
}
