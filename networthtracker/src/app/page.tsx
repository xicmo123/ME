"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Pencil, RefreshCw, Trash2, Plus, X, Lock, Sun, Moon, LogOut, Wallet, Sparkles, Eye, EyeOff, LayoutDashboard, PieChart, TrendingUp, Settings, ChevronRight, AlertTriangle } from "lucide-react";
import { Area, AreaChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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

type Tab = "overview" | "assets" | "trends" | "settings";

// 基準指數：實際行情由 /api/benchmark 透過 Yahoo Finance 抓取（0050.TW、^GSPC）。
const BENCHMARKS: Record<string, { label: string; color: string }> = {
  tw0050: { label: "0050", color: "#4F7B5E" },
  sp500: { label: "S&P 500", color: "#5A7DA0" },
};

const FontStyles = () => (
  <style jsx global>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=Noto+Serif+TC:wght@500;600&display=swap');
    .font-display { font-family: 'Fraunces', 'Noto Serif TC', serif; font-feature-settings: "ss01" 1; }
    .font-mono-ledger { font-family: 'IBM Plex Mono', 'Noto Sans Mono', monospace; }
    .dot-leader {
      flex: 1 1 auto; min-width: 8px;
      border-bottom: 1.5px dotted currentColor;
      opacity: 0.2; transform: translateY(-4px); margin: 0 4px;
    }
    html { -webkit-tap-highlight-color: transparent; }
    * { -webkit-font-smoothing: antialiased; }
  `}</style>
);

const GoogleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.5 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.5 5.1 29.5 3 24 3 15.6 3 8.4 7.8 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 45c5.4 0 10.3-2.1 14-5.5l-6.5-5.4c-2 1.6-4.6 2.9-7.5 2.9-5.3 0-9.7-3.4-11.3-8l-6.6 5.1C9.6 40.2 16.3 45 24 45z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.5 5.4C39.9 37.4 43 31.4 43 24c0-1.2-.1-2.4-.4-3.5z" />
  </svg>
);

export default function HomePage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [formData, setFormData] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<"day" | "month" | "year">("day");
  const [activeBenchmarks, setActiveBenchmarks] = useState<string[]>([]);
  const [benchmarkData, setBenchmarkData] = useState<Record<string, { date: string; level: number }[]>>({});
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [showHistoryForm, setShowHistoryForm] = useState(false);
  const [historyFormData, setHistoryFormData] = useState({ date: "", netWorth: "" });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [goals, setGoals] = useState<any[]>([]);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<any | null>(null);
  const [goalForm, setGoalForm] = useState({ name: "", targetAmount: "", type: "NET_WORTH", accountId: "", emoji: "" });
  const [hideBalance, setHideBalance] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ email: string; hasGoogle: boolean; hasPassword: boolean } | null>(null);
  const [googleUnlinking, setGoogleUnlinking] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showAuthPassword, setShowAuthPassword] = useState(false);
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
    const saved = localStorage.getItem("networth-dark-mode");
    if (saved === "true") { setIsDarkMode(true); document.documentElement.classList.add("dark"); }

    // Google OAuth 回跳可能帶著錯誤訊息或成功綁定的提示，讀完就清掉網址參數
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("authError");
    const linked = params.get("linked");
    if (oauthError) setAuthError(oauthError);
    if (oauthError || linked) window.history.replaceState({}, "", window.location.pathname);

    fetch("/api/auth").then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        setIsAuthenticated(true);
        setCurrentUser(data.user);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      void (async () => {
        await Promise.allSettled([fetchAccounts(), fetchTransactions(), fetchExchangeRate(), fetchGoals()]);
        // 每次進入 App 都記錄「今天」的淨資產快照，讓歷史逐日累積（否則走勢圖只有今天一個點）
        await fetch("/api/history/snapshot").catch(() => {});
        await fetchHistory();
      })();
    }
  }, [isAuthenticated]);

  const toggleDarkMode = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("networth-dark-mode", String(next));
  };

  const handleLogout = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    setIsAuthenticated(false); setAccounts([]); setHistory([]);
    setAuthEmail(""); setAuthPassword(""); setCurrentUser(null);
  };

  async function handleGoogleUnlink() {
    setGoogleUnlinking(true);
    try {
      const res = await fetch("/api/auth/google", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setCurrentUser((u) => (u ? { ...u, hasGoogle: false } : u));
      else alert(data.message || "取消綁定失敗");
    } catch (e) {} finally { setGoogleUnlinking(false); }
  }

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const res = await fetch("/api/user/me", { method: "DELETE" });
      if (res.ok) { setIsAuthenticated(false); setAccounts([]); setHistory([]); }
    } finally { setDeletingAccount(false); setShowDeleteConfirm(false); }
  };

  async function handleAuthSubmit(e: FormEvent) {
    e.preventDefault(); setAuthError(""); setAuthLoading(true);
    try {
      const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: authMode, email: authEmail, password: authPassword }) });
      const data = await res.json();
      if (res.ok) {
        setIsAuthenticated(true);
        const meRes = await fetch("/api/auth");
        if (meRes.ok) setCurrentUser((await meRes.json()).user);
      } else { setAuthError(data.message || "發生錯誤"); }
    } catch { setAuthError("網路錯誤，請稍後再試"); } finally { setAuthLoading(false); }
  }

  async function fetchAccounts() { try { const res = await fetch("/api/accounts"); if (res.ok) setAccounts(await res.json()); } catch (e) {} }
  async function fetchHistory() { try { const res = await fetch("/api/history"); if (res.ok) setHistory(await res.json()); } catch (e) {} }
  async function fetchTransactions() { try { const res = await fetch("/api/transactions"); if (res.ok) setTransactions(await res.json()); } catch (e) {} }
  async function fetchExchangeRate() { try { const res = await fetch("/api/exchange-rate", { cache: "no-store" }); if (res.ok) { const d = await res.json(); if (d?.rate) setExchangeRate(d.rate); } } catch (e) {} }

  async function fetchGoals() { try { const res = await fetch("/api/goals"); if (res.ok) setGoals(await res.json()); } catch (e) {} }

  async function handleGoalSubmit(e: React.FormEvent) {
    e.preventDefault();
    const method = editingGoal ? "PUT" : "POST";
    const body = editingGoal
      ? { id: editingGoal.id, ...goalForm, targetAmount: Number(goalForm.targetAmount) }
      : { ...goalForm, targetAmount: Number(goalForm.targetAmount) };
    const res = await fetch("/api/goals", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) {
      setShowGoalForm(false); setEditingGoal(null);
      setGoalForm({ name: "", targetAmount: "", type: "NET_WORTH", accountId: "", emoji: "" });
      await fetchGoals();
    }
  }

  async function handleDeleteGoal(id: string) {
    if (!window.confirm("確定要刪除這個目標嗎？")) return;
    await fetch(`/api/goals?id=${id}`, { method: "DELETE" });
    await fetchGoals();
  }

  function resetForm() { setFormData(defaultForm); setEditingAccountId(null); setShowForm(false); }

  function startEdit(account: any) {
    setFormData({ name: account.name, type: account.type, category: account.category, symbol: account.symbol ?? "", quantity: String(account.quantity ?? account.currentValue ?? 0), currency: account.currency, isApiConnected: Boolean(account.isApiConnected), apiSource: account.apiSource ?? "BITFINEX", apiKey: account.apiKey ?? "", apiSecret: account.apiSecret ?? "", monthlyDeductionAmount: account.monthlyDeductionAmount ? String(account.monthlyDeductionAmount) : "", deductionDate: account.deductionDate ? String(account.deductionDate) : "" });
    setEditingAccountId(account.id); setShowForm(true); setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (!formData.name.trim() || !formData.type || !formData.category) return setError("請填寫完整資訊");
    const payload = { ...formData, quantity: isCryptoApiMode ? 0 : Number(formData.quantity || 0), symbol: isCryptoApiMode ? formData.apiSource : formData.symbol || null, monthlyDeductionAmount: Number(formData.monthlyDeductionAmount || 0), deductionDate: Number(formData.deductionDate || 0) };
    setLoading(true);
    try {
      const res = await fetch(editingAccountId ? `/api/accounts/${editingAccountId}` : "/api/accounts", { method: editingAccountId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("儲存失敗");
      setTimeout(() => resetForm(), 500);
      await Promise.allSettled([fetchAccounts(), fetchHistory(), fetchTransactions()]);
    } catch { setError("儲存發生錯誤。"); } finally { setLoading(false); }
  }

  async function handleDelete(accountId: string) {
    if (!window.confirm("確定要刪除嗎？")) return;
    try { await fetch(`/api/accounts/${accountId}`, { method: "DELETE" }); await Promise.allSettled([fetchAccounts(), fetchHistory(), fetchTransactions()]); } catch (e) {}
  }

  async function handleSyncPrices() {
    setSyncing(true);
    try {
      await fetch("/api/test-fetch-prices");
      await fetch("/api/history/snapshot").catch(() => {}); // 同步後把最新淨值寫入今天的快照
      await Promise.allSettled([fetchAccounts(), fetchHistory(), fetchExchangeRate()]);
    } catch (e) {} finally { setSyncing(false); }
  }

  async function fetchBenchmarks() {
    setBenchmarkLoading(true);
    try {
      const res = await fetch("/api/benchmark?days=365", { cache: "no-store" });
      if (res.ok) setBenchmarkData(await res.json());
    } catch (e) {} finally { setBenchmarkLoading(false); }
  }

  async function handleHistorySubmit(e: FormEvent) {
    e.preventDefault();
    if (!historyFormData.date || historyFormData.netWorth === "") return;
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(historyFormData) });
      if (res.ok) { setShowHistoryForm(false); await fetchHistory(); }
    } catch (e) {} finally { setHistoryLoading(false); }
  }

  function formatCurrency(value: number) { return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function formatCompactNumber(value: number) { return Intl.NumberFormat("zh-TW", { notation: "compact", maximumFractionDigits: 1 }).format(value); }

  function buildChartSeries(historyPoints: any[], selectedTimeframe: string, currentNetWorth: number) {
    const now = new Date();
    const getTWDateStr = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

    // 以「台北日期」為 key 建立歷史對照表；今天永遠使用即時淨資產
    const historyMap = new Map<string, number>();
    for (const p of historyPoints) {
      const v = Number(p.netWorth);
      if (Number.isFinite(v)) historyMap.set(getTWDateStr(new Date(p.date)), v);
    }
    const todayStr = getTWDateStr(now);
    historyMap.set(todayStr, currentNetWorth);

    // 每個時間範圍都是「每日一個點」，含今天
    const windowDays = selectedTimeframe === "day" ? 14 : selectedTimeframe === "month" ? 180 : 365;

    // 產生從 (今天 - windowDays + 1) 到今天、每天一個台北日期字串
    const days: string[] = [];
    for (let i = windowDays - 1; i >= 0; i--) {
      const d = new Date(now.getTime());
      d.setDate(now.getDate() - i);
      days.push(getTWDateStr(d));
    }

    // 第一筆真實資料出現前以 0 呈現，避免圖表出現斷點看起來像資料遺失；
    // 第一筆之後若有空缺則用前一天的值往後帶。X 軸仍涵蓋整個視窗（14 / 180 / 365 個位置）。
    let started = false;
    let lastKnown = 0;

    const seenMonths = new Set<string>();
    const result: { label: string; date: string; netWorth: number; started: boolean }[] = [];
    for (let idx = 0; idx < days.length; idx++) {
      const dateStr = days[idx];
      if (historyMap.has(dateStr)) { lastKnown = historyMap.get(dateStr)!; started = true; }

      // X 軸 label：兩週每兩天顯示 M/D；六個月／一年每個月首次出現顯示 N月
      const [y, m, dd] = dateStr.split("-");
      let label = "";
      if (selectedTimeframe === "day") {
        if ((days.length - 1 - idx) % 2 === 0) label = `${Number(m)}/${Number(dd)}`;
      } else {
        const monthKey = `${y}-${m}`;
        if (!seenMonths.has(monthKey)) { seenMonths.add(monthKey); label = `${Number(m)}月`; }
      }

      result.push({ label, date: dateStr, netWorth: started ? lastKnown : 0, started });
    }

    return result;
  }

  const chartData = useMemo(() => buildChartSeries(history, timeframe, summary.netWorth), [history, timeframe, summary.netWorth]);

  // X 軸改用 date（保證每個點唯一）當 dataKey，避免大量重複的空字串 label 讓 recharts 的
  // hover/tooltip 索引對不準；稀疏標籤改由 tickFormatter 查表顯示。
  const labelByDate = useMemo(() => new Map(chartData.map((p) => [p.date, p.label])), [chartData]);
  const xAxisTickFormatter = (v: string) => labelByDate.get(v) ?? "";

  const compareMode = activeBenchmarks.length > 0;

  // 進入比較模式且尚未抓過就自動抓一次（一年份，各時間範圍共用後再依視窗切）
  useEffect(() => {
    if (compareMode && Object.keys(benchmarkData).length === 0 && !benchmarkLoading) void fetchBenchmarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareMode]);

  // 指數：date -> 收盤價 的對照表
  const benchLevelMaps = useMemo(() => {
    const maps: Record<string, Map<string, number>> = {};
    for (const k of Object.keys(benchmarkData)) maps[k] = new Map((benchmarkData[k] || []).map((p) => [p.date, p.level]));
    return maps;
  }, [benchmarkData]);

  // 成長率比較：與趨勢圖共用同一組每日點位（14 / 180 / 365）。
  // 指數以「視窗第一天」為 0% 基準，顯示整段真實走勢；缺行情的日子（假日）沿用前一天。
  // 你的淨值：第一筆真實資料出現前先當 0%（使用者同意 7/8 之前 0 沒關係），之後以第一筆為基準計算成長率。
  // 淨值可能為負，改用 |base| 當分母，語意為「相對起始規模的變化」，避免除到號會翻轉的基準。
  // 起始淨值太接近 0 時，百分比變化會被放大到失真（例如淨值從 -500 變 300 會顯示成幾百 %），
  // 這種情況下改回傳空陣列，UI 顯示「起始淨值過低，無法以百分比比較」的提示。
  const MIN_COMPARISON_BASE = 10000;
  const comparisonBaseTooSmall = useMemo(() => {
    if (!compareMode || chartData.length === 0) return false;
    const baseIdx = chartData.findIndex((p) => p.started);
    const baseYou = baseIdx >= 0 ? chartData[baseIdx].netWorth : 0;
    return Math.abs(baseYou) < MIN_COMPARISON_BASE;
  }, [compareMode, chartData]);

  const comparisonData = useMemo(() => {
    if (!compareMode || chartData.length === 0 || comparisonBaseTooSmall) return [] as any[];
    const baseIdx = chartData.findIndex((p) => p.started);
    const baseYou = baseIdx >= 0 ? chartData[baseIdx].netWorth : 0;
    const denomYou = Math.abs(baseYou);

    const idxCarry: Record<string, number | null> = {};
    const idxBase: Record<string, number | null> = {};
    for (const k of activeBenchmarks) { idxCarry[k] = null; idxBase[k] = null; }

    return chartData.map((pt, i) => {
      const row: any = { label: pt.label, date: pt.date };

      // 你的成長率
      if (baseIdx < 0 || i < baseIdx) row.you = 0;
      else row.you = ((pt.netWorth - baseYou) / denomYou) * 100;

      // 各指數成長率（實際行情、視窗首日為基準、缺資料沿用前一天）
      for (const k of activeBenchmarks) {
        const lvl = benchLevelMaps[k]?.get(pt.date);
        if (lvl != null) idxCarry[k] = lvl;
        const cur = idxCarry[k];
        if (cur != null && idxBase[k] == null) idxBase[k] = cur;
        row[k] = cur != null && idxBase[k] ? (cur / (idxBase[k] as number) - 1) * 100 : null;
      }
      return row;
    });
  }, [compareMode, chartData, activeBenchmarks, benchLevelMaps]);

  function formatPct(v: number) { return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`; }
  function toggleBenchmark(k: string) {
    setActiveBenchmarks((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  const accountGroups = [
    { title: "流動資金", categories: ["BANK_ACCOUNT", "CASH"] },
    { title: "投資組合", categories: ["TAIWAN_STOCK", "US_STOCK", "CRYPTO"] },
    { title: "負債總額", categories: ["PAYABLE", "MORTGAGE", "CAR_LOAN", "CREDIT_LOAN"] },
  ];

  const renderedAccountGroups = useMemo(() => {
    return accountGroups.map(group => {
      const relevant = accounts.filter(a => group.categories.includes(a.category));
      if (relevant.length === 0) return null;
      const cards = Object.values(relevant.reduce((res: any, acc: any) => {
        const key = symbolRequiredCategories.includes(acc.category) ? `${acc.symbol}::${acc.name}` : acc.name.toLowerCase();
        if (!res[key]) res[key] = { id: key, title: acc.symbol || acc.name, subtitle: acc.name, category: acc.category, quantity: 0, currentValue: 0, currentPrice: acc.currentPrice, currency: acc.currency, account: acc };
        res[key].quantity += Number(acc.quantity ?? 0);
        res[key].currentValue += Number(acc.currentValue ?? 0);
        return res;
      }, {}));
      return { ...group, cards };
    }).filter(Boolean);
  }, [accounts]);

  const bg = "bg-[#EEF0EC] dark:bg-[#0B0D12]";
  const surface = "bg-white dark:bg-[#12151C] border border-black/[0.07] dark:border-white/[0.07]";
  const textPrimary = "text-[#1C1F1A] dark:text-[#E7E5DE]";
  const textMuted = "text-[#6B7066] dark:text-[#8A8F82]";
  const gold = "#B8933C";
  const inputCls = "w-full h-11 px-3.5 text-sm outline-none bg-transparent text-[#1C1F1A] dark:text-[#E7E5DE] border-b-2 border-black/15 dark:border-white/15 focus:border-[#B8933C] transition-colors";
  const btnPrimary = "w-full py-3.5 text-sm font-semibold bg-[#1C1F1A] dark:bg-[#B8933C] text-[#EEF0EC] dark:text-[#0B0D12] rounded-lg hover:opacity-90 transition-all cursor-pointer";
  const sectionLabel = "text-[9px] font-bold tracking-[0.2em] uppercase text-[#6B7066] dark:text-[#8A8F82]";

  if (mounted && !isAuthenticated) {
    return (
      <main className={`min-h-screen flex items-center justify-center p-4 ${bg} ${textPrimary}`}>
        <FontStyles />
        <div className={`w-full max-w-sm p-8 ${surface} rounded-2xl flex flex-col items-center`}>
          <div className="p-3.5 mb-6 border-2 border-[#1C1F1A] dark:border-[#B8933C] rounded-full">
            <Lock className="h-6 w-6 text-[#1C1F1A] dark:text-[#B8933C]" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">淨資產對帳單</h1>
          <p className={`text-[11px] font-semibold tracking-[0.25em] mb-8 mt-1 ${textMuted}`}>
            {authMode === "login" ? "SIGN IN · 登入帳號" : "REGISTER · 建立帳號"}
          </p>
          <form onSubmit={handleAuthSubmit} className="w-full space-y-5">
            <div>
              <label className={`block text-xs mb-2 ${sectionLabel}`}>電子郵件</label>
              <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="your@email.com" className={inputCls} required />
            </div>
            <div>
              <label className={`block text-xs mb-2 ${sectionLabel}`}>密碼{authMode === "register" ? "（至少 8 字元）" : ""}</label>
              <div className="relative">
                <input type={showAuthPassword ? "text" : "password"} value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="••••••••" className={`${inputCls} pr-9`} required minLength={authMode === "register" ? 8 : 1} />
                <button type="button" onClick={() => setShowAuthPassword(!showAuthPassword)} tabIndex={-1} className={`absolute right-0 top-1/2 -translate-y-1/2 p-1 ${textMuted} hover:text-[#B8933C] transition-colors`}>
                  {showAuthPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {authError && <p className="text-sm font-medium text-[#A24936] bg-[#A24936]/8 p-3 rounded-lg text-center">{authError}</p>}
            <button type="submit" disabled={authLoading} className={`mt-2 ${btnPrimary}`}>
              {authLoading ? "處理中…" : authMode === "login" ? "登入" : "建立帳號"}
            </button>
          </form>

          <div className="w-full flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
            <span className={`text-[10px] ${textMuted}`}>或</span>
            <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
          </div>

          <a href="/api/auth/google" className={`w-full py-3 flex items-center justify-center gap-2.5 text-sm font-semibold rounded-lg border border-black/15 dark:border-white/15 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors ${textPrimary}`}>
            <GoogleIcon className="h-4 w-4" />
            使用 Google {authMode === "login" ? "登入" : "註冊"}
          </a>

          <button onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }} className={`mt-6 text-xs ${textMuted} hover:text-[#B8933C] transition-colors`}>
            {authMode === "login" ? "還沒有帳號？ 立即註冊" : "已有帳號？ 返回登入"}
          </button>
        </div>
      </main>
    );
  }

  const navItems: { key: Tab; icon: any; label: string }[] = [
    { key: "overview", icon: LayoutDashboard, label: "總覽" },
    { key: "assets", icon: PieChart, label: "資產" },
    { key: "trends", icon: TrendingUp, label: "走勢" },
    { key: "settings", icon: Settings, label: "設定" },
  ];

  return (
    <div className={`min-h-screen ${bg} ${textPrimary} flex flex-col`}>
      <FontStyles />
      <div className="fixed top-0 left-0 right-0 h-px z-20" style={{ background: gold, opacity: 0.5 }} />

      <div className="flex-1 overflow-y-auto pb-24">

        {activeTab === "overview" && (
          <div className="px-4 pt-8 pb-4 max-w-lg mx-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b-2 border-[#1C1F1A] dark:border-[#B8933C]">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5" style={{ color: gold }} />
                <span className="font-display text-base font-semibold tracking-tight">Net Worth <span className={`font-normal italic ${textMuted}`}>Statement</span></span>
              </div>
              <button onClick={toggleDarkMode} className={`p-2 rounded-lg ${textMuted} hover:text-[#B8933C] transition-colors`}>
                {isDarkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </button>
            </div>

            <div className={`${surface} rounded-2xl p-5`}>
              <div className="flex items-center justify-between mb-1">
                <span className={sectionLabel}><Wallet className="inline h-3 w-3 mr-1 -mt-0.5" />總淨資產</span>
                <button onClick={() => setHideBalance(!hideBalance)} className={`p-1 ${textMuted} hover:text-[#B8933C] transition-colors`}>
                  {hideBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="font-display text-4xl font-semibold tracking-tight mt-2 mb-4">
                {hideBalance ? "NT$ ••••••" : `NT$ ${formatCurrency(summary.netWorth)}`}
              </p>
              <div className="space-y-2 font-mono-ledger text-sm">
                <div className="flex items-baseline gap-2">
                  <span className={textMuted}>總資產</span>
                  <span className="dot-leader" />
                  <span className="font-semibold text-[#4F7B5E] dark:text-[#7FAE8F]">{hideBalance ? "••••••" : `NT$ ${formatCurrency(summary.totalAssets)}`}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={textMuted}>總負債</span>
                  <span className="dot-leader" />
                  <span className="font-semibold text-[#A24936]">{hideBalance ? "••••••" : `NT$ ${formatCurrency(summary.totalLiabilities)}`}</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-black/[0.06] dark:border-white/[0.06] flex items-center gap-2">
                <button onClick={handleSyncPrices} disabled={syncing} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold ${surface} rounded-lg ${textMuted} hover:text-[#B8933C] transition-all`}>
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "同步中…" : "同步"}
                </button>
                <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg text-white transition-all" style={{ background: "#e2b098" }}>
                  <Plus className="h-3.5 w-3.5" /> 新增項目
                </button>
                <div className={`ml-auto font-mono-ledger text-[11px] ${textMuted}`}>
                  USD/TWD {exchangeRate?.toFixed(2) || "—"}
                </div>
              </div>
            </div>

            {/* 目標進度 — 緊湊橫條樣式 */}
            <div className="flex items-center justify-between px-1">
              <span className={`text-[10px] font-bold tracking-[0.18em] uppercase ${textMuted}`}>目標</span>
              <button onClick={() => { setEditingGoal(null); setGoalForm({ name: "", targetAmount: "", type: "NET_WORTH", accountId: "", emoji: "" }); setShowGoalForm(true); }} className={`text-[10px] font-semibold ${textMuted} hover:text-[#B8933C] transition-colors`}>+ 新增</button>
            </div>
            {goals.length === 0 ? (
              <button onClick={() => { setEditingGoal(null); setGoalForm({ name: "", targetAmount: "", type: "NET_WORTH", accountId: "", emoji: "" }); setShowGoalForm(true); }} className={`w-full px-4 py-3 flex items-center gap-2 ${surface} rounded-xl border-dashed ${textMuted} hover:text-[#B8933C] transition-colors`}>
                <span>🎯</span>
                <span className="text-xs font-medium">設定第一個財務目標</span>
                <Plus className="h-3.5 w-3.5 ml-auto" />
              </button>
            ) : (
              <div className={`${surface} rounded-xl overflow-hidden`}>
                {goals.map((goal: any, idx: number) => (
                  <div key={goal.id} className={`px-4 py-3 ${idx !== 0 ? "border-t border-black/[0.05] dark:border-white/[0.05]" : ""}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {goal.emoji && <span className="text-sm leading-none">{goal.emoji}</span>}
                      <span className="text-xs font-semibold flex-1 truncate">{goal.name}</span>
                      <span className="font-mono-ledger text-[11px] font-bold shrink-0" style={{ color: goal.progress >= 100 ? "#4F7B5E" : "#B8933C" }}>
                        {goal.progress >= 100 ? "✓ 達標" : `${goal.progress}%`}
                      </span>
                      <button onClick={() => { setEditingGoal(goal); setGoalForm({ name: goal.name, targetAmount: String(goal.targetAmount), type: goal.type, accountId: goal.accountId || "", emoji: goal.emoji || "" }); setShowGoalForm(true); }} className={`p-0.5 ${textMuted} hover:text-[#B8933C] transition-colors`}><Pencil className="h-3 w-3" /></button>
                      <button onClick={() => handleDeleteGoal(goal.id)} className={`p-0.5 ${textMuted} hover:text-[#A24936] transition-colors`}><Trash2 className="h-3 w-3" /></button>
                    </div>
                    <div className="w-full bg-black/[0.06] dark:bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
                      <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${goal.progress}%`, background: goal.progress >= 100 ? "#4F7B5E" : "#B8933C" }} />
                    </div>
                    <div className={`flex justify-between mt-1 font-mono-ledger text-[10px] ${textMuted}`}>
                      <span>NT$ {Number(goal.currentAmount).toLocaleString()}</span>
                      {goal.progress < 100
                        ? <span>目標 NT$ {Number(goal.targetAmount).toLocaleString()}</span>
                        : <span className="text-[#4F7B5E] dark:text-[#7FAE8F]">🎉 已達標！</span>
                      }
                    </div>
                  </div>
                ))}
              </div>
            )}

            {renderedAccountGroups.map((group: any) => (
              <div key={group.title} className={`${surface} rounded-2xl p-5`}>
                <div className="flex items-center justify-between pb-3 mb-2 border-b-2 border-[#1C1F1A] dark:border-[#B8933C]">
                  <h3 className="font-display text-sm font-semibold">{group.title}</h3>
                  <span className={`font-mono-ledger text-[10px] ${textMuted}`}>{group.cards.length} 項</span>
                </div>
                {group.cards.map((card: any) => {
                  const showSubtitle = symbolRequiredCategories.includes(card.category) && card.subtitle && card.subtitle !== card.title;
                  return (
                    <div key={card.id} className="py-3 border-b border-dashed border-black/[0.07] dark:border-white/[0.07] last:border-b-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold truncate">{card.title.replace(/\.TW$/i, "")}</span>
                        <span className={`text-[9px] font-bold tracking-wider uppercase ${textMuted} shrink-0`}>{categoryLabelMap[card.category]}</span>
                        <span className="dot-leader" />
                        <span className="font-mono-ledger text-sm font-semibold shrink-0">NT$ {formatCurrency(card.currentValue)}</span>
                      </div>
                      {showSubtitle && <p className="text-xs mt-0.5 truncate" style={{ color: gold }}>{card.subtitle}</p>}
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className={`font-mono-ledger text-xs ${textMuted} flex items-center gap-2`}>
                          <span>{symbolRequiredCategories.includes(card.category) ? `持有 ${formatCurrency(card.quantity)} 股` : `餘額 ${formatCurrency(card.quantity)}`}</span>
                          {symbolRequiredCategories.includes(card.category) && card.currentPrice > 0 && (
                            <><span className="opacity-30">·</span><span className="text-[#4F7B5E] dark:text-[#7FAE8F] font-semibold">@ {formatCurrency(card.currentPrice)} {card.currency}</span></>
                          )}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => startEdit(card.account)} className={`p-1.5 ${textMuted} hover:text-[#B8933C] transition-colors`}><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => handleDelete(card.account.id)} className={`p-1.5 ${textMuted} hover:text-[#A24936] transition-colors`}><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {activeTab === "assets" && (
          <div className="px-4 pt-8 pb-4 max-w-lg mx-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b-2 border-[#1C1F1A] dark:border-[#B8933C]">
              <h2 className="font-display text-base font-semibold">資產明細</h2>
              <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg text-white" style={{ background: "#e2b098" }}>
                <Plus className="h-3.5 w-3.5" /> 新增
              </button>
            </div>
            {accounts.filter(a => a.isActive !== false).length === 0 ? (
              <div className={`${surface} rounded-2xl p-8 text-center`}>
                <p className={`text-sm ${textMuted}`}>還沒有任何資產</p>
                <button onClick={() => { resetForm(); setShowForm(true); }} className="mt-4 text-sm font-semibold" style={{ color: gold }}>+ 新增第一筆資產</button>
              </div>
            ) : (
              (() => {
                const activeAccounts = accounts.filter(a => a.isActive !== false);
                const groups = [
                  { label: "流動資金", cats: ["CASH", "BANK_ACCOUNT"] },
                  { label: "台股", cats: ["TAIWAN_STOCK"] },
                  { label: "美股", cats: ["US_STOCK"] },
                  { label: "虛擬貨幣", cats: ["CRYPTO"] },
                  { label: "其他資產", cats: ["FIXED_ASSET", "RECEIVABLE"] },
                  { label: "負債", cats: ["PAYABLE", "MORTGAGE", "CAR_LOAN", "CREDIT_LOAN"] },
                ];
                return (
                  <div className="space-y-4">
                    {groups.map(group => {
                      const items = activeAccounts.filter(a => group.cats.includes(a.category));
                      if (items.length === 0) return null;
                      const groupTotal = items.reduce((sum, a) => sum + Number(a.currentValue ?? 0), 0);
                      return (
                        <div key={group.label}>
                          <div className="flex items-center justify-between px-1 mb-2">
                            <span className={`text-[10px] font-bold tracking-[0.15em] uppercase ${textMuted}`}>{group.label}</span>
                            <span className={`font-mono-ledger text-[10px] ${textMuted}`}>NT$ {formatCurrency(groupTotal)}</span>
                          </div>
                          <div className={`${surface} rounded-xl overflow-hidden`}>
                            {items.map((account, idx) => (
                              <div key={account.id} className={`flex items-center justify-between p-4 ${idx !== 0 ? "border-t border-black/[0.05] dark:border-white/[0.05]" : ""}`}>
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-semibold truncate block">{account.name}</span>
                                  <p className={`font-mono-ledger text-xs ${textMuted} mt-0.5`}>
                                    {account.symbol ? `${account.symbol.replace(/\.TW$/i, "")} · ` : ""}{formatCurrency(account.quantity)}{amountInputCategories.includes(account.category) ? "" : " 股"}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 ml-3 shrink-0">
                                  <p className="font-mono-ledger text-sm font-semibold">NT$ {formatCurrency(account.currentValue)}</p>
                                  <button onClick={() => startEdit(account)} className={`p-1.5 ${textMuted} hover:text-[#B8933C] transition-colors`}><Pencil className="h-3.5 w-3.5" /></button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>
        )}

        {activeTab === "trends" && (
          <div className="px-4 pt-8 pb-4 max-w-lg mx-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b-2 border-[#1C1F1A] dark:border-[#B8933C]">
              <h2 className="font-display text-base font-semibold">歷史走勢</h2>
              <button onClick={() => setShowHistoryForm(true)} className="text-xs font-semibold hover:underline underline-offset-2" style={{ color: gold }}>+ 手動補登</button>
            </div>
            <div className={`${surface} rounded-xl p-1 flex gap-1`}>
              {(["day", "month", "year"] as const).map(item => (
                <button key={item} onClick={() => setTimeframe(item)} className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${timeframe === item ? "bg-[#1C1F1A] dark:bg-[#B8933C] text-white dark:text-black" : textMuted}`}>
                  {item === "day" ? "兩週" : item === "month" ? "六個月" : "一年"}
                </button>
              ))}
            </div>

            {/* 基準比較：疊上大盤指數的成長率 */}
            <div className="flex items-center gap-2 px-1">
              <span className={`text-[10px] font-bold tracking-[0.15em] uppercase ${textMuted}`}>對比大盤</span>
              {Object.entries(BENCHMARKS).map(([key, cfg]) => {
                const on = activeBenchmarks.includes(key);
                return (
                  <button key={key} onClick={() => toggleBenchmark(key)} className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-all ${on ? "text-white dark:text-black" : `${textMuted} border-black/10 dark:border-white/10`}`} style={on ? { background: cfg.color, borderColor: cfg.color } : undefined}>
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: on ? "currentColor" : cfg.color }} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>

            <div className={`${surface} rounded-2xl p-4`}>
              {compareMode && (
                <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mb-3 pb-3 border-b border-black/[0.06] dark:border-white/[0.06]">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: gold }} />你的淨值</span>
                  {activeBenchmarks.map((k) => (
                    <span key={k} className="flex items-center gap-1.5 text-[11px] font-semibold"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: BENCHMARKS[k].color }} />{BENCHMARKS[k].label}</span>
                  ))}
                  <span className={`ml-auto text-[10px] ${textMuted}`}>{benchmarkLoading ? "抓取行情中…" : "成長率 · 以區間首日為 0%"}</span>
                </div>
              )}
              <div className="h-[240px]">
                {mounted && compareMode && comparisonData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={comparisonData} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#8A8F82", fontSize: 11, fontFamily: "IBM Plex Mono" }} tickMargin={10} interval={0} tickFormatter={xAxisTickFormatter} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#8A8F82", fontSize: 11, fontFamily: "IBM Plex Mono" }} tickFormatter={(v) => `${Math.round(v)}%`} width={44} />
                      <ReferenceLine y={0} stroke="#8A8F82" strokeDasharray="3 3" strokeOpacity={0.5} />
                      <Tooltip contentStyle={{ borderRadius: "10px", border: isDarkMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.08)", background: isDarkMode ? "#12151C" : "#FFFFFF", fontFamily: "IBM Plex Mono", fontSize: "12px", boxShadow: "none" }} labelFormatter={(l) => String(l)} formatter={(val, name) => [formatPct(Number(val)), name === "you" ? "你的淨值" : BENCHMARKS[String(name)]?.label ?? String(name)]} />
                      <Line type="monotone" dataKey="you" stroke={gold} strokeWidth={2.5} dot={false} />
                      {activeBenchmarks.map((k) => (
                        <Line key={k} type="monotone" dataKey={k} stroke={BENCHMARKS[k].color} strokeWidth={2} dot={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                ) : mounted && chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={gold} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={gold} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#8A8F82", fontSize: 11, fontFamily: "IBM Plex Mono" }} tickMargin={10} interval={0} tickFormatter={xAxisTickFormatter} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#8A8F82", fontSize: 11, fontFamily: "IBM Plex Mono" }} tickFormatter={formatCompactNumber} width={44} />
                      <Tooltip contentStyle={{ borderRadius: "10px", border: isDarkMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.08)", background: isDarkMode ? "#12151C" : "#FFFFFF", fontFamily: "IBM Plex Mono", fontSize: "12px", boxShadow: "none" }} labelFormatter={(l) => String(l)} formatter={(val) => [`NT$ ${formatCurrency(Number(val))}`, "淨資產"]} />
                      <Area type="monotone" dataKey="netWorth" stroke={gold} strokeWidth={2} fillOpacity={1} fill="url(#chartGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : mounted && compareMode && comparisonBaseTooSmall ? (
                  <div className="h-full flex items-center justify-center">
                    <p className={`text-sm ${textMuted}`}>起始淨值過低，無法以百分比比較走勢</p>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <p className={`text-sm ${textMuted}`}>尚無歷史資料</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="px-4 pt-8 pb-4 max-w-lg mx-auto space-y-4">
            <div className="pb-3 border-b-2 border-[#1C1F1A] dark:border-[#B8933C]">
              <h2 className="font-display text-base font-semibold">設定</h2>
            </div>
            <div className={`${surface} rounded-2xl overflow-hidden`}>
              <div className="px-4 py-2 border-b border-black/[0.06] dark:border-white/[0.06]">
                <p className={sectionLabel}>外觀</p>
              </div>
              <button onClick={toggleDarkMode} className="w-full flex items-center justify-between p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-3">
                  {isDarkMode ? <Moon className="h-4 w-4" style={{ color: gold }} /> : <Sun className="h-4 w-4" style={{ color: gold }} />}
                  <span className="text-sm font-medium">{isDarkMode ? "深色模式" : "淺色模式"}</span>
                </div>
                <span className={`text-xs ${textMuted}`}>切換</span>
              </button>
            </div>
            <div className={`${surface} rounded-2xl overflow-hidden`}>
              <div className="px-4 py-2 border-b border-black/[0.06] dark:border-white/[0.06]">
                <p className={sectionLabel}>資料</p>
              </div>
              <button onClick={handleSyncPrices} disabled={syncing} className="w-full flex items-center justify-between p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-3">
                  <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} style={{ color: gold }} />
                  <span className="text-sm font-medium">同步價格</span>
                </div>
                <span className={`font-mono-ledger text-xs ${textMuted}`}>{syncing ? "同步中…" : `USD/TWD ${exchangeRate?.toFixed(2) || "—"}`}</span>
              </button>
              <div className="border-t border-black/[0.06] dark:border-white/[0.06]">
                <button onClick={() => setShowHistoryForm(true)} className="w-full flex items-center justify-between p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="h-4 w-4" style={{ color: gold }} />
                    <span className="text-sm font-medium">手動補登走勢</span>
                  </div>
                  <ChevronRight className={`h-4 w-4 ${textMuted}`} />
                </button>
              </div>
            </div>
            <div className={`${surface} rounded-2xl overflow-hidden`}>
              <div className="px-4 py-2 border-b border-black/[0.06] dark:border-white/[0.06]">
                <p className={sectionLabel}>帳號</p>
              </div>
              {currentUser && (
                <div className="flex items-center justify-between p-4 border-b border-black/[0.06] dark:border-white/[0.06]">
                  <div className="flex items-center gap-3">
                    <GoogleIcon className="h-4 w-4" />
                    <div>
                      <span className="text-sm font-medium block">Google 帳號</span>
                      <span className={`text-xs ${textMuted}`}>{currentUser.hasGoogle ? "已綁定" : "尚未綁定"}</span>
                    </div>
                  </div>
                  {currentUser.hasGoogle ? (
                    currentUser.hasPassword ? (
                      <button onClick={handleGoogleUnlink} disabled={googleUnlinking} className={`text-xs font-semibold ${textMuted} hover:text-[#A24936] transition-colors`}>
                        {googleUnlinking ? "處理中…" : "取消綁定"}
                      </button>
                    ) : (
                      <span className={`text-xs ${textMuted}`}>✓</span>
                    )
                  ) : (
                    <a href="/api/auth/google" className="text-xs font-semibold" style={{ color: gold }}>綁定</a>
                  )}
                </div>
              )}
              <button onClick={handleLogout} className="w-full flex items-center p-4 gap-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                <LogOut className="h-4 w-4 text-[#A24936]" />
                <span className="text-sm font-medium text-[#A24936]">登出</span>
              </button>
              <div className="border-t border-black/[0.06] dark:border-white/[0.06]">
                <button onClick={() => setShowDeleteConfirm(true)} className="w-full flex items-center p-4 gap-3 hover:bg-[#A24936]/5 transition-colors">
                  <AlertTriangle className="h-4 w-4 text-[#A24936]" />
                  <span className="text-sm font-medium text-[#A24936]">刪除帳號與所有資料</span>
                </button>
              </div>
            </div>
            <p className={`text-center text-xs ${textMuted} pb-2`}>Net Worth Tracker · 版本 1.0</p>
          </div>
        )}
      </div>

      {/* 底部導覽列 */}
      <div className={`fixed bottom-0 left-0 right-0 z-20 ${surface} border-t`} style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex max-w-lg mx-auto">
          {navItems.map(({ key, icon: Icon, label }) => {
            const active = activeTab === key;
            return (
              <button key={key} onClick={() => setActiveTab(key)} className="flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors cursor-pointer">
                <Icon className="h-5 w-5" style={{ color: active ? gold : "#8A8F82" }} />
                <span className="text-[10px] font-semibold" style={{ color: active ? gold : "#8A8F82" }}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 新增/編輯表單 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-lg max-h-[92vh] overflow-y-auto ${surface} rounded-2xl shadow-2xl`}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/[0.07] dark:border-white/[0.07] bg-white dark:bg-[#12151C] p-5 rounded-t-2xl">
              <h2 className="font-display text-base font-semibold">{editingAccountId ? "編輯項目" : "新增項目"}</h2>
              <button onClick={() => setShowForm(false)} className={`p-2 ${textMuted} transition-colors`}><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className={`block text-xs mb-2 ${sectionLabel}`}>名稱</label>
                  <input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="例如：台積電" className={inputCls} />
                </div>
                <div className="grid gap-4 grid-cols-2">
                  <div>
                    <label className={`block text-xs mb-2 ${sectionLabel}`}>類型</label>
                    <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className={inputCls}>{typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  </div>
                  <div>
                    <label className={`block text-xs mb-2 ${sectionLabel}`}>類別</label>
                    <select value={formData.category} onChange={(e) => { const n = e.target.value; setFormData({ ...formData, category: n, isApiConnected: n === "CRYPTO" ? formData.isApiConnected : false }); }} className={inputCls}>{categoryOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  </div>
                </div>
                <div className="grid gap-4 grid-cols-2">
                  <div>
                    <label className={`block text-xs mb-2 ${sectionLabel}`}>幣別</label>
                    <select value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })} className={inputCls}>{currencyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  </div>
                  {!showApiFields && (
                    <div>
                      <label className={`block text-xs mb-2 ${sectionLabel}`}>{usesAmountInput ? "總金額" : "持有股數"}</label>
                      <input type="number" step="any" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} className={`${inputCls} font-mono-ledger`} />
                    </div>
                  )}
                </div>
                {requiresSymbol && (
                  <div>
                    <label className={`block text-xs mb-2 ${sectionLabel}`}>代號 {formData.category === "TAIWAN_STOCK" ? "（只需輸入數字，自動補 .TW）" : "(Symbol)"}</label>
                    <input value={formData.symbol} onChange={(e) => setFormData({ ...formData, symbol: e.target.value })} placeholder={formData.category === "TAIWAN_STOCK" ? "例如：2330" : "例如：NVDA"} className={`${inputCls} font-mono-ledger`} />
                  </div>
                )}
                {formData.category === "CRYPTO" && (
                  <div className="p-4 border border-black/10 dark:border-white/10 rounded-xl space-y-4">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input type="checkbox" checked={formData.isApiConnected} onChange={(e) => setFormData({ ...formData, isApiConnected: e.target.checked })} className="h-4 w-4 accent-[#B8933C]" />
                      <span className="text-sm font-semibold">連接交易所 API 自動同步</span>
                    </label>
                    {formData.isApiConnected && (
                      <div className="space-y-4 pl-6">
                        <div>
                          <label className={`block text-xs mb-2 ${sectionLabel}`}>交易所</label>
                          <select value={formData.apiSource} onChange={(e) => setFormData({ ...formData, apiSource: e.target.value })} className={inputCls}>
                            <option value="BITFINEX">Bitfinex</option>
                            <option value="BINANCE">幣安 Binance</option>
                          </select>
                        </div>
                        <div>
                          <label className={`block text-xs mb-2 ${sectionLabel}`}>API Key</label>
                          <input type="password" autoComplete="off" value={formData.apiKey} onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })} className={`${inputCls} font-mono-ledger`} />
                        </div>
                        <div>
                          <label className={`block text-xs mb-2 ${sectionLabel}`}>API Secret</label>
                          <input type="password" autoComplete="off" value={formData.apiSecret} onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })} className={`${inputCls} font-mono-ledger`} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {formData.type === "LIABILITY" && (
                  <div className="grid gap-4 grid-cols-2">
                    <div>
                      <label className={`block text-xs mb-2 ${sectionLabel}`}>每月扣款金額</label>
                      <input type="number" step="any" min="0" placeholder="例如：15000" value={formData.monthlyDeductionAmount} onChange={(e) => setFormData({ ...formData, monthlyDeductionAmount: e.target.value })} className={`${inputCls} font-mono-ledger`} />
                    </div>
                    <div>
                      <label className={`block text-xs mb-2 ${sectionLabel}`}>每月扣款日</label>
                      <input type="number" step="1" min="1" max="31" placeholder="例如：5" value={formData.deductionDate} onChange={(e) => setFormData({ ...formData, deductionDate: e.target.value })} className={`${inputCls} font-mono-ledger`} />
                    </div>
                    <p className={`col-span-2 text-xs ${textMuted} -mt-2`}>每月到扣款日，系統自動從負債總額扣除。</p>
                  </div>
                )}
                {error && <p className="text-sm font-medium text-[#A24936] bg-[#A24936]/8 p-3 rounded-lg">{error}</p>}
                <div className="flex gap-3 pt-4 border-t border-black/[0.06] dark:border-white/[0.06]">
                  <button type="button" onClick={() => setShowForm(false)} className={`flex-1 py-3 text-sm font-semibold ${textMuted} border border-black/10 dark:border-white/10 rounded-lg cursor-pointer`}>取消</button>
                  <button type="submit" disabled={loading} className="flex-1 py-3 text-sm font-semibold bg-[#1C1F1A] dark:bg-[#B8933C] text-white dark:text-black rounded-lg hover:opacity-90 transition-all cursor-pointer">{loading ? "儲存中…" : "確認儲存"}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 補登歷史 */}
      {showHistoryForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className={`w-full sm:max-w-sm ${surface} sm:rounded-2xl rounded-t-2xl shadow-2xl`}>
            <div className="flex items-center justify-between border-b border-black/[0.07] dark:border-white/[0.07] p-5">
              <h2 className="font-display text-base font-semibold">手動補登走勢</h2>
              <button onClick={() => setShowHistoryForm(false)} className={`p-2 ${textMuted}`}><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5">
              <form onSubmit={handleHistorySubmit} className="space-y-5">
                <div>
                  <label className={`block text-xs mb-2 ${sectionLabel}`}>選擇日期</label>
                  <input type="date" value={historyFormData.date} onChange={(e) => setHistoryFormData({ ...historyFormData, date: e.target.value })} className={`${inputCls} font-mono-ledger`} required />
                </div>
                <div>
                  <label className={`block text-xs mb-2 ${sectionLabel}`}>該日淨資產 (NT$)</label>
                  <input type="number" placeholder="例如：50000" value={historyFormData.netWorth} onChange={(e) => setHistoryFormData({ ...historyFormData, netWorth: e.target.value })} className={`${inputCls} font-mono-ledger`} required />
                </div>
                <button type="submit" disabled={historyLoading} className={btnPrimary}>
                  {historyLoading ? "處理中…" : "確認補登"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 目標新增/編輯 Modal */}
      {showGoalForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className={`w-full sm:max-w-sm ${surface} sm:rounded-2xl rounded-t-2xl shadow-2xl`}>
            <div className="flex items-center justify-between border-b border-black/[0.07] dark:border-white/[0.07] p-5">
              <h2 className="font-display text-base font-semibold">{editingGoal ? "編輯目標" : "新增目標"}</h2>
              <button onClick={() => setShowGoalForm(false)} className={`p-2 ${textMuted}`}><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5">
              <form onSubmit={handleGoalSubmit} className="space-y-4">
                <div className="flex gap-3">
                  <div style={{width: "60px"}}>
                    <label className={`block text-xs mb-2 ${sectionLabel}`}>圖示</label>
                    <input value={goalForm.emoji} onChange={e => setGoalForm({...goalForm, emoji: e.target.value})} placeholder="🎯" className={`${inputCls} text-center text-xl`} maxLength={2} />
                  </div>
                  <div className="flex-1">
                    <label className={`block text-xs mb-2 ${sectionLabel}`}>目標名稱</label>
                    <input value={goalForm.name} onChange={e => setGoalForm({...goalForm, name: e.target.value})} placeholder="例如：買房頭期款" className={inputCls} required />
                  </div>
                </div>
                <div>
                  <label className={`block text-xs mb-2 ${sectionLabel}`}>目標金額 (NT$)</label>
                  <input type="number" step="any" min="1" value={goalForm.targetAmount} onChange={e => setGoalForm({...goalForm, targetAmount: e.target.value})} placeholder="例如：3000000" className={`${inputCls} font-mono-ledger`} required />
                </div>
                <div>
                  <label className={`block text-xs mb-2 ${sectionLabel}`}>計算基準</label>
                  <select value={goalForm.type} onChange={e => setGoalForm({...goalForm, type: e.target.value, accountId: ""})} className={inputCls}>
                    <option value="NET_WORTH">總淨資產</option>
                    <option value="ACCOUNT">特定帳戶</option>
                  </select>
                </div>
                {goalForm.type === "ACCOUNT" && (
                  <div>
                    <label className={`block text-xs mb-2 ${sectionLabel}`}>選擇帳戶</label>
                    <select value={goalForm.accountId} onChange={e => setGoalForm({...goalForm, accountId: e.target.value})} className={inputCls} required>
                      <option value="">請選擇帳戶</option>
                      {accounts.filter(a => a.isActive !== false).map(a => (
                        <option key={a.id} value={a.id}>{a.name}（NT$ {Number(a.currentValue).toLocaleString()}）</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowGoalForm(false)} className={`flex-1 py-3 text-sm font-semibold ${textMuted} border border-black/10 dark:border-white/10 rounded-lg cursor-pointer`}>取消</button>
                  <button type="submit" className="flex-1 py-3 text-sm font-semibold bg-[#1C1F1A] dark:bg-[#B8933C] text-white dark:text-black rounded-lg cursor-pointer">儲存</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 刪除帳號確認 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className={`w-full sm:max-w-sm ${surface} sm:rounded-2xl rounded-t-2xl shadow-2xl p-6`}>
            <div className="flex items-start gap-4 mb-5">
              <div className="p-2 bg-[#A24936]/10 rounded-xl shrink-0">
                <AlertTriangle className="h-6 w-6 text-[#A24936]" />
              </div>
              <div>
                <h3 className="font-display text-base font-semibold text-[#A24936]">刪除帳號</h3>
                <p className={`text-sm ${textMuted} mt-1 leading-relaxed`}>此操作將永久刪除你的帳號及所有資產、歷史記錄，無法復原。</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className={`flex-1 py-3 text-sm font-semibold ${textMuted} border border-black/10 dark:border-white/10 rounded-lg cursor-pointer`}>取消</button>
              <button onClick={handleDeleteAccount} disabled={deletingAccount} className="flex-1 py-3 text-sm font-semibold bg-[#A24936] text-white rounded-lg hover:opacity-90 transition-all cursor-pointer">
                {deletingAccount ? "刪除中…" : "確認刪除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}