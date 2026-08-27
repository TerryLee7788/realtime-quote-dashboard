import { SignJWT, jwtVerify } from "jose";

/**
 * 只負責「簽發 / 驗證」JWT。
 * 這個檔案刻意不 import next/headers，因為 middleware 跑在 Edge Runtime，
 * jose 是純 Web Crypto 實作，可在 Edge 正常運作。
 */

const ALG = "HS256";
const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-only-insecure-secret-change-me-please-32c",
);

export interface SessionPayload {
  sub: string;
  username: string;
  name: string;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ username: payload.username, name: payload.name })
    .setProtectedHeader({ alg: ALG })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, { algorithms: [ALG] });
    return {
      sub: String(payload.sub ?? ""),
      username: String(payload.username ?? ""),
      name: String(payload.name ?? payload.username ?? ""),
    };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 天
