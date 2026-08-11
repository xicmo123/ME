// 前端共用的資料型別。
//
// 先前 page.tsx 幾乎所有 state 都是 `any[]`（accounts、goals、history、transactions…），
// TypeScript 等於沒有發揮作用——欄位打錯字、忘記處理 null 都要等到 runtime 才會發現。
// 這裡用字面值 union 而非從 @prisma/client 匯入 enum，避免把 Prisma 拉進 client bundle。

export type AccountType = "ASSET" | "LIABILITY";

export type AccountCategory =
  | "CASH"
  | "BANK_ACCOUNT"
  | "TAIWAN_STOCK"
  | "US_STOCK"
  | "JAPAN_STOCK"
  | "KOREA_STOCK"
  | "CRYPTO"
  | "FIXED_ASSET"
  | "RECEIVABLE"
  | "PAYABLE"
  | "MORTGAGE"
  | "CAR_LOAN"
  | "CREDIT_LOAN";

export type TransactionType =
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "BUY"
  | "SELL"
  | "LOAN_PAYMENT"
  | "AUTO_DEDUCTION";

export type ActivityType =
  | "ACCOUNT_CREATED"
  | "ACCOUNT_UPDATED"
  | "ACCOUNT_ARCHIVED"
  | "ACCOUNT_RESTORED"
  | "ACCOUNT_DELETED";

export type CurrencyCode =
  | "TWD" | "USD" | "JPY" | "KRW" | "EUR"
  | "GBP" | "HKD" | "CNY" | "AUD" | "CAD" | "SGD";

export type GoalType = "NET_WORTH" | "ACCOUNT" | "DEBT_PAYOFF";

/** /api/accounts 回傳的形狀（API Key/Secret 已在後端剝除） */
export type Account = {
  id: string;
  name: string;
  type: AccountType;
  category: AccountCategory;
  symbol: string | null;
  quantity: number | null;
  currentPrice: number | null;
  dayChangePct: number | null;
  currentValue: number;
  currency: CurrencyCode;
  isApiConnected: boolean;
  apiSource: string | null;
  lastApiSyncAt: string | null;
  apiSyncError: string | null;
  monthlyDeductionAmount: number | null;
  deductionDate: number | null;
  deductFromAccountId: string | null;
  interestRate: number | null;
  loanTermMonths: number | null;
  loanStartDate: string | null;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // 後端額外算好回傳的衍生欄位
  hasApiCredentials: boolean;
  paidInstallments: number | null;
  isLocked: boolean;
};

/** /api/goals 回傳的形狀（progress / currentAmount / remaining 由後端算好） */
export type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  type: GoalType;
  accountId: string | null;
  /** 欄位名稱叫 emoji 但實際存的是 GOAL_ICONS 的 key，不是真的 emoji */
  emoji: string | null;
  isActive: boolean;
  createdAt: string;
  progress: number;
  currentAmount: number;
  remaining?: number;
};

export type TransactionRecord = {
  id: string;
  accountId: string;
  type: TransactionType;
  amount: number;
  quantity: number | null;
  price: number | null;
  description: string | null;
  date: string;
  account?: { name: string; symbol: string | null; category: AccountCategory } | null;
};

export type ActivityLogRecord = {
  id: string;
  type: ActivityType;
  description: string;
  amount: number | null;
  createdAt: string;
};

export type HistoryPoint = {
  id: string;
  date: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  breakdown: string;
};

export type StockEventType = "EARNINGS" | "EX_DIVIDEND" | "DIVIDEND_PAY" | "CUSTOM";

export type StockEvent = {
  symbol: string;
  name: string;
  date: string;
  type: StockEventType;
  amountPerShare?: number;
  amountPerShareIsAnnualized?: boolean;
  id?: string;
};

export type CalendarEventRecord = {
  id: string;
  title: string;
  eventAt: string;
};

export type Entitlements = {
  tier: "FREE" | "PRO";
  isPro: boolean;
  limits: { maxAccounts: number | null; maxGoals: number | null };
  features: {
    apiSync: boolean;
    csvExport: boolean;
    recurringTransactions: boolean;
    autoSync: boolean;
    extendedTrendRange: boolean;
    scenarioSimulator: boolean;
    annualReport: boolean;
  };
  manualSyncLimitPerDay: number | null;
};

export type CurrentUser = {
  id: string;
  email: string;
  hasGoogle: boolean;
  hasApple: boolean;
  hasPassword: boolean;
  emailVerified: boolean;
  entitlements: Entitlements;
};

export type SyncStatus = {
  limit: number | null;
  used: number;
  remaining: number | null;
  resetAt: string | null;
};

export type ToastKind = "success" | "error";

export type Toast = {
  id: number;
  message: string;
  kind: ToastKind;
  /** 可復原的操作（例如封存資產）帶一顆 Undo 按鈕，而不是只在文字裡叫使用者自己去設定頁找 */
  undo?: { label: string; run: () => void | Promise<void> };
};

export type Tab = "overview" | "calendar" | "trends" | "settings";
