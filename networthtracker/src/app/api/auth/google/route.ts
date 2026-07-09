export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { buildGoogleAuthUrl } from "@/lib/googleAuth";
import { getUserIdFromRequest } from "@/lib/auth";

declare global {
  var prisma: PrismaClient | undefined;
}
const prisma = globalThis.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;

// GET /api/auth/google → 導向 Google 登入頁。若使用者當下已登入（帶著 auth-token），
// callback 會偵測到並改走「綁定」流程，這裡不需要另外傳參數區分。
export async function GET(request: NextRequest) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return NextResponse.json({ message: "尚未設定 Google OAuth 憑證" }, { status: 500 });
  }
  const state = crypto.randomBytes(16).toString("hex");
  const response = NextResponse.redirect(buildGoogleAuthUrl(state));
  response.cookies.set("google-oauth-state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" });
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
