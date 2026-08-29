"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createUser, verifyUser, type AuthedUser } from "./users";
import { getClientIp, isLoginRateLimited, recordFailedLoginAttempt } from "./rate-limit";
import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "./session";

export interface LoginState {
  error?: string;
}

export interface RegisterState {
  error?: string;
}

async function startSession(user: AuthedUser): Promise<void> {
  const token = await createSessionToken({
    sub: user.id,
    username: user.username,
    name: user.name,
  });

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

// 只允許站內相對路徑，避免 open redirect。
// 光檢查開頭是 "/" 不夠：瀏覽器會把 "//evil.com" 或 "/\evil.com" 當成
// scheme-relative URL 導去外部網域，所以這兩種開頭也要擋掉。
function safeCallbackUrl(raw: string): string {
  if (!raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/dashboard";
  return raw;
}

/**
 * 登入 server action，搭配 useFormState 使用。
 * 成功 → 寫入 httpOnly cookie 並 redirect（redirect 會 throw，屬正常行為）。
 * 失敗 → 回傳 { error } 讓表單顯示訊息。
 */
export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const rawCallback = String(formData.get("callbackUrl") ?? "/dashboard");

  if (!username || !password) {
    return { error: "請輸入帳號與密碼" };
  }

  const ip = getClientIp();

  // 限流檢查放在 verifyUser 之前，避免對已被判定為濫用的請求還要付一次 bcrypt 成本。
  if (await isLoginRateLimited(username, ip)) {
    await recordFailedLoginAttempt(username, ip); // 持續攻擊會不斷延長自己的鎖定視窗
    return { error: "帳號或密碼錯誤" }; // 與帳密錯誤共用同一句訊息，不額外透露「被限流」
  }

  const user = await verifyUser(username, password);
  if (!user) {
    await recordFailedLoginAttempt(username, ip);
    return { error: "帳號或密碼錯誤" };
  }

  await startSession(user);
  redirect(safeCallbackUrl(rawCallback));
}

/**
 * 註冊 server action：任意 username/password 皆可建立新帳號，
 * 成功後直接登入（寫入 session cookie）並導向 callbackUrl。
 */
export async function registerAction(
  _prevState: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const rawCallback = String(formData.get("callbackUrl") ?? "/dashboard");

  if (!username || !password) {
    return { error: "請輸入帳號與密碼" };
  }
  if (password !== confirmPassword) {
    return { error: "兩次輸入的密碼不一致" };
  }

  const result = await createUser(username, password);
  if (!result.ok || !result.user) {
    return { error: result.error ?? "註冊失敗，請稍後再試" };
  }

  await startSession(result.user);
  redirect(safeCallbackUrl(rawCallback));
}

export async function logoutAction(): Promise<void> {
  cookies().delete(SESSION_COOKIE);
  redirect("/login");
}
