import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getUserIdFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

type StockEvent = { symbol: string; name: string; date: string; type: "EARNINGS" | "EX_DIVIDEND" | "DIVIDEND_PAY"; amountPerShare?: number; amountPerShareIsAnnualized?: boolean };

// 這支是單一長駐 Node process（非 serverless），模組層級變數在整個 process 生命週期內有效，
// 可以拿來當簡單的行程內快取。使用者數一多，不同人常持有同一檔股票（例如 2330、00929），
// 沒有快取的話每個人開資產頁都會重打一次 Yahoo/TWSE/TPEX，容易把外部 API 打到限流／封鎖，
// 進而讓「所有人」的除息資料都抓不到。
const YAHOO_CACHE_TTL_MS = 60 * 60 * 1000; // calendarEvents 不會盤中變動，快取 1 小時足夠
const TW_FORECAST_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 除權除息預告表一天更新一次，快取 6 小時

type CacheEntry<T> = { data: T; expiresAt: number };
const yahooCache = new Map<string, CacheEntry<{ name: string; events: StockEvent[] }>>();
let twForecastCache: CacheEntry<{ twse: Map<string, string>; tpex: Map<string, string> }> | null = null;
const twNameCache = new Map<string, CacheEntry<string>>();
const TW_NAME_CACHE_TTL_MS = 60 * 60 * 1000; // 公司名稱不會常變，快取 1 小時

// 台股用證交所自己的公開行情端點取中文簡稱（"n" 欄位），比 Yahoo 的英文 shortName 更適合行事曆顯示。
// 上市（tse）查不到就試上櫃（otc）；兩邊都查不到就回 null，讓呼叫端 fallback 回 Yahoo 英文名稱。
async function getTwseChineseName(rawSymbol: string): Promise<string | null> {
  const code = rawSymbol.replace(/\.TW$/i, "").trim();
  if (!code) return null;

  const cached = twNameCache.get(code);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  for (const prefix of ["tse", "otc"]) {
    try {
      const res = await fetch(`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${prefix}_${code}.tw`, { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      const name = data?.msgArray?.[0]?.n;
      if (name) {
        twNameCache.set(code, { data: name, expiresAt: Date.now() + TW_NAME_CACHE_TTL_MS });
        return name;
      }
    } catch {
      // 忽略，換下一個 prefix 或最終回傳 null 讓呼叫端 fallback
    }
  }
  return null;
}

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

// symbols 格式：台股帶 .TW（例如 2330.TW）、日股帶 .T（例如 7203.T）、韓股帶 .KS（例如 005930.KS），
// 美股直接用代號（例如 AAPL）
export async function GET(request: NextRequest) {
  const symbolsParam = request.nextUrl.searchParams.get("symbols") ?? "";
  const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (symbols.length === 0) return NextResponse.json({ events: [] });

  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  const events: StockEvent[] = [];
  const errors: string[] = [];

  const hasTwSymbol = symbols.some((s) => /\.TW$/i.test(s));
  let twseForecast = new Map<string, string>();
  let tpexForecast = new Map<string, string>();
  if (hasTwSymbol) {
    if (twForecastCache && twForecastCache.expiresAt > Date.now()) {
      ({ twse: twseForecast, tpex: tpexForecast } = twForecastCache.data);
    } else {
      [twseForecast, tpexForecast] = await Promise.all([fetchTwseExRightForecast(), fetchTpexExRightForecast()]);
      twForecastCache = { data: { twse: twseForecast, tpex: tpexForecast }, expiresAt: Date.now() + TW_FORECAST_CACHE_TTL_MS };
    }
  }

  await Promise.all(
    symbols.map(async (symbol) => {
      const isTwSymbol = /\.TW$/i.test(symbol);
      const displaySymbol = symbol.replace(/\.TW$/i, "").replace(/\.T$/i, "").replace(/\.KS$/i, "");
      let name = symbol;
      let gotExDividendFromYahoo = false;

      // 台股一律優先用證交所的中文簡稱，不管 Yahoo 查不查得到都要覆蓋成中文，
      // 其他市場（美股/日股/韓股）維持 Yahoo 的英文 shortName。
      const twChineseName = isTwSymbol ? await getTwseChineseName(displaySymbol) : null;

      let symbolEvents: StockEvent[] = [];

      const cached = yahooCache.get(symbol);
      if (cached && cached.expiresAt > Date.now()) {
        name = cached.data.name;
        symbolEvents = cached.data.events;
        gotExDividendFromYahoo = cached.data.events.some((e) => e.type === "EX_DIVIDEND");
      } else {
        const freshEvents: StockEvent[] = [];
        try {
          const res = await yahoo.quoteSummary(symbol, { modules: ["calendarEvents", "price", "summaryDetail"] });
          name = res.price?.shortName ?? symbol;
          // Yahoo 只提供「年化」每股配息（dividendRate），沒有單次配息金額，
          // 用 amountPerShareIsAnnualized 標記讓前端提示這是年化數字，避免使用者誤以為是單次金額
          const annualDividendRate = typeof res.summaryDetail?.dividendRate === "number" ? res.summaryDetail.dividendRate : undefined;

          for (const d of res.calendarEvents?.earnings?.earningsDate ?? []) {
            freshEvents.push({ symbol: displaySymbol, name, date: new Date(d).toISOString(), type: "EARNINGS" });
          }
          if (res.calendarEvents?.exDividendDate) {
            freshEvents.push({ symbol: displaySymbol, name, date: new Date(res.calendarEvents.exDividendDate).toISOString(), type: "EX_DIVIDEND", amountPerShare: annualDividendRate, amountPerShareIsAnnualized: annualDividendRate != null });
            gotExDividendFromYahoo = true;
          }
          if (res.calendarEvents?.dividendDate) {
            freshEvents.push({ symbol: displaySymbol, name, date: new Date(res.calendarEvents.dividendDate).toISOString(), type: "DIVIDEND_PAY", amountPerShare: annualDividendRate, amountPerShareIsAnnualized: annualDividendRate != null });
          }
          yahooCache.set(symbol, { data: { name, events: freshEvents }, expiresAt: Date.now() + YAHOO_CACHE_TTL_MS });
        } catch (error) {
          // Yahoo 對台股 ETF 常常整支查不到（no fundamentals data），不當作致命錯誤，
          // 記錄下來後續改用 TWSE/TPEX 備援繼續補資料，不影響其他股票
          errors.push(`Yahoo lookup failed for ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
        }
        symbolEvents = freshEvents;
      }

      // 台股且 Yahoo 沒抓到除息日 → 用證交所/櫃買中心的除權除息預告表補上
      if (!gotExDividendFromYahoo && isTwSymbol) {
        const isoDate = twseForecast.get(displaySymbol) ?? tpexForecast.get(displaySymbol);
        if (isoDate) {
          symbolEvents = [...symbolEvents, { symbol: displaySymbol, name, date: isoDate, type: "EX_DIVIDEND" }];
        }
      }

      // 台股一律覆蓋成證交所中文簡稱（不管上面是走快取、Yahoo 或預告表分支拿到的英文/預設名稱）
      const finalName = twChineseName ?? name;
      events.push(...symbolEvents.map((e) => ({ ...e, name: finalName })));
    })
  );

  if (errors.length > 0) console.error("[stock-events] partial failures:", errors);

  return NextResponse.json({ events });
}
