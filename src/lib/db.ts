import { Pool, type QueryResultRow } from "pg";

/**
 * 獨立於 Vercel 之外的關聯式資料庫連線層。
 * 只依賴標準 `DATABASE_URL`（libpq 連線字串），可指向任何 Postgres
 * （Neon、Supabase、Railway、自架…），不綁定 Vercel Marketplace 的任何服務，
 * 換供應商只需換這一組環境變數。
 *
 * Server Actions 跑在 Node runtime（非 Edge），可以安全使用 `pg` 這種
 * TCP-based driver；千萬不要把這個檔案 import 進 middleware.ts。
 */

let pool: Pool | null = null;

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "缺少 DATABASE_URL 環境變數，請參考 .env.example 設定一組 Postgres 連線字串。",
    );
  }

  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);

  return new Pool({
    connectionString,
    // 雲端 Postgres（Neon / Supabase / Railway…）都走 TLS，本機開發則關閉。
    // rejectUnauthorized 保持 true：這些供應商都是公開受信任的 CA，關掉驗證會讓
    // 連線暴露在 MITM 風險下，沒有理由關閉。
    ssl: isLocal ? false : { rejectUnauthorized: true },
    max: 5,
  });
}

function getPool(): Pool {
  if (!pool) pool = createPool();
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return getPool().query<T>(text, params);
}

// 建表用的 DDL 只在第一次查詢前執行一次（同一個 lambda/伺服器程序內只跑一次），
// 讓專案不需要額外的 migration 工具就能在任何一台全新的 Postgres 上直接運作。
let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(
        `CREATE TABLE IF NOT EXISTS users (
           id SERIAL PRIMARY KEY,
           username TEXT NOT NULL UNIQUE,
           name TEXT NOT NULL,
           password_hash TEXT NOT NULL,
           created_at TIMESTAMPTZ NOT NULL DEFAULT now()
         )`,
      )
      .then(() => undefined)
      .catch((err) => {
        schemaReady = null; // 失敗就重置，讓下一次查詢可以重試
        throw err;
      });
  }
  return schemaReady;
}
