export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { exchangeGoogleCode, fetchGoogleUserInfo } from "@/lib/googleAuth";
import { createToken, getUserIdFromRequest } from "@/lib/auth";

declare global {
  var prisma: PrismaClient | undefined;
}
const prisma = globalThis.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;

function redirectWithError(request: NextRequest, message: string) {
  const url = new URL("/", request.url);
  url.searchParams.set("authError", message);
  const response = NextResponse.redirect(url);
  response.cookies.set("google-oauth-state", "", { maxAge: 0, path: "/" });
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
    const tokens = await exchangeGoogleCode(code);
    const profile = await fetchGoogleUserInfo(tokens.access_token);
    if (!profile.email || !profile.email_verified) {
      return redirectWithError(request, "此 Google 帳號的電子郵件尚未驗證");
    }

    const currentUserId = getUserIdFromRequest(request);

    if (currentUserId) {
      // 綁定流程：使用者已登入，把 Google 帳號綁到目前這個帳號
      const conflictUser = await prisma.user.findUnique({ where: { googleId: profile.sub } });
      if (conflictUser && conflictUser.id !== currentUserId) {
        return redirectWithError(request, "此 Google 帳號已綁定其他帳號");
      }
      await prisma.user.update({ where: { id: currentUserId }, data: { googleId: profile.sub } });
      const response = NextResponse.redirect(new URL("/?linked=google", request.url));
      response.cookies.set("google-oauth-state", "", { maxAge: 0, path: "/" });
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
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.set("auth-token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 60 * 24 * 7, path: "/" });
    response.cookies.set("google-oauth-state", "", { maxAge: 0, path: "/" });
    return response;
  } catch (err) {
    console.error("Google OAuth callback failed:", err);
    return redirectWithError(request, "Google 登入失敗，請稍後再試");
  }
}
