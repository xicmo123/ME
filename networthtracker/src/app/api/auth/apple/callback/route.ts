export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { exchangeAppleCode, verifyAppleIdToken } from "@/lib/appleAuth";
import { createToken, getUserIdFromRequest } from "@/lib/auth";
import { getAppOrigin } from "@/lib/requestOrigin";

declare global {
  var prisma: PrismaClient | undefined;
}
const prisma = globalThis.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;

function redirectWithError(request: NextRequest, message: string) {
  const url = new URL("/", getAppOrigin(request));
  url.searchParams.set("authError", message);
  const response = NextResponse.redirect(url, { status: 303 });
  response.cookies.set("apple-oauth-state", "", { maxAge: 0, path: "/" });
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

    const currentUserId = getUserIdFromRequest(request);

    if (currentUserId) {
      // 綁定流程：使用者已登入，把 Apple 帳號綁到目前這個帳號
      const conflictUser = await prisma.user.findUnique({ where: { appleId: claims.sub } });
      if (conflictUser && conflictUser.id !== currentUserId) {
        return redirectWithError(request, "此 Apple 帳號已綁定其他帳號");
      }
      await prisma.user.update({ where: { id: currentUserId }, data: { appleId: claims.sub } });
      const response = NextResponse.redirect(new URL("/?linked=apple", getAppOrigin(request)), { status: 303 });
      response.cookies.set("apple-oauth-state", "", { maxAge: 0, path: "/" });
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

    const token = createToken(user.id);
    const response = NextResponse.redirect(new URL("/", getAppOrigin(request)), { status: 303 });
    response.cookies.set("auth-token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 60 * 24 * 7, path: "/" });
    response.cookies.set("apple-oauth-state", "", { maxAge: 0, path: "/" });
    return response;
  } catch (err) {
    console.error("Apple OAuth callback failed:", err);
    return redirectWithError(request, "Apple 登入失敗，請稍後再試");
  }
}
