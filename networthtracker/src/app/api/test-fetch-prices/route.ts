import ccxt from "ccxt";
import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from "yahoo-finance2";
import { PrismaClient } from '@prisma/client';
import { Spot } from '@binance/connector';
import { decrypt } from '@/lib/crypto';
import { getUserIdFromRequest } from '@/lib/auth';
import { isTrustedCronRequest } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

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
  return normalizedSymbol;
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

export async function GET(request: NextRequest) {
  // 這支會更新「全部使用者」的報價，開放給：內部 cron，或任一已登入使用者（App 內按「更新」時呼叫）。
  // 目的是擋掉匿名外部呼叫者無限次濫用，不是做逐使用者的權限區分。
  if (!isTrustedCronRequest(request) && !getUserIdFromRequest(request)) {
    return NextResponse.json({ message: "未授權" }, { status: 401 });
  }

  const results = {
    timestamp: new Date().toISOString(),
    manualUpdates: [] as Array<{ symbol: string; category: string; price: number; currentValue: number }>,
    bitfinexUpdates: [] as Array<{ accountName: string; symbol: string; quantity: number; usdPrice: number; twdValue: number }>,
    binanceUpdates: [] as Array<{ accountName: string; quantity: number; twdValue: number }>,
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
  // 避免使用者數量增長後對 Yahoo 的請求量隨帳戶數線性放大而被限流／封鎖。
  try {
    const manualAccounts = await prisma.account.findMany({
      where: {
        isActive: true,
        isApiConnected: false,
        category: { in: ['TAIWAN_STOCK', 'US_STOCK', 'CRYPTO'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    const quoteSymbolMap = new Map<string, { category: string; quoteSymbol: string }>();
    for (const account of manualAccounts) {
      const symbol = account.symbol?.trim();
      if (!symbol) continue;
      const quoteSymbol = getYahooQuoteSymbol(account.category, symbol);
      if (!quoteSymbolMap.has(quoteSymbol)) quoteSymbolMap.set(quoteSymbol, { category: account.category, quoteSymbol });
    }

    const priceBySymbol = new Map<string, number>();
    for (const { quoteSymbol } of quoteSymbolMap.values()) {
      try {
        const quoteResult = await yahoo.quote(quoteSymbol);
        const marketPrice = Number(quoteResult.regularMarketPrice || 0);
        if (marketPrice) priceBySymbol.set(quoteSymbol, marketPrice);
      } catch (error) {
        const errorMsg = `Quote error for ${quoteSymbol}: ${error instanceof Error ? error.message : String(error)}`;
        results.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

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

    for (const account of bitfinexAccounts) {
      try {
        if (!account.apiKey || !account.apiSecret) continue;

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

        if (totalUsdValue === 0) continue;
        if (!usdToTwdRate) {
          results.errors.push(`Skipped Bitfinex account ${account.name}: no USD/TWD rate available`);
          continue;
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
    }
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

    for (const account of binanceAccounts) {
      try {
        if (!account.apiKey || !account.apiSecret) continue;
        if (!usdToTwdRate) {
          results.errors.push(`Skipped Binance account ${account.name}: no USD/TWD rate available`);
          continue;
        }

        const totalUsdValue = await fetchBinanceTotalUsd(decryptOrLegacyPlaintext(account.apiKey.trim()), decryptOrLegacyPlaintext(account.apiSecret.trim()), sharedPriceMap);
        if (totalUsdValue === 0) continue;

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
    }
  } catch (error) {
    results.errors.push(`Binance sync error: ${error instanceof Error ? error.message : String(error)}`);
  }

  results.databaseUpdate = {
    message: 'Database update completed',
    manualUpdates: results.manualUpdates.length,
    bitfinexUpdates: results.bitfinexUpdates.length,
    binanceUpdates: results.binanceUpdates.length,
  };

  return NextResponse.json(results);
}



