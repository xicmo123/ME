import { NextRequest, NextResponse } from "next/server";
import { fetchRevenueCatSubscriber, applyProStatus } from "@/lib/revenuecat";

export const dynamic = "force-dynamic";

// RevenueCat webhook：訂閱狀態一有變化（購買/續訂/取消/到期/退款…）就會打這支。
// 在 RevenueCat 後台 Project settings → Webhooks 設定這個網址，並在「Authorization header value」
// 欄位填一組只有你知道的字串（存進 .env 的 REVENUECAT_WEBHOOK_AUTH_HEADER），兩邊要一致，
// 否則任何人都能偽造請求竄改使用者的訂閱狀態。
export async function POST(request: NextRequest) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH_HEADER;
  if (!expected) {
    console.error("REVENUECAT_WEBHOOK_AUTH_HEADER 未設定，拒絕所有 webhook 請求");
    return NextResponse.json({ message: "webhook 未設定" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== expected) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const appUserId = body?.event?.app_user_id;
  if (!appUserId) return NextResponse.json({ message: "missing app_user_id" }, { status: 400 });

  try {
    // webhook payload 本身的欄位不一定完整涵蓋所有 entitlement 細節，直接回頭問 RevenueCat
    // 拿這個使用者「現在」的權威狀態，比逐一解析事件型別可靠，也天然處理了亂序送達的問題。
    const subscriber = await fetchRevenueCatSubscriber(appUserId);
    if (subscriber) await applyProStatus(appUserId, subscriber.entitlements);
  } catch (error) {
    console.error("RevenueCat webhook 處理失敗:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ message: "internal error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
