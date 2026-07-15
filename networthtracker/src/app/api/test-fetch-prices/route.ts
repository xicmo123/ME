import ccxt from "ccxt";
import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from "yahoo-finance2";
import { Spot } from '@binance/connector';
import { decrypt } from '@/lib/crypto';
import { getUserIdFromRequest } from '@/lib/auth';
import { isTrustedCronRequest } from '@/lib/cron-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// 有限併發跑一批 async 工作，避免 for...await 序列等待（帳戶/股票數一多同步會拖很久），
// 同時避免完全無限制的 Promise.all 把外部 API 瞬間打爆而被限流。
async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  async function next(): Promise<void> {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
}

// 加密功能上線前建立的帳戶，apiKey/apiSecret 還是明碼存的舊資料；
// 解密失敗就當作舊的明碼值直接使用，讓舊帳戶在下次編輯前仍可正常同步。
function decryptOrLegacyPlaintext(value: string): string {
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

function getYahooQuoteSymbol(category: string, symbol: string) {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) return normalizedSymbol;
  if (category === 'CRYPTO') {
    return normalizedSymbol.includes('-USD') ? normalizedSymbol : `${normalizedSymbol}-USD`;
  }
  if (category === 'TAIWAN_STOCK') {
    return normalizedSymbol.endsWith('.TW') ? normalizedSymbol : `${normalizedSymbol}.TW`;
  }
  return normalizedSymbol;
}

// ─── 節流：使用者手動按「更新」時，如果距離上一次成功同步不到 THROTTLE_MS，
// 直接跳過外部 API 呼叫，避免有人連續猛戳更新鍵而放大請求量。
// 內部 cron 排程（每 10 分鐘一次）不受此限制，一律照排程執行。
// 這是單一長駐 Node process（非 serverless），模組層級變數在整個 process 生命週期內有效。
const THROTTLE_MS = 15_000;
let lastSyncCompletedAt = 0;

// ─── 開盤時間判斷：背景 cron 用這個跳過收盤時段、節省請求額度。
// 使用者手動按「更新」則不受開盤時間限制（見下方 isMarketOpenForCategory 呼叫處），
// 讓使用者隨時都能強制重新查一次，不會因為「現在沒開盤」就整個沒反應。
// 加密貨幣是 24 小時市場，不受此限制。
function getTaipeiParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now).reduce((acc: Record<string, string>, p) => ({ ...acc, [p.type]: p.value }), {});
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdayMap[parts.weekday] ?? 0,
    totalMin: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function isTwMarketOpen(now: Date): boolean {
  const { weekday, totalMin } = getTaipeiParts(now);
  return weekday >= 1 && weekday <= 5 && totalMin >= 9 * 60 && totalMin <= 13 * 60 + 35;
}

// 美股盤中時間依日光節約時間在台灣時間 21:30~04:00 或 22:30~05:00 之間浮動，
// 這裡取寬鬆區間（21:00~05:30）以免因日光節約切換而誤判成休市。
function isUsMarketOpen(now: Date): boolean {
  const { weekday, totalMin } = getTaipeiParts(now);
  const eveningStart = 21 * 60;
  const morningEnd = 5 * 60 + 30;
  if (totalMin >= eveningStart) return weekday >= 1 && weekday <= 5;
  if (totalMin < morningEnd) return weekday >= 2 && weekday <= 6;
  return false;
}

function isMarketOpenForCategory(category: string, now: Date): boolean {
  if (category === 'TAIWAN_STOCK') return isTwMarketOpen(now);
  if (category === 'US_STOCK') return isUsMarketOpen(now);
  return true; // CRYPTO 24 小時市場
}

