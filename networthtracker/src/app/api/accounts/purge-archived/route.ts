import { NextRequest, NextResponse } from "next/server";
import { isTrustedCronRequest } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 每天由 instrumentation.ts 的排程呼叫：已封存（isActive:false）滿 60 天的帳戶，
// 連同其交易紀錄（onDelete: Cascade）一併永久刪除，只有內部 cron 能觸發。
export async function GET(request: NextRequest) {
  if (!isTrustedCronRequest(request)) {
    return NextResponse.json({ message: "未授權" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const toPurge = await prisma.account.findMany({
    where: { isActive: false, archivedAt: { lte: cutoff } },
    select: { id: true },
  });

  if (toPurge.length === 0) {
    return NextResponse.json({ purged: 0 });
  }

  const result = await prisma.account.deleteMany({
    where: { id: { in: toPurge.map((a) => a.id) } },
  });

  return NextResponse.json({ purged: result.count });
}
