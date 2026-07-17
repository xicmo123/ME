import { NextRequest, NextResponse } from "next/server";
import { verifyNativeLinkToken } from "@/lib/auth";

// iOS App 裡點「使用 Google/Apple 登入」是用 ASWebAuthenticationSession 開一個獨立的瀏覽情境跑 OAuth
// （不是像網頁版那樣直接在同一個 WKWebView 裡導頁）——因為 Capacitor 的主 WKWebView 只讓
// server.url 網域內的導頁留在 App 裡，一旦導去 accounts.google.com 這種外部網域就會被丟出去。
//
// 重點：ASWebAuthenticationSession（以及它取代的 SFSafariViewController）用的是跟 Safari
// 共用的系統瀏覽情境，這份 cookie store 跟 App 自己的主 WKWebView 是兩個完全獨立的沙盒，
// 不會互通。所以 callback 不能靠「反正主 WKWebView 讀得到 cookie」這種假設來完成登入，
// 而是要：
//   1. callback 產生一組短效、一次性的交換碼，透過自訂 URL scheme 帶回 App
//      （ASWebAuthenticationSession 的 completion handler 會直接把整個網址交回來）
//   2. 由 App 的主 WKWebView 自己打 /api/auth/native-exchange 用交換碼換發 auth-token
//      ——這個請求是主 WKWebView 自己發的，Set-Cookie 保證進到它自己的 cookie store。
//
// 「綁定既有帳號」流程也有同樣的問題：callback 沒辦法靠讀 auth-token cookie 認出「現在登入的
// 是誰」，因為那個 cookie 在主 WKWebView 的沙盒裡，OAuth 這次的請求根本看不到。所以綁定流程
// 改成：App 先用主 WKWebView 自己打 /api/auth/native-link-token（那邊讀得到 auth-token），
// 換一個短效的 linkToken 帶在 OAuth 起始網址上，讓 callback 能確認「這次要綁定給哪個使用者」。

const PLATFORM_COOKIE = "oauth-platform";
const LINK_USER_COOKIE = "oauth-link-user";
const NATIVE_VALUE = "native";

export const NATIVE_APP_CALLBACK = "com.zenoworth.app://oauth-callback";

export function isNativeOAuthRequest(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get("platform") === "native";
}

export function setOAuthPlatformCookie(response: NextResponse, isNative: boolean) {
  if (isNative) {
    // Apple 用 response_mode=form_post，callback 是跨網域 POST，SameSite=Lax 不會帶上，
    // 一定要用 None（且 None 一定要搭 Secure）這個 cookie 才讀得到、正確判斷是不是 App 版流程
    response.cookies.set(PLATFORM_COOKIE, NATIVE_VALUE, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 600,
      path: "/",
    });
  } else {
    // 清掉可能殘留的舊值，避免上一次沒走完的原生流程誤判這次網頁登入
    response.cookies.set(PLATFORM_COOKIE, "", { maxAge: 0, path: "/" });
  }
}

export function isNativeOAuthCallback(request: NextRequest): boolean {
  return request.cookies.get(PLATFORM_COOKIE)?.value === NATIVE_VALUE;
}

export function clearOAuthPlatformCookie(response: NextResponse) {
  response.cookies.set(PLATFORM_COOKIE, "", { maxAge: 0, path: "/" });
  response.cookies.set(LINK_USER_COOKIE, "", { maxAge: 0, path: "/" });
}

// 綁定流程專用：驗證 App 主 WKWebView 換來的 linkToken，把使用者 id 記在跟
// google/apple-oauth-state 同樣生命週期的短效 cookie 裡，讓 callback 讀得到
export function resolveNativeLinkUserId(linkToken: string): string | null {
  return verifyNativeLinkToken(linkToken);
}

export function setOAuthLinkUserCookie(response: NextResponse, userId: string) {
  // 同上，Apple 的 POST callback 需要 SameSite=None 才讀得到這個 cookie
  response.cookies.set(LINK_USER_COOKIE, userId, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 600,
    path: "/",
  });
}

export function getOAuthLinkUserId(request: NextRequest): string | null {
  return request.cookies.get(LINK_USER_COOKIE)?.value || null;
}

// App 裡的流程用這支組回跳網址：query 帶到 App 自訂 scheme 上，ASWebAuthenticationSession
// 的 completion handler 會把整個網址（含這裡帶的參數）直接交回 App 的 JS 端
export function buildNativeCallbackUrl(params: Record<string, string>): string {
  const url = new URL(NATIVE_APP_CALLBACK);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}
