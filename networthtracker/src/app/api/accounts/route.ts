// src/app/api/accounts/route.ts
export const dynamic = "force-dynamic";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getUserIdFromRequest } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { calcPaidInstallments, calcLoanBalance } from "@/lib/loan";
import { getEntitlementsForUser, computeLockedAccountIds } from "@/lib/entitlements";


import { prisma } from "@/lib/prisma";

const categoriesRequiringSymbol = ["TAIWAN_STOCK", "US_STOCK", "CRYPTO"];
const fixedValueCategories = ["CASH", "BANK_ACCOUNT", "FIXED_ASSET", "RECEIVABLE", "PAYABLE", "MORTGAGE", "CAR_LOAN", "CREDIT_LOAN"];

// 回傳的 price 一律是「該標的原始幣別」的單價（跟帳戶 currency 一致，前端「即時股價」就是顯示這個），
// value 才是換算成 TWD 後、乘以持有數量前的單價換算基準；currentValue 由呼叫端用 quantity * value 算。
async function fetchMarketPrice(category: string, rawSymbol: string): Promise<{ price: number; value: number }> {
  const symbol = category === "TAIWAN_STOCK" && !rawSymbol.toUpperCase().endsWith(".TW")
    ? rawSymbol.toUpperCase() + ".TW"
    : rawSymbol;
  const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

  if (category === "CRYPTO") {
    const normalizedSymbol = symbol.toUpperCase();
    const cryptoResponse = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd"
    );

    if (!cryptoResponse.ok) throw new Error(`CoinGecko API returned ${cryptoResponse.status}`);

    const cryptoData = await cryptoResponse.json();
    const usdPrice =
      normalizedSymbol === "BTC" || normalizedSymbol === "BITCOIN"
        ? Number(cryptoData.bitcoin?.usd || 0)
        : normalizedSymbol === "ETH" || normalizedSymbol === "ETHEREUM"
          ? Number(cryptoData.ethereum?.usd || 0)
          : 0;

    if (!usdPrice) throw new Error(`Unsupported or missing crypto price for ${symbol}`);

    const usdToTwdResult = await yahoo.quote("TWD=X");
    const usdToTwdRate = Number(usdToTwdResult.regularMarketPrice || 1);
    return { price: usdPrice, value: usdPrice * usdToTwdRate };
  }

  const quoteResult = await yahoo.quote(symbol);
  const marketPrice = Number(quoteResult.regularMarketPrice || 0);

  if (category === "US_STOCK") {
    const usdToTwdResult = await yahoo.quote("TWD=X");
    const usdToTwdRate = Number(usdToTwdResult.regularMarketPrice || 1);
    return { price: marketPrice, value: marketPrice * usdToTwdRate };
  }

  return { price: marketPrice, value: marketPrice };
}

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  const accounts = await prisma.account.findMany({
    where: { isActive: true, userId },
    orderBy: { createdAt: "desc" },
  });

  const entitlements = await getEntitlementsForUser(userId);
  const lockedAccountIds = computeLockedAccountIds(accounts, entitlements.limits.maxAccounts);

  // 有設定總期數的負債帳戶，額外算一下「已繳幾期」給前端顯示進度：
  // 有填貸款起算日「跟」扣款日就用起算日推算（不怕帳戶是後來才補登、或中間漏繳打亂交易筆數），
  // 不然退回舊方法：用這個帳戶累積的 AUTO_DEDUCTION 交易筆數概算。
  const idsNeedingTxCount = accounts
    .filter((a) => a.loanTermMonths != null && !(a.loanStartDate && a.deductionDate != null))
    .map((a) => a.id);
  let paidInstallmentsByAccount: Record<string, number> = {};
  if (idsNeedingTxCount.length > 0) {
    const grouped = await prisma.transaction.groupBy({
      by: ["accountId"],
      where: { accountId: { in: idsNeedingTxCount }, type: "AUTO_DEDUCTION" },
      _count: { _all: true },
    });
    paidInstallmentsByAccount = Object.fromEntries(grouped.map((g) => [g.accountId, g._count._all]));
  }

  // 交易所 API Key/Secret/Passphrase 一律不回傳給前端（只在後端解密使用），避免明碼暴露在網路回應中
  const sanitized = accounts.map(({ apiKey, apiSecret, apiPassphrase, ...rest }) => {
    const hasFullLoanInfo = rest.type === "LIABILITY" && rest.loanStartDate != null && rest.deductionDate != null && rest.monthlyDeductionAmount != null;

    const paidInstallments = rest.loanTermMonths == null ? null
      : hasFullLoanInfo ? Math.min(rest.loanTermMonths, calcPaidInstallments(new Date(rest.loanStartDate!), rest.deductionDate!))
      : (paidInstallmentsByAccount[rest.id] ?? 0);

    // 「貸款總金額」欄位存的是本金（quantity），餘額（currentValue，卡片上顯示的數字）改由本金＋期數即時算出，
    // 不用等下一次自動扣款才更新，隨時打開 App 看到的都是當下應有的餘額。
    let currentValue = rest.currentValue;
    if (hasFullLoanInfo) {
      const n = calcPaidInstallments(new Date(rest.loanStartDate!), rest.deductionDate!);
      const cappedN = rest.loanTermMonths != null ? Math.min(n, rest.loanTermMonths) : n;
      currentValue = calcLoanBalance(rest.quantity ?? 0, rest.monthlyDeductionAmount!, rest.interestRate, cappedN);
    }

    return {
      ...rest,
      currentValue,
      hasApiCredentials: Boolean(apiKey && apiSecret),
      paidInstallments,
      isLocked: lockedAccountIds.has(rest.id),
    };
  });

  return NextResponse.json(sanitized);
}

