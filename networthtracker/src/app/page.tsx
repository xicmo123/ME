"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Pencil, RefreshCw, Trash2, Plus, X, Sun, Moon, LogOut, Wallet, Eye, EyeOff, LayoutDashboard, CalendarDays, TrendingUp, Settings, ChevronRight, AlertTriangle, Download, Fingerprint, Bell, Search } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, Line, LineChart, Pie, PieChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TW_BANKS } from "@/lib/tw-banks";
import { initNativeShell, setStatusBarTheme, hapticImpact, isNative, biometricVerify, syncEventReminders, scheduleDailyReminder } from "@/lib/native";

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
const fixedCurrencyCategories = ["TAIWAN_STOCK", "US_STOCK", "CRYPTO"];
const amountInputCategories = ["CASH", "BANK_ACCOUNT", "FIXED_ASSET", "RECEIVABLE", "PAYABLE", "MORTGAGE", "CAR_LOAN", "CREDIT_LOAN"];
// 類別依「資產/負債」分組：類型切換時用來重設類別、類別下拉選單也依此過濾，避免選出「資產」+「應付款」這種兜不起來的組合
const categoriesByType: Record<string, string[]> = {
  ASSET: ["CASH", "BANK_ACCOUNT", "TAIWAN_STOCK", "US_STOCK", "CRYPTO", "FIXED_ASSET", "RECEIVABLE"],
  LIABILITY: ["PAYABLE", "MORTGAGE", "CAR_LOAN", "CREDIT_LOAN"],
};
const defaultForm = { name: "", type: "ASSET", category: "CASH", symbol: "", quantity: "0", currency: "TWD", isApiConnected: false, apiSource: "BITFINEX", apiKey: "", apiSecret: "", apiPassphrase: "", monthlyDeductionAmount: "", deductionDate: "", interestRate: "", loanTermMonths: "", loanStartDate: "" };
const exchangesRequiringPassphrase = ["OKX"];

type Tab = "overview" | "assets" | "trends" | "settings";

// 基準指數：實際行情由 /api/benchmark 透過 Yahoo Finance 抓取。
// 顏色刻意跟「你的淨值」的金色（gold，見下方）以及彼此的色相都拉開差距，全部疊在一起時仍容易區分。
const BENCHMARKS: Record<string, { label: string; color: string }> = {
  tw0050: { label: "0050", color: "#2CA02C" }, // 綠
  sp500: { label: "S&P 500", color: "#1F77B4" }, // 藍
  nasdaq: { label: "那斯達克", color: "#9467BD" }, // 紫
  taiex: { label: "加權指數", color: "#D62728" }, // 紅
  btc: { label: "比特幣", color: "#17BECF" }, // 青
};

// 淨資產主卡配色方案
const HERO_THEMES = {
  cream: {
    background: "linear-gradient(135deg, #F0DFB0 0%, #DFC583 50%, #C9A659 100%)",
    text: "#3B2E12",
    shadow: "0 18px 38px -16px rgba(201,166,89,0.5)",
    ring: "inset 0 1px 0 rgba(255,255,255,0.45), inset 0 0 0 1px rgba(59,46,18,0.1)",
    chipBtnBg: "#3B2E120F",
    chipBtnBgHover: "#3B2E1220",
    plusBg: "#3B2E12",
    plusText: "#F0DFB0",
    assetBorder: "#244A30",
    liabilityBorder: "#6E2A20",
    toggleActiveBg: "#3B2E12",
    toggleActiveText: "#F0DFB0",
    toggleIdleBorder: "#3B2E124D",
    toggleIdleBg: "#3B2E120F",
    toggleIdleText: "#3B2E12",
  },
  noir: {
    background: "linear-gradient(135deg, #262010 0%, #1C1F1A 55%, #14150F 100%)",
    text: "#E8C874",
    shadow: "0 18px 38px -16px rgba(0,0,0,0.6)",
    ring: "inset 0 1px 0 rgba(232,200,116,0.25), inset 0 0 0 1px rgba(232,200,116,0.25)",
    chipBtnBg: "#E8C8741A",
    chipBtnBgHover: "#E8C87433",
    plusBg: "#E8C874",
    plusText: "#1C1F1A",
    assetBorder: "#4F7B5E",
    liabilityBorder: "#A24936",
    toggleActiveBg: "#E8C874",
    toggleActiveText: "#1C1F1A",
    toggleIdleBorder: "#E8C8744D",
    toggleIdleBg: "#E8C8741A",
    toggleIdleText: "#E8C874",
  },
} as const;

const FontStyles = () => (
  <style jsx global>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=Noto+Serif+TC:wght@500;600&display=swap');
    .font-display { font-family: 'Fraunces', 'Noto Serif TC', serif; font-feature-settings: "ss01" 1; }
    .font-mono-ledger { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
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

const AppleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 384 512" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
  </svg>
);

const Switch = ({ on }: { on: boolean }) => (
  <span className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${on ? "bg-[#4F7B5E]" : "bg-black/15 dark:bg-white/20"}`}>
    <span className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow transform transition-transform ${on ? "translate-x-[19px]" : "translate-x-[3px]"}`} />
  </span>
);

