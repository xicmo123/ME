export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getUserIdFromRequest } from "@/lib/auth";

// 基準指數 -> Yahoo Finance 代號
const SYMBOLS: Record<string, string> = {
  tw0050: "0050.TW", // 元大台灣50
  sp500: "^GSPC", // S&P 500
};

const twDateStr = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

// GET /api/benchmark?days=365 -> { tw0050: [{date,level}], sp500: [{date,level}] }
// level 使用還原（adjusted）收盤價，正確反映配息與分割後的成長率。
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  const daysParam = Number(new URL(request.url).searchParams.get("days"));
  const days = Math.min(Math.max(Number.isFinite(daysParam) ? daysParam : 365, 7), 400);

  const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  const now = new Date();
  const period1 = new Date(now.getTime() - (days + 7) * 24 * 3600 * 1000); // 多抓幾天，開頭若逢假日也有基準

  const out: Record<string, Array<{ date: string; level: number }>> = {};
  const errors: string[] = [];

  await Promise.all(
    Object.entries(SYMBOLS).map(async ([key, sym]) => {
      try {
        const r = await yahoo.chart(sym, { period1, period2: now, interval: "1d" });
        out[key] = (r.quotes || [])
          .map((q: any) => ({ date: twDateStr(new Date(q.date)), level: Number(q.adjclose ?? q.close) }))
          .filter((p) => Number.isFinite(p.level) && p.level > 0);
      } catch (e) {
        out[key] = [];
        errors.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
      }
    })
  );

  return NextResponse.json({ ...out, ...(errors.length ? { errors } : {}) });
}
