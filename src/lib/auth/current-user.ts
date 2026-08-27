import { cookies } from "next/headers";
import { verifySessionToken, SESSION_COOKIE, type SessionPayload } from "./session";

/**
 * 在 Server Component / Layout 中讀取目前登入者。
 * 注意：這個檔案用到 next/headers，只能在 Node runtime（Server Component / Route Handler）使用，
 * 不要 import 到 middleware 或 client component。
 */
export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
