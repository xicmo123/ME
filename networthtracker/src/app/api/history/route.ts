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
    const history = await prisma.assetHistory.findMany({
      where: { userId },
      orderBy: { date: "asc" },
    });
    return NextResponse.json(history);
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
    const snapshotDate = new Date(date);
    snapshotDate.setHours(0, 0, 0, 0);
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
