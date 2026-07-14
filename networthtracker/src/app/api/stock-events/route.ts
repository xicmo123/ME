import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";

type StockEvent = { symbol: string; name: string; date: string; type: "EARNINGS" | "EX_DIVIDEND" | "DIVIDEND_PAY" };

// symbols 格式：台股帶 .TW（例如 2330.TW），美股直接用代號（例如 AAPL）
export async function GET(request: NextRequest) {
  const symbolsParam = request.nextUrl.searchParams.get("symbols") ?? "";
  const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (symbols.length === 0) return NextResponse.json({ events: [] });

  const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  const events: StockEvent[] = [];

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const res = await yahoo.quoteSummary(symbol, { modules: ["calendarEvents", "price"] });
        const name = res.price?.shortName ?? symbol;
        const displaySymbol = symbol.replace(/\.TW$/i, "");

        for (const d of res.calendarEvents?.earnings?.earningsDate ?? []) {
          events.push({ symbol: displaySymbol, name, date: new Date(d).toISOString(), type: "EARNINGS" });
        }
        if (res.calendarEvents?.exDividendDate) {
          events.push({ symbol: displaySymbol, name, date: new Date(res.calendarEvents.exDividendDate).toISOString(), type: "EX_DIVIDEND" });
        }
        if (res.calendarEvents?.dividendDate) {
          events.push({ symbol: displaySymbol, name, date: new Date(res.calendarEvents.dividendDate).toISOString(), type: "DIVIDEND_PAY" });
        }
      } catch {
        // 抓不到某檔股票的事件資訊就跳過，不影響其他股票
      }
    })
  );

  return NextResponse.json({ events });
}