// ─── 台股報價改用證交所自己的公開行情端點，不用 Yahoo 這種非官方爬蟲式套件，
// 降低被限流/封鎖的風險。上市（tse）查不到就試上櫃（otc）。查不到就回傳 null，讓呼叫端 fallback 回 Yahoo。
async function getTwseQuote(rawSymbol: string): Promise<number | null> {
  const code = rawSymbol.replace(/\.TW$/i, "").trim();
  if (!code) return null;
  for (const prefix of ["tse", "otc"]) {
    try {
      const res = await fetch(`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${prefix}_${code}.tw`, { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      const item = data?.msgArray?.[0];
      if (!item) continue;
      const lastTradedPrice = parseFloat(item.z);
      if (lastTradedPrice > 0) return lastTradedPrice;

      // z 有時會在兩次撮合之間短暫回傳 "-"（不是沒開盤，只是這個 snapshot 剛好卡在成交瞬間之間），
      // 這種情況下用「昨收」當備援誤差可能很大（一天內可能已經漲跌好幾%），
      // 改用最佳買賣價中價估算，比昨收更接近當下真實價格。
      const bestAsk = parseFloat((item.a || "").split("_")[0]);
      const bestBid = parseFloat((item.b || "").split("_")[0]);
      const hasTraded = Number(item.v) > 0 || Number(item.tv) > 0; // 今天已經有成交量，代表盤中只是暫時抓不到 z
      if (hasTraded && bestAsk > 0 && bestBid > 0) return (bestAsk + bestBid) / 2;
      if (hasTraded && bestAsk > 0) return bestAsk;
      if (hasTraded && bestBid > 0) return bestBid;

      // 真的還沒開盤成交（沒有任何成交量）才退回昨收價當備援
      const prevClose = parseFloat(item.y);
      if (!hasTraded && prevClose > 0) return prevClose;
    } catch {
      // 忽略，換下一個 prefix 或最終回傳 null 讓呼叫端 fallback
    }
  }
  return null;
}

async function getUsdToTwdRate(yahoo: any): Promise<{ rate: number; source: string } | null> {
  try {
    const result = await yahoo.quote('TWD=X');
    const rate = Number(result.regularMarketPrice || 0);
    if (rate > 0) return { rate, source: 'yahoo' };
  } catch (error) {
    console.error(`Yahoo TWD=X error: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const rateRes = await fetch("https://open.er-api.com/v6/latest/USD", { cache: 'no-store' });
    if (rateRes.ok) {
      const rateData = await rateRes.json();
      const rate = Number(rateData?.rates?.TWD || 0);
      if (rate > 0) return { rate, source: 'er-api' };
    }
  } catch (error) {
    console.error(`er-api fallback error: ${error instanceof Error ? error.message : String(error)}`);
  }
  return null;
}

// 🌟 幣安：用 getUserAsset 抓所有帳戶資產總覽（跟 App 首頁「預估總價值」一致）
// priceMap（全市場報價，公開端點）由呼叫端在同一輪同步中只抓一次、所有帳戶共用傳入，
// 避免每個帳戶都重打一次全市場報價、隨帳戶數放大對 Binance 的請求權重。
async function fetchBinanceTotalUsd(apiKey: string, apiSecret: string, priceMap: Map<string, number>): Promise<number> {
  const crypto = await import('crypto');
  const timestamp = Date.now();
  const query = `timestamp=${timestamp}`;
  const sig = crypto.default.createHmac('sha256', apiSecret).update(query).digest('hex');

  // 現貨帳戶已包含所有餘額（含 LD 理財 token）
  const r = await fetch(`https://api.binance.com/api/v3/account?${query}&signature=${sig}`, {
    headers: { 'X-MBX-APIKEY': apiKey },
  });
  const data = await r.json() as any;
  if (!data.balances) throw new Error('Binance API error: ' + JSON.stringify(data));

  const balances: Array<{ asset: string; free: string; locked: string }> = data.balances;
  const holdings = balances.filter(b => Number(b.free) + Number(b.locked) > 0);

  let totalUsd = 0;

  for (const b of holdings) {
    const amount = Number(b.free) + Number(b.locked);
    // LD 前綴是理財 token，去掉 LD 就是原始幣種（LDUSDT → USDT）
    const asset = b.asset.startsWith('LD') ? b.asset.slice(2) : b.asset;

    if (['USDT', 'USDC', 'BUSD', 'USD'].includes(asset)) {
      totalUsd += amount;
    } else {
      const price = priceMap.get(`${asset}USDT`) || priceMap.get(`${asset}BTC`) ? 
        (priceMap.get(`${asset}USDT`) || (priceMap.get(`${asset}BTC`)! * (priceMap.get('BTCUSDT') || 0))) : 0;
      totalUsd += amount * price;
    }
  }

  return totalUsd;
}

// 🌟 OKX：用帳戶餘額端點的 totalEq（OKX 已直接算好全帳戶美元權益），不用逐幣種換算
async function fetchOkxTotalUsd(apiKey: string, apiSecret: string, passphrase: string): Promise<number> {
  const crypto = await import('crypto');
  const timestamp = new Date().toISOString();
  const requestPath = '/api/v5/account/balance';
  const prehash = `${timestamp}GET${requestPath}`;
  const sign = crypto.default.createHmac('sha256', apiSecret).update(prehash).digest('base64');

  const r = await fetch(`https://www.okx.com${requestPath}`, {
    headers: {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': passphrase,
      'Content-Type': 'application/json',
    },
  });
  const data = await r.json() as any;
  if (data.code !== '0') throw new Error('OKX API error: ' + JSON.stringify(data));
  return Number(data.data?.[0]?.totalEq || 0);
}

// 🌟 Coinbase：/v2/exchange-rates 是公開端點（USD 對各幣別匯率），同一輪只查一次、所有帳戶共用，
// 再用 /v2/accounts 抓各帳戶餘額換算成美元加總。
async function fetchCoinbasePriceMap(): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>([['USD', 1], ['USDC', 1], ['USDT', 1], ['DAI', 1]]);
  const r = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=USD');
  const data = await r.json() as any;
  const rates = data?.data?.rates || {};
  for (const [ccy, rateStr] of Object.entries(rates)) {
    const rate = Number(rateStr);
    if (rate > 0) priceMap.set(ccy, 1 / rate);
  }
  return priceMap;
}

async function fetchCoinbaseTotalUsd(apiKey: string, apiSecret: string, priceMap: Map<string, number>): Promise<number> {
  const crypto = await import('crypto');
  let totalUsd = 0;
  let nextUri: string | null = '/v2/accounts?limit=100';

  while (nextUri) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sign = crypto.default.createHmac('sha256', apiSecret).update(`${timestamp}GET${nextUri}`).digest('hex');
    const r = await fetch(`https://api.coinbase.com${nextUri}`, {
      headers: {
        'CB-ACCESS-KEY': apiKey,
        'CB-ACCESS-SIGN': sign,
        'CB-ACCESS-TIMESTAMP': timestamp,
        'CB-VERSION': '2023-01-01',
      },
    });
    const data = await r.json() as any;
    if (data.errors) throw new Error('Coinbase API error: ' + JSON.stringify(data.errors));

    const accounts: Array<{ balance: { amount: string; currency: string } }> = data.data || [];
    for (const acc of accounts) {
      const amount = Number(acc.balance?.amount || 0);
      if (amount <= 0) continue;
      const price = priceMap.get(acc.balance.currency) || 0;
      totalUsd += amount * price;
    }
    nextUri = data.pagination?.next_uri || null;
  }

  return totalUsd;
}

