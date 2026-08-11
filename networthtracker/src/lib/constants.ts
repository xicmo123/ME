// 全站共用的選單資料、標籤對照與圖示對照。
// 先前這些都定義在 page.tsx 的最上方，拆成多個分頁元件之後需要共用。

import {
  Bitcoin, Briefcase, Building2, Car, CreditCard, GraduationCap, HandCoins, Heart,
  Home, Landmark, PiggyBank, Plane, Receipt, Target, TrendingUp, Wallet, type LucideIcon,
} from "lucide-react";
import { COLORS, GROUP_COLORS } from "@/lib/theme";
import type { AccountCategory, CurrencyCode, StockEventType } from "@/lib/types";

export const typeOptions = [
  { value: "ASSET", label: "資產" },
  { value: "LIABILITY", label: "負債" },
] as const;

export const categoryOptions: { value: AccountCategory; label: string }[] = [
  { value: "CASH", label: "現金" },
  { value: "BANK_ACCOUNT", label: "銀行帳戶" },
  { value: "TAIWAN_STOCK", label: "台股" },
  { value: "US_STOCK", label: "美股" },
  { value: "JAPAN_STOCK", label: "日股" },
  { value: "KOREA_STOCK", label: "韓股" },
  { value: "CRYPTO", label: "虛擬貨幣" },
  { value: "FIXED_ASSET", label: "固定資產" },
  { value: "RECEIVABLE", label: "應收款" },
  { value: "PAYABLE", label: "應付款" },
  { value: "MORTGAGE", label: "房貸" },
  { value: "CAR_LOAN", label: "車貸" },
  { value: "CREDIT_LOAN", label: "信用貸款" },
];

export const categoryLabelMap: Record<string, string> = Object.fromEntries(
  categoryOptions.map((option) => [option.value, option.label])
);

export const currencyOptions: { value: CurrencyCode; label: string }[] = [
  { value: "TWD", label: "🇹🇼 TWD" },
  { value: "USD", label: "🇺🇸 USD" },
  { value: "JPY", label: "🇯🇵 JPY" },
  { value: "KRW", label: "🇰🇷 KRW" },
  { value: "EUR", label: "🇪🇺 EUR" },
  { value: "GBP", label: "🇬🇧 GBP" },
  { value: "HKD", label: "🇭🇰 HKD" },
  { value: "CNY", label: "🇨🇳 CNY" },
  { value: "AUD", label: "🇦🇺 AUD" },
  { value: "CAD", label: "🇨🇦 CAD" },
  { value: "SGD", label: "🇸🇬 SGD" },
];

// 類別圖示：單色線條 icon，不用國旗——四個國家的股票類別共用同一個圖示，靠分組色分辨
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  CASH: Wallet, BANK_ACCOUNT: Landmark,
  TAIWAN_STOCK: TrendingUp, US_STOCK: TrendingUp, JAPAN_STOCK: TrendingUp, KOREA_STOCK: TrendingUp,
  CRYPTO: Bitcoin, FIXED_ASSET: Building2, RECEIVABLE: HandCoins,
  PAYABLE: Receipt, MORTGAGE: Home, CAR_LOAN: Car, CREDIT_LOAN: CreditCard,
};

export const fixedCurrencyByCategory: Partial<Record<AccountCategory, CurrencyCode>> = {
  TAIWAN_STOCK: "TWD", US_STOCK: "USD", CRYPTO: "USD", JAPAN_STOCK: "JPY", KOREA_STOCK: "KRW",
};

export const symbolRequiredCategories: AccountCategory[] = [
  "TAIWAN_STOCK", "US_STOCK", "JAPAN_STOCK", "KOREA_STOCK", "CRYPTO",
];

export const amountInputCategories: AccountCategory[] = [
  "CASH", "BANK_ACCOUNT", "FIXED_ASSET", "RECEIVABLE", "PAYABLE", "MORTGAGE", "CAR_LOAN", "CREDIT_LOAN",
];

// 類別依「資產/負債」分組：類型切換時用來重設類別，避免選出「資產」+「應付款」這種兜不起來的組合
export const categoriesByType: Record<string, AccountCategory[]> = {
  ASSET: ["CASH", "BANK_ACCOUNT", "TAIWAN_STOCK", "US_STOCK", "JAPAN_STOCK", "KOREA_STOCK", "CRYPTO", "FIXED_ASSET", "RECEIVABLE"],
  LIABILITY: ["PAYABLE", "MORTGAGE", "CAR_LOAN", "CREDIT_LOAN"],
};

export const exchangesRequiringPassphrase = ["OKX"];

export const defaultAccountForm = {
  name: "", type: "ASSET", category: "CASH" as AccountCategory, symbol: "", quantity: "",
  currency: "TWD" as CurrencyCode, isApiConnected: false, apiSource: "BITFINEX",
  apiKey: "", apiSecret: "", apiPassphrase: "", monthlyDeductionAmount: "", deductionDate: "",
  interestRate: "", loanTermMonths: "", loanStartDate: "", deductFromAccountId: "",
};

