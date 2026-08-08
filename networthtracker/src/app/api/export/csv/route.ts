export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { getEntitlementsForUser } from "@/lib/entitlements";
import { todayInTaipei, toTaipeiDateString } from "@/lib/date";
import { resolveAccountValue } from "@/lib/loan";
import { prisma } from "@/lib/prisma";

// CSV 匯出移到後端的兩個理由：
// 1. 方案比較表把它列為 Pro 專屬，但先前整段是在前端跑的，完全沒有檢查權限——賣了卻沒鎖。
//    只在前端擋是擋不住的，門檻必須在伺服器端。
// 2. 前端只拿得到「目前載入到的」資料；後端可以直接匯出完整的帳戶、歷史與交易紀錄。

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toRow(cells: unknown[]): string {
  return cells.map(escapeCsvCell).join(",");
}

const CATEGORY_LABELS: Record<string, string> = {
  CASH: "現金", BANK_ACCOUNT: "銀行帳戶", TAIWAN_STOCK: "台股", US_STOCK: "美股",
  JAPAN_STOCK: "日股", KOREA_STOCK: "韓股", CRYPTO: "虛擬貨幣", FIXED_ASSET: "固定資產",
  RECEIVABLE: "應收款", PAYABLE: "應付款", MORTGAGE: "房貸", CAR_LOAN: "車貸", CREDIT_LOAN: "信用貸款",
};

const TRANSACTION_LABELS: Record<string, string> = {
  DEPOSIT: "存入", WITHDRAWAL: "轉出", BUY: "買入", SELL: "賣出",
  LOAN_PAYMENT: "還款", AUTO_DEDUCTION: "自動扣款",
};

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  const entitlements = await getEntitlementsForUser(userId);
  if (!entitlements.features.csvExport) {
    return NextResponse.json(
      {
        message: "CSV 報表匯出是 Pro 專屬功能，升級 Pro 即可把完整的資產、歷史與交易紀錄帶著走。",
        code: "UPGRADE_REQUIRED",
        feature: "csvExport",
      },
      { status: 402 }
    );
  }

  const [accounts, history, transactions] = await Promise.all([
    prisma.account.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.assetHistory.findMany({ where: { userId }, orderBy: { date: "asc" } }),
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { date: "asc" },
      include: { account: { select: { name: true } } },
    }),
  ]);

  const lines: string[] = [];

  lines.push("資產清單");
  lines.push(toRow(["名稱", "類型", "分類", "代號", "數量", "現值(TWD)", "幣別", "狀態", "建立日期"]));
  for (const account of accounts) {
    lines.push(
      toRow([
        account.name,
        account.type === "ASSET" ? "資產" : "負債",
        CATEGORY_LABELS[account.category] ?? account.category,
        account.symbol ?? "",
        account.quantity ?? "",
        resolveAccountValue(account),
        account.currency,
        account.isActive ? "使用中" : "已封存",
        toTaipeiDateString(account.createdAt),
      ])
    );
  }

  lines.push("");
  lines.push("淨資產歷史");
  lines.push(toRow(["日期", "總資產", "總負債", "淨資產"]));
  for (const point of history) {
    lines.push(toRow([toTaipeiDateString(point.date), point.totalAssets, point.totalLiabilities, point.netWorth]));
  }

  lines.push("");
  lines.push("交易紀錄");
  lines.push(toRow(["日期", "帳戶", "類型", "金額", "數量", "單價", "說明"]));
  for (const tx of transactions) {
    lines.push(
      toRow([
        toTaipeiDateString(tx.date),
        tx.account?.name ?? "",
        TRANSACTION_LABELS[tx.type] ?? tx.type,
        tx.amount,
        tx.quantity ?? "",
        tx.price ?? "",
        tx.description ?? "",
      ])
    );
  }

  // 開頭的 BOM 讓 Excel 正確以 UTF-8 開啟中文，少了它中文會變亂碼
  const body = "﻿" + lines.join("\r\n");

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zeno-${todayInTaipei()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
