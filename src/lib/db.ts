import { Pool, type QueryResultRow } from "pg";
import { rootCertificates } from "node:tls";

/**
 * 獨立於 Vercel 之外的關聯式資料庫連線層。
 * 只依賴標準 `DATABASE_URL`（libpq 連線字串），可指向任何 Postgres
 * （Neon、Supabase、Railway、自架…），不綁定 Vercel Marketplace 的任何服務，
 * 換供應商只需換這一組環境變數。
 *
 * Server Actions 跑在 Node runtime（非 Edge），可以安全使用 `pg` 這種
 * TCP-based driver；千萬不要把這個檔案 import 進 middleware.ts。
 */

// Supabase 的 Postgres pooler 是用自家的 Root CA 簽發憑證，不在 Node 內建的信任清單
// 裡，單靠 rejectUnauthorized: true + 預設信任鏈驗證會直接丟
// SELF_SIGNED_CERT_IN_CHAIN。這是 Supabase 官方公開、所有專案共用的 Root CA（不是
// 機密），疊加在 Node 內建信任清單「之上」而不是取代它，Neon/Railway 這類走公開受信任
// CA 的供應商還是照樣用預設清單驗證，不受影響。
// 來源：Supabase Dashboard → Database Settings → SSL Configuration → Download certificate
const SUPABASE_ROOT_CA = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----`;

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
    // rejectUnauthorized 保持 true：關掉驗證會讓連線暴露在 MITM 風險下。額外把
    // Supabase 的 Root CA 疊加進信任清單，讓走 Supabase pooler 的連線也能通過驗證。
    ssl: isLocal
      ? false
      : { rejectUnauthorized: true, ca: [...rootCertificates, SUPABASE_ROOT_CA] },
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
  try {
    return await getPool().query<T>(text, params);
  } catch (err) {
    // 42P01 = undefined_table。本機開發常見情境：DB 容器被 `docker compose down`
    // 又 `up` 成一個全新、空的資料庫，但跑著的 Node process 沒有跟著重啟，
    // schemaReady 還停留在「已經對著舊容器建過表」的記憶，導致之後每次查詢都
    // 對著一個其實沒有 users/login_attempts 表的資料庫送查詢、永遠失敗。偵測到這個
    // 錯誤碼就重置 schemaReady、重新跑一次建表 DDL，再重試這次查詢一次——只重試一次，
    // 避免表真的不存在或其他原因造成無窮迴圈。
    if ((err as { code?: string } | null)?.code === "42P01") {
      schemaReady = null;
      await ensureSchema();
      return await getPool().query<T>(text, params);
    }
    throw err;
  }
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
      // 登入失敗嘗試紀錄，供 rate-limit.ts 做滑動視窗限流查詢用。
      // 獨立成一張新表、不對 users 加外鍵，避免動到 users 既有的手動客製設定。
      .then(() =>
        getPool().query(
          `CREATE TABLE IF NOT EXISTS login_attempts (
             id BIGSERIAL PRIMARY KEY,
             username TEXT NOT NULL,
             ip TEXT NOT NULL,
             created_at TIMESTAMPTZ NOT NULL DEFAULT now()
           )`,
        ),
      )
      .then(() =>
        getPool().query(
          `CREATE INDEX IF NOT EXISTS login_attempts_username_created_at_idx
             ON login_attempts (username, created_at)`,
        ),
      )
      .then(() =>
        getPool().query(
          `CREATE INDEX IF NOT EXISTS login_attempts_ip_created_at_idx
             ON login_attempts (ip, created_at)`,
        ),
      )
      .then(() => undefined)
      .catch((err) => {
        schemaReady = null; // 失敗就重置，讓下一次查詢可以重試
        throw err;
      });
  }
  return schemaReady;
}