export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Invalid JSON payload." }, { status: 400 });
  }

  const {
    name, type, category, symbol, quantity, currency,
    isApiConnected, apiSource, apiKey, apiSecret, apiPassphrase,
    monthlyDeductionAmount, deductionDate, interestRate, loanTermMonths, loanStartDate,
  } = body as {
    name?: string; type?: string; category?: string; symbol?: string;
    quantity?: number | string; currency?: string; isApiConnected?: boolean;
    apiSource?: string | null; apiKey?: string | null; apiSecret?: string | null; apiPassphrase?: string | null;
    monthlyDeductionAmount?: number | string; deductionDate?: number | string;
    interestRate?: number | string; loanTermMonths?: number | string; loanStartDate?: string | null;
  };

  if (!name || !type || !category || !currency) {
    return NextResponse.json({ message: "Please provide name, type, category, and currency." }, { status: 400 });
  }

  const isApiMode = Boolean(isApiConnected);

  const entitlements = await getEntitlementsForUser(userId);

  if (isApiMode && !entitlements.features.apiSync) {
    return NextResponse.json({ message: "交易所自動同步是 Pro 專屬功能，升級 Pro 解鎖，免手動輸入、資產即時自動更新。", code: "UPGRADE_REQUIRED", feature: "apiSync" }, { status: 402 });
  }

  if (entitlements.limits.maxAccounts !== null) {
    const activeAccountCount = await prisma.account.count({ where: { userId, isActive: true } });
    if (activeAccountCount >= entitlements.limits.maxAccounts) {
      return NextResponse.json({ message: `帳戶數已達免費方案上限（${entitlements.limits.maxAccounts} 個），升級 Pro 解鎖無限帳戶，完整掌握所有資產。`, code: "UPGRADE_REQUIRED", feature: "maxAccounts" }, { status: 402 });
    }
  }
  const trimmedSymbol = typeof symbol === "string" ? symbol.trim() : "";
  const fallbackSymbol = (typeof apiSource === "string" ? apiSource.trim() : "") || "BITFINEX";
  const requiresSymbolValidation =
    (category === "CRYPTO" || category === "STOCK" || category === "TAIWAN_STOCK" || category === "US_STOCK") &&
    !isApiMode && !trimmedSymbol;

  if (requiresSymbolValidation) {
    return NextResponse.json({ message: "Stocks and crypto accounts require a symbol." }, { status: 400 });
  }

  const quantityValue =
    quantity === undefined || quantity === null || quantity === "" ? 0 : Number(quantity);

  if (!isApiMode && Number.isNaN(quantityValue)) {
    return NextResponse.json({ message: "Quantity must be a valid number." }, { status: 400 });
  }

  let deductionAmountValue: number | null = null;
  let deductionDateValue: number | null = null;
  let interestRateValue: number | null = null;
  let loanTermMonthsValue: number | null = null;
  let loanStartDateValue: Date | null = null;

  if (type === "LIABILITY") {
    deductionAmountValue =
      monthlyDeductionAmount === undefined || monthlyDeductionAmount === null || monthlyDeductionAmount === ""
        ? null : Number(monthlyDeductionAmount);

    deductionDateValue =
      deductionDate === undefined || deductionDate === null || deductionDate === ""
        ? null : Number(deductionDate);

    if (deductionAmountValue !== null && Number.isNaN(deductionAmountValue)) {
      return NextResponse.json({ message: "Monthly deduction amount must be a valid number." }, { status: 400 });
    }

    if (deductionDateValue !== null && (!Number.isInteger(deductionDateValue) || deductionDateValue < 1 || deductionDateValue > 31)) {
      return NextResponse.json({ message: "Deduction date must be between 1 and 31." }, { status: 400 });
    }

    // 利率、期數都是非必填：只是選填的補充資訊，用來讓自動扣款拆分本金/利息、顯示還款進度
    interestRateValue =
      interestRate === undefined || interestRate === null || interestRate === "" ? null : Number(interestRate);
    loanTermMonthsValue =
      loanTermMonths === undefined || loanTermMonths === null || loanTermMonths === "" ? null : Number(loanTermMonths);

    if (interestRateValue !== null && (Number.isNaN(interestRateValue) || interestRateValue < 0)) {
      return NextResponse.json({ message: "Interest rate must be a valid non-negative number." }, { status: 400 });
    }
    if (loanTermMonthsValue !== null && (!Number.isInteger(loanTermMonthsValue) || loanTermMonthsValue < 1)) {
      return NextResponse.json({ message: "Loan term must be a positive integer." }, { status: 400 });
    }

    if (typeof loanStartDate === "string" && loanStartDate.trim()) {
      const parsed = new Date(loanStartDate);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ message: "Loan start date must be a valid date." }, { status: 400 });
      }
      loanStartDateValue = parsed;
    }
  }

  let currentPriceValue = 1;
  let currentValueValue = isApiMode ? 0 : quantityValue;

  if (categoriesRequiringSymbol.includes(category) && !isApiMode) {
    try {
      const { price, value } = await fetchMarketPrice(category, trimmedSymbol);
      currentPriceValue = Number(price || 0);
      currentValueValue = quantityValue * Number(value || 0);
    } catch (error) {
      console.error("Failed to fetch current market price for new account:", error);
      currentPriceValue = 0;
      currentValueValue = 0;
    }
  } else if (fixedValueCategories.includes(category)) {
    currentPriceValue = 1;
    currentValueValue = quantityValue;
  }

  // 「貸款總金額」（quantityValue）是本金，填了起算日+扣款日就自動算出目前應有餘額取代總金額顯示；
  // 沒填起算日就維持舊行為（總金額本身當作目前餘額，用手動/自動扣款遞減）。
  if (type === "LIABILITY" && loanStartDateValue && deductionDateValue != null && deductionAmountValue != null) {
    const n = calcPaidInstallments(loanStartDateValue, deductionDateValue);
    const cappedN = loanTermMonthsValue != null ? Math.min(n, loanTermMonthsValue) : n;
    currentValueValue = calcLoanBalance(quantityValue, deductionAmountValue, interestRateValue, cappedN);
  }

  const account = await prisma.account.create({
    data: {
      id: randomUUID(),
      userId,                    // 🌟 关键：绑定到登入用户
      name: name.trim(),
      type: type as any,
      category: category as any,
      symbol: isApiMode ? (trimmedSymbol || fallbackSymbol) : (trimmedSymbol || null),
      quantity: quantityValue,
      currency: currency as any,
      currentPrice: currentPriceValue,
      currentValue: currentValueValue,
      isApiConnected: isApiMode,
      apiSource: isApiMode ? (apiSource?.trim() || "BITFINEX") : null,
      apiKey: isApiMode && apiKey?.trim() ? encrypt(apiKey.trim()) : null,
      apiSecret: isApiMode && apiSecret?.trim() ? encrypt(apiSecret.trim()) : null,
      apiPassphrase: isApiMode && apiPassphrase?.trim() ? encrypt(apiPassphrase.trim()) : null,
      monthlyDeductionAmount: deductionAmountValue,
      deductionDate: deductionDateValue,
      interestRate: interestRateValue,
      loanTermMonths: loanTermMonthsValue,
      loanStartDate: loanStartDateValue,
    },
  });

  const { apiKey: _apiKey, apiSecret: _apiSecret, apiPassphrase: _apiPassphrase, ...sanitizedAccount } = account;
  return NextResponse.json({ ...sanitizedAccount, hasApiCredentials: Boolean(account.apiKey && account.apiSecret) }, { status: 201 });
}