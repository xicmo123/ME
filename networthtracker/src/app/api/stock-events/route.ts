import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";

type StockEvent = { symbol: string; name: string; date: string; type: "EARNINGS" | "EX_DIVIDEND" | "DIVIDEND_PAY" };

// 民國年日期字串（"115年07月21日" 或緊湊格式 "1150721"）轉 ISO 字串
function parseRocDate(rocYear: number, month: number, day: number): string | null {
  if (!rocYear || !month || !day) return null;
  const year = rocYear + 1911;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const d = new Date(`${year}-${mm}-${dd}T00:00:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// 上市（TWSE）除權除息預告表 — Yahoo 對台股 ETF（例如 00929）常常沒有 calendarEvents 資料，
// 用證交所自己的公開資料當備援，才抓得到這類 ETF 的除息日。
async function fetchTwseExRightForecast(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const res = await fetch("https://www.twse.com.tw/rwd/zh/exRight/TWT48U?response=json", { cache: "no-store" });
    if (!res.ok) return map;
    const data = await res.json();
    for (const row of data?.data ?? []) {
      const rocMatch = String(row[0] ?? "").match(/(\d+)年(\d+)月(\d+)日/);
      const code = row[1];
      if (!rocMatch || !code) continue;
      const iso = parseRocDate(Number(rocMatch[1]), Number(rocMatch[2]), Number(rocMatch[3]));
      if (iso) map.set(code, iso);
    }
  } catch (error) {
    console.error("TWSE ex-right forecast fetch error:", error instanceof Error ? error.message : String(error));
  }
  return map;
}

// 上櫃（TPEX）除權除息預告，補齊 TWSE 名單以外的上櫃股票／ETF
async function fetchTpexExRightForecast(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const res = await fetch("https://www.tpex.org.tw/openapi/v1/tpex_exright_prepost", { cache: "no-store" });
    if (!res.ok) return map;
    const data = await res.json();
    for (const row of data ?? []) {
      const code = row.SecuritiesCompanyCode;
      const rocDate = String(row.ExRrightsExDividendDate ?? "");
      const match = rocDate.match(/^(\d{3})(\d{2})(\d{2})$/);
      if (!code || !match) continue;
      const iso = parseRocDate(Number(match[1]), Number(match[2]), Number(match[3]));
      if (iso) map.set(code, iso);
    }
  } catch (error) {
    console.error("TPEX ex-right forecast fetch error:", error instanceof Error ? error.message : String(error));
  }
  return map;
}

// symbols 格式：台股帶 .TW（例如 2330.TW），美股直接用代號（例如 AAPL）
export async function GET(request: NextRequest) {
  const symbolsParam = request.nextUrl.searchParams.get("symbols") ?? "";
  const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (symbols.length === 0) return NextResponse.json({ events: [] });

  const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  const events: StockEvent[] = [];
  const errors: string[] = [];

  const hasTwSymbol = symbols.some((s) => /\.TW$/i.test(s));
  const [twseForecast, tpexForecast] = hasTwSymbol
    ? await Promise.all([fetchTwseExRightForecast(), fetchTpexExRightForecast()])
    : [new Map<string, string>(), new Map<string, string>()];

  await Promise.all(
    symbols.map(async (symbol) => {
      const displaySymbol = symbol.replace(/\.TW$/i, "");
      let name = symbol;
      let gotExDividendFromYahoo = false;

      try {
        const res = await yahoo.quoteSummary(symbol, { modules: ["calendarEvents", "price"] });
        name = res.price?.shortName ?? symbol;

        for (const d of res.calendarEvents?.earnings?.earningsDate ?? []) {
          events.push({ symbol: displaySymbol, name, date: new Date(d).toISOString(), type: "EARNINGS" });
        }
        if (res.calendarEvents?.exDividendDate) {
          events.push({ symbol: displaySymbol, name, date: new Date(res.calendarEvents.exDividendDate).toISOString(), type: "EX_DIVIDEND" });
          gotExDividendFromYahoo = true;
        }
        if (res.calendarEvents?.dividendDate) {
          events.push({ symbol: displaySymbol, name, date: new Date(res.calendarEvents.dividendDate).toISOString(), type: "DIVIDEND_PAY" });
        }
      } catch (error) {
        // Yahoo 對台股 ETF 常常整支查不到（no fundamentals data），不當作致命錯誤，
        // 記錄下來後續改用 TWSE/TPEX 備援繼續補資料，不影響其他股票
        errors.push(`Yahoo lookup failed for ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
      }

      // 台股且 Yahoo 沒抓到除息日 → 用證交所/櫃買中心的除權除息預告表補上
      if (!gotExDividendFromYahoo && /\.TW$/i.test(symbol)) {
        const isoDate = twseForecast.get(displaySymbol) ?? tpexForecast.get(displaySymbol);
        if (isoDate) {
          events.push({ symbol: displaySymbol, name, date: isoDate, type: "EX_DIVIDEND" });
        }
      }
    })
  );

  if (errors.length > 0) console.error("[stock-events] partial failures:", errors);

  return NextResponse.json({ events });
}
