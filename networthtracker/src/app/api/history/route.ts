export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";


import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  // 走勢圖最長只畫一年，年度報告也只看今年，所以沒有必要每次開 App 都把全部歷史傳回來。
  // 先前是無上限的 findMany，使用者用兩年就是 730 筆全量、每次進 App 傳一次。
  // 預設多給一些緩衝（涵蓋「自成立以來年化報酬」需要的最早一筆），並允許呼叫端指定天數。
  const daysParam = Number(request.nextUrl.searchParams.get("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 3650) : 400;
  const since = new Date(Date.now() - days * 86_400_000);

  try {
    const [history, earliest] = await Promise.all([
      prisma.assetHistory.findMany({
        where: { userId, date: { gte: since } },
        orderBy: { date: "asc" },
      }),
      // CAGR 需要「最早一筆」當基準，單獨補一筆回來就好，不用把中間全部載入
      prisma.assetHistory.findFirst({
        where: { userId },
        orderBy: { date: "asc" },
      }),
    ]);

    const alreadyIncluded = earliest && history.some((point) => point.id === earliest.id);
    return NextResponse.json(earliest && !alreadyIncluded ? [earliest, ...history] : history);
  } catch (error) {
    return NextResponse.json({ message: "Failed to fetch history.", error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  try {
    const body = await request.json();
    const { date, netWorth } = body;
    if (!date || netWorth === undefined) {
      return NextResponse.json({ message: "缺少必要參數" }, { status: 400 });
    }
    const nWorth = Number(netWorth);
    // 與 /api/history/snapshot 對齊：以台北日期正規化，避免伺服器時區不同導致日期錯位
    const twDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));
    const snapshotDate = new Date(`${twDateStr}T00:00:00.000Z`);
    const result = await prisma.assetHistory.upsert({
      where: { userId_date: { userId, date: snapshotDate } },
      update: { totalAssets: nWorth, totalLiabilities: 0, netWorth: nWorth, breakdown: "[]" },
      create: { userId, date: snapshotDate, totalAssets: nWorth, totalLiabilities: 0, netWorth: nWorth, breakdown: "[]" },
    });
    return NextResponse.json({ message: "歷史淨資產補登成功", result });
  } catch (err) {
    return NextResponse.json({ message: "補登失敗", error: String(err) }, { status: 500 });
  }
}
