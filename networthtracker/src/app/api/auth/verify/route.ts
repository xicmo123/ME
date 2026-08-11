export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createToken, setAuthCookie } from "@/lib/auth";
import { getAppOrigin } from "@/lib/requestOrigin";
import { prisma } from "@/lib/prisma";

// GET /api/auth/verify?token=... → 驗證信裡的連結
// 驗證成功後直接發登入 cookie 並導回首頁，使用者不用再輸入一次帳密。
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const origin = getAppOrigin(request);

  const fail = (message: string) => {
    const url = new URL("/", origin);
    url.searchParams.set("authError", message);
    return NextResponse.redirect(url.toString());
  };

  if (!token) return fail("驗證連結不完整，請重新申請驗證信");

  const user = await prisma.user.findFirst({
    where: { verificationToken: token },
    select: { id: true, verificationTokenExpires: true, emailVerified: true },
  });

  if (!user) return fail("驗證連結無效或已被使用，請重新申請驗證信");

  if (user.verificationTokenExpires && user.verificationTokenExpires.getTime() < Date.now()) {
    return fail("驗證連結已過期，請重新申請驗證信");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, verificationToken: null, verificationTokenExpires: null },
  });

  const url = new URL("/", origin);
  url.searchParams.set("verified", "1");
  const response = NextResponse.redirect(url.toString());
  setAuthCookie(response, createToken(user.id));
  return response;
}
