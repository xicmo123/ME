export const dynamic = "force-dynamic";
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