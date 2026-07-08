import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getUserIdFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

declare global {
  var prisma: PrismaClient | undefined;
}

const prisma = globalThis.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const shouldPersist = searchParams.get("write") !== "false";
  const customDate = searchParams.get("date");

  try {
    const accounts = await prisma.account.findMany({
      where: { isActive: true, userId },
    });

    const totalAssets = accounts
      .filter((a) => a.type === "ASSET")
      .reduce((sum, a) => sum + Number(a.currentValue ?? 0), 0);

    const totalLiabilities = accounts
      .filter((a) => a.type === "LIABILITY")
      .reduce((sum, a) => sum + Number(a.currentValue ?? 0), 0);

    const netWorth = totalAssets - totalLiabilities;

    const breakdown = JSON.stringify(
      accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        category: a.category,
        currentValue: a.currentValue,
      }))
    );

    const snapshotDate = customDate ? new Date(customDate) : new Date();
    snapshotDate.setHours(0, 0, 0, 0);

    const snapshot = {
      date: snapshotDate.toISOString(),
      totalAssets,
      totalLiabilities,
      netWorth,
      breakdown,
    };

    if (shouldPersist) {
      await prisma.assetHistory.upsert({
        where: {
          userId_date: {
            userId,
            date: snapshotDate,
          },
        },
        update: { totalAssets, totalLiabilities, netWorth, breakdown },
        create: {
          userId,
          date: snapshotDate,
          totalAssets,
          totalLiabilities,
          netWorth,
          breakdown,
        },
      });
    }

    return NextResponse.json({
      message: shouldPersist
        ? `Snapshot recorded for ${snapshotDate.toISOString()}`
        : "Snapshot preview generated.",
      snapshot,
    });
  } catch (error) {
    console.error("Snapshot creation failed:", error);
    return NextResponse.json(
      { message: "Failed to create snapshot.", error: String(error) },
      { status: 500 }
    );
  }
}
