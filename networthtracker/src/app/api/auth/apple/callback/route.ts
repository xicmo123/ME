export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { exchangeAppleCode, verifyAppleIdToken } from "@/lib/appleAuth";
import { createNativeExchangeToken, createToken, getUserIdFromRequest } from "@/lib/auth";
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
  const response = NextResponse.redirect(url, { status: 303 });
  response.cookies.set("apple-oauth-state", "", { maxAge: 0, path: "/" });
  clearOAuthPlatformCookie(response);
  return response;
}

// Apple 用 response_mode=form_post，所以走 POST 而不是像 Google 那樣走 GET query string。
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) return redirectWithError(request, "Apple 登入回傳格式錯誤");

  const code = form.get("code")?.toString();
  const state = form.get("state")?.toString();
  const savedState = request.cookies.get("apple-oauth-state")?.value;

  if (form.get("error")) return redirectWithError(request, "已取消 Apple 登入");
  if (!code || !state || !savedState || state !== savedState) {
    return redirectWithError(request, "Apple 登入驗證失敗，請重試");
  }

  try {
    const { id_token } = await exchangeAppleCode(code, request);
    const claims = await verifyAppleIdToken(id_token);
    const email = claims.email;
    const emailVerified = claims.email_verified === true || claims.email_verified === "true";
    if (!email || !emailVerified) {
      return redirectWithError(request, "此 Apple 帳號的電子郵件尚未驗證");
    }

    const isNative = isNativeOAuthCallback(request);
    // App 版：這個 request 是在 ASWebAuthenticationSession 的獨立瀏覽情境裡發生的，
    // 讀不到主 WKWebView 的 auth-token cookie，只能靠 route.ts 那邊先驗證過、寫進來的 oauth-link-user
    const currentUserId = isNative ? getOAuthLinkUserId(request) : getUserIdFromRequest(request);

    if (currentUserId) {
      // 綁定流程：使用者已登入，把 Apple 帳號綁到目前這個帳號
      const conflictUser = await prisma.user.findUnique({ where: { appleId: claims.sub } });
      if (conflictUser && conflictUser.id !== currentUserId) {
        return redirectWithError(request, "此 Apple 帳號已綁定其他帳號");
      }
      await prisma.user.update({ where: { id: currentUserId }, data: { appleId: claims.sub } });
      // 綁定流程不需要換發 auth-token——使用者本來就已經登入，導回 App 的 URL scheme 純粹是把使用者帶回前景
      const url = isNative ? buildNativeCallbackUrl({ linked: "apple" }) : new URL("/?linked=apple", getAppOrigin(request)).toString();
      const response = NextResponse.redirect(url, { status: 303 });
      response.cookies.set("apple-oauth-state", "", { maxAge: 0, path: "/" });
      clearOAuthPlatformCookie(response);
      return response;
    }

    // 登入／註冊流程：先用 appleId 找，找不到再用 email 找（讓舊帳號自動接上 Apple），都找不到才新建
    let user = await prisma.user.findUnique({ where: { appleId: claims.sub } });
    if (!user) {
      const existingByEmail = await prisma.user.findUnique({ where: { email } });
      user = existingByEmail
        ? await prisma.user.update({ where: { id: existingByEmail.id }, data: { appleId: claims.sub, emailVerified: true } })
        : await prisma.user.create({ data: { email, appleId: claims.sub, emailVerified: true } });
    }

    if (isNative) {
      // App 版：設 auth-token cookie 在這個獨立瀏覽情境裡沒用，改帶短效交換碼回 App，
      // 讓主 WKWebView 自己打 /api/auth/native-exchange 換發
      const exchange = createNativeExchangeToken(user.id);
      const url = buildNativeCallbackUrl({ exchange });
      const response = NextResponse.redirect(url, { status: 303 });
      response.cookies.set("apple-oauth-state", "", { maxAge: 0, path: "/" });
      clearOAuthPlatformCookie(response);
      return response;
    }

    const token = createToken(user.id);
    const url = new URL("/", getAppOrigin(request)).toString();
    const response = NextResponse.redirect(url, { status: 303 });
    response.cookies.set("auth-token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 60 * 24 * 7, path: "/" });
    response.cookies.set("apple-oauth-state", "", { maxAge: 0, path: "/" });
    clearOAuthPlatformCookie(response);
    return response;
  } catch (err) {
    console.error("Apple OAuth callback failed:", err);
    return redirectWithError(request, "Apple 登入失敗，請稍後再試");
  }
}
