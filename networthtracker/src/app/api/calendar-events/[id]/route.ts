export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE /api/calendar-events/[id] → 刪除行事曆事件
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.calendarEvent.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ message: "事件不存在" }, { status: 404 });

  await prisma.calendarEvent.delete({ where: { id } });
  return NextResponse.json({ message: "已刪除" });
}
