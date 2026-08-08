// 帳戶報價的唯一來源，給 POST /api/accounts 與 PUT /api/accounts/[id] 共用。
//
// 先前這段在兩個檔案裡各有一份幾乎相同的複製，然後就漂移了：新增帳戶那份已經改用 Yahoo 的
// 「{代號}-USD」報價，編輯帳戶那份還停在寫死 ids=bitcoin,ethereum 的 CoinGecko 查詢——
// 結果新增 SOL/DOGE/XRP 沒問題，一編輯就抓不到報價。改成同一份實作，避免再各改各的。

import YahooFinance from "yahoo-finance2";

/** 這些分類的現值要靠代號去抓市價，quantity 是「持有數量」 */
export const categoriesRequiringSymbol = ["TAIWAN_STOCK", "US_STOCK", "JAPAN_STOCK", "KOREA_STOCK", "CRYPTO"];
/** 這些分類的 quantity 直接就是金額，單價固定 1 */
export const fixedValueCategories = ["CASH", "BANK_ACCOUNT", "FIXED_ASSET", "RECEIVABLE", "PAYABLE", "MORTGAGE", "CAR_LOAN", "CREDIT_LOAN"];

// Yahoo Finance 的市場代碼後綴：台股 .TW、日股 .T、韓股 .KS（KOSDAQ 上市的少數代號可能查不到，屬已知限制）
const yahooSuffixByCategory: Record<string, string> = { TAIWAN_STOCK: ".TW", JAPAN_STOCK: ".T", KOREA_STOCK: ".KS" };
// 換算成 TWD 用的匯率代碼（Yahoo「該幣別TWD=X」格式），美股沿用既有的 TWD=X（= USDTWD）
const fxSymbolByCategory: Record<string, string> = { US_STOCK: "TWD=X", JAPAN_STOCK: "JPYTWD=X", KOREA_STOCK: "KRWTWD=X" };

export type MarketPrice = { price: number; value: number; dayChangePct: number | null };

// 回傳的 price 一律是「該標的原始幣別」的單價（跟帳戶 currency 一致，前端「即時股價」就是顯示這個），
// value 才是換算成 TWD 後、乘以持有數量前的單價換算基準；currentValue 由呼叫端用 quantity * value 算。
export async function fetchMarketPrice(category: string, rawSymbol: string): Promise<MarketPrice> {
  const suffix = yahooSuffixByCategory[category];
  const symbol = suffix && !rawSymbol.toUpperCase().endsWith(suffix)
    ? rawSymbol.toUpperCase() + suffix
    : rawSymbol;
  const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

  if (category === "CRYPTO") {
    // 用 Yahoo 的「{代號}-USD」報價，跟每 10 分鐘的同步排程（test-fetch-prices）走同一套。
    const normalizedSymbol = symbol.toUpperCase();
    const quoteSymbol = normalizedSymbol.endsWith("-USD") ? normalizedSymbol : `${normalizedSymbol}-USD`;

    const cryptoQuote = await yahoo.quote(quoteSymbol);
    const usdPrice = Number(cryptoQuote.regularMarketPrice || 0);
    if (!usdPrice) throw new Error(`找不到 ${normalizedSymbol} 的報價`);

    const usdToTwdResult = await yahoo.quote("TWD=X");
    const usdToTwdRate = Number(usdToTwdResult.regularMarketPrice || 1);
    const dayChangePct = Number(cryptoQuote.regularMarketChangePercent);

    return {
      price: usdPrice,
      value: usdPrice * usdToTwdRate,
      dayChangePct: Number.isFinite(dayChangePct) ? dayChangePct : null,
    };
  }

  const quoteResult = await yahoo.quote(symbol);
  const marketPrice = Number(quoteResult.regularMarketPrice || 0);
  const dayChangePct = Number(quoteResult.regularMarketChangePercent);

  const fxSymbol = fxSymbolByCategory[category];
  if (fxSymbol) {
    const fxResult = await yahoo.quote(fxSymbol);
    const fxRate = Number(fxResult.regularMarketPrice || 1);
    return { price: marketPrice, value: marketPrice * fxRate, dayChangePct: Number.isFinite(dayChangePct) ? dayChangePct : null };
  }

  return { price: marketPrice, value: marketPrice, dayChangePct: Number.isFinite(dayChangePct) ? dayChangePct : null };
}
