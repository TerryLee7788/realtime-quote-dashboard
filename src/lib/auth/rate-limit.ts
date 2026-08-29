import { headers } from "next/headers";
import { ensureSchema, query } from "@/lib/db";

/**
 * 登入嘗試的滑動視窗限流（sliding window rate limit）。
 * 只用 Postgres 記錄失敗嘗試，不依賴任何外部服務（Redis/Upstash）；
 * Vercel Serverless 沒有可信賴的行程間記憶體，計數必須落地在 DB。
 *
 * 只套用在「登入」，不含註冊。
 */

// 滑動視窗長度：在這段時間內累積的失敗次數會被計入限流判斷。
export const WINDOW_MINUTES = 15;

// 同一個帳號（normalize 後的 username）在視窗內允許的失敗次數上限。
// 門檻抓得比 IP 嚴，因為一個帳號被鎖不太可能誤傷到別人。
export const MAX_ATTEMPTS_PER_USERNAME = 5;

// 同一個來源 IP 在視窗內允許的失敗次數上限。
// 門檻要放寬，因為公司/校園 NAT、行動網路 CGNAT 底下很多人共用同一個對外 IP，
// 抓太緊會誤傷同網段的其他合法使用者。
export const MAX_ATTEMPTS_PER_IP = 20;

// 保留多久的歷史紀錄（要大於 WINDOW_MINUTES，滑動視窗查詢才有完整資料可看）。
const RETENTION_HOURS = 24;

// 每次寫入失敗紀錄時，用機率觸發舊資料清除，而不是每次都刪一次，
// 避免攻擊高峰期（大量失敗登入湧入）讓每一次寫入都多付一次 DELETE 的成本。
const CLEANUP_PROBABILITY = 0.01;

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * 從 Server Action 內取得使用者端 IP。
 * Next 14 的 Server Action 拿不到原始 Request 物件，只能透過 next/headers 讀取
 * Vercel 附加的 x-forwarded-for（第一段即為使用者端 IP）。本機開發或沒有 proxy
 * header 時沒有真實 IP 可用，退回固定字串（正式站在 Vercel 上一定有這個 header）。
 */
export function getClientIp(): string {
  const h = headers();
  const forwardedFor = h.get("x-forwarded-for");
  const first = forwardedFor?.split(",")[0]?.trim();
  if (first) return first;

  const realIp = h.get("x-real-ip");
  if (realIp) return realIp;

  return "unknown";
}

/**
 * 檢查此次登入（依帳號與 IP）是否已達限流門檻。
 * 刻意不去查 users 表，只看 login_attempts 裡「使用者送出的字串」，這樣不論
 * 帳號存不存在，限流的判斷邏輯與回應都完全一致，不會洩漏帳號是否存在。
 */
export async function isLoginRateLimited(username: string, ip: string): Promise<boolean> {
  await ensureSchema();
  const normalized = normalizeUsername(username);

  const { rows } = await query<{ username_count: string; ip_count: string }>(
    `SELECT
       count(*) FILTER (WHERE username = $1) AS username_count,
       count(*) FILTER (WHERE ip = $2) AS ip_count
     FROM login_attempts
     WHERE created_at > now() - make_interval(mins => $3)
       AND (username = $1 OR ip = $2)`,
    [normalized, ip, WINDOW_MINUTES],
  );

  const row = rows[0];
  return (
    Number(row?.username_count ?? 0) >= MAX_ATTEMPTS_PER_USERNAME ||
    Number(row?.ip_count ?? 0) >= MAX_ATTEMPTS_PER_IP
  );
}

/**
 * 記錄一次失敗（或被限流擋下）的登入嘗試。
 * 兩種情況都要記錄：讓持續攻擊的來源自己延長自己的鎖定視窗，而不是每隔
 * WINDOW_MINUTES 就重新獲得一輪配額。
 */
export async function recordFailedLoginAttempt(username: string, ip: string): Promise<void> {
  await ensureSchema();
  const normalized = normalizeUsername(username);

  if (Math.random() < CLEANUP_PROBABILITY) {
    await query(
      `DELETE FROM login_attempts WHERE created_at < now() - make_interval(hours => $1)`,
      [RETENTION_HOURS],
    ).catch(() => undefined); // 清舊資料失敗不該影響登入流程
  }

  await query(`INSERT INTO login_attempts (username, ip) VALUES ($1, $2)`, [normalized, ip]);
}
