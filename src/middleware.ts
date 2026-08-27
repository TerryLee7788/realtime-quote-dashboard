import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth/session";

/**
 * 路由保護：
 *  - 未登入且不在 /login、/register → 導去 /login，並帶上 callbackUrl。
 *  - 已登入卻在 /login 或 /register → 導去 /dashboard。
 * 這段跑在 Edge Runtime，只用 jose 驗 JWT（無 DB、無 next/headers）。
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const isAuthed = Boolean(session);
  const isPublicAuthPage = pathname === "/login" || pathname === "/register";

  if (!isAuthed && !isPublicAuthPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthed && isPublicAuthPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // 排除 API、Next 內部資源與靜態檔
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
