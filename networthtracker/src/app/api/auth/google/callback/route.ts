export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode, fetchGoogleUserInfo } from "@/lib/googleAuth";
import { createToken, getUserIdFromRequest } from "@/lib/auth";
import { getAppOrigin } from "@/lib/requestOrigin";
import { buildNativeCallbackUrl, clearOAuthPlatformCookie, isNativeOAuthCallback } from "@/lib/oauthNative";

import { prisma } from "@/lib/prisma";

function redirectWithError(request: NextRequest, message: string) {
  const isNative = isNativeOAuthCallback(request);
  const url = isNative ? buildNativeCallbackUrl({ authError: message }) : (() => {
    const u = new URL("/", getAppOrigin(request));
    u.searchParams.set("authError", message);
    return u.toString();
  })();
  const response = NextResponse.redirect(url);
  response.cookies.set("google-oauth-state", "", { maxAge: 0, path: "/" });
  clearOAuthPlatformCookie(response);
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const savedState = request.cookies.get("google-oauth-state")?.value;

  if (searchParams.get("error")) return redirectWithError(request, "已取消 Google 登入");
  if (!code || !state || !savedState || state !== savedState) {
    return redirectWithError(request, "Google 登入驗證失敗，請重試");
  }

  try {
    const tokens = await exchangeGoogleCode(code, request);
    const profile = await fetchGoogleUserInfo(tokens.access_token);
    if (!profile.email || !profile.email_verified) {
      return redirectWithError(request, "此 Google 帳號的電子郵件尚未驗證");
    }

    const currentUserId = getUserIdFromRequest(request);
    const isNative = isNativeOAuthCallback(request);

    if (currentUserId) {
      // 綁定流程：使用者已登入，把 Google 帳號綁到目前這個帳號
      const conflictUser = await prisma.user.findUnique({ where: { googleId: profile.sub } });
      if (conflictUser && conflictUser.id !== currentUserId) {
        return redirectWithError(request, "此 Google 帳號已綁定其他帳號");
      }
      await prisma.user.update({ where: { id: currentUserId }, data: { googleId: profile.sub } });
      // App 版跟主要 WKWebView 共用同一份系統 cookie store，這個 request 是在 in-app 瀏覽器裡發生的，
      // 但既有的 auth-token cookie 早就在共用的 store 裡了，不需要重新發——導回 App 的 URL scheme
      // 只是為了觸發系統把使用者帶回前景、關掉 in-app 瀏覽器分頁
      const url = isNative ? buildNativeCallbackUrl({ linked: "google" }) : new URL("/?linked=google", getAppOrigin(request)).toString();
      const response = NextResponse.redirect(url);
      response.cookies.set("google-oauth-state", "", { maxAge: 0, path: "/" });
      clearOAuthPlatformCookie(response);
      return response;
    }

    // 登入／註冊流程：先用 googleId 找，找不到再用 email 找（讓舊帳號自動接上 Google），都找不到才新建
    let user = await prisma.user.findUnique({ where: { googleId: profile.sub } });
    if (!user) {
      const existingByEmail = await prisma.user.findUnique({ where: { email: profile.email } });
      user = existingByEmail
        ? await prisma.user.update({ where: { id: existingByEmail.id }, data: { googleId: profile.sub, emailVerified: true } })
        : await prisma.user.create({ data: { email: profile.email, googleId: profile.sub, emailVerified: true } });
    }

    const token = createToken(user.id);
    // auth-token 這裡設下去，就算等一下導去 App 的自訂 URL scheme，因為跟主要 WKWebView
    // 共用同一份系統 cookie store，App 主畫面下一次打 API 就讀得到這個 cookie，不需要另外設計
    // 一次性換發碼——導回 App 的 URL scheme 純粹是為了讓系統把使用者從 in-app 瀏覽器帶回 App。
    const url = isNative ? buildNativeCallbackUrl({}) : new URL("/", getAppOrigin(request)).toString();
    const response = NextResponse.redirect(url);
    response.cookies.set("auth-token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 60 * 24 * 7, path: "/" });
    response.cookies.set("google-oauth-state", "", { maxAge: 0, path: "/" });
    clearOAuthPlatformCookie(response);
    return response;
  } catch (err) {
    console.error("Google OAuth callback failed:", err);
    return redirectWithError(request, "Google 登入失敗，請稍後再試");
  }
}
