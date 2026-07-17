export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createToken, verifyNativeExchangeToken } from "@/lib/auth";

// iOS App 版 OAuth 登入的最後一步：由主 WKWebView 自己打這支 API，把 callback 網址帶回來的
// 一次性交換碼換成正式的 auth-token cookie。這個 request 是主 WKWebView 自己發的，
// 所以 Set-Cookie 一定會進到主 WKWebView 自己的 cookie store，不依賴任何跨瀏覽情境共享 cookie 的假設。
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const code = body?.code;
  if (typeof code !== "string") {
    return NextResponse.json({ message: "缺少交換碼" }, { status: 400 });
  }

  const userId = verifyNativeExchangeToken(code);
  if (!userId) {
    return NextResponse.json({ message: "交換碼無效或已過期" }, { status: 401 });
  }

  const token = createToken(userId);
  const response = NextResponse.json({ ok: true });
  response.cookies.set("auth-token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return response;
}
