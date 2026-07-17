export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createNativeLinkToken, getUserIdFromRequest } from "@/lib/auth";

// iOS App 版「綁定 Google/Apple 帳號」流程的第一步：由主 WKWebView 自己打這支 API
// （這裡讀得到 auth-token cookie），換一個短效 linkToken 帶在 OAuth 起始網址上，
// 讓跑在獨立瀏覽情境（ASWebAuthenticationSession）裡的 callback 知道要綁定給哪個使用者。
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  return NextResponse.json({ token: createNativeLinkToken(userId) });
}
