export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getUserIdFromRequest } from "@/lib/auth";

declare global {
  var prisma: PrismaClient | undefined;
}

const prisma = globalThis.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  try {
    const accounts = await prisma.account.findMany({ where: { isActive: true, userId } });

    const totalAssets = accounts.filter((a) => a.type === "ASSET").reduce((sum, a) => sum + Number(a.currentValue ?? 0), 0);
    const totalLiabilities = accounts.filter((a) => a.type === "LIABILITY").reduce((sum, a) => sum + Number(a.currentValue ?? 0), 0);
    const netWorth = totalAssets - totalLiabilities;

    const now = new Date();
    const twDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const snapshotDate = new Date(`${twDateStr}T00:00:00.000Z`);

    const result = await prisma.assetHistory.upsert({
      where: { userId_date: { userId, date: snapshotDate } },
      update: { totalAssets, totalLiabilities, netWorth, breakdown: "[]" },
      create: { userId, date: snapshotDate, totalAssets, totalLiabilities, netWorth, breakdown: "[]" },
    });

    return NextResponse.json({ message: "每日淨資產快照已記錄", date: twDateStr, totalAssets, totalLiabilities, netWorth, result });
  } catch (error) {
    return NextResponse.json({ message: "快照失敗", error: String(error) }, { status: 500 });
  }
}
