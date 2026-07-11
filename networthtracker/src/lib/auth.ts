// src/lib/auth.ts
// 所有 API 都用这个函数来验证登入状态，拿到 userId

import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET 環境變數未設定，拒絕啟動（避免用不安全的預設密鑰簽發登入憑證）");
  }
  return secret;
}

const JWT_SECRET = requireJwtSecret();

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