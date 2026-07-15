export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createToken } from "@/lib/auth";
import bcrypt from "bcryptjs";


import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    if (!token) return NextResponse.json({ user: null }, { status: 401 });
    const jwt = await import("jsonwebtoken");
    const payload = jwt.default.verify(token, process.env.JWT_SECRET || "fallback_secret_change_this") as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, emailVerified: true, createdAt: true, googleId: true, appleId: true, passwordHash: true },
    });
    if (!user) return NextResponse.json({ user: null }, { status: 401 });
    const { googleId, appleId, passwordHash, ...rest } = user;
    return NextResponse.json({ user: { ...rest, hasGoogle: !!googleId, hasApple: !!appleId, hasPassword: !!passwordHash } });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ message: "Invalid request" }, { status: 400 });
  const { action, email, password } = body as { action: "login" | "register"; email: string; password: string };
  if (!email || !password) return NextResponse.json({ message: "請填寫郵箱和密碼" }, { status: 400 });

  if (action === "register") {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ message: "此郵箱已被註冊" }, { status: 409 });
    if (password.length < 8) return NextResponse.json({ message: "密碼至少需要 8 個字元" }, { status: 400 });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, passwordHash, emailVerified: true } });
    const token = createToken(user.id);
    const response = NextResponse.json({ message: "註冊成功", user: { id: user.id, email: user.email } }, { status: 201 });
    response.cookies.set("auth-token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 60 * 24 * 7, path: "/" });
    return response;
  }

  if (action === "login") {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) return NextResponse.json({ message: "郵箱或密碼錯誤" }, { status: 401 });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return NextResponse.json({ message: "郵箱或密碼錯誤" }, { status: 401 });
    const token = createToken(user.id);
    const response = NextResponse.json({ message: "登入成功", user: { id: user.id, email: user.email } });
    response.cookies.set("auth-token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 60 * 24 * 7, path: "/" });
    return response;
  }

  return NextResponse.json({ message: "Unknown action" }, { status: 400 });
}

export async function DELETE() {
  const response = NextResponse.json({ message: "已登出" });
  response.cookies.set("auth-token", "", { httpOnly: true, maxAge: 0, path: "/" });
  return response;
}