export async function GET(request: NextRequest) {
  // 這支會更新「全部使用者」的報價，開放給：內部 cron，或任一已登入使用者（App 內按「更新」時呼叫）。
  // 目的是擋掉匿名外部呼叫者無限次濫用，不是做逐使用者的權限區分。
  const isCron = isTrustedCronRequest(request);
  if (!isCron && !getUserIdFromRequest(request)) {
    return NextResponse.json({ message: "未授權" }, { status: 401 });
  }

  // 使用者手動按「更新」按太快，直接跳過這次外部 API 呼叫（cron 排程本身間隔已經夠長，不受此限制）
  if (!isCron && Date.now() - lastSyncCompletedAt < THROTTLE_MS) {
    return NextResponse.json({ message: "更新太頻繁，請稍後再試", throttled: true });
  }

  const now = new Date();
  const results = {
    timestamp: new Date().toISOString(),
    manualUpdates: [] as Array<{ symbol: string; category: string; price: number; currentValue: number }>,
    bitfinexUpdates: [] as Array<{ accountName: string; symbol: string; quantity: number; usdPrice: number; twdValue: number }>,
    binanceUpdates: [] as Array<{ accountName: string; quantity: number; twdValue: number }>,
    okxUpdates: [] as Array<{ accountName: string; quantity: number; twdValue: number }>,
    coinbaseUpdates: [] as Array<{ accountName: string; quantity: number; twdValue: number }>,
    databaseUpdate: null as any,
    errors: [] as string[],
  };

  const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

  const rateResult = await getUsdToTwdRate(yahoo);
  const usdToTwdRate = rateResult?.rate ?? null;

  if (!usdToTwdRate) {
    results.errors.push('USD/TWD rate unavailable from all sources — skipping USD-denominated updates this run');
  } else {
    console.log(`[Rate] USD/TWD = ${usdToTwdRate} (source: ${rateResult!.source})`);
  }

  // ─── 手動帳戶（台股、美股、加密貨幣）───────────────────────────
  // 同一輪同步中，不論有多少個帳戶／使用者持有同一檔 symbol，都只查一次報價並共用結果，
  // 避免使用者數量增長後對報價來源的請求量隨帳戶數線性放大而被限流／封鎖。
  // 另外，收盤後價格不會變，未開盤的類別這一輪直接跳過，不浪費請求額度。
  try {
    const manualAccounts = await prisma.account.findMany({
      where: {
        isActive: true,
        isApiConnected: false,
        category: { in: ['TAIWAN_STOCK', 'US_STOCK', 'CRYPTO'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    const quoteSymbolMap = new Map<string, { category: string; quoteSymbol: string; rawSymbol: string }>();
    for (const account of manualAccounts) {
      const symbol = account.symbol?.trim();
      if (!symbol) continue;
      // 開盤時間限制只套用在背景 cron（省請求額度）；使用者手動按「更新」一律照查，
      // 讓「按了卻沒反應」的情況不會發生，即使收盤價理論上不會變也讓他們查得到最新結果。
      if (isCron && !isMarketOpenForCategory(account.category, now)) continue;
      const quoteSymbol = getYahooQuoteSymbol(account.category, symbol);
      if (!quoteSymbolMap.has(quoteSymbol)) quoteSymbolMap.set(quoteSymbol, { category: account.category, quoteSymbol, rawSymbol: symbol });
    }

    const priceBySymbol = new Map<string, number>();
    // symbol 數量會隨帳戶／使用者數增加，序列 await 會讓一輪同步的時間線性拉長，
    // 改成有限併發（同時最多 8 檔）平行查詢，同時避免無限併發把外部 API 瞬間打爆。
    await runWithConcurrency(Array.from(quoteSymbolMap.values()), 8, async ({ category, quoteSymbol, rawSymbol }) => {
      try {
        // 台股優先用證交所自己的公開行情端點，查不到（例如興櫃、代碼格式特殊）才退回 Yahoo
        if (category === 'TAIWAN_STOCK') {
          const twsePrice = await getTwseQuote(rawSymbol);
          if (twsePrice) {
            priceBySymbol.set(quoteSymbol, twsePrice);
            return;
          }
        }
        const quoteResult = await yahoo.quote(quoteSymbol);
        const marketPrice = Number(quoteResult.regularMarketPrice || 0);
        if (marketPrice) priceBySymbol.set(quoteSymbol, marketPrice);
      } catch (error) {
        const errorMsg = `Quote error for ${quoteSymbol}: ${error instanceof Error ? error.message : String(error)}`;
        results.errors.push(errorMsg);
        console.error(errorMsg);
      }
    });

    for (const account of manualAccounts) {
      const symbol = account.symbol?.trim();
      if (!symbol) continue;

      try {
        const quoteSymbol = getYahooQuoteSymbol(account.category, symbol);
        const marketPrice = priceBySymbol.get(quoteSymbol);
        if (!marketPrice) continue;

        let currentPrice: number;
        let currentValue: number;

        if (account.category === 'TAIWAN_STOCK') {
          currentPrice = marketPrice;
          currentValue = (account.quantity || 0) * currentPrice;
        } else {
          if (!usdToTwdRate) {
            results.errors.push(`Skipped ${account.symbol}: no USD/TWD rate available`);
            continue;
          }
          currentPrice = marketPrice;
          currentValue = (account.quantity || 0) * currentPrice * usdToTwdRate;
        }

        await prisma.account.update({
          where: { id: account.id },
          data: { currentPrice, currentValue },
        });

        results.manualUpdates.push({ symbol: quoteSymbol, category: account.category, price: currentPrice, currentValue });
      } catch (error) {
        const errorMsg = `Update error for ${account.symbol}: ${error instanceof Error ? error.message : String(error)}`;
        results.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }
  } catch (error) {
    results.errors.push(`Manual account update error: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ─── Bitfinex ────────────────────────────────────────────────
  // 錢包餘額（privatePostAuthRWallets）需要各使用者自己的 API Key，無法共用。
  // 但市場報價（fetchTickers）是公開資料，同一輪只查一次、所有帳戶共用，避免隨帳戶數重複打公開端點。
  try {
    const bitfinexAccounts = await prisma.account.findMany({
      where: { isActive: true, isApiConnected: true, apiSource: 'BITFINEX', category: 'CRYPTO' },
    });

    let sharedTickers: any = {};
    if (bitfinexAccounts.length > 0) {
      try {
        sharedTickers = await new ccxt.bitfinex({ enableRateLimit: true }).fetchTickers();
      } catch (e) {
        results.errors.push(`Bitfinex shared tickers error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await runWithConcurrency(bitfinexAccounts, 5, async (account) => {
      try {
        if (!account.apiKey || !account.apiSecret) return;

        const exchange = new ccxt.bitfinex({
          apiKey: decryptOrLegacyPlaintext(account.apiKey.trim()),
          secret: decryptOrLegacyPlaintext(account.apiSecret.trim()),
          enableRateLimit: true,
        });

        const wallets = await exchange.privatePostAuthRWallets();
        let totalUsdValue = 0;
        const tickers = sharedTickers;

        for (const w of wallets) {
          const coin = w[1];
          const amount = Number(w[2]);
          if (amount <= 0) continue;
          const normalizedCoin = coin === 'UST' ? 'USDT' : coin;
          if (normalizedCoin === "USD" || normalizedCoin === "USDT" || normalizedCoin === "USDC") {
            totalUsdValue += amount;
          } else {
            const pairUsd = `${normalizedCoin}/USD`;
            const pairUsdt = `${normalizedCoin}/USDT`;
            if (tickers[pairUsd]?.last) totalUsdValue += amount * tickers[pairUsd].last;
            else if (tickers[pairUsdt]?.last) totalUsdValue += amount * tickers[pairUsdt].last;
          }
        }

        if (totalUsdValue === 0) return;
        if (!usdToTwdRate) {
          results.errors.push(`Skipped Bitfinex account ${account.name}: no USD/TWD rate available`);
          return;
        }

        const twdValue = totalUsdValue * usdToTwdRate;
        await prisma.account.update({
          where: { id: account.id },
          data: { quantity: totalUsdValue, currentPrice: 1, currentValue: twdValue, lastApiSyncAt: new Date(), apiSyncError: null },
        });

        results.bitfinexUpdates.push({ accountName: account.name, symbol: 'TOTAL_USD', quantity: totalUsdValue, usdPrice: 1, twdValue });
        console.log(`[Bitfinex] 同步成功！帳戶: ${account.name}, 總計: ${totalUsdValue.toFixed(2)} USD`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.errors.push(`[Bitfinex] 帳戶 ${account.name} 串接失敗: ${errorMsg}`);
        await prisma.account.update({
          where: { id: account.id },
          data: { apiSyncError: errorMsg },
        }).catch(() => {});
      }
    });
  } catch (error) {
    results.errors.push(`Bitfinex sync error: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ─── 幣安 Binance ────────────────────────────────────────────
  // ticker/price 是公開端點，同一輪只查一次、所有帳戶共用，避免隨帳戶數重複打全市場報價。
  try {
    const binanceAccounts = await prisma.account.findMany({
      where: { isActive: true, isApiConnected: true, apiSource: 'BINANCE', category: 'CRYPTO' },
    });

    let sharedPriceMap = new Map<string, number>();
    if (binanceAccounts.length > 0) {
      try {
        const pricesRes = await fetch('https://api.binance.com/api/v3/ticker/price');
        const prices = await pricesRes.json() as Array<{ symbol: string; price: string }>;
        sharedPriceMap = new Map(prices.map(p => [p.symbol, Number(p.price)]));
      } catch (e) {
        results.errors.push(`Binance shared ticker/price error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await runWithConcurrency(binanceAccounts, 5, async (account) => {
      try {
        if (!account.apiKey || !account.apiSecret) return;
        if (!usdToTwdRate) {
          results.errors.push(`Skipped Binance account ${account.name}: no USD/TWD rate available`);
          return;
        }

        const totalUsdValue = await fetchBinanceTotalUsd(decryptOrLegacyPlaintext(account.apiKey.trim()), decryptOrLegacyPlaintext(account.apiSecret.trim()), sharedPriceMap);
        if (totalUsdValue === 0) return;

        const twdValue = totalUsdValue * usdToTwdRate;
        await prisma.account.update({
          where: { id: account.id },
          data: { quantity: totalUsdValue, currentPrice: 1, currentValue: twdValue, lastApiSyncAt: new Date(), apiSyncError: null },
        });

        results.binanceUpdates.push({ accountName: account.name, quantity: totalUsdValue, twdValue });
        console.log(`[Binance] 同步成功！帳戶: ${account.name}, 總計: ${totalUsdValue.toFixed(2)} USD`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.errors.push(`[Binance] 帳戶 ${account.name} 串接失敗: ${errorMsg}`);
        await prisma.account.update({
          where: { id: account.id },
          data: { apiSyncError: errorMsg },
        }).catch(() => {});
      }
    });
  } catch (error) {
    results.errors.push(`Binance sync error: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ─── OKX ─────────────────────────────────────────────────────
  try {
    const okxAccounts = await prisma.account.findMany({
      where: { isActive: true, isApiConnected: true, apiSource: 'OKX', category: 'CRYPTO' },
    });

    await runWithConcurrency(okxAccounts, 5, async (account) => {
      try {
        if (!account.apiKey || !account.apiSecret || !account.apiPassphrase) return;
        if (!usdToTwdRate) {
          results.errors.push(`Skipped OKX account ${account.name}: no USD/TWD rate available`);
          return;
        }

        const totalUsdValue = await fetchOkxTotalUsd(
          decryptOrLegacyPlaintext(account.apiKey.trim()),
          decryptOrLegacyPlaintext(account.apiSecret.trim()),
          decryptOrLegacyPlaintext(account.apiPassphrase.trim()),
        );
        if (totalUsdValue === 0) return;

        const twdValue = totalUsdValue * usdToTwdRate;
        await prisma.account.update({
          where: { id: account.id },
          data: { quantity: totalUsdValue, currentPrice: 1, currentValue: twdValue, lastApiSyncAt: new Date(), apiSyncError: null },
        });

        results.okxUpdates.push({ accountName: account.name, quantity: totalUsdValue, twdValue });
        console.log(`[OKX] 同步成功！帳戶: ${account.name}, 總計: ${totalUsdValue.toFixed(2)} USD`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.errors.push(`[OKX] 帳戶 ${account.name} 串接失敗: ${errorMsg}`);
        await prisma.account.update({
          where: { id: account.id },
          data: { apiSyncError: errorMsg },
        }).catch(() => {});
      }
    });
  } catch (error) {
    results.errors.push(`OKX sync error: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ─── Coinbase ────────────────────────────────────────────────
  // exchange-rates 是公開端點，同一輪只查一次、所有帳戶共用，避免隨帳戶數重複打對外請求。
  try {
    const coinbaseAccounts = await prisma.account.findMany({
      where: { isActive: true, isApiConnected: true, apiSource: 'COINBASE', category: 'CRYPTO' },
    });

    let sharedPriceMap = new Map<string, number>();
    if (coinbaseAccounts.length > 0) {
      try {
        sharedPriceMap = await fetchCoinbasePriceMap();
      } catch (e) {
        results.errors.push(`Coinbase shared exchange-rates error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await runWithConcurrency(coinbaseAccounts, 5, async (account) => {
      try {
        if (!account.apiKey || !account.apiSecret) return;
        if (!usdToTwdRate) {
          results.errors.push(`Skipped Coinbase account ${account.name}: no USD/TWD rate available`);
          return;
        }

        const totalUsdValue = await fetchCoinbaseTotalUsd(decryptOrLegacyPlaintext(account.apiKey.trim()), decryptOrLegacyPlaintext(account.apiSecret.trim()), sharedPriceMap);
        if (totalUsdValue === 0) return;

        const twdValue = totalUsdValue * usdToTwdRate;
        await prisma.account.update({
          where: { id: account.id },
          data: { quantity: totalUsdValue, currentPrice: 1, currentValue: twdValue, lastApiSyncAt: new Date(), apiSyncError: null },
        });

        results.coinbaseUpdates.push({ accountName: account.name, quantity: totalUsdValue, twdValue });
        console.log(`[Coinbase] 同步成功！帳戶: ${account.name}, 總計: ${totalUsdValue.toFixed(2)} USD`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.errors.push(`[Coinbase] 帳戶 ${account.name} 串接失敗: ${errorMsg}`);
        await prisma.account.update({
          where: { id: account.id },
          data: { apiSyncError: errorMsg },
        }).catch(() => {});
      }
    });
  } catch (error) {
    results.errors.push(`Coinbase sync error: ${error instanceof Error ? error.message : String(error)}`);
  }

  results.databaseUpdate = {
    message: 'Database update completed',
    manualUpdates: results.manualUpdates.length,
    bitfinexUpdates: results.bitfinexUpdates.length,
    binanceUpdates: results.binanceUpdates.length,
    okxUpdates: results.okxUpdates.length,
    coinbaseUpdates: results.coinbaseUpdates.length,
  };

  lastSyncCompletedAt = Date.now();
  return NextResponse.json(results);
}



