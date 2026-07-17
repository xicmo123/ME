import { NextRequest, NextResponse } from "next/server"
import YahooFinance from "yahoo-finance2"
import { getUserIdFromRequest } from "@/lib/auth"
import { encrypt } from "@/lib/crypto"
import { calcPaidInstallments, calcLoanBalance } from "@/lib/loan"
import { getEntitlementsForUser } from "@/lib/entitlements"


import { prisma } from "@/lib/prisma";

const categoriesRequiringSymbol = ["TAIWAN_STOCK", "US_STOCK", "JAPAN_STOCK", "KOREA_STOCK", "CRYPTO"]
const fixedValueCategories = ["CASH", "BANK_ACCOUNT", "FIXED_ASSET", "RECEIVABLE", "PAYABLE", "MORTGAGE", "CAR_LOAN", "CREDIT_LOAN"]

// Yahoo Finance 的市場代碼後綴：台股 .TW、日股 .T、韓股 .KS（KOSDAQ 上市的少數代號可能查不到，屬已知限制）
const yahooSuffixByCategory: Record<string, string> = { TAIWAN_STOCK: ".TW", JAPAN_STOCK: ".T", KOREA_STOCK: ".KS" }
// 換算成 TWD 用的匯率代碼（Yahoo「該幣別TWD=X」格式），美股沿用既有的 TWD=X（= USDTWD）
const fxSymbolByCategory: Record<string, string> = { US_STOCK: "TWD=X", JAPAN_STOCK: "JPYTWD=X", KOREA_STOCK: "KRWTWD=X" }