export type AccountFormState = typeof defaultAccountForm;

// 帳戶分組：總覽頁的三大區塊
export const ACCOUNT_GROUPS = [
  {
    title: "流動資金",
    color: GROUP_COLORS.liquid,
    categories: ["BANK_ACCOUNT", "CASH", "FIXED_ASSET", "RECEIVABLE"] as AccountCategory[],
    defaultCategory: "CASH" as AccountCategory,
    defaultType: "ASSET",
  },
  {
    title: "投資組合",
    color: GROUP_COLORS.portfolio,
    categories: ["TAIWAN_STOCK", "US_STOCK", "JAPAN_STOCK", "KOREA_STOCK", "CRYPTO"] as AccountCategory[],
    defaultCategory: "TAIWAN_STOCK" as AccountCategory,
    defaultType: "ASSET",
  },
  {
    title: "負債總額",
    color: GROUP_COLORS.liability,
    categories: ["PAYABLE", "MORTGAGE", "CAR_LOAN", "CREDIT_LOAN"] as AccountCategory[],
    defaultCategory: "PAYABLE" as AccountCategory,
    defaultType: "LIABILITY",
  },
] as const;

// 目標圖示：使用者自選一個代表這個目標的 icon（存在 Goal.emoji 欄位，其實存的是 icon key）
export const GOAL_ICONS: Record<string, LucideIcon> = {
  home: Home, plane: Plane, car: Car, education: GraduationCap,
  savings: PiggyBank, family: Heart, career: Briefcase, target: Target,
};

export const GOAL_ICON_CHOICES: { key: string; icon: LucideIcon; label: string }[] = [
  { key: "target", icon: Target, label: "通用" },
  { key: "home", icon: Home, label: "買房" },
  { key: "plane", icon: Plane, label: "旅遊" },
  { key: "car", icon: Car, label: "買車" },
  { key: "education", icon: GraduationCap, label: "教育" },
  { key: "savings", icon: PiggyBank, label: "儲蓄" },
  { key: "family", icon: Heart, label: "家庭" },
  { key: "career", icon: Briefcase, label: "職涯" },
];

// 基準指數：實際行情由 /api/benchmark 透過 Yahoo Finance 抓取。
// 顏色刻意跟「你的淨值」的金色以及彼此的色相都拉開差距，全部疊在一起時仍容易區分。
export const BENCHMARKS: Record<string, { label: string; color: string }> = {
  tw0050: { label: "0050", color: "#2CA02C" },
  sp500: { label: "S&P 500", color: "#1F77B4" },
  nasdaq: { label: "那斯達克", color: "#9467BD" },
  taiex: { label: "加權指數", color: "#D62728" },
  btc: { label: "比特幣", color: "#17BECF" },
};

// 「近期紀錄」把 Transaction 與 ActivityLog 合併成一條時間軸，兩邊的類型共用這份對照
export const ACTIVITY_META: Record<string, { label: string; sign: "+" | "−" | ""; color: string }> = {
  DEPOSIT: { label: "存入", sign: "+", color: COLORS.sage },
  WITHDRAWAL: { label: "轉出", sign: "−", color: COLORS.brick },
  BUY: { label: "買入", sign: "−", color: COLORS.slateBlue },
  SELL: { label: "賣出", sign: "+", color: COLORS.sage },
  LOAN_PAYMENT: { label: "還款", sign: "−", color: COLORS.gold },
  AUTO_DEDUCTION: { label: "自動扣款", sign: "−", color: COLORS.gold },
  ACCOUNT_CREATED: { label: "新增", sign: "", color: COLORS.sage },
  ACCOUNT_UPDATED: { label: "編輯", sign: "", color: COLORS.slateBlue },
  ACCOUNT_ARCHIVED: { label: "封存", sign: "", color: COLORS.brick },
  ACCOUNT_RESTORED: { label: "復原", sign: "", color: COLORS.sage },
  ACCOUNT_DELETED: { label: "刪除", sign: "", color: COLORS.brick },
};

export const EVENT_TYPE_META: Record<StockEventType, { label: string; color: string }> = {
  EARNINGS: { label: "財報", color: COLORS.slateBlue },
  EX_DIVIDEND: { label: "除息/權", color: COLORS.clay },
  DIVIDEND_PAY: { label: "配息入帳", color: COLORS.sage },
  CUSTOM: { label: "行事曆", color: COLORS.orchid },
};

export const NOTIFY_TYPE_OPTIONS = [
  { key: "EARNINGS", label: "財報公佈" },
  { key: "EX_DIVIDEND", label: "除息/權" },
  { key: "DIVIDEND_PAY", label: "配息入帳" },
  { key: "CALENDAR_EVENT", label: "行事曆事件（時間一到即提醒）" },
] as const;
