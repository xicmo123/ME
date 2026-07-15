export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { getEntitlementsForUser } from "@/lib/entitlements";

import { prisma } from "@/lib/prisma";

// GET /api/goals → 取得所有目標（含即時進度）
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  const goals = await prisma.goal.findMany({
    where: { userId, isActive: true },
    orderBy: { createdAt: "asc" },
  });

  // 計算目前進度
  const accounts = await prisma.account.findMany({
    where: { userId, isActive: true },
  });

  const totalAssets = accounts.filter(a => a.type === "ASSET").reduce((sum, a) => sum + Number(a.currentValue ?? 0), 0);
  const totalLiabilities = accounts.filter(a => a.type === "LIABILITY").reduce((sum, a) => sum + Number(a.currentValue ?? 0), 0);
  const netWorth = totalAssets - totalLiabilities;

  const goalsWithProgress = goals.map(goal => {
    let currentAmount = 0;

    if (goal.type === "NET_WORTH") {
      currentAmount = netWorth;
    } else if (goal.type === "ACCOUNT" && goal.accountId) {
      const account = accounts.find(a => a.id === goal.accountId);
      currentAmount = Number(account?.currentValue ?? 0);
    }

    const progress = goal.targetAmount > 0
      ? Math.min(100, Math.round((currentAmount / goal.targetAmount) * 100))
      : 0;
    const remaining = Math.max(0, goal.targetAmount - currentAmount);

    return { ...goal, currentAmount, progress, remaining };
  });

  return NextResponse.json(goalsWithProgress);
}

// POST /api/goals → 新增目標
export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ message: "Invalid request" }, { status: 400 });

  const { name, targetAmount, type, accountId, emoji } = body;

  if (!name || !targetAmount || Number(targetAmount) <= 0) {
    return NextResponse.json({ message: "請填寫目標名稱和金額" }, { status: 400 });
  }

  const entitlements = await getEntitlementsForUser(userId);
  if (entitlements.limits.maxGoals !== null) {
    const activeGoalCount = await prisma.goal.count({ where: { userId, isActive: true } });
    if (activeGoalCount >= entitlements.limits.maxGoals) {
      return NextResponse.json({ message: `目標數已達免費方案上限（${entitlements.limits.maxGoals} 個），升級 Pro 解鎖無限目標，追蹤更多人生里程碑。`, code: "UPGRADE_REQUIRED", feature: "maxGoals" }, { status: 402 });
    }
  }

  const goal = await prisma.goal.create({
    data: {
      userId,
      name: name.trim(),
      targetAmount: Number(targetAmount),
      type: type || "NET_WORTH",
      accountId: type === "ACCOUNT" ? accountId : null,
      emoji: emoji || null,
    },
  });

  return NextResponse.json(goal, { status: 201 });
}

// PUT /api/goals → 更新目標
export async function PUT(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ message: "Invalid request" }, { status: 400 });

  const { id, name, targetAmount, type, accountId, emoji } = body;

  const existing = await prisma.goal.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ message: "目標不存在" }, { status: 404 });

  const goal = await prisma.goal.update({
    where: { id },
    data: {
      name: name.trim(),
      targetAmount: Number(targetAmount),
      type: type || "NET_WORTH",
      accountId: type === "ACCOUNT" ? accountId : null,
      emoji: emoji || null,
    },
  });

  return NextResponse.json(goal);
}

// DELETE /api/goals?id=xxx → 刪除目標
export async function DELETE(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ message: "缺少 id" }, { status: 400 });

  const existing = await prisma.goal.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ message: "目標不存在" }, { status: 404 });

  await prisma.goal.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ message: "已刪除" });
}