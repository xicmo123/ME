"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { apiGet, apiSend, toUserMessage } from "@/lib/api";
import {
  categoriesByType, categoryOptions, currencyOptions, defaultAccountForm,
  exchangesRequiringPassphrase, fixedCurrencyByCategory, symbolRequiredCategories,
  typeOptions, type AccountFormState,
} from "@/lib/constants";
import { TW_BANKS } from "@/lib/tw-banks";
import { COLORS, INPUT_CLASS, SECTION_LABEL_CLASS, SURFACE_CLASS, TEXT_MUTED_CLASS } from "@/lib/theme";
import { Modal } from "@/components/ui/Modal";
import type { Account, AccountCategory, CurrentUser } from "@/lib/types";

const SYMBOL_HINTS: Partial<Record<AccountCategory, { hint: string; placeholder: string }>> = {
  TAIWAN_STOCK: { hint: "可輸入代號或名稱，例如「台積電」或「2330」", placeholder: "例如：台積電 或 2330" },
  US_STOCK: { hint: "可輸入代號或中英文名稱，例如「蘋果」或「AAPL」", placeholder: "例如：蘋果 或 AAPL" },
  JAPAN_STOCK: { hint: "可輸入代號或英文名稱，例如「7203」或「Toyota」", placeholder: "例如：7203 或 Toyota" },
  KOREA_STOCK: { hint: "可輸入代號或英文名稱，例如「005930」或「Samsung」", placeholder: "例如：005930 或 Samsung" },
  CRYPTO: { hint: "可輸入代號或中英文名稱，例如「比特幣」或「BTC」", placeholder: "例如：比特幣 或 BTC" },
};

const MARKET_BY_CATEGORY: Partial<Record<AccountCategory, string>> = {
  TAIWAN_STOCK: "TW", US_STOCK: "US", JAPAN_STOCK: "JP", KOREA_STOCK: "KR", CRYPTO: "CRYPTO",
};

export type AccountPreset = { type: string; category: string; currency?: string };

export type AccountFormModalProps = {
  open: boolean;
  onClose: () => void;
  /** 有值代表編輯模式 */
  editingAccount: Account | null;
  /** 新增時預先帶入的類型／類別／幣別 */
  preset?: AccountPreset | null;
  accounts: Account[];
  currentUser: CurrentUser | null;
  onSaved: (message: string) => void;
  onOpenPlans: () => void;
};

/**
 * 依「編輯既有帳戶」或「帶預設值新增」算出表單初始值。
 * 這支只在元件掛載時跑一次——呼叫端每次開啟彈窗都會用新的 key 重新掛載，
 * 所以不需要（也不應該）在 effect 裡把 state 重設一遍。
 */
function buildInitialForm(editingAccount: Account | null, preset?: AccountPreset | null): AccountFormState {
  if (editingAccount) {
    return {
      name: editingAccount.name,
      type: editingAccount.type,
      category: editingAccount.category,
      symbol: editingAccount.symbol ?? "",
      quantity: String(editingAccount.quantity ?? editingAccount.currentValue ?? 0),
      currency: editingAccount.currency,
      isApiConnected: Boolean(editingAccount.isApiConnected),
      apiSource: editingAccount.apiSource ?? "BITFINEX",
      apiKey: "", apiSecret: "", apiPassphrase: "",
      monthlyDeductionAmount: editingAccount.monthlyDeductionAmount ? String(editingAccount.monthlyDeductionAmount) : "",
      deductionDate: editingAccount.deductionDate ? String(editingAccount.deductionDate) : "",
      interestRate: editingAccount.interestRate != null ? String(editingAccount.interestRate) : "",
      loanTermMonths: editingAccount.loanTermMonths != null ? String(editingAccount.loanTermMonths) : "",
      loanStartDate: editingAccount.loanStartDate ? String(editingAccount.loanStartDate).slice(0, 10) : "",
      deductFromAccountId: editingAccount.deductFromAccountId ?? "",
    };
  }

  if (!preset) return defaultAccountForm;

  return {
    ...defaultAccountForm,
    type: preset.type,
    category: preset.category as AccountCategory,
    currency: (preset.currency
      ?? fixedCurrencyByCategory[preset.category as AccountCategory]
      ?? "TWD") as AccountFormState["currency"],
  };
}

