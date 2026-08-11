export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookie, getUserIdFromRequest } from "@/lib/auth";

import { prisma } from "@/lib/prisma";

// DELETE /api/user/me → 用戶自己刪除帳號（Apple 審核強制要求）
export async function DELETE(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  try {
    // schema 裡每一張關聯表對 User 都是 onDelete: Cascade，所以刪掉 user 這一列
    // 資料庫就會把 accounts / history / transactions / goals / syncLogs / activityLogs /
    // calendarEvents 一併清掉。先前是手動逐張刪前三張，之後新增的資料表很容易漏掉。
    await prisma.user.delete({ where: { id: userId } });
    return clearAuthCookie(NextResponse.json({ message: "帳號已刪除" }));
  } catch (error) {
    console.error("Delete account failed:", error);
    return NextResponse.json({ message: "刪除失敗", error: String(error) }, { status: 500 });
  }
}