export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/calendar-events → 取得使用者自建的行事曆事件
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  const events = await prisma.calendarEvent.findMany({
    where: { userId },
    orderBy: { eventAt: "asc" },
  });

  return NextResponse.json(events);
}

// POST /api/calendar-events → 新增行事曆事件
export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ message: "Invalid request" }, { status: 400 });

  const { title, eventAt } = body;
  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ message: "請填寫事件名稱" }, { status: 400 });
  }
  const at = new Date(eventAt);
  if (isNaN(at.getTime())) {
    return NextResponse.json({ message: "請選擇有效的日期時間" }, { status: 400 });
  }

  const event = await prisma.calendarEvent.create({
    data: { userId, title: title.trim(), eventAt: at },
  });

  return NextResponse.json(event, { status: 201 });
}