// 回傳的 price 一律是「該標的原始幣別」的單價（跟帳戶 currency 一致，前端「即時股價」就是顯示這個），
// value 才是換算成 TWD 後的單價，給呼叫端算 quantity * value = currentValue 用。
async function fetchMarketPrice(category: string, rawSymbol: string): Promise<{ price: number; value: number }> {
  const suffix = yahooSuffixByCategory[category]
  const symbol = suffix && !rawSymbol.toUpperCase().endsWith(suffix)
    ? rawSymbol.toUpperCase() + suffix
    : rawSymbol;
  const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] })
  if (category === "CRYPTO") {
    const normalizedSymbol = symbol.toUpperCase()
    const cryptoResponse = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd")
    if (!cryptoResponse.ok) throw new Error(`CoinGecko API returned ${cryptoResponse.status}`)
    const cryptoData = await cryptoResponse.json()
    const usdPrice =
      normalizedSymbol === "BTC" || normalizedSymbol === "BITCOIN" ? Number(cryptoData.bitcoin?.usd || 0)
      : normalizedSymbol === "ETH" || normalizedSymbol === "ETHEREUM" ? Number(cryptoData.ethereum?.usd || 0)
      : 0
    if (!usdPrice) throw new Error(`Unsupported or missing crypto price for ${symbol}`)
    const usdToTwdResult = await yahoo.quote("TWD=X")
    const usdToTwdRate = Number(usdToTwdResult.regularMarketPrice || 1)
    return { price: usdPrice, value: usdPrice * usdToTwdRate }
  }
  const quoteResult = await yahoo.quote(symbol)
  const marketPrice = Number(quoteResult.regularMarketPrice || 0)
  const fxSymbol = fxSymbolByCategory[category]
  if (fxSymbol) {
    const fxResult = await yahoo.quote(fxSymbol)
    const fxRate = Number(fxResult.regularMarketPrice || 1)
    return { price: marketPrice, value: marketPrice * fxRate }
  }
  return { price: marketPrice, value: marketPrice }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(request)
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") return NextResponse.json({ message: "Invalid JSON payload." }, { status: 400 })

  const { name, type, category, symbol, quantity, currency, isApiConnected, apiSource, apiKey, apiSecret, apiPassphrase, monthlyDeductionAmount, deductionDate, interestRate, loanTermMonths, loanStartDate, deductFromAccountId } = body as {
    name?: string; type?: string; category?: string; symbol?: string
    quantity?: number | string; currency?: string; isApiConnected?: boolean
    apiSource?: string | null; apiKey?: string | null; apiSecret?: string | null; apiPassphrase?: string | null
    monthlyDeductionAmount?: number | string; deductionDate?: number | string
    interestRate?: number | string; loanTermMonths?: number | string; loanStartDate?: string | null
    deductFromAccountId?: string | null
  }

  if (!name || !type || !category || !currency) {
    return NextResponse.json({ message: "Please provide name, type, category, and currency." }, { status: 400 })
  }

  const isApiMode = category === "CRYPTO" && Boolean(isApiConnected)
  const trimmedSymbol = typeof symbol === "string" ? symbol.trim() : ""
  const fallbackSymbol = (typeof apiSource === "string" ? apiSource.trim() : "") || "BITFINEX"
  const requiresSymbolValidation =
    (category === "CRYPTO" || category === "STOCK" || category === "TAIWAN_STOCK" || category === "US_STOCK") &&
    !isApiMode && !trimmedSymbol

  if (requiresSymbolValidation) return NextResponse.json({ message: "Stocks and crypto accounts require a symbol." }, { status: 400 })

  const quantityValue = quantity === undefined || quantity === null || quantity === "" ? 0 : Number(quantity)
  if (!isApiMode && Number.isNaN(quantityValue)) return NextResponse.json({ message: "Quantity must be a valid number." }, { status: 400 })

  let deductionAmountValue: number | null = null
  let deductionDateValue: number | null = null
  let interestRateValue: number | null = null
  let loanTermMonthsValue: number | null = null
  let loanStartDateValue: Date | null = null

  if (type === "LIABILITY") {
    deductionAmountValue = monthlyDeductionAmount === undefined || monthlyDeductionAmount === null || monthlyDeductionAmount === "" ? null : Number(monthlyDeductionAmount)
    deductionDateValue = deductionDate === undefined || deductionDate === null || deductionDate === "" ? null : Number(deductionDate)
    if (deductionAmountValue !== null && Number.isNaN(deductionAmountValue)) return NextResponse.json({ message: "Monthly deduction amount must be a valid number." }, { status: 400 })
    if (deductionDateValue !== null && (!Number.isInteger(deductionDateValue) || deductionDateValue < 1 || deductionDateValue > 31)) return NextResponse.json({ message: "Deduction date must be between 1 and 31." }, { status: 400 })

    // 利率、期數、起算日都是非必填：只是選填的補充資訊，用來讓自動扣款拆分本金/利息、顯示還款進度
    interestRateValue = interestRate === undefined || interestRate === null || interestRate === "" ? null : Number(interestRate)
    loanTermMonthsValue = loanTermMonths === undefined || loanTermMonths === null || loanTermMonths === "" ? null : Number(loanTermMonths)
    if (interestRateValue !== null && (Number.isNaN(interestRateValue) || interestRateValue < 0)) return NextResponse.json({ message: "Interest rate must be a valid non-negative number." }, { status: 400 })
    if (loanTermMonthsValue !== null && (!Number.isInteger(loanTermMonthsValue) || loanTermMonthsValue < 1)) return NextResponse.json({ message: "Loan term must be a positive integer." }, { status: 400 })

    if (typeof loanStartDate === "string" && loanStartDate.trim()) {
      const parsed = new Date(loanStartDate)
      if (Number.isNaN(parsed.getTime())) return NextResponse.json({ message: "Loan start date must be a valid date." }, { status: 400 })
      loanStartDateValue = parsed
    }
  }

  const existingAccount = await prisma.account.findFirst({ where: { id, userId } })
  if (!existingAccount) return NextResponse.json({ message: "Account not found." }, { status: 404 })

  let deductFromAccountIdValue: string | null = null
  if (type === "LIABILITY" && typeof deductFromAccountId === "string" && deductFromAccountId.trim()) {
    const sourceAccount = await prisma.account.findFirst({
      where: { id: deductFromAccountId.trim(), userId, isActive: true, category: { in: ["CASH", "BANK_ACCOUNT"] } },
    })
    if (!sourceAccount) return NextResponse.json({ message: "扣款來源帳戶不存在或不是現金／銀行帳戶。" }, { status: 400 })
    deductFromAccountIdValue = sourceAccount.id
  }

  // 新啟用 API 自動同步才擋（帳戶本來就已連接的，繼續編輯其他欄位不受影響，避免降級用戶被鎖死既有帳戶）
  if (isApiMode && !existingAccount.isApiConnected) {
    const entitlements = await getEntitlementsForUser(userId)
    if (!entitlements.features.apiSync) {
      return NextResponse.json({ message: "交易所自動同步是 Pro 專屬功能，升級 Pro 解鎖，免手動輸入、資產即時自動更新。", code: "UPGRADE_REQUIRED", feature: "apiSync" }, { status: 402 })
    }
  }

  let nextCurrentPrice = existingAccount.currentPrice ?? 0
  let nextCurrentValue = isApiMode ? 0 : quantityValue

  if (categoriesRequiringSymbol.includes(category) && !isApiMode) {
    try {
      const { price, value } = await fetchMarketPrice(category, trimmedSymbol)
      nextCurrentPrice = Number(price || 0)
      nextCurrentValue = quantityValue * Number(value || 0)
    } catch (error) {
      console.error("Failed to refresh market price for updated account:", error)
      nextCurrentPrice = existingAccount.currentPrice ?? 0
      nextCurrentValue = quantityValue * (existingAccount.currentPrice ?? 0)
    }
  } else if (fixedValueCategories.includes(category)) {
    nextCurrentPrice = 1
    nextCurrentValue = quantityValue
  }

  // 「貸款總金額」（quantityValue）是本金，填了起算日+扣款日就自動算出目前應有餘額取代總金額顯示；
  // 沒填起算日就維持舊行為（總金額本身當作目前餘額，用手動/自動扣款遞減）。
  if (type === "LIABILITY" && loanStartDateValue && deductionDateValue != null && deductionAmountValue != null) {
    const n = calcPaidInstallments(loanStartDateValue, deductionDateValue)
    const cappedN = loanTermMonthsValue != null ? Math.min(n, loanTermMonthsValue) : n
    nextCurrentValue = calcLoanBalance(quantityValue, deductionAmountValue, interestRateValue, cappedN)
  }

  const updatedAccount = await prisma.account.update({
    where: { id },
    data: {
      name: name.trim(), type: type as any, category: category as any,
      symbol: isApiMode ? (trimmedSymbol || fallbackSymbol) : (trimmedSymbol || null),
      quantity: quantityValue, currency: currency as any,
      currentPrice: nextCurrentPrice, currentValue: nextCurrentValue,
      isApiConnected: isApiMode,
      apiSource: isApiMode ? (apiSource?.trim() || "BITFINEX") : null,
      // 前端不會再收到明碼，編輯時若欄位留空代表「不變更」，沿用資料庫既有的加密值
      apiKey: isApiMode ? (apiKey?.trim() ? encrypt(apiKey.trim()) : existingAccount.apiKey) : null,
      apiSecret: isApiMode ? (apiSecret?.trim() ? encrypt(apiSecret.trim()) : existingAccount.apiSecret) : null,
      apiPassphrase: isApiMode ? (apiPassphrase?.trim() ? encrypt(apiPassphrase.trim()) : existingAccount.apiPassphrase) : null,
      monthlyDeductionAmount: deductionAmountValue,
      deductionDate: deductionDateValue,
      interestRate: interestRateValue,
      loanTermMonths: loanTermMonthsValue,
      loanStartDate: loanStartDateValue,
      deductFromAccountId: deductFromAccountIdValue,
    },
  })

  const { apiKey: _apiKey, apiSecret: _apiSecret, apiPassphrase: _apiPassphrase, ...sanitizedAccount } = updatedAccount
  return NextResponse.json({ ...sanitizedAccount, hasApiCredentials: Boolean(updatedAccount.apiKey && updatedAccount.apiSecret) }, { status: 200 })
}

