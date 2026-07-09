import ccxt from "ccxt";
import { NextResponse } from 'next/server';
import YahooFinance from "yahoo-finance2";
import { PrismaClient } from '@prisma/client';
import { Spot } from '@binance/connector';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

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
async function fetchBinanceTotalUsd(apiKey: string, apiSecret: string): Promise<number> {
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

  // 抓現貨行情換算非穩定幣
  const pricesRes = await fetch('https://api.binance.com/api/v3/ticker/price');
  const prices = await pricesRes.json() as Array<{ symbol: string; price: string }>;
  const priceMap = new Map(prices.map(p => [p.symbol, Number(p.price)]));

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

export async function GET() {
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
  try {
    const manualAccounts = await prisma.account.findMany({
      where: {
        isActive: true,
        isApiConnected: false,
        category: { in: ['TAIWAN_STOCK', 'US_STOCK', 'CRYPTO'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const account of manualAccounts) {
      const symbol = account.symbol?.trim();
      if (!symbol) continue;

      try {
        const quoteSymbol = getYahooQuoteSymbol(account.category, symbol);
        const quoteResult = await yahoo.quote(quoteSymbol);
        const marketPrice = Number(quoteResult.regularMarketPrice || 0);
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
        const errorMsg = `Quote error for ${account.symbol}: ${error instanceof Error ? error.message : String(error)}`;
        results.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }
  } catch (error) {
    results.errors.push(`Manual account update error: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ─── Bitfinex ────────────────────────────────────────────────
  try {
    const bitfinexAccounts = await prisma.account.findMany({
      where: { isActive: true, isApiConnected: true, apiSource: 'BITFINEX', category: 'CRYPTO' },
    });

    for (const account of bitfinexAccounts) {
      try {
        if (!account.apiKey || !account.apiSecret) continue;

        const exchange = new ccxt.bitfinex({
          apiKey: account.apiKey.trim(),
          secret: account.apiSecret.trim(),
          enableRateLimit: true,
        });

        const wallets = await exchange.privatePostAuthRWallets();
        let totalUsdValue = 0;
        let tickers: any = {};
        try { tickers = await exchange.fetchTickers(); } catch (e) {}

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
  try {
    const binanceAccounts = await prisma.account.findMany({
      where: { isActive: true, isApiConnected: true, apiSource: 'BINANCE', category: 'CRYPTO' },
    });

    for (const account of binanceAccounts) {
      try {
        if (!account.apiKey || !account.apiSecret) continue;
        if (!usdToTwdRate) {
          results.errors.push(`Skipped Binance account ${account.name}: no USD/TWD rate available`);
          continue;
        }

        const totalUsdValue = await fetchBinanceTotalUsd(account.apiKey.trim(), account.apiSecret.trim());
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



