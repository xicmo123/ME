import { NextRequest } from "next/server";

// 內部排程專用 API（會動到全部使用者的資料）用這個判斷呼叫者是不是 instrumentation.ts 的 cron，
// 避免這些端點被任何人從外部隨時呼叫來濫用（觸發扣款、灌爆外部報價 API 額度等）。
export function isTrustedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("x-cron-secret") === secret;
}