// DELETE：一般呼叫是「封存」（isActive:false，記錄 archivedAt，資料保留 60 天）。
// 加上 ?permanent=true 才是「永久刪除」，且只允許對已經封存的帳戶執行，避免誤刪還在使用中的帳戶。
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(request)
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 })

  const { id } = await params
  const isPermanent = request.nextUrl.searchParams.get("permanent") === "true"

  const existingAccount = await prisma.account.findFirst({ where: { id, userId } })
  if (!existingAccount) return NextResponse.json({ message: "Account not found." }, { status: 404 })

  if (isPermanent) {
    if (existingAccount.isActive) {
      return NextResponse.json({ message: "請先封存帳戶，才能永久刪除。" }, { status: 400 })
    }
    // Transaction.account 是 onDelete: Cascade，交易紀錄會一併刪除；
    // Transaction.loanAccount（loanAccountId）是 onDelete: SetNull，其他帳戶指向這筆貸款帳戶的扣款紀錄會被清空關聯而不是報錯。
    await prisma.account.delete({ where: { id } })
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  const updatedAccount = await prisma.account.update({
    where: { id },
    data: { isActive: false, archivedAt: new Date() },
  })

  return NextResponse.json(updatedAccount, { status: 200 })
}

// PATCH { action: "restore" } → 從「已封存帳戶」列表取消封存，isActive 改回 true，清掉 archivedAt
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(request)
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || body.action !== "restore") return NextResponse.json({ message: "Invalid action." }, { status: 400 })

  const existingAccount = await prisma.account.findFirst({ where: { id, userId } })
  if (!existingAccount) return NextResponse.json({ message: "Account not found." }, { status: 404 })

  const updatedAccount = await prisma.account.update({
    where: { id },
    data: { isActive: true, archivedAt: null },
  })

  return NextResponse.json(updatedAccount, { status: 200 })
}