import { NextRequest } from "next/server";

// APP_BASE_URL 沒設定時，退而求其次用實際進來的 request 反推網域，
// 避免忘記設定環境變數時 OAuth 導向直接壞掉（redirect_uri 變成 localhost）。
export function getRequestOrigin(request: NextRequest): string {
  const proto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
  return `${proto}://${host}`;
}

// 站台實際對外的網域。優先用 APP_BASE_URL，沒設定才退而求其次用 request 反推
// —— 反向代理（例如 cloudflared）若沒把 Host header 轉成對外網域，request.url
// 就會是內部的 localhost:port，直接拿去組 redirect 網址會導去使用者連不到的地方。
export function getAppOrigin(request: NextRequest): string {
  return (process.env.APP_BASE_URL || getRequestOrigin(request)).replace(/\/$/, "");
}
