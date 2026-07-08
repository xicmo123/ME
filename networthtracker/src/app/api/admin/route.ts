// src/app/api/admin/route.ts
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getUserIdFromRequest } from "@/lib/auth";

declare global {
  var prisma: PrismaClient | undefined;
}
const prisma = globalThis.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;

const ADMIN_ID = process.env.ADMIN_USER_ID;

function isAdmin(userId: string) {
  return userId === ADMIN_ID;
}

// GET /api/admin?action=users → 所有用戶列表
// GET /api/admin?action=user&userId=xxx → 某用戶詳細資料
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId || !isAdmin(userId)) {
    return NextResponse.json({ message: "無權限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const targetUserId = searchParams.get("userId");

  if (action === "users") {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        emailVerified: true,
        createdAt: true,
        _count: { select: { accounts: true, history: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(users);
  }

  if (action === "user" && targetUserId) {
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        createdAt: true,
        accounts: {
          where: {},  // 顯示所有資產，含停用的
          select: {
            id: true, name: true, type: true, category: true,
            symbol: true, quantity: true, currentPrice: true,
            currentValue: true, currency: true, isApiConnected: true,
            monthlyDeductionAmount: true, deductionDate: true, createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!user) return NextResponse.json({ message: "用戶不存在" }, { status: 404 });
    return NextResponse.json(user);
  }

  return NextResponse.json({ message: "無效的 action" }, { status: 400 });
}

// POST /api/admin → 新增/修改用戶資產、停用用戶
export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId || !isAdmin(userId)) {
    return NextResponse.json({ message: "無權限" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ message: "Invalid request" }, { status: 400 });

  const { action, targetUserId, accountId, data } = body;

  // 停用用戶（軟刪除所有資產）
  if (action === "disableUser" && targetUserId) {
    if (targetUserId === ADMIN_ID) {
      return NextResponse.json({ message: "不能停用管理員帳號" }, { status: 400 });
    }
    await prisma.account.updateMany({
      where: { userId: targetUserId },
      data: { isActive: false },
    });
    return NextResponse.json({ message: "用戶已停用" });
  }

  // 刪除用戶（完全刪除，包含所有資料）
  if (action === "deleteUser" && targetUserId) {
    if (targetUserId === ADMIN_ID) {
      return NextResponse.json({ message: "不能刪除管理員帳號" }, { status: 400 });
    }
    await prisma.assetHistory.deleteMany({ where: { userId: targetUserId } });
    await prisma.transaction.deleteMany({ where: { userId: targetUserId } });
    await prisma.account.deleteMany({ where: { userId: targetUserId } });
    await prisma.user.delete({ where: { id: targetUserId } });
    return NextResponse.json({ message: "用戶已刪除" });
  }

  // 新增資產給指定用戶
  if (action === "createAccount" && targetUserId && data) {
    const { randomUUID } = await import("crypto");
    const account = await prisma.account.create({
      data: {
        id: randomUUID(),
        userId: targetUserId,
        name: data.name,
        type: data.type,
        category: data.category,
        symbol: data.symbol || null,
        quantity: Number(data.quantity || 0),
        currentPrice: Number(data.currentPrice || 1),
        currentValue: Number(data.currentValue || data.quantity || 0),
        currency: data.currency || "TWD",
        isApiConnected: false,
      },
    });
    return NextResponse.json(account, { status: 201 });
  }

  // 修改指定資產
  if (action === "updateAccount" && accountId && data) {
    const account = await prisma.account.update({
      where: { id: accountId },
      data: {
        name: data.name,
        quantity: Number(data.quantity || 0),
        currentPrice: Number(data.currentPrice || 1),
        currentValue: Number(data.currentValue || data.quantity || 0),
      },
    });
    return NextResponse.json(account);
  }

  // 刪除資產
  if (action === "deleteAccount" && accountId) {
    await prisma.account.update({
      where: { id: accountId },
      data: { isActive: false },
    });
    return NextResponse.json({ message: "資產已刪除" });
  }

  return NextResponse.json({ message: "無效的 action" }, { status: 400 });
}