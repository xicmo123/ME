export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { isTrustedCronRequest } from "@/lib/cron-auth";
import { getEntitlementsForUser, computeLockedAccountIds } from "@/lib/entitlements";


import { prisma } from "@/lib/prisma";

async function snapshotForUser(userId: string, twDateStr: string, snapshotDate: Date) {
  const accounts = await prisma.account.findMany({ where: { isActive: true, userId } });

  // 降級後被鎖定的帳戶不計入快照，跟即時淨值計算保持一致，避免走勢圖出現「解鎖前」虛高的數字
  const entitlements = await getEntitlementsForUser(userId);
  const lockedAccountIds = computeLockedAccountIds(accounts, entitlements.limits.maxAccounts);
  const unlockedAccounts = accounts.filter((a) => !lockedAccountIds.has(a.id));

  const totalAssets = unlockedAccounts.filter((a) => a.type === "ASSET").reduce((sum, a) => sum + Number(a.currentValue ?? 0), 0);
  const totalLiabilities = unlockedAccounts.filter((a) => a.type === "LIABILITY").reduce((sum, a) => sum + Number(a.currentValue ?? 0), 0);
  const netWorth = totalAssets - totalLiabilities;

  const result = await prisma.assetHistory.upsert({
    where: { userId_date: { userId, date: snapshotDate } },
    update: { totalAssets, totalLiabilities, netWorth, breakdown: "[]" },
    create: { userId, date: snapshotDate, totalAssets, totalLiabilities, netWorth, breakdown: "[]" },
  });

  return { totalAssets, totalLiabilities, netWorth, result };
}

// 這支 API 有兩種呼叫方式：
// 1. 使用者登入瀏覽器呼叫（帶 auth-token cookie）→ 只記錄該使用者一筆快照
// 2. instrumentation.ts 的每日 cron 呼叫（沒有 cookie，伺服器對伺服器）→ 沒有登入狀態可判斷，
//    所以改成遍歷所有使用者各自記一筆快照，否則 cron 會被 401 擋掉、每天都靜靜失敗
export async function GET(request: NextRequest) {
  const now = new Date();
  const twDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const snapshotDate = new Date(`${twDateStr}T00:00:00.000Z`);

  const userId = getUserIdFromRequest(request);

  try {
    if (userId) {
      const { totalAssets, totalLiabilities, netWorth, result } = await snapshotForUser(userId, twDateStr, snapshotDate);
      return NextResponse.json({ message: "每日淨資產快照已記錄", date: twDateStr, totalAssets, totalLiabilities, netWorth, result });
    }

    // 沒有登入 cookie 的請求，只信任內部 cron（會為全部使用者記錄快照），避免外部任意呼叫者觸發全體快照
    if (!isTrustedCronRequest(request)) {
      return NextResponse.json({ message: "未授權" }, { status: 401 });
    }

    const users = await prisma.user.findMany({ select: { id: true } });
    const errors: string[] = [];
    let succeeded = 0;
    for (const u of users) {
      try {
        await snapshotForUser(u.id, twDateStr, snapshotDate);
        succeeded++;
      } catch (error) {
        errors.push(`${u.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return NextResponse.json({
      message: `每日淨資產快照已為 ${succeeded}/${users.length} 位使用者記錄`,
      date: twDateStr,
      succeeded,
      total: users.length,
      ...(errors.length ? { errors } : {}),
    });
  } catch (error) {
    return NextResponse.json({ message: "快照失敗", error: String(error) }, { status: 500 });
  }
}
