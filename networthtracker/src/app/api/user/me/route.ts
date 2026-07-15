export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";

import { prisma } from "@/lib/prisma";

// DELETE /api/user/me → 用戶自己刪除帳號（Apple 審核強制要求）
export async function DELETE(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  try {
    // 依序刪除所有關聯資料
    await prisma.assetHistory.deleteMany({ where: { userId } });
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });

    // 清除 cookie
    const response = NextResponse.json({ message: "帳號已刪除" });
    response.cookies.set("auth-token", "", { httpOnly: true, maxAge: 0, path: "/" });
    return response;
  } catch (error) {
    console.error("Delete account failed:", error);
    return NextResponse.json({ message: "刪除失敗", error: String(error) }, { status: 500 });
  }
}