// 電子雞風格：蛋 -> 裂痕 -> 破殼小雞，依 progress (0~100) 呈現不同階段
const EggChick = ({ progress, size = 44 }: { progress: number; size?: number }) => {
  const p = Math.max(0, Math.min(100, progress || 0));
  const stage = p >= 100 ? 4 : p >= 75 ? 3 : p >= 50 ? 2 : p >= 25 ? 1 : 0;
  const eggFill = p >= 100 ? "#FFE9B8" : `hsl(${38 + p * 0.1}, 70%, ${92 - p * 0.12}%)`;
  const cracks = [
    "M50 18 L45 30 L54 38 L47 50",
    "M30 30 L38 40 L32 50 L40 62",
    "M62 28 L58 42 L66 50 L60 64",
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="shrink-0" style={{ filter: "drop-shadow(0 2px 1px rgba(0,0,0,0.12))" }}>
      {stage < 4 ? (
        <g>
          <path
            d={`M50 8 C ${72 + stage} 8 88 34 88 58 C 88 82 70 94 50 94 C 30 94 12 82 12 58 C 12 34 ${28 - stage} 8 50 8 Z`}
            fill={eggFill}
            stroke="#5B4B49"
            strokeWidth="3"
          />
          <ellipse cx="36" cy="32" rx="8" ry="12" fill="#FFFFFF" opacity="0.55" />
          {cracks.slice(0, stage).map((d, i) => (
            <path key={i} d={d} fill="none" stroke="#5B4B49" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {stage >= 3 && (
            <>
              <path d="M42 14 Q50 6 58 14 Q54 20 50 18 Q46 20 42 14 Z" fill="#FFF3D6" stroke="#5B4B49" strokeWidth="2" />
              <path d="M47 14 L50 10 L53 14 Z" fill="#F4A94F" />
            </>
          )}
        </g>
      ) : (
        <g>
          <path d="M14 66 Q10 84 32 88 Q26 74 34 62 Z" fill="#FFF3D6" stroke="#5B4B49" strokeWidth="2.5" />
          <path d="M86 66 Q90 84 68 88 Q74 74 66 62 Z" fill="#FFF3D6" stroke="#5B4B49" strokeWidth="2.5" />
          <circle cx="50" cy="52" r="30" fill="#FFE066" stroke="#5B4B49" strokeWidth="3" />
          <path d="M24 52 Q14 56 20 68 Q30 66 30 56 Z" fill="#FFD23F" stroke="#5B4B49" strokeWidth="2" />
          <path d="M76 52 Q86 56 80 68 Q70 66 70 56 Z" fill="#FFD23F" stroke="#5B4B49" strokeWidth="2" />
          <path d="M46 24 Q48 14 52 24" fill="none" stroke="#5B4B49" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M38 48 Q42 44 46 48" fill="none" stroke="#5B4B49" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M54 48 Q58 44 62 48" fill="none" stroke="#5B4B49" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="34" cy="56" r="4" fill="#FF9FB0" opacity="0.7" />
          <circle cx="66" cy="56" r="4" fill="#FF9FB0" opacity="0.7" />
          <path d="M44 58 L50 64 L56 58 Z" fill="#F4A94F" stroke="#5B4B49" strokeWidth="1.5" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
};

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
  const [editingHasApiCredentials, setEditingHasApiCredentials] = useState(false);
  const [symbolSuggestions, setSymbolSuggestions] = useState<{ symbol: string; name: string }[]>([]);
  const [showSymbolSuggestions, setShowSymbolSuggestions] = useState(false);
  const [showBankSuggestions, setShowBankSuggestions] = useState(false);
  const [timeframe, setTimeframe] = useState<"day" | "month" | "year" | "custom">("day");
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null);
  const [showCustomRangePicker, setShowCustomRangePicker] = useState(false);
  const [customRangeDraft, setCustomRangeDraft] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [trendView, setTrendView] = useState<"net" | "breakdown">("net");
  const [activeBenchmarks, setActiveBenchmarks] = useState<string[]>([]);
  const [benchmarkData, setBenchmarkData] = useState<Record<string, { date: string; level: number }[]>>({});
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [showHistoryForm, setShowHistoryForm] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [historyFormData, setHistoryFormData] = useState({ date: "", netWorth: "" });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [goals, setGoals] = useState<any[]>([]);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<any | null>(null);
  const [goalForm, setGoalForm] = useState({ name: "", targetAmount: "", type: "NET_WORTH", accountId: "", emoji: "" });
  const [hideBalance, setHideBalance] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState<"TWD" | "USD">("TWD");
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioLocked, setBioLocked] = useState(false);
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyPrefs, setNotifyPrefs] = useState<Record<string, boolean>>({ EARNINGS: true, EX_DIVIDEND: true, DIVIDEND_PAY: true });
  const [notifyExpanded, setNotifyExpanded] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [stockEvents, setStockEvents] = useState<{ symbol: string; name: string; date: string; type: "EARNINGS" | "EX_DIVIDEND" | "DIVIDEND_PAY" }[]>([]);
  const [stockEventsLoading, setStockEventsLoading] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [dailyReminderEnabled, setDailyReminderEnabled] = useState(false);
  const [dailyReminderTime, setDailyReminderTime] = useState("21:00");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; message: string; kind: "success" | "error" }[]>([]);
  const [itemDeleteTarget, setItemDeleteTarget] = useState<{ kind: "account" | "goal"; id: string; name: string } | null>(null);
  const [itemDeleting, setItemDeleting] = useState(false);
  const [accountShelfProgress, setAccountShelfProgress] = useState<Record<string, number>>({});
  const [collapsedAccountGroups, setCollapsedAccountGroups] = useState<Record<string, boolean>>({});
  const [accountSearch, setAccountSearch] = useState("");

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ email: string; hasGoogle: boolean; hasApple: boolean; hasPassword: boolean } | null>(null);
  const [googleUnlinking, setGoogleUnlinking] = useState(false);
  const [appleUnlinking, setAppleUnlinking] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const isCryptoApiMode = formData.category === "CRYPTO" && formData.isApiConnected;
  const requiresSymbol = symbolRequiredCategories.includes(formData.category) && !isCryptoApiMode;
  const usesAmountInput = amountInputCategories.includes(formData.category);
  const amountFieldLabel = usesAmountInput ? (formData.type === "LIABILITY" ? "貸款總金額" : "總金額") : "持有股數";
  const showApiFields = formData.category === "CRYPTO" && formData.isApiConnected;
  const stockSearchMarket = formData.category === "TAIWAN_STOCK" ? "TW" : formData.category === "US_STOCK" ? "US" : formData.category === "CRYPTO" && !isCryptoApiMode ? "CRYPTO" : null;

  useEffect(() => {
    if (!stockSearchMarket || !formData.symbol.trim()) { setSymbolSuggestions([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/stock-search?q=${encodeURIComponent(formData.symbol.trim())}&market=${stockSearchMarket}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => setSymbolSuggestions(data.results ?? []))
        .catch(() => { });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [formData.symbol, stockSearchMarket]);

  const heldStockSymbols = useMemo(() => {
    const symbols = accounts
      .filter((a) => a.isActive !== false && (a.category === "TAIWAN_STOCK" || a.category === "US_STOCK") && a.symbol)
      .map((a) => (a.category === "TAIWAN_STOCK" ? `${String(a.symbol).replace(/\.TW$/i, "")}.TW` : String(a.symbol)));
    return Array.from(new Set(symbols));
  }, [accounts]);

  useEffect(() => {
    if (activeTab !== "assets" || heldStockSymbols.length === 0) return;
    setStockEventsLoading(true);
    fetch(`/api/stock-events?symbols=${encodeURIComponent(heldStockSymbols.join(","))}`)
      .then((res) => res.json())
      .then((data) => setStockEvents(data.events ?? []))
      .catch(() => { })
      .finally(() => setStockEventsLoading(false));
  }, [activeTab, heldStockSymbols]);

  const summary = useMemo(() => {
    const totalAssets = accounts.filter(a => a.type === "ASSET").reduce((sum, a) => sum + Number(a.currentValue ?? 0), 0);
    const totalLiabilities = accounts.filter(a => a.type === "LIABILITY").reduce((sum, a) => sum + Number(a.currentValue ?? 0), 0);
    return { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities };
  }, [accounts]);

  // 資產配置：依分類分桶，用品牌色系
  const allocation = useMemo(() => {
    const buckets = [
      { name: "流動資金", cats: ["CASH", "BANK_ACCOUNT"], color: "#B8933C" },
      { name: "台股", cats: ["TAIWAN_STOCK"], color: "#4F7B5E" },
      { name: "美股", cats: ["US_STOCK"], color: "#5A7DA0" },
      { name: "加密貨幣", cats: ["CRYPTO"], color: "#A24936" },
      { name: "其他", cats: ["FIXED_ASSET", "RECEIVABLE"], color: "#8A8F82" },
    ];
    const rows = buckets
      .map((b) => ({ name: b.name, color: b.color, value: accounts.filter((a: any) => a.type === "ASSET" && b.cats.includes(a.category)).reduce((s: number, a: any) => s + Number(a.currentValue ?? 0), 0) }))
      .filter((r) => r.value > 0);
    const total = rows.reduce((s, r) => s + r.value, 0);
    return { rows, total };
  }, [accounts]);

  // 上月回顧：上月最後一筆快照 vs 前月最後一筆快照
  const monthlyReport = useMemo(() => {
    if (history.length < 2) return null;
    const sorted = [...history].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const reversed = [...sorted].reverse();
    const endOfPrev = reversed.find((p: any) => { const d = new Date(p.date); return d < startOfThisMonth && d >= startOfPrevMonth; });
    const endOfBefore = reversed.find((p: any) => new Date(p.date) < startOfPrevMonth);
    if (!endOfPrev || !endOfBefore || !Number(endOfBefore.netWorth)) return null;
    const delta = Number(endOfPrev.netWorth) - Number(endOfBefore.netWorth);
    const pct = (delta / Math.abs(Number(endOfBefore.netWorth))) * 100;
    return { month: startOfPrevMonth.getMonth() + 1, delta, pct };
  }, [history]);

  // 近半年平均月增額（給目標達成預測用）
  const monthlyGrowth = useMemo(() => {
    if (history.length < 2) return null;
    const sorted = [...history].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const cutoff = Date.now() - 180 * 86400000;
    const recent = sorted.filter((p: any) => new Date(p.date).getTime() >= cutoff);
    const series = recent.length >= 2 ? recent : sorted;
    const first = series[0], last = series[series.length - 1];
    const days = (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86400000;
    if (days < 14) return null; // 資料太短，預測沒意義
    return ((Number(last.netWorth) - Number(first.netWorth)) / days) * 30.4;
  }, [history]);

  // 每月增減：取每個月最後一筆快照，跟前月比（最多 12 個月，含當月進行中）
  const monthlyDeltas = useMemo(() => {
    if (history.length < 2) return [];
    const sorted = [...history].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const lastPerMonth = new Map<string, number>();
    for (const p of sorted) {
      const d = new Date(p.date);
      lastPerMonth.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, Number(p.netWorth));
    }
    const keys = [...lastPerMonth.keys()].sort();
    const deltas: { key: string; label: string; delta: number }[] = [];
    for (let i = 1; i < keys.length; i++) {
      const [, m] = keys[i].split("-");
      deltas.push({ key: keys[i], label: `${Number(m)}月`, delta: lastPerMonth.get(keys[i])! - lastPerMonth.get(keys[i - 1])! });
    }
    return deltas.slice(-12);
  }, [history]);

  // 連續正成長月數（從最近的月份往回數）
  const growthStreak = useMemo(() => {
    let n = 0;
    for (let i = monthlyDeltas.length - 1; i >= 0 && monthlyDeltas[i].delta > 0; i--) n++;
    return n;
  }, [monthlyDeltas]);

  const goalEta = (goal: any): string | null => {
    if (!monthlyGrowth || monthlyGrowth <= 0 || goal.progress >= 100) return null;
    const remain = Number(goal.targetAmount) - Number(goal.currentAmount);
    const months = remain / monthlyGrowth;
    if (!isFinite(months) || months <= 0 || months > 240) return null;
    const d = new Date();
    d.setMonth(d.getMonth() + Math.ceil(months));
    return `${d.getFullYear()}/${d.getMonth() + 1}`;
  };

  const allCalendarEvents = useMemo(() => {
    return stockEvents.map((ev) => ({ ...ev, id: undefined, note: undefined }));
  }, [stockEvents]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, typeof allCalendarEvents> = {};
    for (const ev of allCalendarEvents) {
      const key = ev.date.slice(0, 10);
      (map[key] ??= []).push(ev);
    }
    return map;
  }, [allCalendarEvents]);

  const calendarWeeks = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))];
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }, [calendarMonth]);

  const eventTypeMeta: Record<string, { label: string; color: string }> = {
    EARNINGS: { label: "財報", color: "#5A7DA0" },
    EX_DIVIDEND: { label: "除息/權", color: "#B8933C" },
    DIVIDEND_PAY: { label: "配息入帳", color: "#4F7B5E" },
  };

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("networth-dark-mode");
    const dark = saved === "true";
    if (dark) { setIsDarkMode(true); document.documentElement.classList.add("dark"); }
    void initNativeShell(dark);

    if (localStorage.getItem("networth-display-currency") === "USD") setDisplayCurrency("USD");
    const savedNotify = localStorage.getItem("networth-event-notify") === "true";
    setNotifyEnabled(savedNotify);
    const savedPrefsRaw = localStorage.getItem("networth-event-notify-prefs");
    if (savedPrefsRaw) {
      try { setNotifyPrefs(JSON.parse(savedPrefsRaw)); } catch {}
    } else {
      // 舊版只有單一總開關，沿用其狀態初始化各類別偏好
      setNotifyPrefs({ EARNINGS: savedNotify, EX_DIVIDEND: savedNotify, DIVIDEND_PAY: savedNotify });
    }
    const savedBio = localStorage.getItem("networth-bio-lock") === "true";
    setBioEnabled(savedBio);
    setDailyReminderEnabled(localStorage.getItem("networth-daily-reminder-enabled") === "true");
    const savedReminderTime = localStorage.getItem("networth-daily-reminder-time");
    if (savedReminderTime) setDailyReminderTime(savedReminderTime);

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
        // 只有在確認已登入後才觸發 bio lock，避免 session 過期時擋住登入畫面
        if (savedBio && isNative()) {
          setBioLocked(true);
          void biometricVerify("解鎖 Zeno Worth").then((ok) => { if (ok) setBioLocked(false); });
        }
      }
    }).catch(() => { });
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      void (async () => {
        // 先套用本月到期的定期扣款，之後抓到的帳戶餘額才是最新的
        try {
          const res = await fetch("/api/recurring/apply", { method: "POST" });
          if (res.ok) {
            const data = await res.json().catch(() => null);
            if (data?.processed?.length) showToast(`已自動記錄 ${data.processed.length} 筆本月定期扣款`);
          }
        } catch { }
        await Promise.allSettled([fetchAccounts(), fetchTransactions(), fetchExchangeRate(), fetchGoals()]);
        // 每次進入 App 都記錄「今天」的淨資產快照，讓歷史逐日累積（否則走勢圖只有今天一個點）
        await fetch("/api/history/snapshot").catch(() => { });
        await fetchHistory();
      })();
    }
  }, [isAuthenticated]);

  const toggleDarkMode = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("networth-dark-mode", String(next));
    void setStatusBarTheme(next);
  };

  const toggleDisplayCurrency = () => {
    const next = displayCurrency === "TWD" ? "USD" : "TWD";
    setDisplayCurrency(next);
    localStorage.setItem("networth-display-currency", next);
  };

  // 主卡片金額依檢視幣別顯示；帳戶明細維持 NT$
  const fmtMoney = (twd: number) =>
    displayCurrency === "USD" && exchangeRate ? `US$ ${formatCurrency(Math.round(twd / exchangeRate))}` : `NT$ ${formatCurrency(twd)}`;

  const handleExportCsv = () => {
    const esc = (v: any) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines: string[] = [];
    lines.push("資產清單");
    lines.push(["名稱", "類型", "分類", "代號", "數量", "現值(TWD)", "幣別"].join(","));
    for (const a of accounts) lines.push([a.name, a.type === "ASSET" ? "資產" : "負債", a.category, a.symbol ?? "", a.quantity ?? "", a.currentValue, a.currency].map(esc).join(","));
    lines.push("");
    lines.push("淨資產歷史");
    lines.push(["日期", "總資產", "總負債", "淨資產"].join(","));
    for (const h of [...history].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())) {
      lines.push([String(h.date).slice(0, 10), h.totalAssets ?? "", h.totalLiabilities ?? "", h.netWorth].map(esc).join(","));
    }
    // BOM 讓 Excel 正確以 UTF-8 開啟中文
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zeno-worth-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("已匯出 CSV");
  };

  const handleToggleBioLock = async () => {
    if (!isNative()) { showToast("生物辨識需在 iOS App 中使用", "error"); return; }
    if (bioEnabled) {
      setBioEnabled(false);
      localStorage.setItem("networth-bio-lock", "false");
      showToast("已關閉 Face ID 解鎖");
      return;
    }
    // 開啟前先驗證一次，確認裝置支援且使用者本人操作
    const ok = await biometricVerify("開啟 Face ID 解鎖");
    if (ok) {
      setBioEnabled(true);
      localStorage.setItem("networth-bio-lock", "true");
      showToast("已開啟 Face ID 解鎖");
    } else {
      showToast("驗證未通過，未開啟", "error");
    }
  };

  const handleToggleNotify = async () => {
    if (!isNative()) { showToast("通知需在 iOS App 中使用", "error"); return; }
    const next = !notifyEnabled;
    const nextPrefs = { EARNINGS: next, EX_DIVIDEND: next, DIVIDEND_PAY: next };
    setNotifyEnabled(next);
    setNotifyPrefs(nextPrefs);
    localStorage.setItem("networth-event-notify", String(next));
    localStorage.setItem("networth-event-notify-prefs", JSON.stringify(nextPrefs));
    showToast(next ? "已開啟事件提醒" : "已關閉事件提醒");
  };

  const handleToggleNotifyType = (key: string) => {
    if (!isNative()) { showToast("通知需在 iOS App 中使用", "error"); return; }
    setNotifyPrefs((prev) => {
      const nextPrefs = { ...prev, [key]: !prev[key] };
      const anyOn = Object.values(nextPrefs).some(Boolean);
      setNotifyEnabled(anyOn);
      localStorage.setItem("networth-event-notify", String(anyOn));
      localStorage.setItem("networth-event-notify-prefs", JSON.stringify(nextPrefs));
      return nextPrefs;
    });
  };

  // 股票行事曆事件變動時，同步未來 30 天的本地提醒
  useEffect(() => {
    if (!mounted) return;
    const upcoming: { id: number; title: string; at: Date }[] = [];
    const now = new Date();
    const horizon = new Date(now.getTime() + 30 * 86400000);

    const push = (dateStr: string, title: string) => {
      const eventDay = new Date(dateStr.slice(0, 10) + "T00:00:00");
      if (isNaN(eventDay.getTime()) || eventDay <= now || eventDay > horizon) return;
      // 前一天 20:00 提醒
      const at = new Date(eventDay.getTime() - 4 * 3600000);
      if (at <= now) return;
      let hash = 0;
      const key = `${dateStr}|${title}`;
      for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
      upcoming.push({ id: Math.abs(hash) || 1, title, at });
    };

    for (const ev of stockEvents) { if (notifyPrefs[ev.type]) push(ev.date, `明天：${ev.name || ev.symbol} ${eventTypeMeta[ev.type]?.label ?? ""}`); }
    void syncEventReminders(upcoming, notifyEnabled);
  }, [mounted, notifyEnabled, notifyPrefs, stockEvents]);

  // 每日記帳提醒：設定變動時重新排程（固定時間、每天重複，跟行事曆事件無關）
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("networth-daily-reminder-enabled", String(dailyReminderEnabled));
    localStorage.setItem("networth-daily-reminder-time", dailyReminderTime);
    const [hour, minute] = dailyReminderTime.split(":").map(Number);
    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      void scheduleDailyReminder(hour, minute, dailyReminderEnabled);
    }
  }, [mounted, dailyReminderEnabled, dailyReminderTime]);

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
    } catch (e) { } finally { setGoogleUnlinking(false); }
  }

  async function handleAppleUnlink() {
    setAppleUnlinking(true);
    try {
      const res = await fetch("/api/auth/apple", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setCurrentUser((u) => (u ? { ...u, hasApple: false } : u));
      else alert(data.message || "取消綁定失敗");
    } catch (e) { } finally { setAppleUnlinking(false); }
  }

  function showToast(message: string, kind: "success" | "error" = "success") {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((toast) => toast.id !== id)), 2800);
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

  async function fetchAccounts() { try { const res = await fetch("/api/accounts"); if (res.ok) setAccounts(await res.json()); } catch (e) { } }
  async function fetchHistory() { try { const res = await fetch("/api/history"); if (res.ok) setHistory(await res.json()); } catch (e) { } }
  async function fetchTransactions() { try { const res = await fetch("/api/transactions"); if (res.ok) setTransactions(await res.json()); } catch (e) { } }
  async function fetchExchangeRate() { try { const res = await fetch("/api/exchange-rate", { cache: "no-store" }); if (res.ok) { const d = await res.json(); if (d?.rate) setExchangeRate(d.rate); } } catch (e) { } }

  async function fetchGoals() { try { const res = await fetch("/api/goals"); if (res.ok) setGoals(await res.json()); } catch (e) { } }

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
      showToast(editingGoal ? "目標已更新" : "目標已新增");
    } else {
      showToast("儲存目標失敗，請再試一次", "error");
    }
  }

  async function handleDeleteGoal(id: string, name: string) {
    setItemDeleteTarget({ kind: "goal", id, name });
  }

  function resetForm() { setFormData(defaultForm); setEditingAccountId(null); setEditingHasApiCredentials(false); setShowForm(false); }

  function startEdit(account: any) {
    setFormData({ name: account.name, type: account.type, category: account.category, symbol: account.symbol ?? "", quantity: String(account.quantity ?? account.currentValue ?? 0), currency: account.currency, isApiConnected: Boolean(account.isApiConnected), apiSource: account.apiSource ?? "BITFINEX", apiKey: "", apiSecret: "", apiPassphrase: "", monthlyDeductionAmount: account.monthlyDeductionAmount ? String(account.monthlyDeductionAmount) : "", deductionDate: account.deductionDate ? String(account.deductionDate) : "", interestRate: account.interestRate != null ? String(account.interestRate) : "", loanTermMonths: account.loanTermMonths != null ? String(account.loanTermMonths) : "", loanStartDate: account.loanStartDate ? String(account.loanStartDate).slice(0, 10) : "" });
    setEditingAccountId(account.id); setEditingHasApiCredentials(Boolean(account.hasApiCredentials)); setShowForm(true); setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(null);
    const missing: string[] = [];
    if (!formData.name.trim()) missing.push("名稱");
    if (!formData.type) missing.push("類型");
    if (!formData.category) missing.push("類別");
    if (requiresSymbol && !formData.symbol.trim()) missing.push("代號");
    if (!showApiFields && formData.quantity.trim() === "") missing.push(amountFieldLabel);
    if (isCryptoApiMode && !editingHasApiCredentials) {
      if (!formData.apiKey.trim()) missing.push("API Key");
      if (!formData.apiSecret.trim()) missing.push("API Secret");
      if (exchangesRequiringPassphrase.includes(formData.apiSource) && !formData.apiPassphrase.trim()) missing.push("Passphrase");
    }
    if (missing.length > 0) return setError(`請填寫以下欄位：${missing.join("、")}`);
    const payload = { ...formData, quantity: isCryptoApiMode ? 0 : Number(formData.quantity || 0), symbol: isCryptoApiMode ? formData.apiSource : formData.symbol || null, monthlyDeductionAmount: formData.monthlyDeductionAmount.trim() === "" ? null : Number(formData.monthlyDeductionAmount), deductionDate: formData.deductionDate.trim() === "" ? null : Number(formData.deductionDate), interestRate: formData.interestRate.trim() === "" ? null : Number(formData.interestRate), loanTermMonths: formData.loanTermMonths.trim() === "" ? null : Number(formData.loanTermMonths), loanStartDate: formData.loanStartDate.trim() === "" ? null : formData.loanStartDate };
    setLoading(true);
    try {
      const res = await fetch(editingAccountId ? `/api/accounts/${editingAccountId}` : "/api/accounts", { method: editingAccountId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("儲存失敗");
      setTimeout(() => resetForm(), 500);
      await Promise.allSettled([fetchAccounts(), fetchHistory(), fetchTransactions(), fetchGoals()]);
      showToast(editingAccountId ? "資產已更新" : "資產已新增");
    } catch { setError("儲存發生錯誤。"); showToast("儲存失敗", "error"); } finally { setLoading(false); }
  }

  async function handleDelete(accountId: string, name: string) {
    setItemDeleteTarget({ kind: "account", id: accountId, name });
  }

  async function confirmItemDelete() {
    if (!itemDeleteTarget) return;
    setItemDeleting(true);
    try {
      if (itemDeleteTarget.kind === "account") {
        await fetch(`/api/accounts/${itemDeleteTarget.id}`, { method: "DELETE" });
        await Promise.allSettled([fetchAccounts(), fetchHistory(), fetchTransactions(), fetchGoals()]);
      } else {
        await fetch(`/api/goals?id=${itemDeleteTarget.id}`, { method: "DELETE" });
        await fetchGoals();
      }
      showToast(`已刪除「${itemDeleteTarget.name}」`);
      setItemDeleteTarget(null);
    } catch (e) {
      showToast("刪除失敗，請再試一次", "error");
    } finally { setItemDeleting(false); }
  }

  async function handleSyncPrices() {
    setSyncing(true);
    try {
      const res = await fetch("/api/test-fetch-prices");
      if (!res.ok) {
        showToast(res.status === 429 ? "更新失敗，API 已達使用額度上限，請稍後再試" : "更新失敗，價格來源暫時無法使用", "error");
        return;
      }
      const data = await res.json().catch(() => null);
      if (data?.throttled) {
        showToast("剛更新過，請稍後再試");
        return;
      }
      await fetch("/api/history/snapshot").catch(() => { }); // 更新後把最新淨值寫入今天的快照
      await Promise.allSettled([fetchAccounts(), fetchHistory(), fetchExchangeRate(), fetchGoals()]);
      showToast("已更新最新價格");
    } catch (e) {
      showToast(navigator.onLine === false ? "更新失敗，請確認網路連線" : "更新失敗，請稍後再試", "error");
    } finally { setSyncing(false); }
  }

  async function fetchBenchmarks() {
    setBenchmarkLoading(true);
    try {
      const res = await fetch("/api/benchmark?days=365", { cache: "no-store" });
      if (res.ok) setBenchmarkData(await res.json());
    } catch (e) { } finally { setBenchmarkLoading(false); }
  }

  async function handleHistorySubmit(e: FormEvent) {
    e.preventDefault();
    if (!historyFormData.date || historyFormData.netWorth === "") return;
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(historyFormData) });
      if (res.ok) { setShowHistoryForm(false); await fetchHistory(); }
    } catch (e) { } finally { setHistoryLoading(false); }
  }

  function formatCurrency(value: number) { return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function formatCompactNumber(value: number) { return Intl.NumberFormat("zh-TW", { notation: "compact", maximumFractionDigits: 1 }).format(value); }
  function buildChartSeries(historyPoints: any[], selectedTimeframe: string, currentNetWorth: number, customRange?: { start: string; end: string } | null) {
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

    const days: string[] = [];
    if (selectedTimeframe === "custom" && customRange?.start && customRange?.end) {
      // 自訂區間：從起日到迄日，每天一個台北日期字串
      const cursor = new Date(customRange.start + "T00:00:00");
      const end = new Date(customRange.end + "T00:00:00");
      while (cursor <= end) {
        days.push(getTWDateStr(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    } else {
      // 每個時間範圍都是「每日一個點」，含今天；產生從 (今天 - windowDays + 1) 到今天、每天一個台北日期字串
      const windowDays = selectedTimeframe === "day" ? 14 : selectedTimeframe === "month" ? 180 : 365;
      for (let i = windowDays - 1; i >= 0; i--) {
        const d = new Date(now.getTime());
        d.setDate(now.getDate() - i);
        days.push(getTWDateStr(d));
      }
    }

    // 第一筆真實資料出現前以 0 呈現，避免圖表出現斷點看起來像資料遺失；
    // 第一筆之後若有空缺則用前一天的值往後帶。X 軸仍涵蓋整個視窗。
    let started = false;
    let lastKnown = 0;

    // 區間夠短（兩週或短的自訂範圍）用「每兩天一個 M/D」標籤；夠長就改用「每月第一次出現顯示 N月」
    const useDailyLabel = days.length <= 20;
    const seenMonths = new Set<string>();
    const result: { label: string; date: string; netWorth: number; started: boolean }[] = [];
    for (let idx = 0; idx < days.length; idx++) {
      const dateStr = days[idx];
      if (historyMap.has(dateStr)) { lastKnown = historyMap.get(dateStr)!; started = true; }

      const [y, m, dd] = dateStr.split("-");
      let label = "";
      if (useDailyLabel) {
        if ((days.length - 1 - idx) % 2 === 0) label = `${Number(m)}/${Number(dd)}`;
      } else {
        const monthKey = `${y}-${m}`;
        if (!seenMonths.has(monthKey)) { seenMonths.add(monthKey); label = `${Number(m)}月`; }
      }

      result.push({ label, date: dateStr, netWorth: started ? lastKnown : 0, started });
    }

    return result;
  }

  const chartData = useMemo(() => buildChartSeries(history, timeframe, summary.netWorth, customRange), [history, timeframe, summary.netWorth, customRange]);

  // 自成立以來的年化報酬率（CAGR）：用歷史第一筆快照 vs 目前淨值，衡量「長期累積速度」而非單一區間漲跌
  const inceptionCagr = useMemo(() => {
    if (history.length === 0) return null;
    const sorted = [...history].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const first = sorted[0];
    const firstNetWorth = Number(first.netWorth);
    const firstDate = new Date(first.date).getTime();
    const days = (Date.now() - firstDate) / 86400000;
    if (!Number.isFinite(firstNetWorth) || firstNetWorth <= 0 || days < 30) return null;
    const years = days / 365;
    const cagr = (Math.pow(summary.netWorth / firstNetWorth, 1 / years) - 1) * 100;
    if (!Number.isFinite(cagr)) return null;
    return { cagr, years, since: first.date };
  }, [history, summary.netWorth]);

  // 目前選取區間的統計摘要
  const periodStats = useMemo(() => {
    const pts = chartData.filter((p: any) => p.started);
    if (pts.length < 2) return null;
    const first = pts[0], last = pts[pts.length - 1];
    let high = pts[0], low = pts[0];
    for (const p of pts) {
      if (p.netWorth > high.netWorth) high = p;
      if (p.netWorth < low.netWorth) low = p;
    }
    const delta = last.netWorth - first.netWorth;
    const pct = first.netWorth ? (delta / Math.abs(first.netWorth)) * 100 : null;
    const days = Math.max(1, (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86400000);
    return { delta, pct, high, low, dailyAvg: delta / days };
  }, [chartData]);

  // 資產 vs 負債分解：沿用 chartData 的時間軸，把歷史快照的總資產/總負債前向填充上去
  const assetLiabData = useMemo(() => {
    if (chartData.length === 0) return [];
    const sorted = [...history].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let idx = 0, lastA = 0, lastL = 0, started = false;
    return chartData.map((pt: any) => {
      const t = new Date(pt.date + "T23:59:59").getTime();
      while (idx < sorted.length && new Date(sorted[idx].date).getTime() <= t) {
        lastA = Number(sorted[idx].totalAssets ?? 0);
        lastL = Number(sorted[idx].totalLiabilities ?? 0);
        started = true;
        idx++;
      }
      return { date: pt.date, label: pt.label, assets: started ? lastA : 0, liabilities: started ? lastL : 0 };
    });
  }, [chartData, history]);


  // X 軸改用 date（保證每個點唯一）當 dataKey，避免大量重複的空字串 label 讓 recharts 的
  // hover/tooltip 索引對不準；稀疏標籤改由 tickFormatter 查表顯示。
  const labelByDate = useMemo(() => new Map(chartData.map((p) => [p.date, p.label])), [chartData]);
  const xAxisTickFormatter = (v: string) => labelByDate.get(v) ?? "";

  const todayDateStr = new Date().toISOString().slice(0, 10);
  const timeframeLabel = timeframe === "day" ? "預設兩週"
    : timeframe === "month" ? "六個月"
    : timeframe === "year" ? "一年"
    : customRange ? `${customRange.start.slice(5).replace("-", "/")} ～ ${customRange.end.slice(5).replace("-", "/")}` : "自訂";

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

  // 對比大盤的勝負摘要：取每條線最後一個有值的點
  const benchmarkVerdicts = useMemo(() => {
    if (comparisonData.length === 0) return [];
    let you: number | null = null;
    for (let i = comparisonData.length - 1; i >= 0; i--) {
      const v = (comparisonData[i] as any).you;
      if (typeof v === "number") { you = v; break; }
    }
    if (you === null) return [];
    return activeBenchmarks.flatMap((k) => {
      for (let i = comparisonData.length - 1; i >= 0; i--) {
        const v = (comparisonData[i] as any)[k];
        if (typeof v === "number") return [{ key: k, label: BENCHMARKS[k].label, you: you!, bench: v, win: you! >= v }];
      }
      return [];
    });
  }, [comparisonData, activeBenchmarks]);

  function formatPct(v: number) { return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`; }
  function toggleBenchmark(k: string) {
    setActiveBenchmarks((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  const accountGroups = [
    { title: "流動資金", color: "#B8933C", categories: ["BANK_ACCOUNT", "CASH", "FIXED_ASSET", "RECEIVABLE"], defaultCategory: "CASH", defaultType: "ASSET" },
    { title: "投資組合", color: "#5A7DA0", categories: ["TAIWAN_STOCK", "US_STOCK", "CRYPTO"], defaultCategory: "TAIWAN_STOCK", defaultType: "ASSET" },
    { title: "負債總額", color: "#A24936", categories: ["PAYABLE", "MORTGAGE", "CAR_LOAN", "CREDIT_LOAN"], defaultCategory: "PAYABLE", defaultType: "LIABILITY" },
  ];

  function handleAccountShelfScroll(title: string, el: HTMLDivElement) {
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const progress = max ? Math.min(1, Math.max(0, el.scrollLeft / max)) : 0;
    setAccountShelfProgress((prev) => (
      Math.abs((prev[title] ?? 0) - progress) < 0.01 ? prev : { ...prev, [title]: progress }
    ));
  }

  const investmentCostBasis = useMemo(() => {
    const basis: Record<string, { quantity: number; cost: number }> = {};
    const ordered = [...transactions].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    for (const tx of ordered) {
      if (!tx.account || !symbolRequiredCategories.includes(tx.account.category)) continue;
      const qty = Number(tx.quantity ?? 0);
      const price = Number(tx.price ?? 0);
      const key = `${tx.account.symbol}::${tx.account.name}`;
      if (!basis[key]) basis[key] = { quantity: 0, cost: 0 };
      if (tx.type === "BUY" && qty > 0 && price > 0) {
        basis[key].quantity += qty;
        basis[key].cost += qty * price;
      }
      if (tx.type === "SELL" && qty > 0 && basis[key].quantity > 0) {
        const avgCost = basis[key].cost / basis[key].quantity;
        const soldQty = Math.min(qty, basis[key].quantity);
        basis[key].quantity -= soldQty;
        basis[key].cost = Math.max(0, basis[key].cost - avgCost * soldQty);
      }
    }
    return basis;
  }, [transactions]);

  const renderedAccountGroups = useMemo(() => {
    return accountGroups.map(group => {
      // 負債總額只看 type，不受分類白名單限制：任何被標記為負債的帳戶都要算進來
      const relevant = group.title === "負債總額"
        ? accounts.filter(a => a.type === "LIABILITY")
        : accounts.filter(a => group.categories.includes(a.category) && a.type !== "LIABILITY");
      if (relevant.length === 0) return null;
      const cards = Object.values(relevant.reduce((res: any, acc: any) => {
        const key = symbolRequiredCategories.includes(acc.category) ? `${acc.symbol}::${acc.name}` : acc.name.toLowerCase();
        const title = symbolRequiredCategories.includes(acc.category) ? (acc.symbol || acc.name) : acc.name;
        const subtitle = symbolRequiredCategories.includes(acc.category) ? acc.name : acc.category === "BANK_ACCOUNT" ? acc.symbol : null;
        const basis = investmentCostBasis[key];
        const avgCost = basis?.quantity ? basis.cost / basis.quantity : null;
        const priceChangePct = avgCost && acc.currentPrice ? ((Number(acc.currentPrice) - avgCost) / avgCost) * 100 : null;
        if (!res[key]) res[key] = { id: key, title, subtitle, category: acc.category, quantity: 0, currentValue: 0, currentPrice: acc.currentPrice, currency: acc.currency, account: acc, avgCost, priceChangePct };
        res[key].quantity += Number(acc.quantity ?? 0);
        res[key].currentValue += Number(acc.currentValue ?? 0);
        return res;
      }, {}));
      return { ...group, cards };
    }).filter(Boolean);
  }, [accounts, investmentCostBasis]);

  const displayedAccountGroups = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    if (!q) return renderedAccountGroups;
    return renderedAccountGroups
      .map((group: any) => ({
        ...group,
        cards: group.cards.filter((card: any) => {
          const haystack = [
            group.title,
            card.title,
            card.subtitle,
            categoryLabelMap[card.category],
            card.account?.name,
            card.account?.symbol,
          ].filter(Boolean).join(" ").toLowerCase();
          return haystack.includes(q);
        }),
      }))
      .filter((group: any) => group.cards.length > 0);
  }, [accountSearch, renderedAccountGroups]);

  const dataHealth = useMemo(() => {
    const timestamps = accounts
      .map((a: any) => a.lastApiSyncAt ?? a.updatedAt)
      .filter(Boolean)
      .map((v: string) => new Date(v).getTime())
      .filter(Number.isFinite);
    const lastSync = timestamps.length ? new Date(Math.max(...timestamps)) : null;
    const syncErrors = accounts.filter((a: any) => a.apiSyncError).length;
    return { lastSync, syncErrors };
  }, [accounts]);

  const todayLabel = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const bg = "bg-[#EEF0EC] dark:bg-[#0B0D12]";
  // 卡片改走 fintech 扁平風：白底＋柔和陰影，不再用漸層描邊（圓角由各處自帶的 rounded-* 決定）
  const surface = "bg-white dark:bg-[#151923] shadow-[0_10px_30px_-14px_rgba(28,31,26,0.16)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.55)]";
  const textPrimary = "text-[#1C1F1A] dark:text-[#E7E5DE]";
  const textMuted = "text-[#6B7066] dark:text-[#8A8F82]";
  const gold = "#B8933C";
  const inputCls = "w-full h-11 px-3.5 text-sm outline-none bg-transparent text-[#1C1F1A] dark:text-[#E7E5DE] border-b-2 border-black/15 dark:border-white/15 focus:border-[#B8933C] transition-colors";
  const btnPrimary = "w-full py-3.5 text-sm font-semibold bg-[#1C1F1A] dark:bg-[#B8933C] text-[#EEF0EC] dark:text-[#0B0D12] rounded-lg hover:opacity-90 transition-all cursor-pointer";
  const sectionLabel = "text-[9px] font-bold tracking-[0.2em] uppercase text-[#6B7066] dark:text-[#8A8F82]";
  // 標題階層統一：頁面標題 22px（各分頁 h1/h2）、區塊標題小字 uppercase（sectionLabel）、卡片標題 14px bold（cardTitle）
  const cardTitle = "text-sm font-bold";

  const navItems: { key: Tab; icon: any; label: string }[] = [
    { key: "overview", icon: LayoutDashboard, label: "總覽" },
    { key: "assets", icon: CalendarDays, label: "行事曆" },
    { key: "trends", icon: TrendingUp, label: "走勢" },
    { key: "settings", icon: Settings, label: "設定" },
  ];

  if (bioLocked) {
    return (
      <main className={`min-h-screen flex flex-col items-center justify-center gap-8 p-4 ${bg} ${textPrimary}`} style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <FontStyles />
        <img src="/logo.png" alt="Zeno Worth" className="h-24 w-auto object-contain dark:invert dark:brightness-125" />
        <p className={`text-[11px] font-semibold tracking-[0.25em] ${textMuted}`}>LOCKED · 已鎖定</p>
        <button
          onClick={() => { void biometricVerify("解鎖 Zeno Worth").then((ok) => { if (ok) setBioLocked(false); }); }}
          className="flex items-center gap-2.5 px-6 py-3.5 text-sm font-semibold rounded-xl text-black active:scale-95 transition-transform"
          style={{ background: gold }}
        >
          <Fingerprint className="h-5 w-5" /> 使用 Face ID 解鎖
        </button>
      </main>
    );
  }

  if (mounted && !isAuthenticated) {
    return (
      <main className={`min-h-screen flex items-center justify-center p-4 ${bg} ${textPrimary}`} style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <FontStyles />
        <div className={`w-full max-w-sm p-6 ${surface} rounded-[24px] flex flex-col items-center`}>
          <img src="/logo.png" alt="Zeno Worth" className="h-20 w-auto mb-3 object-contain dark:invert dark:brightness-125" />
          <p className={`text-[11px] font-semibold tracking-[0.25em] mb-5 ${textMuted}`}>
            {authMode === "login" ? "SIGN IN · 登入帳號" : "REGISTER · 建立帳號"}
          </p>
          <form onSubmit={handleAuthSubmit} className="w-full space-y-4">
            <div>
              <label className={`block text-xs mb-2 ${sectionLabel}`}>電子郵件</label>
              <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="your@email.com" className={inputCls} required />
            </div>
            <div>
              <label className={`block text-xs mb-2 ${sectionLabel}`}>密碼{authMode === "register" ? "（至少 8 字元）" : ""}</label>
              <div className="relative">
                <input type={showAuthPassword ? "text" : "password"} value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="••••••••" className={`${inputCls} pr-9`} required minLength={authMode === "register" ? 8 : 1} />
                <button type="button" onClick={() => setShowAuthPassword(!showAuthPassword)} tabIndex={-1} aria-label={showAuthPassword ? "隱藏密碼" : "顯示密碼"} className={`absolute right-0 top-1/2 -translate-y-1/2 h-11 w-11 flex items-center justify-center ${textMuted} hover:text-[#B8933C] transition-colors`}>
                  {showAuthPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {authError && <p className="text-sm font-medium text-[#A24936] bg-[#A24936]/8 p-3 rounded-lg text-center">{authError}</p>}
            <button type="submit" disabled={authLoading} className={`mt-2 ${btnPrimary}`}>
              {authLoading ? "處理中…" : authMode === "login" ? "登入" : "建立帳號"}
            </button>
          </form>

          <div className="w-full flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
            <span className={`text-[10px] ${textMuted}`}>或</span>
            <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
          </div>

          <a href="/api/auth/google" className={`w-full py-3 flex items-center justify-center gap-2.5 text-sm font-semibold rounded-lg border border-black/15 dark:border-white/15 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors ${textPrimary}`}>
            <GoogleIcon className="h-4 w-4" />
            使用 Google {authMode === "login" ? "登入" : "註冊"}
          </a>

          <a href="/api/auth/apple" className={`mt-2.5 w-full py-3 flex items-center justify-center gap-2.5 text-sm font-semibold rounded-lg border border-black/15 dark:border-white/15 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors ${textPrimary}`}>
            <AppleIcon className="h-4 w-4" />
            使用 Apple {authMode === "login" ? "登入" : "註冊"}
          </a>

          <button onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }} className={`mt-5 text-xs ${textMuted} hover:text-[#B8933C] transition-colors`}>
            {authMode === "login" ? "還沒有帳號？ 立即註冊" : "已有帳號？ 返回登入"}
          </button>
        </div>
      </main>
    );
  }

  // 圓形圖示按鈕（fintech 風的 header 按鈕）
  const iconBtn = "h-10 w-10 rounded-full bg-white dark:bg-[#151923] border border-black/[0.05] dark:border-white/[0.07] flex items-center justify-center transition-colors";
  // 淨資產主卡配色隨明暗模式切換：淺色模式用香檳金奶油底，深色模式用暗夜金
  const heroTheme = isDarkMode ? "noir" : "cream";

  return (
    <div className={`h-screen overflow-hidden ${bg} ${textPrimary} flex flex-col`} style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <FontStyles />

      {/* key=activeTab：切換分頁時重建捲動容器，讓每頁都從頂部開始 */}
      <div key={activeTab} className="flex-1 overflow-y-auto pb-32">

        {activeTab === "overview" && (
          <div className="px-5 pt-5 pb-4 max-w-lg mx-auto space-y-6">
            {/* 問候列 */}
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <h1 className="font-display text-[22px] font-bold leading-tight tracking-tight" style={{ color: gold }}>Zeno</h1>
              </div>
              <div className="flex min-w-0 shrink-0 items-center gap-2">
                <p className={`min-w-0 text-right font-mono-ledger text-[11px] font-medium tabular-nums ${textMuted}`}>
                  {todayLabel} · 最近更新時間 {dataHealth.lastSync ? dataHealth.lastSync.toLocaleString("zh-TW", { hour: "2-digit", minute: "2-digit" }) : "尚無"}
                </p>
                <button onClick={() => setHideBalance(!hideBalance)} aria-label={hideBalance ? "顯示金額" : "隱藏金額"} className={`${iconBtn} ${textMuted} hover:text-[#B8933C]`}>
                  {hideBalance ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
                <button onClick={toggleDarkMode} aria-label={isDarkMode ? "切換淺色模式" : "切換深色模式"} className={`${iconBtn} ${textMuted} hover:text-[#B8933C]`}>
                  {isDarkMode ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
                </button>
              </div>
            </div>

            {/* 淨資產主卡 — 金色 hero，右上角一排操作 icon（更新價格／幣別切換／新增資產） */}
            <div
              className="rounded-[28px] p-5 sm:p-6 transition-[background,color] duration-300"
              style={{
                background: HERO_THEMES[heroTheme].background,
                color: HERO_THEMES[heroTheme].text,
                boxShadow: `${HERO_THEMES[heroTheme].shadow}, ${HERO_THEMES[heroTheme].ring}`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 pt-1.5">
                  <span className="text-[10px] font-bold tracking-[0.18em] uppercase truncate"><Wallet className="inline h-3 w-3 mr-1 -mt-0.5" />目前淨資產</span>
                  {monthlyReport && !hideBalance && (
                    <span className="font-mono-ledger text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: HERO_THEMES[heroTheme].chipBtnBg }}>
                      {monthlyReport.delta >= 0 ? "+" : "−"}{Math.abs(monthlyReport.pct).toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={handleSyncPrices}
                    disabled={syncing}
                    aria-label="更新價格"
                    className="h-9 w-9 rounded-full flex items-center justify-center active:scale-95 transition-all"
                    style={{ background: HERO_THEMES[heroTheme].chipBtnBg }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = HERO_THEMES[heroTheme].chipBtnBgHover)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = HERO_THEMES[heroTheme].chipBtnBg)}
                  >
                    <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    onClick={() => { resetForm(); setShowForm(true); }}
                    aria-label="新增資產"
                    className="h-10 w-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                    style={{ background: HERO_THEMES[heroTheme].plusBg, color: HERO_THEMES[heroTheme].plusText }}
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <p className="font-mono-ledger text-[clamp(1.5rem,7.5vw,2.25rem)] font-bold leading-normal mt-1 truncate">
                {hideBalance ? `${displayCurrency === "USD" ? "US$" : "NT$"} ••••••` : fmtMoney(summary.netWorth)}
              </p>
              <div className="mt-3 flex flex-col gap-2 font-mono-ledger text-[11px] font-bold sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="min-w-0 max-w-full break-words rounded-full border px-2.5 py-1" style={{ borderColor: `${HERO_THEMES[heroTheme].assetBorder}59`, background: `${HERO_THEMES[heroTheme].assetBorder}1A`, color: HERO_THEMES[heroTheme].assetBorder }}>
                    資產 {hideBalance ? "••••" : fmtMoney(summary.totalAssets)}
                  </span>
                  <span className="min-w-0 max-w-full break-words rounded-full border px-2.5 py-1" style={{ borderColor: `${HERO_THEMES[heroTheme].liabilityBorder}59`, background: `${HERO_THEMES[heroTheme].liabilityBorder}1A`, color: HERO_THEMES[heroTheme].liabilityBorder }}>
                    負債 {hideBalance ? "••••" : fmtMoney(summary.totalLiabilities)}
                  </span>
                </div>
                <button
                  onClick={toggleDisplayCurrency}
                  disabled={!exchangeRate}
                  className="w-fit max-w-full shrink-0 rounded-full border px-2.5 py-1 text-left active:scale-95 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  style={
                    displayCurrency === "USD"
                      ? { borderColor: HERO_THEMES[heroTheme].toggleActiveBg, background: HERO_THEMES[heroTheme].toggleActiveBg, color: HERO_THEMES[heroTheme].toggleActiveText }
                      : { borderColor: HERO_THEMES[heroTheme].toggleIdleBorder, background: HERO_THEMES[heroTheme].toggleIdleBg, color: HERO_THEMES[heroTheme].toggleIdleText }
                  }
                >
                  {displayCurrency === "USD" ? "US$ 檢視中" : `USD/TWD ${exchangeRate?.toFixed(2) || "—"}`}
                </button>
              </div>
            </div>

            {/* 資產配置 */}
            {allocation.rows.length > 1 && (
              <div className={`${surface} rounded-[24px] p-5`}>
                <p className={`${cardTitle} mb-3`}>資產配置</p>
                <div className="flex items-center gap-5">
                  <div className="h-[84px] w-[84px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={allocation.rows} dataKey="value" nameKey="name" innerRadius={26} outerRadius={41} paddingAngle={2} strokeWidth={0}>
                          {allocation.rows.map((r) => <Cell key={r.name} fill={r.color} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-1.5 min-w-0">
                    {allocation.rows.map((r) => (
                      <div key={r.name} className="flex items-center gap-2 text-xs">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: r.color }} />
                        <span className="font-medium truncate">{r.name}</span>
                        <span className="ml-auto font-mono-ledger font-semibold shrink-0">{((r.value / allocation.total) * 100).toFixed(1)}%</span>
                        {!hideBalance && <span className={`font-mono-ledger text-[10px] ${textMuted} shrink-0 text-right`}>{formatCompactNumber(r.value)}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 目標 — 直向清單卡 */}
            <div className="flex items-center justify-between px-1">
              <span className={`text-[10px] font-bold tracking-[0.18em] uppercase ${textMuted}`}>目標</span>
              <button onClick={() => { setEditingGoal(null); setGoalForm({ name: "", targetAmount: "", type: "NET_WORTH", accountId: "", emoji: "" }); setShowGoalForm(true); }} className="text-[11px] font-semibold hover:underline underline-offset-2" style={{ color: gold }}>+ 新增</button>
            </div>
            {goals.length === 0 ? (
              <button onClick={() => { setEditingGoal(null); setGoalForm({ name: "", targetAmount: "", type: "NET_WORTH", accountId: "", emoji: "" }); setShowGoalForm(true); }} className={`w-full px-4 py-3 flex items-center gap-2 rounded-2xl border-2 border-dashed border-[#B8933C]/60 bg-[#B8933C]/[0.08] dark:bg-[#B8933C]/[0.12] ${textMuted} hover:text-[#B8933C] hover:border-[#B8933C]/80 transition-colors`}>
                <span className="text-xs font-medium">設定第一個財務目標</span>
                <Plus className="h-3.5 w-3.5 ml-auto" />
              </button>
            ) : (
              <div className={`${surface} rounded-[24px] overflow-hidden divide-y divide-black/[0.05] dark:divide-white/[0.05]`}>
                {goals.map((goal: any) => (
                  <div key={goal.id} className="px-4 py-3.5 flex items-center gap-3">
                    <div className="shrink-0 flex flex-col items-center gap-0.5">
                      <EggChick progress={goal.progress} size={30} />
                      <span className="text-[8px] font-bold" style={{ color: goal.progress >= 100 ? "#4F7B5E" : gold }}>
                        {goal.progress >= 100 ? "孵化！" : goal.progress >= 75 ? "快出殼" : goal.progress >= 50 ? "裂開了" : goal.progress >= 25 ? "有裂痕" : "孵蛋中"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold flex-1 truncate">{goal.name}</span>
                        <span className="font-mono-ledger text-[11px] font-bold shrink-0" style={{ color: goal.progress >= 100 ? "#4F7B5E" : gold }}>
                          {goal.progress >= 100 ? "✓ 達標" : `${goal.progress}%`}
                        </span>
                        <button onClick={() => { setEditingGoal(goal); setGoalForm({ name: goal.name, targetAmount: String(goal.targetAmount), type: goal.type, accountId: goal.accountId || "", emoji: goal.emoji || "" }); setShowGoalForm(true); }} aria-label="編輯目標" className={`p-2.5 -m-2 ${textMuted} hover:text-[#B8933C] transition-colors`}><Pencil className="h-3 w-3" /></button>
                        <button onClick={() => handleDeleteGoal(goal.id, goal.name)} aria-label="刪除目標" className={`p-1.5 -m-1 ${textMuted} hover:text-[#A24936] active:scale-90 transition-transform`}><Trash2 className="h-3 w-3" /></button>
                      </div>
                      <div className="w-full bg-black/[0.06] dark:bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
                        <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, goal.progress)}%`, background: goal.progress >= 100 ? "#4F7B5E" : gold }} />
                      </div>
                      <div className={`flex flex-wrap justify-between gap-x-2 mt-1 font-mono-ledger text-[10px] ${textMuted}`}>
                        <span className="whitespace-nowrap">{hideBalance ? "••••" : `NT$ ${Math.round(Number(goal.currentAmount)).toLocaleString()}`}</span>
                        {goal.progress < 100
                          ? <span className="whitespace-nowrap ml-auto">目標 NT$ {Number(goal.targetAmount).toLocaleString()}</span>
                          : <span className="text-[#4F7B5E] dark:text-[#7FAE8F]">🎉 已達標！</span>
                        }
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 帳戶 */}
            <div className="flex items-center justify-between px-1">
              <span className={`text-[10px] font-bold tracking-[0.18em] uppercase ${textMuted}`}>帳戶</span>
            </div>
            {accounts.length > 0 && (
              <div className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 ${surface}`}>
                <Search className={`h-4 w-4 shrink-0 ${textMuted}`} />
                <input
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  placeholder="搜尋帳戶、代號或分類"
                  className={`min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#8A8F82] ${textPrimary}`}
                />
                {accountSearch && (
                  <button onClick={() => setAccountSearch("")} aria-label="清除搜尋" className={`p-1 ${textMuted} hover:text-[#B8933C]`}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
            {accounts.length === 0 && (
              <div className={`${surface} rounded-2xl p-8 flex flex-col items-center text-center`}>
                <div className="text-4xl mb-3">🥚</div>
                <h3 className="font-display text-base font-semibold mb-1.5">還沒有任何資產紀錄</h3>
                <p className={`text-xs ${textMuted} mb-6 leading-relaxed`}>新增你的第一筆資產或負債，開始追蹤你的淨資產變化</p>
                <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-1.5 px-5 py-3 text-sm font-semibold rounded-lg text-black active:scale-95 transition-transform" style={{ background: "#B8933C" }}>
                  <Plus className="h-4 w-4" /> 新增第一筆資產
                </button>
              </div>
            )}

            {displayedAccountGroups.length === 0 && accounts.length > 0 && (
              <div className={`${surface} rounded-2xl p-5 text-center`}>
                <p className={`text-sm ${textMuted}`}>找不到符合「{accountSearch}」的帳戶</p>
              </div>
            )}

            {displayedAccountGroups.map((group: any) => {
              const groupTotal = group.cards.reduce((sum: number, c: any) => sum + Number(c.currentValue ?? 0), 0);
              const collapsed = !accountSearch && collapsedAccountGroups[group.title];
              return (
                <div key={group.title} className="space-y-2.5">
                  <div className="flex items-baseline justify-between px-1">
                    <button
                      onClick={() => setCollapsedAccountGroups((prev) => ({ ...prev, [group.title]: !prev[group.title] }))}
                      className="flex min-w-0 items-center gap-2 text-left active:scale-[0.99] transition-transform"
                      aria-expanded={!collapsed}
                    >
                      <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${collapsed ? "" : "rotate-90"}`} style={{ color: group.color }} />
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: group.color }} />
                      <h3 className={`font-display ${cardTitle}`}>{group.title}</h3>
                      <span className={`font-mono-ledger text-[10px] ${textMuted}`}>{group.cards.length} 項</span>
                    </button>
                    <div className="flex items-baseline gap-3 shrink-0">
                      <span className={`font-mono-ledger text-xs font-semibold ${group.title === "負債總額" ? "text-[#A24936]" : ""}`}>{hideBalance ? "••••" : `NT$ ${formatCurrency(groupTotal)}`}</span>
                      <button
                        onClick={() => { resetForm(); setFormData((f: any) => ({ ...f, type: group.defaultType, category: group.defaultCategory, currency: group.defaultCategory === "TAIWAN_STOCK" ? "TWD" : group.defaultCategory === "US_STOCK" || group.defaultCategory === "CRYPTO" ? "USD" : f.currency })); setShowForm(true); }}
                        className="text-[11px] font-semibold hover:underline underline-offset-2" style={{ color: gold }}
                      >
                        + 新增
                      </button>
                    </div>
                  </div>
                  {/* 帳戶卡片 — 橫向貨架 */}
                  {!collapsed && (
                    <>
                      <div
                        className="flex snap-x snap-mandatory gap-3 overflow-x-auto -mx-5 px-5 pb-1"
                        onScroll={(e) => handleAccountShelfScroll(group.title, e.currentTarget)}
                        style={{ scrollbarWidth: "none" }}
                      >
                    {group.cards.map((card: any) => {
                      const showSubtitle = Boolean(card.subtitle) && card.subtitle !== card.title;
                      const gainColor = card.priceChangePct == null ? "#4F7B5E" : card.priceChangePct >= 0 ? "#4F7B5E" : "#A24936";
                      const isLiability = group.title === "負債總額";
                      return (
                        <div key={card.id} className={`relative w-[196px] shrink-0 snap-start overflow-hidden rounded-[24px] p-4 pl-5 ${isLiability ? "bg-[#FCF4F2] dark:bg-[#1D1416] border border-[#A24936]/25 shadow-[0_10px_30px_-14px_rgba(28,31,26,0.16)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.55)]" : surface}`}>
                          <span className="absolute inset-y-0 left-0 w-1" style={{ background: group.color }} />
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-bold truncate">{card.title.replace(/\.TW$/i, "")}</p>
                              <p className={`text-[9px] font-bold tracking-wider uppercase mt-0.5 ${textMuted}`}>{categoryLabelMap[card.category]}{showSubtitle && <span className="normal-case tracking-normal font-medium" style={{ color: gold }}> · {card.subtitle}</span>}</p>
                            </div>
                            <div className="flex items-center shrink-0">
                              <button onClick={() => startEdit(card.account)} aria-label="編輯資產" className={`p-2 -m-1 ${textMuted} hover:text-[#B8933C] active:scale-90 transition-transform`}><Pencil className="h-3 w-3" /></button>
                              <button onClick={() => handleDelete(card.account.id, card.account.name)} aria-label="刪除資產" className={`p-2 -m-1 ${textMuted} hover:text-[#A24936] active:scale-90 transition-transform`}><Trash2 className="h-3 w-3" /></button>
                            </div>
                          </div>
                          <p className={`font-mono-ledger text-[15px] font-bold mt-2.5 truncate ${group.title === "負債總額" ? "text-[#A24936]" : ""}`}>
                            {hideBalance ? "••••" : `NT$ ${formatCurrency(card.currentValue)}`}
                          </p>
                          <div className={`mt-1 flex items-center gap-2 font-mono-ledger text-[10px] ${textMuted}`}>
                            <p className="min-w-0 flex-1 truncate">
                              {symbolRequiredCategories.includes(card.category) ? `持有 ${formatCurrency(card.quantity)} 股` : card.account.type === "LIABILITY" && card.account.loanStartDate ? `貸款總額 ${formatCurrency(card.quantity)}` : `餘額 ${formatCurrency(card.quantity)}`}
                              {symbolRequiredCategories.includes(card.category) && card.currentPrice > 0 && (
                                <span className="ml-1.5 font-semibold" style={{ color: gainColor }}>現價 {formatCurrency(card.currentPrice)}</span>
                              )}
                            </p>
                            {symbolRequiredCategories.includes(card.category) && card.priceChangePct != null && (
                              <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ color: gainColor, background: `${gainColor}1A` }}>
                                {card.priceChangePct >= 0 ? "+" : ""}{card.priceChangePct.toFixed(1)}%
                              </span>
                            )}
                          </div>
                          {card.account.type === "LIABILITY" && (card.account.interestRate != null || card.account.loanTermMonths != null) && (
                            <p className={`text-[10px] mt-0.5 truncate ${textMuted}`}>
                              {card.account.interestRate != null && <span>利率 {card.account.interestRate}%</span>}
                              {card.account.interestRate != null && card.account.loanTermMonths != null && <span> · </span>}
                              {card.account.loanTermMonths != null && <span>已繳 {card.account.paidInstallments ?? 0}/{card.account.loanTermMonths} 期</span>}
                            </p>
                          )}
                          {card.account.isApiConnected && card.account.apiSyncError && (
                            <button onClick={() => startEdit(card.account)} className="text-[10px] mt-1 font-semibold text-red-500 underline underline-offset-2 active:opacity-60">⚠️ API 已過期，立即設定</button>
                          )}
                        </div>
                      );
                    })}
                      </div>
                      {group.cards.length > 2 && (
                        <div className="mx-1 h-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                          <div
                            className="h-full rounded-full transition-[width] duration-150"
                            style={{
                              background: group.color,
                              width: `${Math.max(18, Math.round(((accountShelfProgress[group.title] ?? 0) * 82) + 18))}%`,
                            }}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "assets" && (
          <div className="px-5 pt-5 pb-4 max-w-lg mx-auto space-y-4">
            <div className="flex items-center justify-between pb-2">
              <h2 className="font-display text-[22px] font-bold tracking-tight">行事曆</h2>
            </div>
            {(
              heldStockSymbols.length === 0 ? (
                <div className={`${surface} rounded-2xl p-8 text-center`}>
                  <div className="text-3xl mb-3">📅</div>
                  <p className="text-sm font-semibold mb-1.5">還沒有持股</p>
                  <p className={`text-xs leading-relaxed ${textMuted}`}>新增台股／美股後，財報、除息、配息日期會自動出現在這裡</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className={`${surface} rounded-2xl p-4`}>
                    <div className="flex items-center justify-between mb-3">
                      <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} className={`p-2 rounded-lg ${textMuted} hover:text-[#B8933C] transition-colors`}>‹</button>
                      <span className={`font-display ${cardTitle}`}>{calendarMonth.getFullYear()} 年 {calendarMonth.getMonth() + 1} 月</span>
                      <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} className={`p-2 rounded-lg ${textMuted} hover:text-[#B8933C] transition-colors`}>›</button>
                    </div>
                    {stockEventsLoading && <p className={`text-xs mb-2 ${textMuted}`}>載入股票行事曆中…</p>}
                    <div className="grid grid-cols-7 gap-1 mb-1">
                      {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
                        <div key={d} className={`text-center text-[10px] font-semibold ${textMuted}`}>{d}</div>
                      ))}
                    </div>
                    <div className="space-y-1">
                      {calendarWeeks.map((week, wi) => (
                        <div key={wi} className="grid grid-cols-7 gap-1">
                          {week.map((day, di) => {
                            if (!day) return <div key={di} />;
                            const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                            const dayEvents = eventsByDate[key] ?? [];
                            const isToday = key === new Date().toISOString().slice(0, 10);
                            return (
                              <button
                                key={di}
                                onClick={() => dayEvents.length > 0 && setSelectedCalendarDate(key === selectedCalendarDate ? null : key)}
                                className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-xs transition-colors ${isToday ? "border-2" : ""} ${selectedCalendarDate === key ? "bg-black/[0.06] dark:bg-white/[0.08]" : ""}`}
                                style={isToday ? { borderColor: "#B8933C" } : undefined}
                              >
                                <span className={textMuted}>{day.getDate()}</span>
                                {dayEvents.length > 0 && (
                                  <span className="flex gap-0.5">
                                    {Array.from(new Set(dayEvents.map((e) => e.type))).slice(0, 3).map((t) => (
                                      <span key={t} className="h-1.5 w-1.5 rounded-full" style={{ background: eventTypeMeta[t].color }} />
                                    ))}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 px-1">
                    {Object.values(eventTypeMeta).map((m) => (
                      <div key={m.label} className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
                        <span className={`text-[10px] ${textMuted}`}>{m.label}</span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    {(selectedCalendarDate ? allCalendarEvents.filter((e) => e.date.slice(0, 10) === selectedCalendarDate) : allCalendarEvents)
                      .slice()
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((ev, i) => (
                        <div key={i} className={`${surface} rounded-xl p-4 flex items-center gap-3`}>
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: eventTypeMeta[ev.type].color }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{ev.symbol} · {ev.name}</p>
                            <p className={`text-xs ${textMuted}`}>{eventTypeMeta[ev.type].label} · {new Date(ev.date).toLocaleDateString("zh-TW", { month: "long", day: "numeric" })}</p>
                          </div>
                        </div>
                      ))}
                    {allCalendarEvents.length === 0 && !stockEventsLoading && (
                      <p className={`text-sm text-center py-4 ${textMuted}`}>本月暫無事件</p>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {activeTab === "trends" && (
          <div className="px-5 pt-5 pb-4 max-w-lg mx-auto space-y-4">
            <div className="flex items-center justify-between pb-2">
              <h2 className="font-display text-[22px] font-bold tracking-tight">歷史走勢</h2>
              <button onClick={() => setShowHistoryForm(true)} className="text-xs font-semibold hover:underline underline-offset-2" style={{ color: gold }}>+ 手動補登</button>
            </div>
            {periodStats && (
              <div className={`${surface} rounded-2xl p-4`}>
                <div className="flex items-center justify-between mb-3">
                  <p className={sectionLabel}>本期摘要</p>
                  <span className={`text-[11px] ${textMuted}`}>{timeframeLabel}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className={`text-[10px] ${textMuted}`}>本期變化</p>
                    <p className="font-mono-ledger text-base font-bold mt-0.5" style={{ color: periodStats.delta >= 0 ? "#4F7B5E" : "#A24936" }}>
                      {hideBalance ? "••••" : `${periodStats.delta >= 0 ? "+" : "−"}${formatCompactNumber(Math.abs(periodStats.delta))}`}
                      {periodStats.pct !== null && <span className="ml-1.5 text-[11px]">{periodStats.pct >= 0 ? "+" : "−"}{Math.abs(periodStats.pct).toFixed(1)}%</span>}
                    </p>
                  </div>
                  <div>
                    <p className={`text-[10px] ${textMuted}`}>日均變化</p>
                    <p className="font-mono-ledger text-base font-bold mt-0.5" style={{ color: periodStats.dailyAvg >= 0 ? "#4F7B5E" : "#A24936" }}>
                      {hideBalance ? "••••" : `${periodStats.dailyAvg >= 0 ? "+" : "−"}${formatCompactNumber(Math.round(Math.abs(periodStats.dailyAvg)))}`}
                    </p>
                  </div>
                  <div>
                    <p className={`text-[10px] ${textMuted}`}>期間最高</p>
                    <p className="font-mono-ledger text-sm font-bold mt-0.5">{hideBalance ? "••••" : formatCompactNumber(periodStats.high.netWorth)}</p>
                    <p className={`text-[10px] ${textMuted}`}>{periodStats.high.label || periodStats.high.date}</p>
                  </div>
                  <div>
                    <p className={`text-[10px] ${textMuted}`}>期間最低</p>
                    <p className="font-mono-ledger text-sm font-bold mt-0.5">{hideBalance ? "••••" : formatCompactNumber(periodStats.low.netWorth)}</p>
                    <p className={`text-[10px] ${textMuted}`}>{periodStats.low.label || periodStats.low.date}</p>
                  </div>
                </div>
              </div>
            )}
            {/* 基準比較：疊上大盤指數的成長率 */}
            <div className="flex flex-wrap items-center gap-2 px-1">
              <button
                onClick={() => setActiveBenchmarks((prev) => prev.length ? [] : ["tw0050", "sp500"])}
                className={`px-3 py-1.5 text-[11px] font-semibold rounded-full border transition-all ${compareMode ? "text-white dark:text-black" : `${textMuted} border-black/10 dark:border-white/10`}`}
                style={compareMode ? { background: gold, borderColor: gold } : undefined}
              >
                比較大盤
              </button>
              {compareMode && Object.entries(BENCHMARKS).map(([key, cfg]) => {
                const on = activeBenchmarks.includes(key);
                return (
                  <button key={key} onClick={() => toggleBenchmark(key)} className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-all ${on ? "text-white dark:text-black" : `${textMuted} border-black/10 dark:border-white/10`}`} style={on ? { background: cfg.color, borderColor: cfg.color } : undefined}>
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: on ? "currentColor" : cfg.color }} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>

            {/* 時間範圍 — segmented control */}
            <div className="flex gap-1 p-1 rounded-full bg-black/[0.05] dark:bg-white/[0.06]">
              {([["day", "兩週"], ["month", "六個月"], ["year", "一年"], ["custom", "自訂"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => {
                    if (key === "custom") {
                      const todayStr = new Date().toISOString().slice(0, 10);
                      setCustomRangeDraft(customRange ?? { start: todayStr, end: todayStr });
                      setShowCustomRangePicker(true);
                    } else {
                      setTimeframe(key);
                      setShowCustomRangePicker(false);
                    }
                  }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-full transition-colors ${timeframe === key ? "bg-white dark:bg-[#151923] shadow-sm" : textMuted}`}
                  style={timeframe === key ? { color: gold } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className={`${surface} rounded-2xl p-4`}>
              {showCustomRangePicker && (
                <div className="mb-3 pb-3 border-b border-black/[0.06] dark:border-white/[0.06] space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="date" value={customRangeDraft.start} max={customRangeDraft.end || todayDateStr} onChange={(e) => setCustomRangeDraft((r) => ({ ...r, start: e.target.value }))} className={`${inputCls} h-9 flex-1 min-w-[120px]`} />
                    <span className={`text-xs ${textMuted}`}>～</span>
                    <input type="date" value={customRangeDraft.end} min={customRangeDraft.start || undefined} max={todayDateStr} onChange={(e) => setCustomRangeDraft((r) => ({ ...r, end: e.target.value }))} className={`${inputCls} h-9 flex-1 min-w-[120px]`} />
                    <button
                      onClick={() => {
                        if (!customRangeDraft.start || !customRangeDraft.end) { showToast("請選擇起訖日期", "error"); return; }
                        // 指數只有到「今天」為止的歷史資料，迄日不能選未來，不然比較線會完全沒有資料可畫
                        const clampedEnd = customRangeDraft.end > todayDateStr ? todayDateStr : customRangeDraft.end;
                        setCustomRange({ ...customRangeDraft, end: clampedEnd });
                        setTimeframe("custom");
                        setShowCustomRangePicker(false);
                      }}
                      className="px-4 py-2 text-xs font-semibold rounded-lg text-white dark:text-black shrink-0"
                      style={{ background: gold }}
                    >
                      套用
                    </button>
                  </div>
                  <p className={`text-[11px] ${textMuted}`}>迄日最晚只能選到今天，指數才有行情可以比較。</p>
                </div>
              )}
              {compareMode ? (
                <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mb-3 pb-3 border-b border-black/[0.06] dark:border-white/[0.06]">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: gold }} />你的淨值</span>
                  {activeBenchmarks.map((k) => (
                    <span key={k} className="flex items-center gap-1.5 text-[11px] font-semibold"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: BENCHMARKS[k].color }} />{BENCHMARKS[k].label}</span>
                  ))}
                  <div className="ml-auto flex items-center gap-2.5">
                    <span className={`text-[10px] ${textMuted}`}>{benchmarkLoading ? "抓取行情中…" : "成長率 · 以區間首日為 0%"}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mb-3 pb-3 border-b border-black/[0.06] dark:border-white/[0.06]">
                  {([["net", "淨值"], ["breakdown", "資產 vs 負債"]] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setTrendView(key)} className={`px-3 py-1.5 text-[11px] font-semibold rounded-full transition-all ${trendView === key ? "bg-[#1C1F1A] dark:bg-[#B8933C] text-white dark:text-black" : `${textMuted} border border-black/10 dark:border-white/10`}`}>
                      {label}
                    </button>
                  ))}
                  {trendView === "breakdown" && (
                    <span className={`ml-auto flex items-center gap-3 text-[10px] ${textMuted}`}>
                      <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#4F7B5E]" />資產</span>
                      <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#A24936]" />負債</span>
                    </span>
                  )}
                </div>
              )}
              <div className="h-[240px]">
                {mounted && compareMode && comparisonData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={comparisonData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
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
                ) : mounted && compareMode && comparisonBaseTooSmall ? (
                  <div className="h-full flex items-center justify-center">
                    <p className={`text-sm ${textMuted}`}>起始淨值過低，無法以百分比比較走勢</p>
                  </div>
                ) : mounted && trendView === "breakdown" && assetLiabData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={assetLiabData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="assetsGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4F7B5E" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#4F7B5E" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="liabGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#A24936" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#A24936" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#8A8F82", fontSize: 11, fontFamily: "IBM Plex Mono" }} tickMargin={10} interval={0} tickFormatter={xAxisTickFormatter} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#8A8F82", fontSize: 11, fontFamily: "IBM Plex Mono" }} tickFormatter={formatCompactNumber} width={44} />
                      <Tooltip contentStyle={{ borderRadius: "10px", border: isDarkMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.08)", background: isDarkMode ? "#12151C" : "#FFFFFF", fontFamily: "IBM Plex Mono", fontSize: "12px", boxShadow: "none" }} labelFormatter={(l) => String(l)} formatter={(val, name) => [`NT$ ${formatCurrency(Number(val))}`, name === "assets" ? "總資產" : "總負債"]} />
                      <Area type="monotone" dataKey="assets" stroke="#4F7B5E" strokeWidth={2} fillOpacity={1} fill="url(#assetsGrad)" />
                      <Area type="monotone" dataKey="liabilities" stroke="#A24936" strokeWidth={2} fillOpacity={1} fill="url(#liabGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : mounted && chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
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
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <p className={`text-sm ${textMuted}`}>尚無歷史資料</p>
                  </div>
                )}
              </div>
              {compareMode && benchmarkVerdicts.length > 0 && (
                <div className="mt-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.06] space-y-1.5">
                  {benchmarkVerdicts.map((v) => (
                    <p key={v.key} className="text-[11px] font-medium flex items-center gap-1.5">
                      <span className={v.win ? "text-[#4F7B5E] dark:text-[#7FAE8F]" : "text-[#A24936]"}>{v.win ? "✓" : "✗"}</span>
                      <span>本區間你 <span className="font-mono-ledger font-bold" style={{ color: gold }}>{formatPct(v.you)}</span>，{v.label} <span className="font-mono-ledger font-bold">{formatPct(v.bench)}</span></span>
                      <span className={`ml-auto font-bold ${v.win ? "text-[#4F7B5E] dark:text-[#7FAE8F]" : "text-[#A24936]"}`}>{v.win ? `跑贏 ${formatPct(v.you - v.bench).slice(1)}` : `落後 ${formatPct(v.bench - v.you).slice(1)}`}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* 自成立以來年化報酬 */}
            {inceptionCagr && (
              <div className={`${surface} rounded-2xl p-4`}>
                <p className={`text-[11px] ${textMuted}`}>
                  自 {String(inceptionCagr.since).slice(0, 10)} 記錄以來，年化成長率約
                  <span className="ml-1 font-mono-ledger font-bold" style={{ color: inceptionCagr.cagr >= 0 ? "#4F7B5E" : "#A24936" }}>{formatPct(inceptionCagr.cagr)}</span>
                </p>
              </div>
            )}

            {/* 每月增減 */}
            {monthlyDeltas.length >= 2 && (
              <div className={`${surface} rounded-2xl p-4`}>
                <div className="flex items-center justify-between mb-3">
                  <p className={cardTitle}>每月增減</p>
                  {growthStreak >= 2 && (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#4F7B5E]/12 text-[#4F7B5E] dark:text-[#7FAE8F]">
                      🔥 連續 {growthStreak} 個月正成長
                    </span>
                  )}
                </div>
                <div className="h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyDeltas} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#8A8F82", fontSize: 10, fontFamily: "IBM Plex Mono" }} tickMargin={6} interval={0} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#8A8F82", fontSize: 10, fontFamily: "IBM Plex Mono" }} tickFormatter={formatCompactNumber} width={40} />
                      <ReferenceLine y={0} stroke="#8A8F82" strokeOpacity={0.4} />
                      <Tooltip cursor={{ fill: "rgba(138,143,130,0.08)" }} contentStyle={{ borderRadius: "10px", border: isDarkMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.08)", background: isDarkMode ? "#12151C" : "#FFFFFF", fontFamily: "IBM Plex Mono", fontSize: "12px", boxShadow: "none" }} formatter={(val) => [`${Number(val) >= 0 ? "+" : ""}NT$ ${formatCurrency(Number(val))}`, "當月變化"]} />
                      <Bar dataKey="delta" radius={[4, 4, 0, 0]} maxBarSize={26}>
                        {monthlyDeltas.map((m) => <Cell key={m.key} fill={m.delta >= 0 ? "#4F7B5E" : "#A24936"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* 近期交易紀錄 */}
            {transactions.length > 0 && (
              <div className={`${surface} rounded-2xl p-4`}>
                <p className={`${cardTitle} mb-2`}>近期紀錄</p>
                <div className="divide-y divide-black/[0.05] dark:divide-white/[0.05]">
                  {transactions.slice(0, 8).map((tx: any) => {
                    const meta: Record<string, { label: string; sign: "+" | "−"; color: string }> = {
                      DEPOSIT: { label: "存入", sign: "+", color: "#4F7B5E" },
                      WITHDRAWAL: { label: "轉出", sign: "−", color: "#A24936" },
                      BUY: { label: "買入", sign: "−", color: "#5A7DA0" },
                      SELL: { label: "賣出", sign: "+", color: "#4F7B5E" },
                      LOAN_PAYMENT: { label: "還款", sign: "−", color: "#B8933C" },
                      AUTO_DEDUCTION: { label: "自動扣款", sign: "−", color: "#B8933C" },
                    };
                    const m = meta[tx.type] ?? { label: tx.type, sign: "−" as const, color: "#8A8F82" };
                    return (
                      <div key={tx.id} className="flex items-center gap-3 py-2.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ color: m.color, background: `${m.color}1A` }}>{m.label}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{tx.account?.name ?? tx.description ?? "—"}</p>
                          <p className={`text-[10px] ${textMuted}`}>
                            {String(tx.date).slice(0, 10)}
                            {tx.type === "AUTO_DEDUCTION" && tx.price != null && (
                              <span> · 本金 {formatCurrency(Number(tx.quantity ?? 0))} · 利息 {formatCurrency(Number(tx.price))}</span>
                            )}
                          </p>
                        </div>
                        <span className="font-mono-ledger text-xs font-bold shrink-0" style={{ color: m.color }}>
                          {hideBalance ? "••••" : `${m.sign}NT$ ${formatCurrency(Number(tx.amount))}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "settings" && (
          <div className="px-5 pt-5 pb-4 max-w-lg mx-auto space-y-4">
            <div className="pb-2">
              <h2 className="font-display text-[22px] font-bold tracking-tight">設定</h2>
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
                <Switch on={isDarkMode} />
              </button>
            </div>
            <div className={`${surface} rounded-2xl overflow-hidden`}>
              <div className="px-4 py-2 border-b border-black/[0.06] dark:border-white/[0.06]">
                <p className={sectionLabel}>資料</p>
              </div>
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: dataHealth.syncErrors ? "#A24936" : "#4F7B5E" }} />
                  <div>
                    <span className="text-sm font-medium block">資料健康狀態</span>
                    <span className={`text-xs ${textMuted}`}>
                      {dataHealth.lastSync ? `最近更新 ${dataHealth.lastSync.toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "尚無同步紀錄"}
                    </span>
                  </div>
                </div>
                <span className={`text-xs font-semibold ${dataHealth.syncErrors ? "text-[#A24936]" : "text-[#4F7B5E] dark:text-[#7FAE8F]"}`}>
                  {dataHealth.syncErrors ? `${dataHealth.syncErrors} 筆異常` : "正常"}
                </span>
              </div>
              <div className="border-t border-black/[0.06] dark:border-white/[0.06]">
              <button onClick={handleSyncPrices} disabled={syncing} className="w-full flex items-center justify-between p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-3">
                  <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} style={{ color: gold }} />
                  <span className="text-sm font-medium">更新價格</span>
                </div>
                <span className={`font-mono-ledger text-xs ${textMuted}`}>{syncing ? "更新中…" : `USD/TWD ${exchangeRate?.toFixed(2) || "—"}`}</span>
              </button>
              </div>
              <div className="border-t border-black/[0.06] dark:border-white/[0.06]">
                <button onClick={() => setShowHistoryForm(true)} className="w-full flex items-center justify-between p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="h-4 w-4" style={{ color: gold }} />
                    <span className="text-sm font-medium">手動補登走勢</span>
                  </div>
                  <ChevronRight className={`h-4 w-4 ${textMuted}`} />
                </button>
              </div>
              <div className="border-t border-black/[0.06] dark:border-white/[0.06]">
                <button onClick={handleExportCsv} className="w-full flex items-center justify-between p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-3">
                    <Download className="h-4 w-4" style={{ color: gold }} />
                    <span className="text-sm font-medium">匯出 CSV 報表</span>
                  </div>
                  <span className={`text-xs ${textMuted}`}>資產清單＋歷史</span>
                </button>
              </div>
            </div>
            <div className={`${surface} rounded-2xl overflow-hidden`}>
              <div className="px-4 py-2 border-b border-black/[0.06] dark:border-white/[0.06]">
                <p className={sectionLabel}>安全與提醒</p>
              </div>
              <button onClick={handleToggleBioLock} disabled={!isNative()} className="w-full flex items-center justify-between p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] disabled:opacity-50 disabled:hover:bg-transparent transition-colors">
                <div className="flex items-center gap-3">
                  <Fingerprint className="h-4 w-4" style={{ color: gold }} />
                  <div className="text-left">
                    <span className="text-sm font-medium block">Face ID 解鎖</span>
                    <span className={`text-xs ${textMuted}`}>開啟後進入 App 需先驗證</span>
                  </div>
                </div>
                {isNative() ? <Switch on={bioEnabled} /> : <span className={`text-[10px] font-bold ${textMuted}`}>APP ONLY</span>}
              </button>
              <div className="border-t border-black/[0.06] dark:border-white/[0.06]">
                <button onClick={() => isNative() && setNotifyExpanded((v) => !v)} disabled={!isNative()} className="w-full flex items-center justify-between p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] disabled:opacity-50 disabled:hover:bg-transparent transition-colors">
                  <div className="flex items-center gap-3">
                    <Bell className="h-4 w-4" style={{ color: gold }} />
                    <div className="text-left">
                      <span className="text-sm font-medium block">事件提醒通知</span>
                      <span className={`text-xs ${textMuted}`}>財報、除息、配息前一天提醒</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${notifyEnabled ? "text-[#4F7B5E] dark:text-[#7FAE8F]" : textMuted}`}>
                      {isNative() ? `${Object.values(notifyPrefs).filter(Boolean).length}/3 已開啟` : "APP ONLY"}
                    </span>
                    {isNative() && <ChevronRight className={`h-3.5 w-3.5 ${textMuted} transition-transform ${notifyExpanded ? "rotate-90" : ""}`} />}
                  </div>
                </button>
                {notifyExpanded && (
                  <div className="border-t border-black/[0.06] dark:border-white/[0.06]">
                    <button onClick={handleToggleNotify} className="w-full flex items-center justify-between pl-11 pr-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                      <span className="text-sm">{notifyEnabled ? "全部關閉" : "全部開啟"}</span>
                      <Switch on={notifyEnabled} />
                    </button>
                    {[
                      { key: "EARNINGS", label: "財報公佈" },
                      { key: "EX_DIVIDEND", label: "除息/權" },
                      { key: "DIVIDEND_PAY", label: "配息入帳" },
                    ].map((t) => (
                      <button key={t.key} onClick={() => handleToggleNotifyType(t.key)} className="w-full flex items-center justify-between pl-11 pr-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors border-t border-black/[0.05] dark:border-white/[0.05]">
                        <span className="text-sm">{t.label}</span>
                        <Switch on={notifyPrefs[t.key]} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className={`border-t border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between p-4 ${!isNative() ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-3">
                  <Bell className="h-4 w-4" style={{ color: gold }} />
                  <div className="text-left">
                    <span className="text-sm font-medium block">每日記帳提醒</span>
                    <span className={`text-xs ${textMuted}`}>每天固定時間提醒你記帳</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={dailyReminderTime}
                    onChange={(e) => setDailyReminderTime(e.target.value)}
                    disabled={!isNative()}
                    className="font-mono-ledger text-sm bg-transparent border-b border-black/15 dark:border-white/15 disabled:opacity-40"
                  />
                  <button
                    onClick={() => {
                      if (!isNative()) { showToast("通知需在 iOS App 中使用", "error"); return; }
                      setDailyReminderEnabled((v) => !v);
                    }}
                    disabled={!isNative()}
                  >
                    {isNative() ? <Switch on={dailyReminderEnabled} /> : <span className={`text-[10px] font-bold ${textMuted}`}>APP ONLY</span>}
                  </button>
                </div>
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
              {currentUser && (
                <div className="flex items-center justify-between p-4 border-b border-black/[0.06] dark:border-white/[0.06]">
                  <div className="flex items-center gap-3">
                    <AppleIcon className={`h-4 w-4 ${textPrimary}`} />
                    <div>
                      <span className="text-sm font-medium block">Apple 帳號</span>
                      <span className={`text-xs ${textMuted}`}>{currentUser.hasApple ? "已綁定" : "尚未綁定"}</span>
                    </div>
                  </div>
                  {currentUser.hasApple ? (
                    currentUser.hasPassword ? (
                      <button onClick={handleAppleUnlink} disabled={appleUnlinking} className={`text-xs font-semibold ${textMuted} hover:text-[#A24936] transition-colors`}>
                        {appleUnlinking ? "處理中…" : "取消綁定"}
                      </button>
                    ) : (
                      <span className={`text-xs ${textMuted}`}>✓</span>
                    )
                  ) : (
                    <a href="/api/auth/apple" className="text-xs font-semibold" style={{ color: gold }}>綁定</a>
                  )}
                </div>
              )}
              <button onClick={handleLogout} className="w-full flex items-center p-4 gap-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                <LogOut className="h-4 w-4 text-[#A24936]" />
                <span className="text-sm font-medium text-[#A24936]">登出</span>
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden border border-[#A24936]/25 bg-[#A24936]/[0.03]">
              <div className="px-4 py-2 border-b border-[#A24936]/15">
                <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#A24936]">危險操作</p>
              </div>
              <button onClick={() => setShowDeleteConfirm(true)} className="w-full flex items-center p-4 gap-3 hover:bg-[#A24936]/5 transition-colors">
                <AlertTriangle className="h-4 w-4 text-[#A24936]" />
                <span className="text-sm font-medium text-[#A24936]">刪除帳號與所有資料</span>
              </button>
            </div>
            <p className={`text-center text-xs ${textMuted} pb-2`}>Zeno Worth · 版本 1.0</p>
          </div>
        )}
      </div>

      {/* 底部導覽列 — 中央浮動「新增」按鈕（fintech 風） */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-[#12151C] border-t border-black/[0.06] dark:border-white/[0.08] shadow-[0_-8px_28px_rgba(0,0,0,0.1)]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex items-center max-w-lg mx-auto">
          {navItems.slice(0, 2).map(({ key, icon: Icon, label }) => {
            const active = activeTab === key;
            return (
              <button key={key} onClick={() => { void hapticImpact("light"); setActiveTab(key); }} className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors cursor-pointer ${active ? "" : "text-[#3D4136] dark:text-[#C7CBBE]"}`}>
                <Icon className="h-5 w-5" style={active ? { color: gold } : undefined} />
                <span className="text-[10px] font-semibold" style={active ? { color: gold } : undefined}>{label}</span>
              </button>
            );
          })}
          <div className="w-16 shrink-0 flex justify-center">
            <button onClick={() => { void hapticImpact("light"); setShowQuickAdd((v) => !v); }} aria-label="新增" aria-expanded={showQuickAdd} className={`-mt-7 h-14 w-14 rounded-full text-[#241B06] flex items-center justify-center border-4 border-[#EEF0EC] dark:border-[#0B0D12] shadow-[0_10px_22px_-8px_rgba(184,147,60,0.7)] active:scale-95 transition-transform ${showQuickAdd ? "rotate-45" : ""}`} style={{ background: "linear-gradient(135deg, #DCB75F, #B8933C)", transitionProperty: "transform" }}>
              <Plus className="h-6 w-6" />
            </button>
          </div>
          {navItems.slice(2).map(({ key, icon: Icon, label }) => {
            const active = activeTab === key;
            return (
              <button key={key} onClick={() => { void hapticImpact("light"); setActiveTab(key); }} className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors cursor-pointer ${active ? "" : "text-[#3D4136] dark:text-[#C7CBBE]"}`}>
                <Icon className="h-5 w-5" style={active ? { color: gold } : undefined} />
                <span className="text-[10px] font-semibold" style={active ? { color: gold } : undefined}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 中央「＋」快速選單 */}
      {showQuickAdd && (
        <>
          <div className="fixed inset-0 z-30 bg-black/30" onClick={() => setShowQuickAdd(false)} />
          <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[45] w-56" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
            <div className={`${surface} rounded-[20px] overflow-hidden divide-y divide-black/[0.05] dark:divide-white/[0.05] shadow-2xl`}>
              {[
                { label: "新增資產", icon: Wallet, run: () => { resetForm(); setShowForm(true); } },
                { label: "新增負債", icon: AlertTriangle, run: () => { resetForm(); setFormData((f: any) => ({ ...f, type: "LIABILITY", category: "PAYABLE" })); setShowForm(true); } },
                { label: "新增目標", icon: TrendingUp, run: () => { setEditingGoal(null); setGoalForm({ name: "", targetAmount: "", type: "NET_WORTH", accountId: "", emoji: "" }); setShowGoalForm(true); } },
                { label: "手動補登", icon: CalendarDays, run: () => setShowHistoryForm(true) },
              ].map(({ label, icon: Icon, run }) => (
                <button key={label} onClick={() => { setShowQuickAdd(false); void hapticImpact("light"); run(); }} className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-semibold hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors">
                  <Icon className="h-4 w-4" style={{ color: gold }} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* 新增/編輯表單 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-lg max-h-[92vh] overflow-y-auto ${surface} rounded-2xl shadow-2xl`}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/[0.07] dark:border-white/[0.07] bg-white dark:bg-[#12151C] p-5 rounded-t-2xl">
              <h2 className="font-display text-base font-semibold">{editingAccountId ? "編輯資產" : "新增資產"}</h2>
              <button onClick={() => setShowForm(false)} className={`p-2 ${textMuted} transition-colors`}><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className={`block text-xs mb-2 ${sectionLabel}`}>名稱</label>
                  <input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder={formData.category === "BANK_ACCOUNT" ? "例如：薪資帳戶" : "例如：台積電"} className={inputCls} />
                </div>
                {formData.category === "BANK_ACCOUNT" && (
                  <div className="relative">
                    <label className={`block text-xs mb-2 ${sectionLabel}`}>銀行名稱</label>
                    <input
                      value={formData.symbol}
                      onChange={(e) => { setFormData({ ...formData, symbol: e.target.value }); setShowBankSuggestions(true); }}
                      onFocus={() => setShowBankSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowBankSuggestions(false), 150)}
                      placeholder="例如：國泰世華銀行"
                      className={inputCls}
                      autoComplete="off"
                    />
                    {showBankSuggestions && formData.symbol.trim() && (
                      <ul className={`absolute z-10 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg shadow-lg ${surface}`}>
                        {TW_BANKS.filter((b) => b.includes(formData.symbol.trim())).slice(0, 8).map((b) => (
                          <li key={b}>
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setFormData({ ...formData, symbol: b }); setShowBankSuggestions(false); }} className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">{b}</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={`block text-xs mb-2 ${sectionLabel}`}>類型</label>
                    <select value={formData.type} onChange={(e) => {
                      const nextType = e.target.value;
                      const validCategories = categoriesByType[nextType] || [];
                      const nextCategory = validCategories.includes(formData.category) ? formData.category : validCategories[0];
                      const forcedCurrency = nextCategory === "TAIWAN_STOCK" ? "TWD" : nextCategory === "US_STOCK" || nextCategory === "CRYPTO" ? "USD" : formData.currency;
                      setFormData({ ...formData, type: nextType, category: nextCategory, currency: forcedCurrency, isApiConnected: nextCategory === "CRYPTO" ? formData.isApiConnected : false, symbol: "" });
                    }} className={inputCls}>{typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  </div>
                  <div>
                    <label className={`block text-xs mb-2 ${sectionLabel}`}>類別</label>
                    <select value={formData.category} onChange={(e) => { const n = e.target.value; const forcedCurrency = n === "TAIWAN_STOCK" ? "TWD" : n === "US_STOCK" || n === "CRYPTO" ? "USD" : formData.currency; setFormData({ ...formData, category: n, currency: forcedCurrency, isApiConnected: n === "CRYPTO" ? formData.isApiConnected : false, symbol: "" }); }} className={inputCls}>{categoryOptions.filter(o => (categoriesByType[formData.type] || []).includes(o.value)).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {fixedCurrencyCategories.includes(formData.category) ? (
                    <div>
                      <label className={`block text-xs mb-2 ${sectionLabel}`}>幣別</label>
                      <p className={`h-11 flex items-center font-mono-ledger text-sm ${textMuted}`}>{formData.currency}（自動預設）</p>
                    </div>
                  ) : (
                    <div>
                      <label className={`block text-xs mb-2 ${sectionLabel}`}>幣別</label>
                      <select value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })} className={inputCls}>{currencyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                    </div>
                  )}
                  {!showApiFields && (
                    <div>
                      <label className={`block text-xs mb-2 ${sectionLabel}`}>{amountFieldLabel}</label>
                      <input type="number" inputMode="decimal" step="any" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} className={`${inputCls} font-mono-ledger`} />
                      {formData.type === "LIABILITY" && formData.loanStartDate && (
                        <p className={`text-[11px] mt-1.5 ${textMuted}`}>這裡填的是貸款本金（原始總額），目前餘額會依本金＋已繳期數自動算出，顯示在卡片上。</p>
                      )}
                    </div>
                  )}
                </div>
                {requiresSymbol && (
                  <div className="relative">
                    <label className={`block text-xs mb-2 ${sectionLabel}`}>代號 {formData.category === "TAIWAN_STOCK" ? "（可輸入代號或名稱，例如「台積電」或「2330」）" : formData.category === "CRYPTO" ? "（可輸入代號或中英文名稱，例如「比特幣」或「BTC」）" : "（可輸入代號或中英文名稱，例如「蘋果」或「AAPL」）"}</label>
                    <input
                      value={formData.symbol}
                      onChange={(e) => { setFormData({ ...formData, symbol: e.target.value }); setShowSymbolSuggestions(true); }}
                      onFocus={() => setShowSymbolSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSymbolSuggestions(false), 150)}
                      placeholder={formData.category === "TAIWAN_STOCK" ? "例如：台積電 或 2330" : formData.category === "CRYPTO" ? "例如：比特幣 或 BTC" : "例如：蘋果 或 AAPL"}
                      className={`${inputCls} font-mono-ledger`}
                      autoComplete="off"
                    />
                    {showSymbolSuggestions && symbolSuggestions.length > 0 && (
                      <ul className={`absolute z-10 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg shadow-lg ${surface}`}>
                        {symbolSuggestions.map((s) => (
                          <li key={s.symbol}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { setFormData({ ...formData, symbol: s.symbol, name: formData.name.trim() ? formData.name : s.name }); setSymbolSuggestions([]); setShowSymbolSuggestions(false); }}
                              className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-black/[0.04] dark:hover:bg-white/[0.06] flex items-center justify-between gap-2"
                            >
                              <span className="font-mono-ledger font-semibold">{s.symbol}</span>
                              <span className={`text-xs truncate ${textMuted}`}>{s.name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
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
                            <option value="OKX">OKX</option>
                            <option value="COINBASE">Coinbase</option>
                          </select>
                        </div>
                        <div>
                          <label className={`block text-xs mb-2 ${sectionLabel}`}>API Key{editingHasApiCredentials ? "（留空則不變更）" : ""}</label>
                          <input type="password" autoComplete="off" placeholder={editingHasApiCredentials ? "••••••••（已設定）" : ""} value={formData.apiKey} onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })} className={`${inputCls} font-mono-ledger`} />
                        </div>
                        <div>
                          <label className={`block text-xs mb-2 ${sectionLabel}`}>API Secret{editingHasApiCredentials ? "（留空則不變更）" : ""}</label>
                          <input type="password" autoComplete="off" placeholder={editingHasApiCredentials ? "••••••••（已設定）" : ""} value={formData.apiSecret} onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })} className={`${inputCls} font-mono-ledger`} />
                        </div>
                        {exchangesRequiringPassphrase.includes(formData.apiSource) && (
                          <div>
                            <label className={`block text-xs mb-2 ${sectionLabel}`}>Passphrase{editingHasApiCredentials ? "（留空則不變更）" : ""}</label>
                            <input type="password" autoComplete="off" placeholder={editingHasApiCredentials ? "••••••••（已設定）" : ""} value={formData.apiPassphrase} onChange={(e) => setFormData({ ...formData, apiPassphrase: e.target.value })} className={`${inputCls} font-mono-ledger`} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {(formData.type === "LIABILITY" || ["RECEIVABLE", "PAYABLE"].includes(formData.category)) && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={`block text-xs mb-2 ${sectionLabel}`}>每月扣款金額</label>
                      <input type="number" inputMode="decimal" step="any" min="0" placeholder="例如：15000" value={formData.monthlyDeductionAmount} onChange={(e) => setFormData({ ...formData, monthlyDeductionAmount: e.target.value })} className={`${inputCls} font-mono-ledger`} />
                    </div>
                    <div>
                      <label className={`block text-xs mb-2 ${sectionLabel}`}>每月扣款日</label>
                      <input type="number" inputMode="numeric" step="1" min="1" max="31" placeholder="例如：5" value={formData.deductionDate} onChange={(e) => setFormData({ ...formData, deductionDate: e.target.value })} className={`${inputCls} font-mono-ledger`} />
                    </div>
                    <p className={`text-xs ${textMuted} -mt-2 sm:col-span-2`}>每月到扣款日，系統自動從{formData.type === "LIABILITY" ? "負債總額" : "帳戶餘額"}扣除。</p>
                    {formData.type === "LIABILITY" && (
                      <>
                        <div>
                          <label className={`block text-xs mb-2 ${sectionLabel}`}>年利率 %（選填）</label>
                          <input type="number" inputMode="decimal" step="any" min="0" placeholder="例如：2.5" value={formData.interestRate} onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })} className={`${inputCls} font-mono-ledger`} />
                        </div>
                        <div>
                          <label className={`block text-xs mb-2 ${sectionLabel}`}>總期數（選填）</label>
                          <input type="number" inputMode="numeric" step="1" min="1" placeholder="例如：60" value={formData.loanTermMonths} onChange={(e) => setFormData({ ...formData, loanTermMonths: e.target.value })} className={`${inputCls} font-mono-ledger`} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={`block text-xs mb-2 ${sectionLabel}`}>貸款起算日（選填）</label>
                          <input type="date" value={formData.loanStartDate} onChange={(e) => setFormData({ ...formData, loanStartDate: e.target.value })} className={`${inputCls} font-mono-ledger`} />
                        </div>
                        <p className={`text-xs ${textMuted} -mt-2 sm:col-span-2`}>填了年利率後，每次自動扣款會拆出利息，其餘才算還本金；填了總期數則會顯示「已繳/總期數」進度。填了起算日（=第 1 期扣款日），期數會依日期精準推算，不然只能用交易紀錄筆數概算。三者都非必填。</p>
                      </>
                    )}
                  </div>
                )}
                {error && <p className="text-sm font-medium text-[#A24936] bg-[#A24936]/8 p-3 rounded-lg">{error}</p>}
                <div className="flex gap-3 pt-4 border-t border-black/[0.06] dark:border-white/[0.06]">
                  <button type="button" onClick={() => setShowForm(false)} className={`flex-1 py-3 text-sm font-semibold ${textMuted} border border-black/10 dark:border-white/10 rounded-lg cursor-pointer active:scale-[0.97] transition-transform`}>取消</button>
                  <button type="submit" disabled={loading} className="flex-1 py-3 text-sm font-semibold bg-[#1C1F1A] dark:bg-[#B8933C] text-white dark:text-black rounded-lg hover:opacity-90 active:scale-[0.97] transition-transform cursor-pointer">{loading ? "儲存中…" : "確認儲存"}</button>
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
                  <input type="number" inputMode="decimal" placeholder="例如：50000" value={historyFormData.netWorth} onChange={(e) => setHistoryFormData({ ...historyFormData, netWorth: e.target.value })} className={`${inputCls} font-mono-ledger`} required />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-sm ${surface} rounded-2xl shadow-2xl`}>
            <div className="flex items-center justify-between border-b border-black/[0.07] dark:border-white/[0.07] p-5">
              <h2 className="font-display text-base font-semibold">{editingGoal ? "編輯目標" : "新增目標"}</h2>
              <button onClick={() => setShowGoalForm(false)} className={`p-2 ${textMuted}`}><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5">
              <form onSubmit={handleGoalSubmit} className="space-y-4">
                <div>
                  <label className={`block text-xs mb-2 ${sectionLabel}`}>目標名稱</label>
                  <input value={goalForm.name} onChange={e => setGoalForm({ ...goalForm, name: e.target.value })} placeholder="例如：買房頭期款" className={inputCls} required />
                </div>
                <div>
                  <label className={`block text-xs mb-2 ${sectionLabel}`}>目標金額 (NT$)</label>
                  <input type="number" inputMode="decimal" step="any" min="1" value={goalForm.targetAmount} onChange={e => setGoalForm({ ...goalForm, targetAmount: e.target.value })} placeholder="例如：3000000" className={`${inputCls} font-mono-ledger`} required />
                </div>
                <div>
                  <label className={`block text-xs mb-2 ${sectionLabel}`}>計算基準</label>
                  <select value={goalForm.type} onChange={e => setGoalForm({ ...goalForm, type: e.target.value, accountId: "" })} className={inputCls}>
                    <option value="NET_WORTH">總淨資產</option>
                    <option value="ACCOUNT">特定帳戶</option>
                  </select>
                </div>
                {goalForm.type === "ACCOUNT" && (
                  <div>
                    <label className={`block text-xs mb-2 ${sectionLabel}`}>選擇帳戶</label>
                    <select value={goalForm.accountId} onChange={e => setGoalForm({ ...goalForm, accountId: e.target.value })} className={inputCls} required>
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

      {/* 刪除資產確認（資產/負債/目標） */}
      {itemDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className={`w-full sm:max-w-sm ${surface} sm:rounded-2xl rounded-t-2xl shadow-2xl p-6`}>
            <div className="flex items-start gap-4 mb-5">
              <div className="p-2 bg-[#A24936]/10 rounded-xl shrink-0">
                <AlertTriangle className="h-6 w-6 text-[#A24936]" />
              </div>
              <div>
                <h3 className="font-display text-base font-semibold text-[#A24936]">
                  {itemDeleteTarget.kind === "goal" ? "刪除目標" : "刪除資產"}
                </h3>
                <p className={`text-sm ${textMuted} mt-1 leading-relaxed`}>確定要刪除「{itemDeleteTarget.name}」嗎？此操作無法復原。</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setItemDeleteTarget(null)} className={`flex-1 py-3 text-sm font-semibold ${textMuted} border border-black/10 dark:border-white/10 rounded-lg cursor-pointer active:scale-[0.97] transition-transform`}>取消</button>
              <button onClick={confirmItemDelete} disabled={itemDeleting} className="flex-1 py-3 text-sm font-semibold bg-[#A24936] text-white rounded-lg hover:opacity-90 active:scale-[0.97] transition-transform cursor-pointer">
                {itemDeleting ? "刪除中…" : "確認刪除"}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Toast 提示 */}
      <div className="fixed left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center w-full px-4 pointer-events-none" style={{ top: "max(1rem, calc(env(safe-area-inset-top) + 0.5rem))" }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-sm px-4 py-2.5 rounded-lg text-sm font-semibold shadow-lg text-white ${t.kind === "error" ? "bg-[#A24936]" : "bg-[#1C1F1A] dark:bg-[#B8933C] dark:text-black"}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
