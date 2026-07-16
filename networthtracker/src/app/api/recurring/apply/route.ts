export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { isTrustedCronRequest } from "@/lib/cron-auth";
import { calcPaidInstallments, calcLoanBalance } from "@/lib/loan";

import { prisma } from "@/lib/prisma";

// POST /api/recurring/apply → 套用「本月已到期、尚未入帳」的定期扣款。
// 兩種呼叫方式：
// 1. 前端在每次進入 App 時呼叫 → 只處理該登入使用者，讓使用者一開 App 就能看到最新入帳。
// 2. instrumentation.ts 的每日 cron 呼叫（沒有登入 cookie）→ 遍歷所有使用者各自套用，
//    確保就算使用者長時間沒開 App，扣款仍會準時發生在每日快照之前，走勢圖不會出現斷層。
// 冪等性：同一帳戶當月已有 AUTO_DEDUCTION 交易就跳過，兩種呼叫方式重複觸發也不會重複扣。
export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);

  if (!userId) {
    if (!isTrustedCronRequest(request)) {
      return NextResponse.json({ message: "未登入" }, { status: 401 });
    }

    const users = await prisma.user.findMany({ select: { id: true } });
    const errors: string[] = [];
    let processedTotal = 0;
    for (const u of users) {
      try {
        const result = await applyForUser(u.id);
        processedTotal += result.length;
      } catch (error) {
        errors.push(
          `${u.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return NextResponse.json({
      message: `定期扣款已為 ${users.length} 位使用者檢查，共處理 ${processedTotal} 筆`,
      processedTotal,
      ...(errors.length ? { errors } : {}),
    });
  }

  try {
    const processed = await applyForUser(userId);
    return NextResponse.json({ message: "ok", processed });
  } catch (error) {
    console.error("Recurring apply failed:", error);
    return NextResponse.json({ message: "定期扣款處理失敗" }, { status: 500 });
  }
}

async function applyForUser(userId: string) {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  // 扣款日大於當月天數時（例如設 31 號但當月只有 30 天），視為月底到期
  const daysInMonth = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0,
  ).getDate();

  const candidates = await prisma.account.findMany({
    where: {
      userId,
      isActive: true,
      monthlyDeductionAmount: { gt: 0 },
      deductionDate: { not: null },
    },
  });

  const processed: Array<{ id: string; name: string; amount: number }> = [];

  for (const acc of candidates) {
    const dueDay = Math.min(acc.deductionDate!, daysInMonth);
    if (today.getDate() < dueDay) continue;

    const alreadyApplied = await prisma.transaction.findFirst({
      where: {
        accountId: acc.id,
        type: "AUTO_DEDUCTION",
        date: { gte: monthStart },
      },
    });
    if (alreadyApplied) continue;

    const amount = Number(acc.monthlyDeductionAmount);
    const currentBalance = Number(acc.currentValue ?? 0);
    const hasFullLoanInfo =
      acc.type === "LIABILITY" && acc.loanStartDate != null;

    let interestPortion = 0;
    let principalPortion = amount;
    let nextValue: number;
    let installmentNo = 0;

    if (hasFullLoanInfo) {
      // 有填貸款起算日：本金（quantity）固定不變，餘額改由「本金＋已繳期數」公式即時算出，
      // 這期的本金/利息拆分，直接取算出來的期初/期末餘額差，確保跟卡片上顯示的餘額永遠一致。
      installmentNo = calcPaidInstallments(
        new Date(acc.loanStartDate!),
        acc.deductionDate!,
        today,
      );
      const cappedN =
        acc.loanTermMonths != null
          ? Math.min(installmentNo, acc.loanTermMonths)
          : installmentNo;
      const principal = Number(acc.quantity ?? 0);
      const balanceBefore = calcLoanBalance(
        principal,
        amount,
        acc.interestRate,
        Math.max(0, cappedN - 1),
      );
      const balanceAfter = calcLoanBalance(
        principal,
        amount,
        acc.interestRate,
        cappedN,
      );
      principalPortion = balanceBefore - balanceAfter;
      interestPortion = amount - principalPortion;
      nextValue = balanceAfter;
    } else {
      // 沒填起算日：維持舊行為，利率選填時用「目前餘額 × 月利率」拆出這期利息，本金 = 扣款金額 - 利息；
      // 沒填利率就整筆當本金扣。
      if (
        acc.type === "LIABILITY" &&
        acc.interestRate != null &&
        acc.interestRate > 0
      ) {
        interestPortion = currentBalance * (acc.interestRate / 100 / 12);
        principalPortion = amount - interestPortion;
      }
      nextValue = Math.max(0, currentBalance - principalPortion);

      if (acc.loanTermMonths != null) {
        const paidSoFar = await prisma.transaction.count({
          where: { accountId: acc.id, type: "AUTO_DEDUCTION" },
        });
        installmentNo = paidSoFar + 1;
      }
    }

    // 期數進度是選填的：只有填了總期數才顯示「第 X/N 期」
    const installmentSuffix =
      acc.loanTermMonths != null
        ? `（第 ${Math.min(installmentNo, acc.loanTermMonths)}/${acc.loanTermMonths} 期）`
        : "";

    await prisma.$transaction(async (tx) => {
      // 有貸款起算日的帳戶，本金（quantity）不變，只更新算出來的餘額；沒有的話沿用舊行為兩者一起改
      await tx.account.update({
        where: { id: acc.id },
        data: hasFullLoanInfo
          ? { currentValue: nextValue }
          : { quantity: nextValue, currentValue: nextValue },
      });

      await tx.transaction.create({
        data: {
          userId,
          accountId: acc.id,
          type: "AUTO_DEDUCTION",
          amount,
          // 有拆分利息時，quantity 存本金、price 存利息，方便前端顯示明細；沒填利率就都是 null（沿用舊行為）
          quantity: interestPortion > 0 ? principalPortion : null,
          price: interestPortion > 0 ? interestPortion : null,
          description: `每月定期扣款（${acc.name}）${installmentSuffix}`,
        },
      });

      // 若指定了扣款來源帳戶，同步減少該帳戶餘額並留下紀錄
      if (acc.deductFromAccountId) {
        const source = await tx.account.findFirst({
          where: { id: acc.deductFromAccountId, userId },
        });
        if (source) {
          const sourceNext = Number(source.currentValue ?? 0) - amount;
          await tx.account.update({
            where: { id: source.id },
            data: { quantity: sourceNext, currentValue: sourceNext },
          });
          await tx.transaction.create({
            data: {
              userId,
              accountId: source.id,
              type: "WITHDRAWAL",
              amount,
              description: `定期扣款轉出 → ${acc.name}`,
            },
          });
        }
      }
    });

    processed.push({ id: acc.id, name: acc.name, amount });
  }

  return processed;
}
