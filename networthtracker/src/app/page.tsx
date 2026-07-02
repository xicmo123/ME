"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Pencil, RefreshCw, Trash2, Plus, X } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const typeOptions = [
  { value: "ASSET", label: "資產" },
  { value: "LIABILITY", label: "負債" },
];

const categoryOptions = [
  { value: "CASH", label: "現金" },
  { value: "BANK_ACCOUNT", label: "銀行帳戶" },
  { value: "TAIWAN_STOCK", label: "台股" },
  { value: "US_STOCK", label: "美股" },
  { value: "CRYPTO", label: "虛擬貨幣" },
  { value: "FIXED_ASSET", label: "固定資產" },
  { value: "RECEIVABLE", label: "應收款" },
  { value: "PAYABLE", label: "應付款" },
  { value: "MORTGAGE", label: "房貸" },
  { value: "CAR_LOAN", label: "車貸" },
  { value: "CREDIT_LOAN", label: "信用貸款" },
];

const currencyOptions = [
  { value: "TWD", label: "TWD" },
  { value: "USD", label: "USD" },
];

const categoryLabelMap: Record<string, string> = {
  CASH: "現金",
  BANK_ACCOUNT: "銀行帳戶",
  TAIWAN_STOCK: "台股",
  US_STOCK: "美股",
  CRYPTO: "虛擬貨幣",
  FIXED_ASSET: "固定資產",
  RECEIVABLE: "應收款",
  PAYABLE: "應付款",
  MORTGAGE: "房貸",
  CAR_LOAN: "車貸",
  CREDIT_LOAN: "信用貸款",
};

const symbolRequiredCategories = ["TAIWAN_STOCK", "US_STOCK", "CRYPTO"];
const amountInputCategories = [
  "CASH",
  "BANK_ACCOUNT",
  "FIXED_ASSET",
  "RECEIVABLE",
  "PAYABLE",
  "MORTGAGE",
  "CAR_LOAN",
  "CREDIT_LOAN",
];

type Account = {
  id: string;
  name: string;
  type: string;
  category: string;
  symbol: string | null;
  quantity: number | null;
  currency: string;
  isApiConnected: boolean;
  apiSource: string | null;
  apiKey: string | null;
  apiSecret: string | null;
  currentPrice: number | null;
  currentValue: number;
  monthlyDeductionAmount: number | null;
  deductionDate: number | null;
  createdAt: string;
};

type HistoryPoint = {
  id: string;
  date: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
};

type TransactionRecord = {
  id: string;
  accountId: string;
  type: string;
  amount: number;
  description: string | null;
  date: string;
  account: {
    name: string;
  } | null;
};

const defaultForm = {
  name: "",
  type: "ASSET",
  category: "CASH",
  symbol: "",
  quantity: "0",
  currency: "TWD",
  isApiConnected: false,
  apiSource: "BITFINEX",
  apiKey: "",
  apiSecret: "",
  monthlyDeductionAmount: "",
  deductionDate: "",
};

