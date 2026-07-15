export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { buildAppleAuthUrl, isAppleSignInConfigured } from "@/lib/appleAuth";
import { getUserIdFromRequest } from "@/lib/auth";

import { prisma } from "@/lib/prisma";

// GET /api/auth/apple → 導向 Apple 登入頁。已登入的使用者走綁定流程（同 Google 的作法）。
export async function GET(request: NextRequest) {
  if (!isAppleSignInConfigured()) {
    return NextResponse.json({ message: "尚未設定 Sign in with Apple 憑證" }, { status: 500 });
  }
  const state = crypto.randomBytes(16).toString("hex");
  const response = NextResponse.redirect(buildAppleAuthUrl(state, request));
  response.cookies.set("apple-oauth-state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" });
  return response;
}

// DELETE /api/auth/apple → 取消綁定。僅在使用者仍有密碼可登入時允許，避免帳號被鎖死。
export async function DELETE(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ message: "找不到使用者" }, { status: 404 });
  if (!user.appleId) return NextResponse.json({ message: "尚未綁定 Apple 帳號" }, { status: 400 });
  if (!user.passwordHash) return NextResponse.json({ message: "此帳號沒有設定密碼，取消綁定會導致無法登入，請先聯絡管理員" }, { status: 400 });

  await prisma.user.update({ where: { id: userId }, data: { appleId: null } });
  return NextResponse.json({ message: "已取消綁定 Apple 帳號" });
}