export function AccountFormModal({
  open, onClose, editingAccount, preset, accounts, currentUser, onSaved, onOpenPlans,
}: AccountFormModalProps) {
  const [form, setForm] = useState<AccountFormState>(() => buildInitialForm(editingAccount, preset));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [symbolSuggestions, setSymbolSuggestions] = useState<{ symbol: string; name: string }[]>([]);
  const [showSymbolSuggestions, setShowSymbolSuggestions] = useState(false);
  const [showBankSuggestions, setShowBankSuggestions] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const hasCredentials = Boolean(editingAccount?.hasApiCredentials);

  const isPro = currentUser?.entitlements?.features.apiSync ?? false;

  const isCryptoApiMode = form.category === "CRYPTO" && form.isApiConnected;
  const requiresSymbol = symbolRequiredCategories.includes(form.category) && !isCryptoApiMode;
  const usesAmountInput = !symbolRequiredCategories.includes(form.category);
  const amountLabel = usesAmountInput ? (form.type === "LIABILITY" ? "貸款總金額" : "總金額") : "持有數量/股數";
  const hasFixedCurrency = fixedCurrencyByCategory[form.category] != null;
  const searchMarket = isCryptoApiMode ? null : MARKET_BY_CATEGORY[form.category];

  // 代號建議：打字停 300ms 才查，切換類別時取消上一個請求
  useEffect(() => {
    if (!searchMarket || !form.symbol.trim()) {
      setSymbolSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void apiGet<{ results?: { symbol: string; name: string }[] }>(
        `/api/stock-search?q=${encodeURIComponent(form.symbol.trim())}&market=${searchMarket}`,
        { signal: controller.signal }
      )
        .then((data) => setSymbolSuggestions(data.results ?? []))
        .catch(() => setSymbolSuggestions([]));
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form.symbol, searchMarket]);

  const bankSuggestions = useMemo(
    () => (form.symbol.trim() ? TW_BANKS.filter((bank) => bank.includes(form.symbol.trim())).slice(0, 8) : []),
    [form.symbol]
  );

  const deductionSourceAccounts = useMemo(
    () => accounts.filter((account) => ["CASH", "BANK_ACCOUNT"].includes(account.category) && account.isActive),
    [accounts]
  );

  function update(patch: Partial<AccountFormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  /**
   * 幫既有負債「補填」貸款起算日時，金額欄的意義會從「目前餘額」變成「貸款本金（原始總額）」，
   * 但欄位裡預帶的是已經被扣過好幾期的餘額。直接存下去會把那個縮水的數字當本金去跑攤還公式，
   * 債務就永久低估（例：Tesla Model Y 原本 2,460,000，扣一期後欄位裡只剩 2,420,000）。
   * 所以這個轉換點要把金額清空，強迫使用者重新輸入原始總額——旁邊的說明文字會同步出現。
   */
  function startDatePatch(nextStartDate: string): Partial<AccountFormState> {
    const isNewlyAddingStartDate =
      nextStartDate.trim() !== "" && form.loanStartDate.trim() === "" && !editingAccount?.loanStartDate;
    return isNewlyAddingStartDate
      ? { loanStartDate: nextStartDate, quantity: "" }
      : { loanStartDate: nextStartDate };
  }

  function handleTypeChange(nextType: string) {
    const validCategories = categoriesByType[nextType] ?? [];
    const nextCategory = validCategories.includes(form.category) ? form.category : validCategories[0];
    update({
      type: nextType,
      category: nextCategory,
      currency: (fixedCurrencyByCategory[nextCategory] ?? form.currency) as AccountFormState["currency"],
      isApiConnected: nextCategory === "CRYPTO" ? form.isApiConnected : false,
      symbol: "",
    });
  }

  function handleCategoryChange(nextCategory: AccountCategory) {
    update({
      category: nextCategory,
      currency: (fixedCurrencyByCategory[nextCategory] ?? form.currency) as AccountFormState["currency"],
      isApiConnected: nextCategory === "CRYPTO" ? form.isApiConnected : false,
      symbol: "",
    });
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const data = await apiSend<{ ok?: boolean; message?: string }>("/api/accounts/test-connection", "POST", {
        apiSource: form.apiSource,
        apiKey: form.apiKey,
        apiSecret: form.apiSecret,
        apiPassphrase: form.apiPassphrase,
      });
      setTestResult({ ok: Boolean(data?.ok), message: data?.message || "連線成功" });
    } catch (err) {
      setTestResult({ ok: false, message: toUserMessage(err, "連線失敗") });
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const missing: string[] = [];
    if (!form.name.trim()) missing.push("名稱");
    if (requiresSymbol && !form.symbol.trim()) missing.push("代號");
    if (!isCryptoApiMode && form.quantity.trim() === "") missing.push(amountLabel);
    if (isCryptoApiMode && !hasCredentials) {
      if (!form.apiKey.trim()) missing.push("API Key");
      if (!form.apiSecret.trim()) missing.push("API Secret");
      if (exchangesRequiringPassphrase.includes(form.apiSource) && !form.apiPassphrase.trim()) missing.push("Passphrase");
    }
    if (missing.length > 0) {
      setError(`請填寫以下欄位：${missing.join("、")}`);
      return;
    }

    const payload = {
      ...form,
      quantity: isCryptoApiMode ? 0 : Number(form.quantity || 0),
      symbol: isCryptoApiMode ? form.apiSource : form.symbol || null,
      monthlyDeductionAmount: form.monthlyDeductionAmount.trim() === "" ? null : Number(form.monthlyDeductionAmount),
      deductionDate: form.deductionDate.trim() === "" ? null : Number(form.deductionDate),
      interestRate: form.interestRate.trim() === "" ? null : Number(form.interestRate),
      loanTermMonths: form.loanTermMonths.trim() === "" ? null : Number(form.loanTermMonths),
      loanStartDate: form.loanStartDate.trim() === "" ? null : form.loanStartDate,
      deductFromAccountId: form.deductFromAccountId.trim() === "" ? null : form.deductFromAccountId,
    };

    setSaving(true);
    try {
      const saved = await apiSend<{ warning?: string }>(
        editingAccount ? `/api/accounts/${editingAccount.id}` : "/api/accounts",
        editingAccount ? "PUT" : "POST",
        payload
      );
      // 報價抓不到時後端會回一段 warning，要顯示出來，不然使用者只會看到一筆金額 0 的資產
      onSaved(saved?.warning ?? (editingAccount ? "資產已更新" : "資產已新增"));
      onClose();
    } catch (err) {
      setError(toUserMessage(err, "儲存失敗，請再試一次"));
    } finally {
      setSaving(false);
    }
  }

  const showLoanFields = form.type === "LIABILITY" || ["RECEIVABLE", "PAYABLE"].includes(form.category);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingAccount ? "編輯資產" : "新增資產"}
      variant="center"
      size="lg"
      dismissOnBackdrop={false}
    >
      <form onSubmit={handleSubmit} className="space-y-5 p-5">
        <Field label="名稱" htmlFor="account-name">
          <input
            id="account-name"
            value={form.name}
            onChange={(event) => update({ name: event.target.value })}
            placeholder={form.category === "BANK_ACCOUNT" ? "例如：薪資帳戶" : "例如：台積電"}
            className={INPUT_CLASS}
          />
        </Field>

        {form.category === "BANK_ACCOUNT" && (
          <div className="relative">
            <Field label="銀行名稱" htmlFor="account-bank">
              <input
                id="account-bank"
                value={form.symbol}
                onChange={(event) => {
                  update({ symbol: event.target.value });
                  setShowBankSuggestions(true);
                }}
                onFocus={() => setShowBankSuggestions(true)}
                onBlur={() => setTimeout(() => setShowBankSuggestions(false), 150)}
                placeholder="例如：國泰世華銀行"
                className={INPUT_CLASS}
                autoComplete="off"
              />
            </Field>
            {showBankSuggestions && bankSuggestions.length > 0 && (
              <ul className={`absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg shadow-lg ${SURFACE_CLASS}`}>
                {bankSuggestions.map((bank) => (
                  <li key={bank}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        update({ symbol: bank });
                        setShowBankSuggestions(false);
                      }}
                      className="w-full px-3.5 py-2.5 text-left text-sm hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                    >
                      {bank}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="類型" htmlFor="account-type">
            <select
              id="account-type"
              value={form.type}
              onChange={(event) => handleTypeChange(event.target.value)}
              className={INPUT_CLASS}
            >
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          <Field label="類別" htmlFor="account-category">
            <select
              id="account-category"
              value={form.category}
              onChange={(event) => handleCategoryChange(event.target.value as AccountCategory)}
              className={INPUT_CLASS}
            >
              {categoryOptions
                .filter((option) => (categoriesByType[form.type] ?? []).includes(option.value))
                .map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="幣別" htmlFor={hasFixedCurrency ? undefined : "account-currency"}>
            {hasFixedCurrency ? (
              <p className={`flex h-11 items-center font-ledger text-sm ${TEXT_MUTED_CLASS}`}>
                {form.currency}（依類別自動決定）
              </p>
            ) : (
              <select
                id="account-currency"
                value={form.currency}
                onChange={(event) => update({ currency: event.target.value as AccountFormState["currency"] })}
                className={INPUT_CLASS}
              >
                {currencyOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            )}
          </Field>

          {!isCryptoApiMode && (
            <Field label={amountLabel} htmlFor="account-quantity">
              <input
                id="account-quantity"
                type="number"
                inputMode="decimal"
                step="any"
                placeholder="0"
                value={form.quantity}
                onChange={(event) => update({ quantity: event.target.value })}
                className={`${INPUT_CLASS} font-ledger`}
              />
              {form.type === "LIABILITY" && form.loanStartDate && (
                <p className={`mt-1.5 text-xs ${TEXT_MUTED_CLASS}`}>
                  這裡填的是貸款本金（原始總額），目前餘額會依本金＋已繳期數自動算出。
                </p>
              )}
            </Field>
          )}
        </div>

        {requiresSymbol && (
          <div className="relative">
            <Field label="代號" hint={SYMBOL_HINTS[form.category]?.hint} htmlFor="account-symbol">
              <input
                id="account-symbol"
                value={form.symbol}
                onChange={(event) => {
                  update({ symbol: event.target.value });
                  setShowSymbolSuggestions(true);
                }}
                onFocus={() => setShowSymbolSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSymbolSuggestions(false), 150)}
                placeholder={SYMBOL_HINTS[form.category]?.placeholder}
                className={`${INPUT_CLASS} font-ledger`}
                autoComplete="off"
              />
            </Field>
            {showSymbolSuggestions && symbolSuggestions.length > 0 && (
              <ul className={`absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg shadow-lg ${SURFACE_CLASS}`}>
                {symbolSuggestions.map((suggestion) => (
                  <li key={suggestion.symbol}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        update({ symbol: suggestion.symbol, name: form.name.trim() ? form.name : suggestion.name });
                        setSymbolSuggestions([]);
                        setShowSymbolSuggestions(false);
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                    >
                      <span className="font-ledger font-semibold">{suggestion.symbol}</span>
                      <span className={`truncate text-xs ${TEXT_MUTED_CLASS}`}>{suggestion.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {form.category === "CRYPTO" && (
          <div className="space-y-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <label className="flex cursor-pointer select-none items-center gap-2.5">
              <input
                type="checkbox"
                checked={form.isApiConnected}
                onChange={(event) => {
                  if (!isPro) {
                    onOpenPlans();
                    return;
                  }
                  update({ isApiConnected: event.target.checked });
                }}
                className="h-4 w-4 accent-[#B8933C]"
              />
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                連接交易所 API 自動同步
                {!isPro && (
                  <span
                    className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] font-bold"
                    style={{ color: COLORS.gold, borderColor: COLORS.gold }}
                  >
                    <Lock className="h-2.5 w-2.5" aria-hidden /> Pro
                  </span>
                )}
              </span>
            </label>

            {!isPro && (
              <p className="text-xs" style={{ color: COLORS.gold }}>
                連接交易所 API 自動同步是 Pro 會員專屬功能，
                <button type="button" onClick={onOpenPlans} className="cursor-pointer font-semibold underline">
                  升級解鎖
                </button>
              </p>
            )}

            {form.isApiConnected && isPro && (
              <div className="space-y-4 pl-6">
                <Field label="交易所" htmlFor="api-source">
                  <select
                    id="api-source"
                    value={form.apiSource}
                    onChange={(event) => {
                      update({ apiSource: event.target.value });
                      setTestResult(null);
                    }}
                    className={INPUT_CLASS}
                  >
                    <option value="BITFINEX">Bitfinex</option>
                    <option value="BINANCE">幣安 Binance</option>
                    <option value="OKX">OKX</option>
                    <option value="COINBASE">Coinbase</option>
                  </select>
                </Field>

                <Field label={`API Key${hasCredentials ? "（留空則不變更）" : ""}`} htmlFor="api-key">
                  <input
                    id="api-key" type="password" autoComplete="off"
                    placeholder={hasCredentials ? "••••••••（已設定）" : ""}
                    value={form.apiKey}
                    onChange={(event) => {
                      update({ apiKey: event.target.value });
                      setTestResult(null);
                    }}
                    className={`${INPUT_CLASS} font-ledger`}
                  />
                </Field>

                <Field label={`API Secret${hasCredentials ? "（留空則不變更）" : ""}`} htmlFor="api-secret">
                  <input
                    id="api-secret" type="password" autoComplete="off"
                    placeholder={hasCredentials ? "••••••••（已設定）" : ""}
                    value={form.apiSecret}
                    onChange={(event) => {
                      update({ apiSecret: event.target.value });
                      setTestResult(null);
                    }}
                    className={`${INPUT_CLASS} font-ledger`}
                  />
                </Field>

                {exchangesRequiringPassphrase.includes(form.apiSource) && (
                  <Field label={`Passphrase${hasCredentials ? "（留空則不變更）" : ""}`} htmlFor="api-passphrase">
                    <input
                      id="api-passphrase" type="password" autoComplete="off"
                      placeholder={hasCredentials ? "••••••••（已設定）" : ""}
                      value={form.apiPassphrase}
                      onChange={(event) => {
                        update({ apiPassphrase: event.target.value });
                        setTestResult(null);
                      }}
                      className={`${INPUT_CLASS} font-ledger`}
                    />
                  </Field>
                )}

                <div>
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={
                      testingConnection ||
                      !form.apiKey.trim() ||
                      !form.apiSecret.trim() ||
                      (exchangesRequiringPassphrase.includes(form.apiSource) && !form.apiPassphrase.trim())
                    }
                    className="w-full cursor-pointer rounded-lg border border-black/10 py-2.5 text-sm font-semibold transition-colors hover:border-[#B8933C] disabled:opacity-40 dark:border-white/10"
                  >
                    {testingConnection ? "測試連線中…" : "測試連線"}
                  </button>
                  {testResult && (
                    <p className={`mt-2 text-xs ${testResult.ok ? "text-[#4F7B5E]" : "text-[#A24936]"}`} role="status">
                      {testResult.ok ? "✓ " : "✗ "}
                      {testResult.message}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {showLoanFields && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="每月扣款金額" htmlFor="deduction-amount">
              <input
                id="deduction-amount" type="number" inputMode="decimal" step="any" min="0" placeholder="例如：15000"
                value={form.monthlyDeductionAmount}
                onChange={(event) => update({ monthlyDeductionAmount: event.target.value })}
                className={`${INPUT_CLASS} font-ledger`}
              />
            </Field>
            <Field label="每月扣款日" htmlFor="deduction-date">
              <input
                id="deduction-date" type="number" inputMode="numeric" step="1" min="1" max="31" placeholder="例如：5"
                value={form.deductionDate}
                onChange={(event) => update({ deductionDate: event.target.value })}
                className={`${INPUT_CLASS} font-ledger`}
              />
            </Field>
            <p className={`-mt-2 text-xs sm:col-span-2 ${TEXT_MUTED_CLASS}`}>
              每月到扣款日，系統自動從{form.type === "LIABILITY" ? "負債總額" : "帳戶餘額"}扣除。
            </p>

            {form.type === "LIABILITY" && (
              <>
                <div className="sm:col-span-2">
                  <Field label="扣款來源帳戶（選填）" htmlFor="deduct-from">
                    <select
                      id="deduct-from"
                      value={form.deductFromAccountId}
                      onChange={(event) => update({ deductFromAccountId: event.target.value })}
                      className={INPUT_CLASS}
                    >
                      <option value="">不自動扣款（僅記錄負債本身）</option>
                      {deductionSourceAccounts.map((account) => (
                        <option key={account.id} value={account.id}>{account.name}</option>
                      ))}
                    </select>
                  </Field>
                  <p className={`mt-1.5 text-xs ${TEXT_MUTED_CLASS}`}>
                    設定後，每月扣款日到期時會自動從此帳戶扣除對應金額，同步建立轉出紀錄。
                  </p>
                </div>
                <Field label="年利率 %（選填）" htmlFor="interest-rate">
                  <input
                    id="interest-rate" type="number" inputMode="decimal" step="any" min="0" placeholder="例如：2.5"
                    value={form.interestRate}
                    onChange={(event) => update({ interestRate: event.target.value })}
                    className={`${INPUT_CLASS} font-ledger`}
                  />
                </Field>
                <Field label="總期數（選填）" htmlFor="loan-term">
                  <input
                    id="loan-term" type="number" inputMode="numeric" step="1" min="1" placeholder="例如：60"
                    value={form.loanTermMonths}
                    onChange={(event) => update({ loanTermMonths: event.target.value })}
                    className={`${INPUT_CLASS} font-ledger`}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="貸款起算日（選填）" htmlFor="loan-start">
                    <input
                      id="loan-start" type="date"
                      value={form.loanStartDate}
                      onChange={(event) => update(startDatePatch(event.target.value))}
                      className={`${INPUT_CLASS} font-ledger`}
                    />
                  </Field>
                </div>
                <p className={`-mt-2 text-xs sm:col-span-2 ${TEXT_MUTED_CLASS}`}>
                  填了年利率後，每次自動扣款會拆出利息，其餘才算還本金；填了總期數則會顯示「已繳/總期數」進度。
                  填了起算日（＝第 1 期扣款日），期數會依日期精準推算。三者都非必填。
                </p>
              </>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-[#A24936]/10 p-3 text-sm font-medium text-[#A24936]" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-3 border-t border-black/[0.06] pt-4 dark:border-white/[0.06]">
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 cursor-pointer rounded-lg border border-black/15 py-3 text-sm font-semibold transition-transform active:scale-[0.97] dark:border-white/15 ${TEXT_MUTED_CLASS}`}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 cursor-pointer rounded-lg bg-[#1C1F1A] py-3 text-sm font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-60 dark:bg-[#B8933C] dark:text-black"
          >
            {saving ? "儲存中…" : "確認儲存"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label, hint, htmlFor, children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={`mb-2 block ${SECTION_LABEL_CLASS}`} htmlFor={htmlFor}>
        {label}
        {hint && <span className="ml-1 font-normal normal-case tracking-normal opacity-90">（{hint}）</span>}
      </label>
      {children}
    </div>
  );
}
