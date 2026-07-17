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

// iOS App 版登入：OAuth callback 是在 ASWebAuthenticationSession 的獨立瀏覽情境裡發生的，
// 那邊設下的 cookie 不保證跟 App 主要 WKWebView 共用同一份 cookie store。所以 callback
// 不直接發 auth-token，而是先發一個短效的一次性交換碼，透過 callback 網址帶回 App，
// 再由主 WKWebView 自己打 /api/auth/native-exchange 換發 auth-token——這樣 cookie
// 一定是主 WKWebView 自己的請求設下的，不依賴任何跨情境共享的假設。
export function createNativeExchangeToken(userId: string): string {
  return jwt.sign({ userId, purpose: "native-exchange" }, JWT_SECRET, { expiresIn: "60s" });
}

export function verifyNativeExchangeToken(code: string): string | null {
  try {
    const payload = jwt.verify(code, JWT_SECRET) as { userId: string; purpose?: string };
    if (payload.purpose !== "native-exchange" || !payload.userId) return null;
    return payload.userId;
  } catch {
    return null;
  }
}

// 綁定既有帳號：App 主 WKWebView 自己讀得到 auth-token，先用它換一個短效 linkToken，
// 帶在 OAuth 起始網址上，讓跑在獨立瀏覽情境裡的 callback 知道「這次要綁定給哪個使用者」。
export function createNativeLinkToken(userId: string): string {
  return jwt.sign({ userId, purpose: "native-link" }, JWT_SECRET, { expiresIn: "60s" });
}

export function verifyNativeLinkToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; purpose?: string };
    if (payload.purpose !== "native-link" || !payload.userId) return null;
    return payload.userId;
  } catch {
    return null;
  }
}