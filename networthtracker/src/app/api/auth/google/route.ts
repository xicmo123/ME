export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { buildGoogleAuthUrl } from "@/lib/googleAuth";
import { getUserIdFromRequest } from "@/lib/auth";
import { isNativeOAuthRequest, resolveNativeLinkUserId, setOAuthLinkUserCookie, setOAuthPlatformCookie } from "@/lib/oauthNative";

import { prisma } from "@/lib/prisma";

// GET /api/auth/google → 導向 Google 登入頁。網頁版若使用者當下已登入（帶著 auth-token），
// callback 會偵測到並改走「綁定」流程，這裡不需要另外傳參數區分。
// ?platform=native → iOS App 用獨立瀏覽情境（ASWebAuthenticationSession）發起的請求，
// callback 結束後要導回 App 而不是網頁版的 `/`。
// ?linkToken=... → App 版「綁定既有帳號」流程專用：那個瀏覽情境讀不到主 WKWebView 的
// auth-token cookie，所以由主 WKWebView 先換一個短效 linkToken 帶過來，這裡驗證後
// 記在跟 state 同樣生命週期的 cookie 裡，讓 callback 知道要綁定給哪個使用者。
export async function GET(request: NextRequest) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return NextResponse.json({ message: "尚未設定 Google OAuth 憑證" }, { status: 500 });
  }
  const state = crypto.randomBytes(16).toString("hex");
  const response = NextResponse.redirect(buildGoogleAuthUrl(state, request));
  response.cookies.set("google-oauth-state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" });
  setOAuthPlatformCookie(response, isNativeOAuthRequest(request));

  const linkToken = request.nextUrl.searchParams.get("linkToken");
  if (linkToken) {
    const linkUserId = resolveNativeLinkUserId(linkToken);
    if (linkUserId) setOAuthLinkUserCookie(response, linkUserId);
  }

  return response;
}

// DELETE /api/auth/google → 取消綁定。僅在使用者仍有密碼可登入時允許，避免帳號被鎖死。
export async function DELETE(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ message: "找不到使用者" }, { status: 404 });
  if (!user.googleId) return NextResponse.json({ message: "尚未綁定 Google 帳號" }, { status: 400 });
  if (!user.passwordHash) return NextResponse.json({ message: "此帳號沒有設定密碼，取消綁定會導致無法登入，請先聯絡管理員" }, { status: 400 });

  await prisma.user.update({ where: { id: userId }, data: { googleId: null } });
  return NextResponse.json({ message: "已取消綁定 Google 帳號" });
}
