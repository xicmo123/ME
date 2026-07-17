import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { fetchRevenueCatSubscriber, applyProStatus } from "@/lib/revenuecat";
import { getEntitlementsForUser } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

// 購買/還原成功後，前端立刻呼叫這支，不用乾等 webhook 送達（webhook 可能晚幾秒到幾分鐘才到）。
// 一樣是回頭問 RevenueCat API 拿權威狀態，不直接信任前端回報「我剛買成功了」這句話。
export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  try {
    const subscriber = await fetchRevenueCatSubscriber(userId);
    if (subscriber) await applyProStatus(userId, subscriber.entitlements);
  } catch (error) {
    console.error("Purchase sync 失敗:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ message: "同步失敗，請稍後再試" }, { status: 500 });
  }

  const entitlements = await getEntitlementsForUser(userId);
  return NextResponse.json({ entitlements });
}
