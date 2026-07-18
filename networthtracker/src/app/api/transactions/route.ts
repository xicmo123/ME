export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";


import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  try {
    const transactions = await prisma.transaction.findMany({
      where: { userId },
      take: 20,
      orderBy: { date: "desc" },
      include: { account: true },
    });

    return NextResponse.json(transactions);
  } catch (error) {
    console.error("Transactions lookup failed:", error);
    return NextResponse.json(
      { message: "Failed to fetch transactions.", error: String(error) },
      { status: 500 }
    );
  }
}

// POST：手動記帳（支出／收入），指定要從哪個現金／銀行帳戶扣款或存入，
// 同步更新該帳戶餘額並留下一筆 Transaction，跟自動扣款（AUTO_DEDUCTION）共用同一張表。
export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Invalid JSON payload." }, { status: 400 });
  }

  const { accountId, type, amount, description, date } = body as {
    accountId?: string; type?: string; amount?: number | string; description?: string; date?: string;
  };

  if (!accountId || (type !== "WITHDRAWAL" && type !== "DEPOSIT")) {
    return NextResponse.json({ message: "請提供帳戶與收支類型（WITHDRAWAL / DEPOSIT）。" }, { status: 400 });
  }

  const amountValue = Number(amount);
  if (!Number.isFinite(amountValue) || amountValue <= 0) {
    return NextResponse.json({ message: "金額必須是大於 0 的數字。" }, { status: 400 });
  }

  const account = await prisma.account.findFirst({
    where: { id: accountId, userId, isActive: true, category: { in: ["CASH", "BANK_ACCOUNT"] } },
  });
  if (!account) return NextResponse.json({ message: "帳戶不存在或不是現金／銀行帳戶。" }, { status: 400 });

  const trimmedDescription = typeof description === "string" ? description.trim() : "";
  const txDate = typeof date === "string" && date.trim() ? new Date(date) : new Date();
  if (Number.isNaN(txDate.getTime())) return NextResponse.json({ message: "日期格式不正確。" }, { status: 400 });

  const delta = type === "WITHDRAWAL" ? -amountValue : amountValue;
  const nextValue = Number(account.currentValue ?? 0) + delta;

  const transaction = await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: account.id },
      data: { quantity: nextValue, currentValue: nextValue },
    });

    return tx.transaction.create({
      data: {
        userId,
        accountId: account.id,
        type: type as "WITHDRAWAL" | "DEPOSIT",
        amount: amountValue,
        description: trimmedDescription || null,
        date: txDate,
      },
      include: { account: true },
    });
  });

  return NextResponse.json(transaction, { status: 201 });
}