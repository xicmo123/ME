"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Pencil, RefreshCw, Trash2, Plus, X, Lock, Sun, Moon, LogOut, Wallet, Sparkles } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const typeOptions = [{ value: "ASSET", label: "資產" }, { value: "LIABILITY", label: "負債" }];
const categoryOptions = [
  { value: "CASH", label: "現金" }, { value: "BANK_ACCOUNT", label: "銀行帳戶" },
  { value: "TAIWAN_STOCK", label: "台股" }, { value: "US_STOCK", label: "美股" },
  { value: "CRYPTO", label: "虛擬貨幣" }, { value: "FIXED_ASSET", label: "固定資產" },
  { value: "RECEIVABLE", label: "應收款" }, { value: "PAYABLE", label: "應付款" },
  { value: "MORTGAGE", label: "房貸" }, { value: "CAR_LOAN", label: "車貸" },
  { value: "CREDIT_LOAN", label: "信用貸款" },
];
const currencyOptions = [{ value: "TWD", label: "TWD" }, { value: "USD", label: "USD" }];
const categoryLabelMap: Record<string, string> = categoryOptions.reduce((acc, curr) => ({ ...acc, [curr.value]: curr.label }), {});

const symbolRequiredCategories = ["TAIWAN_STOCK", "US_STOCK", "CRYPTO"];
const amountInputCategories = ["CASH", "BANK_ACCOUNT", "FIXED_ASSET", "RECEIVABLE", "PAYABLE", "MORTGAGE", "CAR_LOAN", "CREDIT_LOAN"];

const defaultForm = { name: "", type: "ASSET", category: "CASH", symbol: "", quantity: "0", currency: "TWD", isApiConnected: false, apiSource: "BITFINEX", apiKey: "", apiSecret: "", monthlyDeductionAmount: "", deductionDate: "" };

