export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode, fetchGoogleUserInfo } from "@/lib/googleAuth";
import { createNativeExchangeToken, createToken, getUserIdFromRequest, setAuthCookie } from "@/lib/auth";
import { resolveOAuthLogin } from "@/lib/oauthAccount";
import { getAppOrigin } from "@/lib/requestOrigin";
import { buildNativeCallbackUrl, clearOAuthPlatformCookie, getOAuthLinkUserId, isNativeOAuthCallback } from "@/lib/oauthNative";

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

    const isNative = isNativeOAuthCallback(request);
    // App 版：這個 request 是在 ASWebAuthenticationSession 的獨立瀏覽情境裡發生的，
    // 讀不到主 WKWebView 的 auth-token cookie，只能靠 route.ts 那邊先驗證過、寫進來的 oauth-link-user
    const currentUserId = isNative ? getOAuthLinkUserId(request) : getUserIdFromRequest(request);

    if (currentUserId) {
      // 綁定流程：使用者已登入，把 Google 帳號綁到目前這個帳號
      const conflictUser = await prisma.user.findUnique({ where: { googleId: profile.sub } });
      if (conflictUser && conflictUser.id !== currentUserId) {
        return redirectWithError(request, "此 Google 帳號已綁定其他帳號");
      }
      await prisma.user.update({ where: { id: currentUserId }, data: { googleId: profile.sub } });
      // 綁定流程不需要換發 auth-token——使用者本來就已經登入，主 WKWebView 的 auth-token
      // 沒有變化，導回 App 的 URL scheme 純粹是把使用者帶回前景
      const url = isNative ? buildNativeCallbackUrl({ linked: "google" }) : new URL("/?linked=google", getAppOrigin(request)).toString();
      const response = NextResponse.redirect(url);
      response.cookies.set("google-oauth-state", "", { maxAge: 0, path: "/" });
      clearOAuthPlatformCookie(response);
      return response;
    }

    // 登入／註冊流程。合併規則見 lib/oauthAccount.ts——有密碼的同信箱帳號一律不自動合併，
    // 否則會形成「搶先用別人的信箱註冊 → 對方 Google 登入時被併進攻擊者帳號」的接管路徑。
    const resolved = await resolveOAuthLogin("google", profile.sub, profile.email);
    if (!resolved.ok) return redirectWithError(request, resolved.message);
    const user = { id: resolved.userId };

    if (isNative) {
      // App 版：這個回應是在 ASWebAuthenticationSession 的獨立瀏覽情境裡發生的，設 auth-token
      // cookie 在這裡沒用——主 WKWebView 讀不到。改帶一個短效交換碼回 App，讓主 WKWebView
      // 自己打 /api/auth/native-exchange 換發，Set-Cookie 才會進到正確的 cookie store。
      const exchange = createNativeExchangeToken(user.id);
      const url = buildNativeCallbackUrl({ exchange });
      const response = NextResponse.redirect(url);
      response.cookies.set("google-oauth-state", "", { maxAge: 0, path: "/" });
      clearOAuthPlatformCookie(response);
      return response;
    }

    const url = new URL("/", getAppOrigin(request)).toString();
    const response = NextResponse.redirect(url);
    setAuthCookie(response, createToken(user.id));
    response.cookies.set("google-oauth-state", "", { maxAge: 0, path: "/" });
    clearOAuthPlatformCookie(response);
    return response;
  } catch (err) {
    console.error("Google OAuth callback failed:", err);
    return redirectWithError(request, "Google 登入失敗，請稍後再試");
  }
}
