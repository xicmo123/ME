export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 帳戶的新增／編輯／封存／刪除紀錄；跟 /api/transactions 的記帳／自動扣款紀錄，
// 前端依時間合併成同一份「近期紀錄」。
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  try {
    const logs = await prisma.activityLog.findMany({
      where: { userId },
      take: 20,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(logs);
  } catch (error) {
    console.error("Activity log lookup failed:", error);
    return NextResponse.json({ message: "Failed to fetch activity log.", error: String(error) }, { status: 500 });
  }
}
