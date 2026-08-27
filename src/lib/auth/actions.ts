"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createUser, verifyUser, type AuthedUser } from "./users";
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

// 只允許站內相對路徑，避免 open redirect
function safeCallbackUrl(raw: string): string {
  return raw.startsWith("/") ? raw : "/dashboard";
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

  const user = await verifyUser(username, password);
  if (!user) {
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
