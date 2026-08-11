import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// iOS App 的前端現在是從 binary 載入的，origin 是 capacitor://localhost，打過來的 API 請求
// 屬於跨來源請求。沒有 CORS 標頭的話瀏覽器層會直接擋掉，App 一支 API 都呼叫不到。
//
// （先前不需要這個檔案，是因為 App 的 WKWebView 直接跑在 zeno.zequo.net 上，所有請求都是
// 同源的——那正是被 App Store 以 Guideline 5.6 退件的架構。）
//
// 白名單而非萬用字元：帶著 credentials 的請求本來就不允許 Access-Control-Allow-Origin: *，
// 而且 API 有 httpOnly cookie 這條路徑，放寬成任意來源等於開放跨站請求偽造。
function allowedOrigins(): string[] {
  const origins = [
    // Capacitor 在 iOS 上的兩種 origin：預設 scheme 與部分版本使用的 localhost
    "capacitor://localhost",
    "ionic://localhost",
    // 網頁版自己
    process.env.APP_BASE_URL,
  ];
  return origins.filter((o): o is string => Boolean(o)).map((o) => o.replace(/\/$/, ""));
}

const ALLOWED_HEADERS = "Content-Type, Authorization";
const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  if (origin && allowedOrigins().includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    // 網頁版仍然靠 httpOnly cookie，跨來源時要明確允許才會帶上
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
    headers.set("Access-Control-Max-Age", "86400");
    // 回應會依 Origin 而異，不加這個標頭會被快取成錯誤的來源
    headers.set("Vary", "Origin");
  }
  return headers;
}

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  // 預檢請求不必進到 route handler
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();
  headers.forEach((value, key) => response.headers.set(key, value));
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
