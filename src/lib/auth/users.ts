import bcrypt from "bcryptjs";
import { ensureSchema, query } from "@/lib/db";

/**
 * 使用者資料存放於 Postgres（見 src/lib/db.ts）。
 * 任何人都可以在 /register 用任意 username/password 建立帳號，
 * 密碼一律用 bcrypt 雜湊後才寫入資料庫，明碼不落地。
 */

interface UserRow {
  id: number;
  username: string;
  name: string;
  password_hash: string;
}

// 單一 cost 常數，hash 真密碼與算 dummy hash 都用它，避免兩者手動同步時漏改
// 其中一處，重新出現 cost 不一致造成的計時側信道。
export const BCRYPT_COST = 12;

// 一個永遠不會通過的 dummy hash，用來讓「帳號不存在」也花掉一次 compare 時間，
// 降低透過回應時間差判斷帳號是否存在的側信道（timing attack）。用 hashSync 在
// module 載入時現算，而不是手刻字串常數，以後調整 BCRYPT_COST 這裡會自動跟著變。
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing-safety", BCRYPT_COST);

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export interface AuthedUser {
  id: string;
  username: string;
  name: string;
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export async function verifyUser(
  username: string,
  password: string,
): Promise<AuthedUser | null> {
  await ensureSchema();

  const normalized = normalizeUsername(username);
  const { rows } = await query<UserRow>(
    "SELECT id, username, name, password_hash FROM users WHERE username = $1",
    [normalized],
  );
  const user = rows[0];

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH).catch(() => false);
    return null;
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;

  // 順手把 cost 低於目前設定值的舊雜湊升級——伺服器只有在登入成功這一刻拿得到
  // 明碼密碼，這是唯一不強迫使用者重設密碼、又能把既有帳號雜湊強度拉到新 cost
  // 的時機。失敗不該擋登入本身，吞掉即可。
  const currentCost = Number(user.password_hash.split("$")[2]);
  if (currentCost < BCRYPT_COST) {
    const upgradedHash = await bcrypt.hash(password, BCRYPT_COST);
    await query("UPDATE users SET password_hash = $1 WHERE id = $2", [upgradedHash, user.id]).catch(
      () => undefined,
    );
  }

  return { id: String(user.id), username: user.username, name: user.name };
}

export interface CreateUserResult {
  ok: boolean;
  error?: string;
  user?: AuthedUser;
}

export async function createUser(
  username: string,
  password: string,
): Promise<CreateUserResult> {
  const normalized = normalizeUsername(username);

  if (!USERNAME_PATTERN.test(normalized)) {
    return { ok: false, error: "帳號需為 3-20 碼英數字或底線" };
  }
  if (password.length < 8) {
    return { ok: false, error: "密碼至少需 8 碼" };
  }

  await ensureSchema();

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  try {
    const { rows } = await query<UserRow>(
      `INSERT INTO users (username, name, password_hash)
       VALUES ($1, $1, $2)
       RETURNING id, username, name, password_hash`,
      [normalized, passwordHash],
    );
    const user = rows[0];
    return { ok: true, user: { id: String(user.id), username: user.username, name: user.name } };
  } catch (err) {
    // Postgres unique_violation：兩個請求同時搶註冊同一個帳號時的 race condition
    if (isUniqueViolation(err)) {
      return { ok: false, error: "此帳號已被註冊" };
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505";
}
