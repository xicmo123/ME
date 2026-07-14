// Sign in with Apple helpers（web-based OAuth，走 Authorization Code + form_post，
// 跟 googleAuth.ts 對稱，方便 callback 路由重用同一套「登入/註冊/綁定」邏輯）。
//
// 需要在 Apple Developer 後台設定並填入以下環境變數才能啟用：
//   APPLE_CLIENT_ID      → Services ID（例如 com.zenoworth.app.web）
//   APPLE_TEAM_ID        → Apple Developer Team ID
//   APPLE_KEY_ID         → Sign in with Apple 用的 Key ID
//   APPLE_PRIVATE_KEY    → 對應 .p8 私鑰內容（含 BEGIN/END PRIVATE KEY，換行可用 \n 轉義）
// 這些是 Apple Developer 帳號層級的憑證，無法用程式產生，需使用者自行申請。

import { SignJWT, createRemoteJWKSet, jwtVerify } from "jose";
import { NextRequest } from "next/server";
import { getRequestOrigin } from "./requestOrigin";

const APPLE_AUTH_URL = "https://appleid.apple.com/auth/authorize";
const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";

const appleJwks = createRemoteJWKSet(new URL(APPLE_KEYS_URL));

export function isAppleSignInConfigured(): boolean {
  return !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY);
}

export function getAppleRedirectUri(request?: NextRequest): string {
  const base = process.env.APP_BASE_URL || (request ? getRequestOrigin(request) : "http://localhost:8000");
  return `${base.replace(/\/$/, "")}/api/auth/apple/callback`;
}

export function buildAppleAuthUrl(state: string, request?: NextRequest): string {
  const params = new URLSearchParams({
    client_id: process.env.APPLE_CLIENT_ID || "",
    redirect_uri: getAppleRedirectUri(request),
    response_type: "code",
    response_mode: "form_post",
    scope: "name email",
    state,
  });
  return `${APPLE_AUTH_URL}?${params.toString()}`;
}

// Apple 要求用 ES256 簽一個短效期 JWT 當作 OAuth client_secret，取代固定密鑰。
async function generateClientSecret(): Promise<string> {
  const privateKey = (process.env.APPLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const { importPKCS8 } = await import("jose");
  const key = await importPKCS8(privateKey, "ES256");

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: process.env.APPLE_KEY_ID })
    .setIssuer(process.env.APPLE_TEAM_ID || "")
    .setIssuedAt()
    .setExpirationTime("5m")
    .setAudience("https://appleid.apple.com")
    .setSubject(process.env.APPLE_CLIENT_ID || "")
    .sign(key);
}

export async function exchangeAppleCode(code: string, request?: NextRequest): Promise<{ id_token: string }> {
  const clientSecret = await generateClientSecret();
  const res = await fetch(APPLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.APPLE_CLIENT_ID || "",
      client_secret: clientSecret,
      redirect_uri: getAppleRedirectUri(request),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Apple token exchange failed: ${await res.text()}`);
  return res.json();
}

export async function verifyAppleIdToken(idToken: string): Promise<{ sub: string; email?: string; email_verified?: boolean | string }> {
  const { payload } = await jwtVerify(idToken, appleJwks, {
    issuer: "https://appleid.apple.com",
    audience: process.env.APPLE_CLIENT_ID || "",
  });
  return payload as { sub: string; email?: string; email_verified?: boolean | string };
}
