import ccxt from "ccxt";
import { NextResponse } from 'next/server';
import YahooFinance from "yahoo-finance2";
import { PrismaClient } from '@prisma/client';

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

// 🌟 这支 API 是 cron job 内部使用，不需要用户 auth
// 它会更新所有用户的股价，但每笔数据仍然跟着各自的 userId
export async function GET() {
  const results = {
    timestamp: new Date().toISOString(),
    manualUpdates: [] as Array<{ symbol: string; category: string; price: number; currentValue: number }>,
    bitfinexUpdates: [] as Array<{ accountName: string; symbol: string; quantity: number; usdPrice: number; twdValue: number }>,
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
    const errorMsg = `Manual account update error: ${error instanceof Error ? error.message : String(error)}`;
    results.errors.push(errorMsg);
    console.error(errorMsg);
  }

  try {
    const apiAccounts = await prisma.account.findMany({
      where: { isActive: true, isApiConnected: true, apiSource: 'BITFINEX', category: 'CRYPTO' },
    });

    for (const account of apiAccounts) {
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
          data: { quantity: totalUsdValue, currentPrice: 1, currentValue: twdValue },
        });

        results.bitfinexUpdates.push({ accountName: account.name, symbol: 'TOTAL_USD', quantity: totalUsdValue, usdPrice: 1, twdValue });
        console.log(`[Bitfinex] 同步成功！帳戶: ${account.name}, 總計: ${totalUsdValue.toFixed(2)} USD`);
      } catch (err) {
        const errorMsg = `[Bitfinex] 帳戶 ${account.name} 串接失敗: ${err instanceof Error ? err.message : String(err)}`;
        console.error(errorMsg);
        results.errors.push(errorMsg);
      }
    }
  } catch (error) {
    const errorMsg = `Bitfinex sync error: ${error instanceof Error ? error.message : String(error)}`;
    results.errors.push(errorMsg);
    console.error(errorMsg);
  }

  results.databaseUpdate = {
    message: 'Database update completed',
    manualUpdates: results.manualUpdates.length,
    bitfinexUpdates: results.bitfinexUpdates.length,
  };

  return NextResponse.json(results);
}