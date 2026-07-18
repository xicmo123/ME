import { ActivityType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// 帳戶的新增／編輯／封存／刪除紀錄，給「近期紀錄」彈窗用；刻意不拋錯，記錄失敗不該讓主要操作跟著失敗。
export async function logActivity(userId: string, type: ActivityType, description: string, amount?: number | null) {
  try {
    await prisma.activityLog.create({ data: { userId, type, description, amount: amount ?? null } });
  } catch (error) {
    console.error("logActivity failed:", error);
  }
}
