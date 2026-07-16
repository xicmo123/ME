export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { getManualSyncStatusForUser } from "@/lib/entitlements";

// GET /api/sync-status → Free 方案「剩餘手動同步次數」查詢，前端在按下更新之前顯示用，
// 避免使用者不知道自己還剩幾次，按了才被 402 擋下來。
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  const status = await getManualSyncStatusForUser(userId);
  return NextResponse.json(status);
}
