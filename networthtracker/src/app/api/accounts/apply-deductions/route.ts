export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prisma = globalThis.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;

// 每天觸發一次：檢查所有「負債」帳戶，如果今天（台灣時間）是設定的扣款日，
// 就把 quantity（=總金額）跟 currentValue 各自扣掉 monthlyDeductionAmount，
// 下限是 0（不會扣成負數）。
//
// 扣款日邏輯：
// - deductionDate 直接等於今天的日期（1~31）就觸發
// - 如果 deductionDate 超過當月天數（例如設 31 號，但 2 月只有 28 天），
//   則在當月最後一天觸發，避免有些月份永遠扣不到款
export async function GET() {
  const results = {
    timestamp: new Date().toISOString(),
    deducted: [] as Array<{ id: string; name: string; before: number; after: number; deductionAmount: number }>,
    skipped: 0,
    errors: [] as string[],
  };

  try {
    const now = new Date();
    const twParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .reduce((acc: Record<string, string>, p) => ({ ...acc, [p.type]: p.value }), {});

    const todayDay = Number(twParts.day);
    const todayYear = Number(twParts.year);
    const todayMonth = Number(twParts.month); // 1-12
    const lastDayOfMonth = new Date(todayYear, todayMonth, 0).getDate();

    const liabilityAccounts = await prisma.account.findMany({
      where: {
        isActive: true,
        type: "LIABILITY",
      },
    });

    for (const account of liabilityAccounts) {
      const deductionAmount = Number(account.monthlyDeductionAmount || 0);
      const deductionDate = Number(account.deductionDate || 0);

      if (!deductionAmount || !deductionDate) {
        results.skipped++;
        continue;
      }

      // 觸發條件：今天剛好是扣款日，或今天是當月最後一天且扣款日超過當月天數
      const isDeductionDay =
        todayDay === deductionDate || (todayDay === lastDayOfMonth && deductionDate > lastDayOfMonth);

      if (!isDeductionDay) {
        results.skipped++;
        continue;
      }

      try {
        const before = Number(account.quantity || 0);
        const after = Math.max(0, before - deductionAmount);

        await prisma.account.update({
          where: { id: account.id },
          data: {
            quantity: after,
            currentValue: after,
          },
        });

        results.deducted.push({ id: account.id, name: account.name, before, after, deductionAmount });
      } catch (error) {
        const errorMsg = `Deduction failed for ${account.name}: ${error instanceof Error ? error.message : String(error)}`;
        results.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Apply deductions failed:", error);
    return NextResponse.json(
      { message: "自動扣款執行失敗", error: String(error) },
      { status: 500 }
    );
  }
}