export default function HomePage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [formData, setFormData] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [showForm, setShowForm] = useState(false); // 預設關閉表單
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<"day" | "month" | "quarter" | "year">("day");
  const [mounted, setMounted] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<"original" | "pixel">("original");
  const formSectionRef = useRef<HTMLDivElement | null>(null);

  const isCryptoApiMode = formData.category === "CRYPTO" && formData.isApiConnected;
  const requiresSymbol = symbolRequiredCategories.includes(formData.category) && !isCryptoApiMode;
  const usesAmountInput = amountInputCategories.includes(formData.category);
  const showDeductionFields = formData.type === "LIABILITY";
  const showApiFields = formData.category === "CRYPTO" && formData.isApiConnected;

  const summary = useMemo(() => {
    const totalAssets = accounts
      .filter((account) => account.type === "ASSET")
      .reduce((sum, account) => sum + Number(account.currentValue ?? 0), 0);

    const totalLiabilities = accounts
      .filter((account) => account.type === "LIABILITY")
      .reduce((sum, account) => sum + Number(account.currentValue ?? 0), 0);

    return {
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
    };
  }, [accounts]);

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem("networth-tracker-theme");
    if (savedTheme === "pixel" || savedTheme === "original") {
      setCurrentTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await Promise.allSettled([fetchAccounts(), fetchHistory(), fetchTransactions()]);
    })();
  }, []);

  const handleSaveThemeDefault = () => {
    localStorage.setItem("networth-tracker-theme", currentTheme);
    alert(`💾 已成功將「${currentTheme === "pixel" ? "像素 8-Bit" : "現代原版"}」風格儲存為預設值！`);
  };

  async function fetchAccounts() {
    try {
      const response = await fetch("/api/accounts");
      if (!response.ok) throw new Error("無法取得帳戶清單。");
      const data = (await response.json()) as Account[];
      setAccounts(data);
    } catch (fetchError) {
      console.error(fetchError);
    }
  }

  async function fetchHistory() {
    try {
      const response = await fetch("/api/history");
      if (!response.ok) throw new Error("無法取得歷史資料。");
      const data = (await response.json()) as HistoryPoint[];
      setHistory(data);
    } catch (historyError) {
      console.error("History request failed:", historyError);
    }
  }

  async function fetchTransactions() {
    try {
      const response = await fetch("/api/transactions");
      if (!response.ok) throw new Error("無法取得交易紀錄。");
      const data = (await response.json()) as TransactionRecord[];
      setTransactions(data);
    } catch (transactionError) {
      console.error("Transactions request failed:", transactionError);
    }
  }

  function resetForm() {
    setFormData(defaultForm);
    setEditingAccountId(null);
    setShowForm(false);
  }

  function startEdit(account: Account) {
    setFormData({
      name: account.name,
      type: account.type,
      category: account.category,
      symbol: account.symbol ?? "",
      quantity: String(account.quantity ?? account.currentValue ?? 0),
      currency: account.currency,
      isApiConnected: Boolean(account.isApiConnected),
      apiSource: account.apiSource ?? "BITFINEX",
      apiKey: account.apiKey ?? "",
      apiSecret: account.apiSecret ?? "",
      monthlyDeductionAmount: account.monthlyDeductionAmount ? String(account.monthlyDeductionAmount) : "",
      deductionDate: account.deductionDate ? String(account.deductionDate) : "",
    });
    setEditingAccountId(account.id);
    setShowForm(true);
    setError(null);
    setMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!formData.name.trim()) return setError("請填寫名稱。");
    if (!formData.type) return setError("請選擇類型。");
    if (!formData.category) return setError("請選擇類別。");
    if (requiresSymbol && !formData.symbol.trim()) return setError("需要填寫代號。");

    const parsedQuantity = isCryptoApiMode ? 0 : Number(formData.quantity ?? 0);
    
    const payload = {
      name: formData.name.trim(),
      type: formData.type,
      category: formData.category,
      symbol: isCryptoApiMode ? (formData.symbol.trim() || formData.apiSource || "BITFINEX") : (formData.symbol.trim() || null),
      quantity: parsedQuantity,
      currency: formData.currency,
      isApiConnected: isCryptoApiMode,
      apiSource: isCryptoApiMode ? (formData.apiSource || "BITFINEX") : null,
      apiKey: isCryptoApiMode ? formData.apiKey.trim() : null,
      apiSecret: isCryptoApiMode ? formData.apiSecret.trim() : null,
      monthlyDeductionAmount: showDeductionFields ? Number(formData.monthlyDeductionAmount || 0) : null,
      deductionDate: showDeductionFields ? Number(formData.deductionDate || 0) : null,
    };

    setLoading(true);
    try {
      const response = await fetch(editingAccountId ? `/api/accounts/${editingAccountId}` : "/api/accounts", {
        method: editingAccountId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("儲存失敗。");

      setMessage(editingAccountId ? "已成功更新帳戶。" : "已成功新增帳戶。");
      setTimeout(() => resetForm(), 1000);
      await Promise.allSettled([fetchAccounts(), fetchHistory(), fetchTransactions()]);
    } catch (submitError) {
      setError("儲存帳戶時發生錯誤。");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(accountId: string) {
    if (!window.confirm("確定要刪除此項目嗎？")) return;
    try {
      const response = await fetch(`/api/accounts/${accountId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("刪除失敗。");
      if (editingAccountId === accountId) resetForm();
      await Promise.allSettled([fetchAccounts(), fetchHistory(), fetchTransactions()]);
    } catch (deleteError) {
      console.error(deleteError);
    }
  }

  async function handleSyncPrices() {
    setSyncing(true);
    try {
      const response = await fetch("/api/test-fetch-prices");
      if (!response.ok) throw new Error("同步最新報價失敗。");
      await Promise.allSettled([fetchAccounts(), fetchHistory(), fetchTransactions()]);
    } catch (syncError) {
      console.error(syncError);
    } finally {
      setSyncing(false);
    }
  }

  function formatCurrency(value: number) {
    return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function formatPercent(value: number) {
    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
  }

  function buildChartSeries(historyPoints: HistoryPoint[], selectedTimeframe: typeof timeframe, currentNetWorth: number) {
    const sorted = [...historyPoints].filter((p) => Number.isFinite(Number(p.netWorth))).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (sorted.length === 0) return []; // 簡化回退處理

    const grouped = new Map<string, HistoryPoint>();
    for (const point of sorted) {
      const date = new Date(point.date);
      let key = "";
      if (selectedTimeframe === "month") key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      else if (selectedTimeframe === "quarter") key = `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
      else if (selectedTimeframe === "year") key = `${date.getFullYear()}`;
      else key = date.toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
      grouped.set(key, point);
    }

    return Array.from(grouped.entries()).slice(-14).map(([key, point]) => ({
      ...point,
      label: key.replace("-", " / "),
    }));
  }

  const accountGroups = [
    { title: "【流動資金】", categories: ["BANK_ACCOUNT", "CASH"], accent: "from-emerald-500 to-teal-500" },
    { title: "【投資組合】", categories: ["TAIWAN_STOCK", "US_STOCK", "CRYPTO"], accent: "from-sky-500 to-blue-500" },
    { title: "【固定資產】", categories: ["FIXED_ASSET"], accent: "from-amber-500 to-orange-500" },
    { title: "【應收款項】", categories: ["RECEIVABLE"], accent: "from-violet-500 to-fuchsia-500" },
    { title: "【負債與應付款】", categories: ["PAYABLE", "MORTGAGE", "CAR_LOAN", "CREDIT_LOAN"], accent: "from-rose-500 to-pink-500" },
  ];

  const chartData = useMemo(() => buildChartSeries(history, timeframe, summary.netWorth), [history, timeframe, summary.netWorth]);
  const trendDelta = useMemo(() => {
    if (chartData.length < 2) return 0;
    const firstValue = Number(chartData[0]?.netWorth ?? 0);
    const lastValue = Number(chartData[chartData.length - 1]?.netWorth ?? 0);
    return firstValue ? ((lastValue - firstValue) / firstValue) * 100 : 0;
  }, [chartData]);

  const renderedAccountGroups = accountGroups.map((group) => {
    const relevantAccounts = accounts.filter((account) => group.categories.includes(account.category));
    if (relevantAccounts.length === 0) return null;
    return { ...group, cards: relevantAccounts };
  }).filter(Boolean);

  // 主題樣式設定
  const themeClasses = currentTheme === "pixel" 
    ? "font-mono bg-zinc-200" 
    : "bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_35%),linear-gradient(135deg,_#f8fafc_0%,_#f1f5f9_100%)]";

  const cardClasses = currentTheme === "pixel"
    ? "border-2 border-slate-950 bg-zinc-50 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] rounded-none"
    : "border border-slate-200/80 bg-white/80 shadow-sm rounded-[1.5rem] backdrop-blur";

  const rowClasses = currentTheme === "pixel"
    ? "border-2 border-slate-900 bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] rounded-none"
    : "border border-slate-200 bg-slate-50/70 rounded-2xl hover:bg-white transition-colors shadow-sm";

  return (
    <main className={`min-h-screen px-4 py-6 text-slate-900 sm:px-6 lg:px-8 transition-colors duration-300 ${themeClasses}`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        
        {/* 極簡頂部與主題切換 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-emerald-600">
            NetWorthTracker
          </p>
          <div className={`flex items-center gap-1 p-1 ${currentTheme === "pixel" ? "border-2 border-slate-900 bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" : "rounded-full border border-slate-200 bg-white shadow-sm"}`}>
            <button onClick={() => setCurrentTheme("original")} className={`px-3 py-1 text-xs font-medium transition ${currentTheme === "original" ? "bg-slate-900 text-white rounded-full" : "text-slate-600 hover:bg-slate-100 rounded-full"}`}>✨ 現代原版</button>
            <button onClick={() => setCurrentTheme("pixel")} className={`px-3 py-1 text-xs font-medium transition ${currentTheme === "pixel" ? "bg-amber-400 text-slate-900 border-2 border-slate-900 font-bold" : "text-slate-600 hover:bg-slate-100 rounded-full"}`}>👾 像素 8-Bit</button>
            <div className="h-4 w-[1px] bg-slate-200 mx-1" />
            <button onClick={handleSaveThemeDefault} className={`px-3 py-1 text-xs font-medium text-emerald-700 transition ${currentTheme === "pixel" ? "bg-emerald-300 border-2 border-slate-900" : "bg-emerald-50 hover:bg-emerald-100 rounded-full"}`}>💾 設為預設</button>
          </div>
        </div>

        {/* 滿版主區塊：淨資產與圖表 */}
        <div className={`${cardClasses} p-6 xl:p-8 flex flex-col xl:flex-row gap-8`}>
          {/* 左側：淨資產與按鈕 */}
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-500">目前淨資產</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-4">
              <h1 className="text-5xl font-bold tracking-tight text-slate-950">
                NT$ {formatCurrency(summary.netWorth)}
              </h1>
              <div className="flex items-center gap-2">
                <button onClick={handleSyncPrices} disabled={syncing} className={`flex items-center justify-center p-2.5 transition active:scale-95 ${currentTheme === "pixel" ? "bg-white border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" : "bg-white hover:bg-slate-50 border border-slate-200/80 shadow-sm rounded-full text-slate-600"}`} title="同步最新報價">
                  <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                </button>
                <button onClick={() => { resetForm(); setShowForm(true); }} className={`flex items-center justify-center p-2.5 transition active:scale-95 ${currentTheme === "pixel" ? "bg-emerald-400 border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" : "bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 shadow-sm rounded-full text-emerald-600"}`} title="新增資產/負債">
                  <Plus className="h-4 w-4" />
                </button>
                <span className="ml-2 text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-md">💵 USD/TWD 即時</span>
              </div>
            </div>
            
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className={`p-5 ${rowClasses}`}>
                <p className="text-sm text-slate-500">總資產</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">NT$ {formatCurrency(summary.totalAssets)}</p>
              </div>
              <div className={`p-5 ${rowClasses}`}>
                <p className="text-sm text-slate-500">總負債</p>
                <p className="mt-1 text-2xl font-semibold text-rose-600">NT$ {formatCurrency(summary.totalLiabilities)}</p>
              </div>
            </div>
          </div>

          {/* 右側：趨勢圖表 */}
          <div className="flex-1 xl:max-w-xl">
             <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">資產趨勢</p>
                <div className={`flex p-1 ${currentTheme === "pixel" ? "border-2 border-slate-900 bg-white" : "rounded-full border border-slate-200 bg-white shadow-sm"}`}>
                  {(["day", "month", "quarter", "year"] as const).map((item) => (
                    <button key={item} onClick={() => setTimeframe(item)} className={`px-3 py-1 text-xs font-medium transition ${timeframe === item ? (currentTheme==="pixel"?"bg-slate-900 text-white":"bg-emerald-600 text-white rounded-full") : "text-slate-500 hover:bg-slate-100 rounded-full"}`}>
                      {item === "day" ? "日" : item === "month" ? "月" : item === "quarter" ? "季" : "年"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-[250px] w-full">
                {mounted && (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                      <Tooltip formatter={(value) => [`NT$ ${formatCurrency(Number(value ?? 0))}`, "淨資產"]} />
                      <Area type={currentTheme === "pixel" ? "step" : "monotone"} dataKey="netWorth" stroke={currentTheme === "pixel" ? "#000000" : "#10b981"} strokeWidth={currentTheme === "pixel" ? 3 : 2.5} fill={currentTheme === "pixel" ? "#a7f3d0" : "url(#netWorthGradient)"} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
          </div>
        </div>

        {/* 資產群組卡片列表 */}
        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 mt-4">
          {renderedAccountGroups.map((group: any) => (
            <div key={group.title} className={`${cardClasses} p-5 flex flex-col`}>
              <div className="mb-4">
                <div className={`h-1.5 w-12 bg-gradient-to-r ${group.accent} ${currentTheme==="pixel"?"border border-black": "rounded-full"}`} />
                <h3 className="mt-3 text-lg font-bold text-slate-900">{group.title}</h3>
              </div>
              <div className="space-y-3 flex-1">
                {group.cards.map((card: Account) => (
                  <div key={card.id} className={`group relative p-3 flex items-center justify-between gap-3 ${rowClasses}`}>
                    <div className="min-w-0 flex-1">
                      {/* 強制橫向不斷行標籤 */}
                      <div className="flex flex-row items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-slate-900 truncate">{card.name}</p>
                        <span className={`px-1.5 py-0.5 text-[10px] whitespace-nowrap shrink-0 ${currentTheme==="pixel"?"bg-slate-200 border border-slate-900":"bg-slate-200/60 text-slate-600 rounded-md"}`}>
                          {categoryLabelMap[card.category] || card.category}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                         {symbolRequiredCategories.includes(card.category) ? `持有 ${formatCurrency(card.quantity || 0)} 股` : `餘額 ${formatCurrency(card.quantity || card.currentValue || 0)}`}
                      </p>
                    </div>
                    <div className="flex flex-col items-end">
                      <p className="text-sm font-bold text-slate-900 text-right">NT$ {formatCurrency(card.currentValue || 0)}</p>
                      {/* Hover 浮現控制鈕 */}
                      <div className="mt-1 flex items-center gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => startEdit(card)} className="p-1.5 text-slate-400 hover:text-emerald-600 transition bg-white rounded-md shadow-sm border border-slate-100"><Pencil className="h-3 w-3" /></button>
                        <button onClick={() => handleDelete(card.id)} className="p-1.5 text-slate-400 hover:text-rose-600 transition bg-white rounded-md shadow-sm border border-slate-100"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* 毛玻璃表單彈窗 (Modal) */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm transition-all duration-300">
            <div className={`w-full max-w-lg max-h-[90vh] overflow-y-auto ${cardClasses}`}>
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 p-4 backdrop-blur">
                <h2 className="text-lg font-bold">{editingAccountId ? "編輯項目" : "新增項目"}</h2>
                <button onClick={() => setShowForm(false)} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 transition"><X className="h-5 w-5" /></button>
              </div>
              <div className="p-5 bg-white">
                <Form onSubmit={handleSubmit}>
                    <FormItem>
                      <FormLabel htmlFor="name">名稱</FormLabel>
                      <FormControl>
                        <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="例如：台積電、薪轉帳戶" className={currentTheme==="pixel"?"rounded-none border-2 border-slate-900":""} />
                      </FormControl>
                    </FormItem>

                    <div className="mt-4 grid gap-4 grid-cols-2">
                      <FormItem>
                        <FormLabel htmlFor="type">類型</FormLabel>
                        <FormControl>
                          <select id="type" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className={`flex h-10 w-full px-3 py-2 text-sm outline-none ${currentTheme==="pixel"?"border-2 border-slate-900 bg-white":"rounded-lg border border-slate-300 bg-white"}`}>
                            {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </FormControl>
                      </FormItem>
                      <FormItem>
                        <FormLabel htmlFor="category">類別</FormLabel>
                        <FormControl>
                          <select id="category" value={formData.category} onChange={(e) => {
                               const nextCategory = e.target.value;
                               setFormData({ ...formData, category: nextCategory, isApiConnected: nextCategory === "CRYPTO" ? formData.isApiConnected : false });
                            }} className={`flex h-10 w-full px-3 py-2 text-sm outline-none ${currentTheme==="pixel"?"border-2 border-slate-900 bg-white":"rounded-lg border border-slate-300 bg-white"}`}>
                            {categoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </FormControl>
                      </FormItem>
                    </div>

                    <div className="mt-4 grid gap-4 grid-cols-2">
                      <FormItem>
                        <FormLabel htmlFor="currency">幣別</FormLabel>
                        <FormControl>
                          <select id="currency" value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })} className={`flex h-10 w-full px-3 py-2 text-sm outline-none ${currentTheme==="pixel"?"border-2 border-slate-900 bg-white":"rounded-lg border border-slate-300 bg-white"}`}>
                            {currencyOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </FormControl>
                      </FormItem>
                      {!showApiFields && (
                        <FormItem>
                          <FormLabel htmlFor="quantity">{usesAmountInput ? "總金額" : "持有股數"}</FormLabel>
                          <FormControl>
                            <Input id="quantity" type="number" step="any" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} className={currentTheme==="pixel"?"rounded-none border-2 border-slate-900":""}/>
                          </FormControl>
                        </FormItem>
                      )}
                    </div>

                    {requiresSymbol && (
                      <FormItem className="mt-4">
                        <FormLabel htmlFor="symbol">代號 (Symbol)</FormLabel>
                        <FormControl>
                          <Input id="symbol" value={formData.symbol} onChange={(e) => setFormData({ ...formData, symbol: e.target.value })} placeholder="例如：2330.TW" className={currentTheme==="pixel"?"rounded-none border-2 border-slate-900":""} />
                        </FormControl>
                      </FormItem>
                    )}

                    {showDeductionFields && (
                      <div className="mt-4 grid gap-4 grid-cols-2">
                        <FormItem>
                          <FormLabel htmlFor="monthlyDeductionAmount">每月扣款金額</FormLabel>
                          <FormControl><Input id="monthlyDeductionAmount" type="number" value={formData.monthlyDeductionAmount} onChange={(e) => setFormData({ ...formData, monthlyDeductionAmount: e.target.value })} className={currentTheme==="pixel"?"rounded-none border-2 border-slate-900":""} /></FormControl>
                        </FormItem>
                        <FormItem>
                          <FormLabel htmlFor="deductionDate">每月扣款日 (1-31)</FormLabel>
                          <FormControl><Input id="deductionDate" type="number" value={formData.deductionDate} onChange={(e) => setFormData({ ...formData, deductionDate: e.target.value })} className={currentTheme==="pixel"?"rounded-none border-2 border-slate-900":""} /></FormControl>
                        </FormItem>
                      </div>
                    )}

                    {error && <p className="mt-4 text-sm text-rose-600 font-bold">⚠️ {error}</p>}
                    {message && <p className="mt-4 text-sm text-emerald-600 font-bold">✅ {message}</p>}

                    <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100">
                      <Button type="button" variant="outline" onClick={() => setShowForm(false)} className={currentTheme==="pixel"?"rounded-none border-2 border-slate-900":""}>取消</Button>
                      <Button type="submit" disabled={loading} className={currentTheme==="pixel"?"rounded-none border-2 border-slate-900 bg-emerald-400 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-emerald-500 hover:translate-y-px hover:shadow-none":""}>
                        {loading ? "處理中..." : "確認儲存"}
                      </Button>
                    </div>
                </Form>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}