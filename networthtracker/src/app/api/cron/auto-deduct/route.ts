import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getUserIdFromRequest } from "@/lib/auth";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prisma = globalThis.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  const today = new Date();
  const deductionDay = today.getDate();

  try {
    const liabilities = await prisma.account.findMany({
      where: {
        userId,
        type: "LIABILITY",
        isActive: true,
        deductionDate: deductionDay,
      },
    });

    if (liabilities.length === 0) {
      return NextResponse.json({
        message: "No liabilities due for automatic deduction today.",
        processedAccounts: [],
      });
    }

    const processedAccounts: Array<{ id: string; name: string }> = [];

    for (const liability of liabilities) {
      if (!liability.monthlyDeductionAmount || liability.monthlyDeductionAmount <= 0) {
        continue;
      }

      const deductionAmount = Number(liability.monthlyDeductionAmount);
      const nextQuantity = Number(liability.quantity ?? 0) - deductionAmount;

      await prisma.$transaction(async (tx) => {
        const updatedLiability = await tx.account.update({
          where: { id: liability.id },
          data: {
            quantity: nextQuantity,
            currentValue: nextQuantity,
          },
        });

        await tx.transaction.create({
          data: {
            userId,                    // 🌟 新增
            accountId: updatedLiability.id,
            type: "AUTO_DEDUCTION",
            amount: deductionAmount,
            description: `Automatic deduction for ${updatedLiability.name}`,
          },
        });
      });

      processedAccounts.push({ id: liability.id, name: liability.name });
    }

    return NextResponse.json({
      message: "Automatic deductions processed successfully.",
      processedAccounts,
    });
  } catch (error) {
    console.error("Auto deduction failed:", error);
    return NextResponse.json(
      { message: "Failed to process automatic deductions.", error: String(error) },
      { status: 500 }
    );
  }
}