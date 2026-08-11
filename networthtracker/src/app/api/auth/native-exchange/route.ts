export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createToken, setAuthCookie, verifyNativeExchangeToken } from "@/lib/auth";

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

  // cookie 留著給網頁版；App 版另外從 body 拿 token 存進自己的儲存區，因為 App 的 UI
  // 從 binary 載入（origin capacitor://localhost），跨站 cookie 會被 WKWebView 的 ITP 擋掉。
  const token = createToken(userId);
  return setAuthCookie(NextResponse.json({ ok: true, token }), token);
}
