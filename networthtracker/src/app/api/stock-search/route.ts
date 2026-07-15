import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { TW_STOCKS } from "@/lib/tw-stocks";
import { US_STOCKS } from "@/lib/us-stocks";
import { CRYPTO_LIST } from "@/lib/crypto-list";

export const dynamic = "force-dynamic";

type Suggestion = { symbol: string; name: string };

function rankMatches<T extends { symbol: string; name: string; aliases?: string[] }>(list: T[], qLower: string): T[] {
  const startsWith = list.filter((s) => s.symbol.toLowerCase().startsWith(qLower) || s.name.toLowerCase().startsWith(qLower) || s.aliases?.some((a) => a.toLowerCase().startsWith(qLower)));
  const contains = list.filter(
    (s) => !startsWith.includes(s) && (s.symbol.toLowerCase().includes(qLower) || s.name.toLowerCase().includes(qLower) || s.aliases?.some((a) => a.toLowerCase().includes(qLower)))
  );
  return [...startsWith, ...contains];
}

async function fetchYahooMatches(q: string, quoteTypes: string[], exchange?: string): Promise<Suggestion[]> {
  if (!/^[a-zA-Z0-9. ]+$/.test(q)) return []; // Yahoo 的搜尋 API 不支援中文查詢
  try {
    const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
    const res = await yahoo.search(q, { quotesCount: 10, newsCount: 0 });
    return res.quotes
      .filter((quote): quote is typeof quote & { quoteType: string; symbol: string; exchange?: string } => "quoteType" in quote && quoteTypes.includes(quote.quoteType as string))
      .filter((quote) => (exchange ? "exchange" in quote && quote.exchange === exchange : !quote.symbol.includes(".")))
      .map((quote) => ({
        symbol: exchange ? quote.symbol.replace(/\.TW$/i, "") : quote.symbol.replace(/-USD$/i, ""),
        name: "shortname" in quote && typeof quote.shortname === "string" ? quote.shortname : quote.symbol,
      }));
  } catch {
    return [];
  }
}

// Yahoo 的 search API 對新幣種收錄常有延遲或分類錯誤，若代號完全比對不到，
// 直接嘗試 quote 該幣種的 -USD / -USDT 交易對，只要 Yahoo 有報價就能兜底找到。
async function fetchYahooDirectCryptoQuote(q: string): Promise<Suggestion[]> {
  if (!/^[a-zA-Z0-9]+$/.test(q)) return [];
  const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  for (const suffix of ["-USD", "-USDT"]) {
    try {
      const quote = await yahoo.quote(`${q.toUpperCase()}${suffix}`);
      if (quote && quote.quoteType === "CRYPTOCURRENCY") {
        return [{ symbol: q.toUpperCase(), name: quote.shortName ?? quote.longName ?? q.toUpperCase() }];
      }
    } catch {
      // try next suffix
    }
  }
  return [];
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const market = request.nextUrl.searchParams.get("market") ?? "TW";
  if (!q) return NextResponse.json({ results: [] });

  if (market === "TW") {
    const localMatches: Suggestion[] = TW_STOCKS.filter((s) => s.code.includes(q) || s.name.includes(q)).map((s) => ({ symbol: s.code, name: s.name }));
    const yahooMatches = await fetchYahooMatches(q, ["EQUITY", "ETF"], "TAI");
    for (const m of yahooMatches) if (!localMatches.some((e) => e.symbol === m.symbol)) localMatches.push(m);
    return NextResponse.json({ results: localMatches.slice(0, 10) });
  }

  if (market === "CRYPTO") {
    const qLower = q.toLowerCase();
    const localMatches: Suggestion[] = rankMatches(CRYPTO_LIST, qLower).map((s) => ({ symbol: s.symbol, name: s.name }));
    const yahooMatches = await fetchYahooMatches(q, ["CRYPTOCURRENCY"]);
    for (const m of yahooMatches) if (!localMatches.some((e) => e.symbol === m.symbol)) localMatches.push(m);
    if (!localMatches.some((e) => e.symbol.toLowerCase() === qLower)) {
      const directMatches = await fetchYahooDirectCryptoQuote(q);
      for (const m of directMatches) if (!localMatches.some((e) => e.symbol === m.symbol)) localMatches.unshift(m);
    }
    return NextResponse.json({ results: localMatches.slice(0, 10) });
  }

  // US
  const qLower = q.toLowerCase();
  const localMatches: Suggestion[] = rankMatches(US_STOCKS, qLower).map((s) => ({ symbol: s.symbol, name: s.name }));
  const yahooMatches = await fetchYahooMatches(q, ["EQUITY", "ETF"]);
  for (const m of yahooMatches) if (!localMatches.some((e) => e.symbol === m.symbol)) localMatches.push(m);
  return NextResponse.json({ results: localMatches.slice(0, 10) });
}
