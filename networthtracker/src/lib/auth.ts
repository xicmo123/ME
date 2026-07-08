// src/lib/auth.ts
// 所有 API 都用这个函数来验证登入状态，拿到 userId

import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_change_this";

export function getUserIdFromRequest(request: NextRequest): string | null {
  try {
    // 从 cookie 里拿 token
    const token = request.cookies.get("auth-token")?.value;
    if (!token) return null;

    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    return payload.userId || null;
  } catch {
    return null;
  }
}

export function createToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}