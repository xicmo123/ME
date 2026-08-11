// Google OAuth 2.0 helpers（Authorization Code flow）

import { NextRequest } from "next/server";
import { DEFAULT_APP_ORIGIN, getRequestOrigin } from "./requestOrigin";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export function getGoogleRedirectUri(request?: NextRequest): string {
  const base = process.env.APP_BASE_URL || (request ? getRequestOrigin(request) : DEFAULT_APP_ORIGIN);
  return `${base.replace(/\/$/, "")}/api/auth/google/callback`;
}

export function buildGoogleAuthUrl(state: string, request?: NextRequest): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: getGoogleRedirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string, request?: NextRequest): Promise<{ access_token: string }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: getGoogleRedirectUri(request),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  return res.json();
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<{ sub: string; email: string; email_verified: boolean; name?: string }> {
  const res = await fetch(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Google userinfo fetch failed: ${await res.text()}`);
  return res.json();
}
