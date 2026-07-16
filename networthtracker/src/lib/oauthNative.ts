import { NextRequest, NextResponse } from "next/server";

// iOS App 裡點「使用 Google/Apple 登入」是用 @capacitor/browser 開一個 in-app 瀏覽器分頁跑 OAuth
// （不是像網頁版那樣直接在同一個 WKWebView 裡導頁）——因為 Capacitor 預設只讓 webview 的 server.url
// 網域內的導頁留在 App 裡，一旦導去 accounts.google.com 這種外部網域就會被丟到系統瀏覽器，
// 使用者體感上就是「登入了但變成一個網頁」，回不去 App。
//
// 用 in-app 瀏覽器（SFSafariViewController）開 OAuth，走完整個流程後 callback 設下的
// auth-token cookie，因為跟 App 主要的 WKWebView 共用同一份系統 cookie store，所以主畫面
// 馬上就讀得到——不需要另外設計一次性換發碼。剩下唯一要做的，是讓 in-app 瀏覽器導回
// 自訂 URL scheme（App 的 Bundle ID），iOS 收到就會自動關閉瀏覽器分頁、把 App 帶回前景，
// 讓 native.ts 的 appUrlOpen 監聽器接手，把網址參數轉貼回主網域，重用既有的
// 「讀 authError/linked 參數」邏輯。
//
// 這裡用一個短效 cookie（跟 google/apple-oauth-state 同樣的生命週期）記住「這次 OAuth
// 是不是從 App 裡發起的」，callback 讀到就知道要導回 App 的 URL scheme，而不是網頁版的 `/`。

const COOKIE_NAME = "oauth-platform";
const NATIVE_VALUE = "native";

export const NATIVE_APP_CALLBACK = "com.zenoworth.app://oauth-callback";

export function isNativeOAuthRequest(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get("platform") === "native";
}

export function setOAuthPlatformCookie(response: NextResponse, isNative: boolean) {
  if (isNative) {
    response.cookies.set(COOKIE_NAME, NATIVE_VALUE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
  } else {
    // 清掉可能殘留的舊值，避免上一次沒走完的原生流程誤判這次網頁登入
    response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
  }
}

export function isNativeOAuthCallback(request: NextRequest): boolean {
  return request.cookies.get(COOKIE_NAME)?.value === NATIVE_VALUE;
}

export function clearOAuthPlatformCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
}

// App 裡的流程用這支組回跳網址：query 帶到 App 自訂 scheme 上，讓 native.ts 的
// appUrlOpen 監聽器解析後轉貼回主網域，跟網頁版共用同一套「讀參數」邏輯
export function buildNativeCallbackUrl(params: Record<string, string>): string {
  const url = new URL(NATIVE_APP_CALLBACK);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}
