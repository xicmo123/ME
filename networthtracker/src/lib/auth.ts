// src/lib/auth.ts
// 所有 API 都用这个函数来验证登入状态，拿到 userId

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export const AUTH_COOKIE_NAME = "auth-token";
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET 環境變數未設定，拒絕啟動（避免用不安全的預設密鑰簽發登入憑證）");
  }
  return secret;
}

const JWT_SECRET = requireJwtSecret();

// 兩種憑證來源：
// - 網頁版：httpOnly cookie。瀏覽器自動帶上，前端 JS 讀不到，最安全。
// - App 版：Authorization: Bearer。App 的 UI 是從 binary 載入的（origin 為 capacitor://localhost），
//   打 API 時屬於跨站請求，WKWebView 的 ITP 會擋掉第三方 cookie，所以 cookie 這條路在 App 裡走不通。
//   token 改由 App 存在原生 Keychain（見 src/lib/authToken.ts），每次請求自己帶上。
//
// 兩者簽的是同一種 JWT，驗證邏輯共用；cookie 優先，讓網頁版行為完全不變。
function readBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !value) return null;
  return value;
}

export function getUserIdFromRequest(request: NextRequest): string | null {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value ?? readBearerToken(request);
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; purpose?: string };
    // 短效的 native-exchange / native-link 交換碼用的是同一個密鑰，
    // 不擋掉的話它們會被當成正式的登入憑證使用。
    if (payload.purpose) return null;
    return payload.userId || null;
  } catch {
    return null;
  }
}

export function createToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

// 登入 cookie 的設定先前在 auth route、Google callback、Apple callback、native-exchange
// 四個地方各寫一份，改一個屬性（例如 sameSite）很容易漏掉其中一處。集中在這裡。
export function setAuthCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return response;
}

// 登入成功的統一出口：網頁版靠 Set-Cookie，App 版從 body 的 token 欄位拿。
// 兩者是同一個 JWT，只是送達方式不同。
export function authenticatedJson(
  body: Record<string, unknown>,
  userId: string,
  init?: ResponseInit
): NextResponse {
  const token = createToken(userId);
  return setAuthCookie(NextResponse.json({ ...body, token }, init), token);
}

export function clearAuthCookie(response: NextResponse): NextResponse {
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
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