// ─── 字體與全域樣式（對帳單字體系統） ───────────────────────────────
const FontStyles = () => (
  <style jsx global>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=Noto+Serif+TC:wght@500;600&display=swap');
    .font-ledger-display { font-family: 'Fraunces', 'Noto Serif TC', serif; font-feature-settings: "ss01" 1; }
    .font-ledger-mono { font-family: 'IBM Plex Mono', 'Noto Sans Mono', monospace; }
    .dot-leader {
      flex: 1 1 auto;
      min-width: 12px;
      border-bottom: 1.5px dotted currentColor;
      opacity: 0.28;
      transform: translateY(-4px);
      margin: 0 2px;
    }
  `}</style>
);

// ─── 對帳單背景紋理（極細直向刻度，取代原本的霓光光暈） ───────────────
const LedgerBackdrop = () => (
  <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
    <div className="absolute inset-0 bg-[#EEF0EC] dark:bg-[#0B0D12] transition-colors duration-500" />
    <div
      className="absolute inset-0 opacity-[0.05] dark:opacity-[0.06]"
      style={{
        backgroundImage: "repeating-linear-gradient(180deg, currentColor 0px, currentColor 1px, transparent 1px, transparent 28px)",
        color: "#3A3F33",
      }}
    />
    <div className="absolute top-0 left-0 right-0 h-px bg-[#B8933C]/40" />
  </div>
);

export default function HomePage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [formData, setFormData] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<"day" | "month" | "year">("day");
  const [mounted, setMounted] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [showHistoryForm, setShowHistoryForm] = useState(false);
  const [historyFormData, setHistoryFormData] = useState({ date: "", netWorth: "" });
  const [historyLoading, setHistoryLoading] = useState(false);

  // 🌟 多用戶認證系統
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const isCryptoApiMode = formData.category === "CRYPTO" && formData.isApiConnected;
  const requiresSymbol = symbolRequiredCategories.includes(formData.category) && !isCryptoApiMode;
  const usesAmountInput = amountInputCategories.includes(formData.category);
  const showApiFields = formData.category === "CRYPTO" && formData.isApiConnected;

  const summary = useMemo(() => {
    const totalAssets = accounts.filter(a => a.type === "ASSET").reduce((sum, a) => sum + Number(a.currentValue ?? 0), 0);
    const totalLiabilities = accounts.filter(a => a.type === "LIABILITY").reduce((sum, a) => sum + Number(a.currentValue ?? 0), 0);
    return { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities };
  }, [accounts]);

  useEffect(() => {
    setMounted(true);
    if (localStorage.getItem("networth-dark-mode") === "true") { setIsDarkMode(true); document.documentElement.classList.add("dark"); }
    // 用 cookie 驗證登入狀態（向後端確認 token 是否有效）
    fetch("/api/auth").then(res => { if (res.ok) setIsAuthenticated(true); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      void (async () => { await Promise.allSettled([fetchAccounts(), fetchHistory(), fetchTransactions(), fetchExchangeRate()]); })();
    }
  }, [isAuthenticated]);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    document.documentElement.classList.toggle("dark", newMode);
    localStorage.setItem("networth-dark-mode", String(newMode));
  };

  const handleLogout = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    setIsAuthenticated(false); setAccounts([]); setHistory([]);
    setAuthEmail(""); setAuthPassword("");
  };

  async function handleAuthSubmit(e: FormEvent) {
    e.preventDefault();
    setAuthError(""); setAuthLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: authMode, email: authEmail, password: authPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsAuthenticated(true);
      } else {
        setAuthError(data.message || "發生錯誤，請稍後再試");
      }
    } catch {
      setAuthError("網路錯誤，請稍後再試");
    } finally {
      setAuthLoading(false);
    }
  }

  async function fetchAccounts() {
    try { const res = await fetch("/api/accounts"); if (res.ok) setAccounts(await res.json()); } catch (e) {}
  }
  async function fetchHistory() {
    try { const res = await fetch("/api/history"); if (res.ok) setHistory(await res.json()); } catch (e) {}
  }
  async function fetchTransactions() {
    try { const res = await fetch("/api/transactions"); if (res.ok) setTransactions(await res.json()); } catch (e) {}
  }
  async function fetchExchangeRate() {
    try { const res = await fetch("/api/exchange-rate", { cache: "no-store" }); if (res.ok) { const data = await res.json(); if (data?.rate) setExchangeRate(data.rate); } } catch (e) {}
  }

  function resetForm() { setFormData(defaultForm); setEditingAccountId(null); setShowForm(false); }

  function startEdit(account: any) {
    setFormData({
      name: account.name, type: account.type, category: account.category, symbol: account.symbol ?? "",
      quantity: String(account.quantity ?? account.currentValue ?? 0), currency: account.currency,
      isApiConnected: Boolean(account.isApiConnected), apiSource: account.apiSource ?? "BITFINEX",
      apiKey: account.apiKey ?? "", apiSecret: account.apiSecret ?? "",
      monthlyDeductionAmount: account.monthlyDeductionAmount ? String(account.monthlyDeductionAmount) : "",
      deductionDate: account.deductionDate ? String(account.deductionDate) : "",
    });
    setEditingAccountId(account.id); setShowForm(true); setError(null); setMessage(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(null); setMessage(null);
    if (!formData.name.trim() || !formData.type || !formData.category) return setError("請填寫完整資訊");
    const payload = { ...formData, quantity: isCryptoApiMode ? 0 : Number(formData.quantity || 0), symbol: isCryptoApiMode ? formData.apiSource : formData.symbol || null, monthlyDeductionAmount: Number(formData.monthlyDeductionAmount || 0), deductionDate: Number(formData.deductionDate || 0) };
    setLoading(true);
    try {
      const res = await fetch(editingAccountId ? `/api/accounts/${editingAccountId}` : "/api/accounts", { method: editingAccountId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("儲存失敗");
      setMessage("已儲存。"); setTimeout(() => resetForm(), 800);
      await Promise.allSettled([fetchAccounts(), fetchHistory(), fetchTransactions()]);
    } catch (err) { setError("儲存發生錯誤。"); } finally { setLoading(false); }
  }

  async function handleDelete(accountId: string) {
    if (!window.confirm("確定要刪除嗎？")) return;
    try { await fetch(`/api/accounts/${accountId}`, { method: "DELETE" }); await Promise.allSettled([fetchAccounts(), fetchHistory(), fetchTransactions()]); } catch (e) {}
  }

  async function handleSyncPrices() {
    setSyncing(true);
    try { await fetch("/api/test-fetch-prices"); await Promise.allSettled([fetchAccounts(), fetchHistory(), fetchExchangeRate()]); } catch (e) {} finally { setSyncing(false); }
  }

  async function handleHistorySubmit(e: FormEvent) {
    e.preventDefault();
    if (!historyFormData.date || historyFormData.netWorth === "") return;
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(historyFormData) });
      if (res.ok) { alert("✅ 補登成功！"); setShowHistoryForm(false); await fetchHistory(); }
    } catch (e) {} finally { setHistoryLoading(false); }
  }

  function formatCurrency(value: number) { return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function formatCompactNumber(value: number) { return Intl.NumberFormat("zh-TW", { notation: "compact", maximumFractionDigits: 1 }).format(value); }

  function buildChartSeries(historyPoints: any[], selectedTimeframe: string, currentNetWorth: number) {
    const sorted = [...historyPoints].filter((p) => Number.isFinite(Number(p.netWorth))).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const now = new Date();
    const getTWDateStr = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
    const historyMap = new Map<string, number>();
    for (const p of sorted) historyMap.set(getTWDateStr(new Date(p.date)), p.netWorth);
    historyMap.set(getTWDateStr(now), currentNetWorth);

    const startDate = new Date(now.getTime());
    let stepDays = 1; // 預設每天一個點

    if (selectedTimeframe === "day") {
      startDate.setDate(now.getDate() - 13);
      stepDays = 1;
    } else if (selectedTimeframe === "month") {
      startDate.setMonth(now.getMonth() - 6);
      stepDays = 7; // 六個月用每週一個點
    } else {
      startDate.setFullYear(now.getFullYear() - 5);
      stepDays = 30; // 五年用每月一個點
    }
    startDate.setHours(0, 0, 0, 0);

    const result = [];
    let lastKnown = 0;
    const daysToGenerate = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 3600 * 24)) + 1;

    for (let i = daysToGenerate - 1; i >= 0; i -= stepDays) {
      const d = new Date(now.getTime());
      d.setDate(now.getDate() - i);
      const dateStr = getTWDateStr(d);
      if (historyMap.has(dateStr)) lastKnown = historyMap.get(dateStr)!;
      result.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, netWorth: lastKnown });
    }
    return result;
  }

  const chartData = useMemo(() => buildChartSeries(history, timeframe, summary.netWorth), [history, timeframe, summary.netWorth]);

  const accountGroups = [
    { title: "流動資金", categories: ["BANK_ACCOUNT", "CASH"] },
    { title: "投資組合", categories: ["TAIWAN_STOCK", "US_STOCK", "CRYPTO"] },
    { title: "負債總額", categories: ["PAYABLE", "MORTGAGE", "CAR_LOAN", "CREDIT_LOAN"] },
  ];

  const renderedAccountGroups = useMemo(() => {
    return accountGroups.map(group => {
      const relevant = accounts.filter(a => group.categories.includes(a.category));
      if (relevant.length === 0) return null;
      const cards = Object.values(relevant.reduce((res:any, acc:any) => {
        const key = symbolRequiredCategories.includes(acc.category) ? `${acc.symbol}::${acc.name}` : acc.name.toLowerCase();
        // 🌟 這裡把 currentPrice 跟 currency 記錄下來！
        if (!res[key]) res[key] = {
          id: key, title: acc.symbol || acc.name, subtitle: acc.name,
          category: acc.category, quantity: 0, currentValue: 0,
          currentPrice: acc.currentPrice, currency: acc.currency, // ✅ 加回這行
          account: acc
        };
        res[key].quantity += Number(acc.quantity ?? 0);
        res[key].currentValue += Number(acc.currentValue ?? 0);
        return res;
      }, {}));
      return { ...group, cards };
    }).filter(Boolean);
  }, [accounts]);

  // ─── 對帳單樣式系統 ───────────────────────────────────────────
  const themeClasses = "bg-[#EEF0EC] dark:bg-[#0B0D12] transition-colors duration-500 font-sans selection:bg-[#B8933C]/25 text-[#1C1F1A] dark:text-[#E7E5DE]";

  // 對帳單卡片：細邊線 + 極淺陰影，取代玻璃模糊
  const sheet = "relative z-10 bg-white dark:bg-[#12151C] border border-black/[0.08] dark:border-white/[0.08] shadow-[0_1px_0_rgba(0,0,0,0.03)] rounded-md";
  const sheetHeader = "text-xs font-semibold tracking-[0.18em] uppercase text-[#6B7066] dark:text-[#8A8F82]";

  const inputClasses = "w-full h-11 px-3.5 text-sm outline-none bg-transparent text-[#1C1F1A] dark:text-[#E7E5DE] border-b-2 border-black/15 dark:border-white/15 focus:border-[#B8933C] transition-colors";
  const btnPrimary = "w-full py-3.5 text-sm font-semibold tracking-wide bg-[#1C1F1A] dark:bg-[#B8933C] text-[#EEF0EC] dark:text-[#0B0D12] rounded-sm hover:opacity-90 transition-all cursor-pointer";
  const btnIcon = "flex items-center justify-center p-2.5 bg-transparent border border-black/10 dark:border-white/10 text-[#1C1F1A] dark:text-[#E7E5DE] rounded-sm hover:border-[#B8933C]/60 hover:text-[#B8933C] transition-all cursor-pointer";
  const btnAction = "flex items-center justify-center gap-2 px-5 py-3 bg-[#1C1F1A] dark:bg-[#B8933C] text-[#EEF0EC] dark:text-[#0B0D12] rounded-sm hover:opacity-90 transition-all cursor-pointer text-sm font-semibold";

  // 帳本明細列：名稱 …點狀引導線… 金額
  function LedgerRow({ card }: { card: any }) {
    const showSubtitle = symbolRequiredCategories.includes(card.category) && card.subtitle && card.subtitle !== card.title;
    return (
      <div className="group relative py-3 px-1 border-b border-dashed border-black/[0.08] dark:border-white/[0.08] last:border-b-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold truncate">{card.title}</span>
          <span className="text-[10px] font-semibold tracking-wider uppercase text-[#6B7066] dark:text-[#8A8F82] shrink-0">
            {categoryLabelMap[card.category]}
          </span>
          <span className="dot-leader" aria-hidden="true" />
          <span className="font-ledger-mono text-sm font-semibold tracking-tight shrink-0">
            NT$ {formatCurrency(card.currentValue)}
          </span>
        </div>
        {showSubtitle && (
          <p className="text-xs text-[#B8933C] font-medium truncate mt-0.5">{card.subtitle}</p>
        )}
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <p className="font-ledger-mono text-xs text-[#6B7066] dark:text-[#8A8F82] flex items-center gap-2">
            <span>
              {symbolRequiredCategories.includes(card.category) ? `持有 ${formatCurrency(card.quantity)} 股` : `餘額 ${formatCurrency(card.quantity)}`}
            </span>
            {symbolRequiredCategories.includes(card.category) && card.currentPrice > 0 && (
              <>
                <span className="opacity-40">·</span>
                <span className="text-[#4F7B5E] dark:text-[#7FAE8F] font-semibold">
                  @ {formatCurrency(card.currentPrice)} {card.currency}
                </span>
              </>
            )}
          </p>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => startEdit(card.account)} className="p-1.5 text-[#6B7066] dark:text-[#8A8F82] hover:text-[#B8933C] transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={() => handleDelete(card.account.id)} className="p-1.5 text-[#6B7066] dark:text-[#8A8F82] hover:text-[#A24936] transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>
    );
  }

  if (mounted && !isAuthenticated) {
    return (
      <main className={`min-h-screen flex items-center justify-center p-4 ${themeClasses}`}>
        <FontStyles />
        <LedgerBackdrop />
        <div className={`w-full max-w-sm p-9 ${sheet} flex flex-col items-center`}>
          <div className="p-3.5 mb-6 border-2 border-[#1C1F1A] dark:border-[#B8933C] rounded-full">
            <Lock className="h-6 w-6 text-[#1C1F1A] dark:text-[#B8933C]" />
          </div>
          <h1 className="font-ledger-display text-2xl font-semibold tracking-tight">淨資產對帳單</h1>
          <p className="text-[11px] font-semibold tracking-[0.25em] mb-6 text-[#6B7066] dark:text-[#8A8F82]">
            {authMode === "login" ? "SIGN IN · 登入帳號" : "REGISTER · 建立帳號"}
          </p>

          <form onSubmit={handleAuthSubmit} className="w-full space-y-5 z-10">
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-[#6B7066] dark:text-[#8A8F82] mb-2">電子郵件</label>
              <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="your@email.com" className={inputClasses} required />
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-[#6B7066] dark:text-[#8A8F82] mb-2">密碼{authMode === "register" ? "（至少 8 字元）" : ""}</label>
              <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="••••••••" className={inputClasses} required minLength={authMode === "register" ? 8 : 1} />
            </div>
            {authError && <p className="text-sm font-medium text-[#A24936] bg-[#A24936]/8 p-3 rounded-sm text-center">{authError}</p>}
            <button type="submit" disabled={authLoading} className={`mt-2 ${btnPrimary}`}>
              {authLoading ? "處理中…" : authMode === "login" ? "登入" : "建立帳號"}
            </button>
          </form>

          <button
            onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }}
            className="mt-6 text-xs text-[#6B7066] dark:text-[#8A8F82] hover:text-[#B8933C] transition-colors"
          >
            {authMode === "login" ? "還沒有帳號？ 立即註冊" : "已有帳號？ 返回登入"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={`min-h-screen px-4 py-8 sm:px-6 lg:px-10 ${themeClasses}`}>
      <FontStyles />
      <LedgerBackdrop />
      <div className="mx-auto flex w-full max-w-[78rem] flex-col gap-6 relative z-10">

        {/* 對帳單信頭 */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b-2 border-[#1C1F1A] dark:border-[#B8933C]">
          <div className="flex items-center gap-3">
            <Sparkles className="h-4 w-4 text-[#B8933C]" />
            <div>
              <p className="font-ledger-display text-2xl font-semibold tracking-tight leading-none">
                Net Worth <span className="italic font-normal text-[#6B7066] dark:text-[#8A8F82]">Statement</span>
              </p>
              <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-[#6B7066] dark:text-[#8A8F82] mt-1">
                個人資產負債對帳單
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button onClick={toggleDarkMode} className={btnIcon}>
              {isDarkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#A24936] rounded-sm hover:bg-[#A24936]/8 transition-colors cursor-pointer border border-[#A24936]/25">
              <LogOut className="h-4 w-4" /> 登出
            </button>
          </div>
        </div>

        {/* 總覽與走勢 */}
        <div className="grid lg:grid-cols-12 gap-6">

          <div className={`lg:col-span-5 p-8 ${sheet} flex flex-col justify-center`}>
            <p className={sheetHeader}><Wallet className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />總淨資產</p>
            <h1 className="font-ledger-display mt-3 text-5xl sm:text-6xl font-semibold tracking-tight tabular-nums">
              NT$ {formatCurrency(summary.netWorth)}
            </h1>

            <div className="mt-7 space-y-2.5 font-ledger-mono text-sm">
              <div className="flex items-baseline gap-2">
                <span className="text-[#6B7066] dark:text-[#8A8F82]">總資產</span>
                <span className="dot-leader" aria-hidden="true" />
                <span className="font-semibold text-[#4F7B5E] dark:text-[#7FAE8F]">NT$ {formatCurrency(summary.totalAssets)}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[#6B7066] dark:text-[#8A8F82]">總負債</span>
                <span className="dot-leader" aria-hidden="true" />
                <span className="font-semibold text-[#A24936]">NT$ {formatCurrency(summary.totalLiabilities)}</span>
              </div>
            </div>

            <div className="mt-8 flex items-center gap-2.5">
              <button onClick={handleSyncPrices} disabled={syncing} className={btnIcon}>
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={() => { resetForm(); setShowForm(true); }}
                className="flex items-center justify-center p-2.5 rounded-sm hover:opacity-90 transition-all cursor-pointer"
                style={{ backgroundColor: "#e2b098" }}
                title="新增項目"
              >
                <Plus className="h-4 w-4 text-white" />
              </button>
              <div className="ml-auto font-ledger-mono text-xs px-3 py-2 border border-black/10 dark:border-white/10 rounded-sm">
                USD/TWD {syncing ? "…" : (exchangeRate?.toFixed(2) || "—")}
              </div>
            </div>
          </div>

          <div className={`lg:col-span-7 p-6 xl:p-7 ${sheet} flex flex-col`}>
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-baseline gap-3">
                <p className={sheetHeader}>歷史走勢</p>
                <button onClick={() => setShowHistoryForm(true)} className="text-xs font-semibold text-[#B8933C] hover:underline underline-offset-2">
                  + 手動補登
                </button>
              </div>
              <div className="flex gap-4 font-ledger-mono text-xs">
                {(["day", "month", "year"] as const).map((item) => (
                  <button
                    key={item}
                    onClick={() => setTimeframe(item)}
                    className={`pb-1 border-b-2 transition-all font-semibold ${timeframe === item ? "border-[#B8933C] text-[#1C1F1A] dark:text-[#E7E5DE]" : "border-transparent text-[#6B7066] dark:text-[#8A8F82] hover:text-[#1C1F1A] dark:hover:text-white"}`}
                  >
                    {item === "day" ? "兩周" : item === "month" ? "六個月" : "五年"}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-[230px] w-full flex-1">
              {mounted && chartData.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorNetWorth" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#B8933C" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#B8933C" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#8A8F82", fontSize: 11, fontFamily: "IBM Plex Mono" }} tickMargin={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#8A8F82", fontSize: 11, fontFamily: "IBM Plex Mono" }} tickFormatter={formatCompactNumber} width={44} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "2px",
                        border: isDarkMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.1)",
                        background: isDarkMode ? "#12151C" : "#FFFFFF",
                        fontFamily: "IBM Plex Mono",
                        fontSize: "12px",
                        boxShadow: "none",
                      }}
                      formatter={(val) => [`NT$ ${formatCurrency(Number(val))}`, "淨資產"]}
                    />
                    <Area type="monotone" dataKey="netWorth" stroke="#B8933C" strokeWidth={2} fillOpacity={1} fill="url(#colorNetWorth)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* 帳本明細 */}
        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {renderedAccountGroups.map((group: any) => (
            <div key={group.title} className={`${sheet} p-5 flex flex-col`}>
              <div className="flex items-center justify-between pb-3 mb-1 border-b-2 border-[#1C1F1A] dark:border-[#B8933C]">
                <h3 className="font-ledger-display text-base font-semibold">{group.title}</h3>
                <span className="font-ledger-mono text-[11px] text-[#6B7066] dark:text-[#8A8F82]">{group.cards.length} 項</span>
              </div>
              <div className="flex-1">
                {group.cards.map((card: any) => <LedgerRow key={card.id} card={card} />)}
              </div>
            </div>
          ))}
        </section>

        {/* 新增/編輯表單 */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className={`w-full max-w-lg max-h-[90vh] overflow-y-auto ${sheet} !bg-white dark:!bg-[#12151C] shadow-2xl`}>
              <div className="sticky top-0 z-10 flex items-center justify-between border-b-2 border-[#1C1F1A] dark:border-[#B8933C] bg-white dark:bg-[#12151C] p-5">
                <h2 className="font-ledger-display text-lg font-semibold">{editingAccountId ? "編輯項目" : "新增項目"}</h2>
                <button onClick={() => setShowForm(false)} className={btnIcon}><X className="h-4 w-4" /></button>
              </div>
              <div className="p-6">
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="name" className={`block text-xs mb-2 ${sheetHeader}`}>名稱</label>
                    <input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="例如：台積電" className={inputClasses} />
                  </div>
                  <div className="grid gap-5 grid-cols-2">
                    <div>
                      <label htmlFor="type" className={`block text-xs mb-2 ${sheetHeader}`}>類型</label>
                      <select id="type" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className={inputClasses}>{typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                    </div>
                    <div>
                      <label htmlFor="category" className={`block text-xs mb-2 ${sheetHeader}`}>類別</label>
                      <select id="category" value={formData.category} onChange={(e) => { const n = e.target.value; setFormData({ ...formData, category: n, isApiConnected: n === "CRYPTO" ? formData.isApiConnected : false }); }} className={inputClasses}>{categoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                    </div>
                  </div>
                  <div className="grid gap-5 grid-cols-2">
                    <div>
                      <label htmlFor="currency" className={`block text-xs mb-2 ${sheetHeader}`}>幣別</label>
                      <select id="currency" value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })} className={inputClasses}>{currencyOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                    </div>
                    {!showApiFields && (
                      <div>
                        <label htmlFor="quantity" className={`block text-xs mb-2 ${sheetHeader}`}>{usesAmountInput ? "總金額" : "持有股數"}</label>
                        <input id="quantity" type="number" step="any" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} className={`${inputClasses} font-ledger-mono`} />
                      </div>
                    )}
                  </div>
                  {requiresSymbol && (
                    <div>
                      <label htmlFor="symbol" className={`block text-xs mb-2 ${sheetHeader}`}>代號 (Symbol)</label>
                      <input id="symbol" value={formData.symbol} onChange={(e) => setFormData({ ...formData, symbol: e.target.value })} placeholder="例如：2330.TW" className={`${inputClasses} font-ledger-mono`} />
                    </div>
                  )}

                  {formData.category === "CRYPTO" && (
                    <div className="p-4 border border-black/10 dark:border-white/10 rounded-sm space-y-4">
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={formData.isApiConnected}
                          onChange={(e) => setFormData({ ...formData, isApiConnected: e.target.checked })}
                          className="h-4 w-4 accent-[#B8933C]"
                        />
                        <span className="text-sm font-semibold">連接交易所 API 自動同步餘額</span>
                      </label>
                      {formData.isApiConnected && (
                        <div className="space-y-4 pl-6">
                          <p className={`${sheetHeader} !normal-case !tracking-normal font-ledger-mono`}>交易所：Bitfinex</p>
                          <div>
                            <label htmlFor="apiKey" className={`block text-xs mb-2 ${sheetHeader}`}>API Key</label>
                            <input id="apiKey" type="password" autoComplete="off" value={formData.apiKey} onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })} className={`${inputClasses} font-ledger-mono`} />
                          </div>
                          <div>
                            <label htmlFor="apiSecret" className={`block text-xs mb-2 ${sheetHeader}`}>API Secret</label>
                            <input id="apiSecret" type="password" autoComplete="off" value={formData.apiSecret} onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })} className={`${inputClasses} font-ledger-mono`} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {formData.type === "LIABILITY" && (
                    <div className="grid gap-5 grid-cols-2">
                      <div>
                        <label htmlFor="monthlyDeductionAmount" className={`block text-xs mb-2 ${sheetHeader}`}>每月扣款金額</label>
                        <input id="monthlyDeductionAmount" type="number" step="any" min="0" placeholder="例如：15000" value={formData.monthlyDeductionAmount} onChange={(e) => setFormData({ ...formData, monthlyDeductionAmount: e.target.value })} className={`${inputClasses} font-ledger-mono`} />
                      </div>
                      <div>
                        <label htmlFor="deductionDate" className={`block text-xs mb-2 ${sheetHeader}`}>每月扣款日</label>
                        <input id="deductionDate" type="number" step="1" min="1" max="31" placeholder="例如：5" value={formData.deductionDate} onChange={(e) => setFormData({ ...formData, deductionDate: e.target.value })} className={`${inputClasses} font-ledger-mono`} />
                      </div>
                      <p className="col-span-2 text-xs text-[#6B7066] dark:text-[#8A8F82] -mt-2">
                        每月到了扣款日，系統會自動從這筆負債的總金額扣掉扣款金額（月份天數不足時，會在當月最後一天扣款）。
                      </p>
                    </div>
                  )}

                  {error && <p className="text-sm font-medium text-[#A24936] bg-[#A24936]/8 p-3 rounded-sm">{error}</p>}
                  <div className="mt-8 flex justify-end gap-3 pt-5 border-t border-black/10 dark:border-white/10">
                    <button type="button" onClick={() => setShowForm(false)} className="px-5 py-3 text-sm font-semibold text-[#6B7066] dark:text-[#8A8F82] hover:text-[#1C1F1A] dark:hover:text-white transition-all cursor-pointer">取消</button>
                    <button type="submit" disabled={loading} className={`px-7 ${btnPrimary} w-auto`}>確認儲存</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* 補登歷史表單 */}
        {showHistoryForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className={`w-full max-w-sm ${sheet} !bg-white dark:!bg-[#12151C] shadow-2xl`}>
              <div className="flex items-center justify-between border-b-2 border-[#1C1F1A] dark:border-[#B8933C] bg-white dark:bg-[#12151C] p-5">
                <h2 className="font-ledger-display text-lg font-semibold">手動補登</h2>
                <button onClick={() => setShowHistoryForm(false)} className={btnIcon}><X className="h-4 w-4" /></button>
              </div>
              <div className="p-6">
                <form onSubmit={handleHistorySubmit} className="space-y-5">
                  <div>
                    <label className={`block text-xs mb-2 ${sheetHeader}`}>選擇日期</label>
                    <input type="date" value={historyFormData.date} onChange={(e) => setHistoryFormData({ ...historyFormData, date: e.target.value })} className={`${inputClasses} font-ledger-mono`} required />
                  </div>
                  <div>
                    <label className={`block text-xs mb-2 ${sheetHeader}`}>該日淨資產 (NT$)</label>
                    <input type="number" placeholder="例如：50000" value={historyFormData.netWorth} onChange={(e) => setHistoryFormData({ ...historyFormData, netWorth: e.target.value })} className={`${inputClasses} font-ledger-mono`} required />
                  </div>
                  <div className="flex justify-end pt-4">
                    <button type="submit" disabled={historyLoading} className={btnPrimary}>
                      {historyLoading ? "處理中…" : "確認補登"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}