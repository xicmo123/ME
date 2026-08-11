// 從原始資料推導出畫面要用的東西。
//
// 這些先前全部是 page.tsx 裡的 useMemo，跟 JSX 混在一起沒辦法單獨閱讀或測試。
// 抽成純函式之後，分頁元件只負責呈現，計算邏輯集中在這裡。

import { ALLOCATION_BUCKETS } from "@/lib/theme";
import { ACCOUNT_GROUPS, symbolRequiredCategories } from "@/lib/constants";
import { toTaipeiDateString, taipeiDateFromToday, todayInTaipei } from "@/lib/date";
import type {
  Account, ActivityLogRecord, Goal, HistoryPoint, TransactionRecord,
} from "@/lib/types";

// ─── 淨值摘要 ─────────────────────────────────────────────────────────────

export type Summary = { totalAssets: number; totalLiabilities: number; netWorth: number };

/**
 * 總資產／總負債／淨資產。
 * 計入所有啟用中的帳戶，**包含**降級後被鎖定的——鎖定只影響互動，不影響金額，
 * 否則訂閱一過期使用者就會看到一個錯誤的淨資產。詳見 lib/entitlements.ts。
 */
export function computeSummary(accounts: Account[]): Summary {
  let totalAssets = 0;
  let totalLiabilities = 0;
  for (const account of accounts) {
    const value = Number(account.currentValue ?? 0);
    if (!Number.isFinite(value)) continue;
    if (account.type === "ASSET") totalAssets += value;
    else totalLiabilities += value;
  }
  return { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities };
}

// ─── 資產配置 ─────────────────────────────────────────────────────────────

export type AllocationRow = { name: string; color: string; value: number };

export function computeAllocation(accounts: Account[]): { rows: AllocationRow[]; total: number } {
  const rows = ALLOCATION_BUCKETS.map((bucket) => ({
    name: bucket.name,
    color: bucket.color,
    value: accounts
      .filter((a) => a.type === "ASSET" && (bucket.cats as readonly string[]).includes(a.category))
      .reduce((sum, a) => sum + Number(a.currentValue ?? 0), 0),
  })).filter((row) => row.value > 0);

  return { rows, total: rows.reduce((sum, row) => sum + row.value, 0) };
}

// ─── 持股成本 ─────────────────────────────────────────────────────────────

export type CostBasis = Record<string, { quantity: number; cost: number }>;

/** 用買賣紀錄推平均成本（賣出時以移動平均扣減） */
export function computeCostBasis(transactions: TransactionRecord[]): CostBasis {
  const basis: CostBasis = {};
  const ordered = [...transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  for (const tx of ordered) {
    if (!tx.account || !symbolRequiredCategories.includes(tx.account.category)) continue;
    const quantity = Number(tx.quantity ?? 0);
    const price = Number(tx.price ?? 0);
    const key = `${tx.account.symbol}::${tx.account.name}`;
    basis[key] ??= { quantity: 0, cost: 0 };

    if (tx.type === "BUY" && quantity > 0 && price > 0) {
      basis[key].quantity += quantity;
      basis[key].cost += quantity * price;
    }
    if (tx.type === "SELL" && quantity > 0 && basis[key].quantity > 0) {
      const avgCost = basis[key].cost / basis[key].quantity;
      const soldQty = Math.min(quantity, basis[key].quantity);
      basis[key].quantity -= soldQty;
      basis[key].cost = Math.max(0, basis[key].cost - avgCost * soldQty);
    }
  }
  return basis;
}

// ─── 帳戶分組 ─────────────────────────────────────────────────────────────

export type AccountCard = {
  id: string;
  title: string;
  subtitle: string | null;
  category: string;
  quantity: number;
  currentValue: number;
  currentPrice: number | null;
  avgCost: number | null;
  costChangePct: number | null;
  dayChangePct: number | null;
  account: Account;
};

export type AccountGroup = {
  title: string;
  color: string;
  defaultCategory: string;
  defaultType: string;
  cards: AccountCard[];
  total: number;
};

/** 把帳戶依三大分組整理成卡片；同代號同名稱的持倉會被合併成一張 */
export function buildAccountGroups(accounts: Account[], costBasis: CostBasis): AccountGroup[] {
  return ACCOUNT_GROUPS.map((group): AccountGroup | null => {
    // 負債總額只看 type，不受分類白名單限制：任何被標記為負債的帳戶都要算進來
    const relevant =
      group.title === "負債總額"
        ? accounts.filter((a) => a.type === "LIABILITY")
        : accounts.filter(
            (a) => (group.categories as readonly string[]).includes(a.category) && a.type !== "LIABILITY"
          );

    if (relevant.length === 0) return null;

    const byKey = new Map<string, AccountCard>();
    for (const account of relevant) {
      const isSymbolBased = symbolRequiredCategories.includes(account.category);
      const key = isSymbolBased ? `${account.symbol}::${account.name}` : account.name.toLowerCase();
      const existing = byKey.get(key);

      if (!existing) {
        const basis = costBasis[key];
        const avgCost = basis?.quantity ? basis.cost / basis.quantity : null;
        byKey.set(key, {
          id: key,
          title: isSymbolBased ? account.symbol || account.name : account.name,
          subtitle: isSymbolBased
            ? account.name
            : account.category === "BANK_ACCOUNT"
              ? account.symbol
              : null,
          category: account.category,
          quantity: Number(account.quantity ?? 0),
          currentValue: Number(account.currentValue ?? 0),
          currentPrice: account.currentPrice,
          avgCost,
          costChangePct:
            avgCost && account.currentPrice
              ? ((Number(account.currentPrice) - avgCost) / avgCost) * 100
              : null,
          dayChangePct: Number.isFinite(Number(account.dayChangePct)) ? Number(account.dayChangePct) : null,
          account,
        });
        continue;
      }

      existing.quantity += Number(account.quantity ?? 0);
      existing.currentValue += Number(account.currentValue ?? 0);
      if (!existing.currentPrice && account.currentPrice) existing.currentPrice = account.currentPrice;
      if (existing.dayChangePct == null && Number.isFinite(Number(account.dayChangePct))) {
        existing.dayChangePct = Number(account.dayChangePct);
      }
    }

    const cards = [...byKey.values()].sort((a, b) => b.currentValue - a.currentValue);
    return {
      title: group.title,
      color: group.color,
      defaultCategory: group.defaultCategory,
      defaultType: group.defaultType,
      cards,
      total: cards.reduce((sum, card) => sum + card.currentValue, 0),
    };
  }).filter((group): group is AccountGroup => group !== null);
}

/** 依關鍵字過濾分組（名稱、代號、分類、分組名都能命中） */
export function filterAccountGroups(groups: AccountGroup[], query: string): AccountGroup[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return groups;

  return groups
    .map((group) => ({
      ...group,
      cards: group.cards.filter((card) =>
        [group.title, card.title, card.subtitle, card.category, card.account.name, card.account.symbol]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle)
      ),
    }))
    .filter((group) => group.cards.length > 0);
}

// ─── 歷史走勢 ─────────────────────────────────────────────────────────────

export type ChartPoint = { label: string; date: string; netWorth: number; started: boolean };

/**
 * 把歷史快照攤平成「每天一個點」的序列。
 * 第一筆真實資料出現前以 0 呈現（避免圖表斷點看起來像資料遺失），之後空缺沿用前一天。
 */
export function buildChartSeries(
  history: HistoryPoint[],
  timeframe: string,
  currentNetWorth: number,
  customRange?: { start: string; end: string } | null
): ChartPoint[] {
  const historyMap = new Map<string, number>();
  for (const point of history) {
    const value = Number(point.netWorth);
    if (Number.isFinite(value)) historyMap.set(toTaipeiDateString(point.date), value);
  }
  // 今天永遠使用即時淨資產，而不是今天稍早寫入的快照
  historyMap.set(todayInTaipei(), currentNetWorth);

  const days: string[] = [];
  if (timeframe === "custom" && customRange?.start && customRange?.end) {
    const cursor = new Date(`${customRange.start}T00:00:00`);
    const end = new Date(`${customRange.end}T00:00:00`);
    while (cursor <= end) {
      days.push(toTaipeiDateString(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    const windowDays = timeframe === "day" ? 14 : timeframe === "month" ? 180 : 365;
    for (let i = windowDays - 1; i >= 0; i--) days.push(taipeiDateFromToday(-i));
  }

  // 區間短就每兩天標一次 M/D；區間長就每個月第一次出現時標「N月」
  const useDailyLabel = days.length <= 20;
  const seenMonths = new Set<string>();
  let started = false;
  let lastKnown = 0;

  return days.map((dateStr, index) => {
    if (historyMap.has(dateStr)) {
      lastKnown = historyMap.get(dateStr)!;
      started = true;
    }

    const [year, month, day] = dateStr.split("-");
    let label = "";
    if (useDailyLabel) {
      if ((days.length - 1 - index) % 2 === 0) label = `${Number(month)}/${Number(day)}`;
    } else {
      const monthKey = `${year}-${month}`;
      if (!seenMonths.has(monthKey)) {
        seenMonths.add(monthKey);
        label = `${Number(month)}月`;
      }
    }

    return { label, date: dateStr, netWorth: started ? lastKnown : 0, started };
  });
}

/** 資產 vs 負債分解：沿用走勢圖的時間軸，把歷史快照前向填充上去 */
export function buildAssetLiabilitySeries(chartData: ChartPoint[], history: HistoryPoint[]) {
  if (chartData.length === 0) return [];
  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let index = 0;
  let lastAssets = 0;
  let lastLiabilities = 0;
  let started = false;

  return chartData.map((point) => {
    const cutoff = new Date(`${point.date}T23:59:59`).getTime();
    while (index < sorted.length && new Date(sorted[index].date).getTime() <= cutoff) {
      lastAssets = Number(sorted[index].totalAssets ?? 0);
      lastLiabilities = Number(sorted[index].totalLiabilities ?? 0);
      started = true;
      index++;
    }
    return {
      date: point.date,
      label: point.label,
      assets: started ? lastAssets : 0,
      liabilities: started ? lastLiabilities : 0,
    };
  });
}

export type PeriodStats = {
  delta: number;
  pct: number | null;
  high: ChartPoint;
  low: ChartPoint;
  dailyAvg: number;
  days: number;
  first: ChartPoint;
  last: ChartPoint;
};

export function computePeriodStats(chartData: ChartPoint[]): PeriodStats | null {
  const points = chartData.filter((point) => point.started);
  if (points.length < 2) return null;

  const first = points[0];
  const last = points[points.length - 1];
  let high = first;
  let low = first;
  for (const point of points) {
    if (point.netWorth > high.netWorth) high = point;
    if (point.netWorth < low.netWorth) low = point;
  }

  const delta = last.netWorth - first.netWorth;
  const days = Math.max(
    1,
    (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86_400_000
  );

  return {
    delta,
    pct: first.netWorth ? (delta / Math.abs(first.netWorth)) * 100 : null,
    high,
    low,
    dailyAvg: delta / days,
    days: Math.round(days),
    first,
    last,
  };
}

/** 每個月最後一筆快照跟前月比，最多 12 個月 */
export function computeMonthlyDeltas(history: HistoryPoint[]) {
  if (history.length < 2) return [];
  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const lastPerMonth = new Map<string, number>();
  for (const point of sorted) {
    const date = new Date(point.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    lastPerMonth.set(key, Number(point.netWorth));
  }

  const keys = [...lastPerMonth.keys()].sort();
  const deltas: { key: string; label: string; delta: number }[] = [];
  for (let i = 1; i < keys.length; i++) {
    const month = keys[i].split("-")[1];
    deltas.push({
      key: keys[i],
      label: `${Number(month)}月`,
      delta: lastPerMonth.get(keys[i])! - lastPerMonth.get(keys[i - 1])!,
    });
  }
  return deltas.slice(-12);
}

export function computeGrowthStreak(monthlyDeltas: { delta: number }[]): number {
  let streak = 0;
  for (let i = monthlyDeltas.length - 1; i >= 0 && monthlyDeltas[i].delta > 0; i--) streak++;
  return streak;
}

/** 上月最後一筆快照 vs 前月最後一筆快照 */
export function computeMonthlyReport(history: HistoryPoint[]) {
  if (history.length < 2) return null;
  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const reversed = [...sorted].reverse();
  const endOfPrev = reversed.find((point) => {
    const date = new Date(point.date);
    return date < startOfThisMonth && date >= startOfPrevMonth;
  });
  const endOfBefore = reversed.find((point) => new Date(point.date) < startOfPrevMonth);
  if (!endOfPrev || !endOfBefore || !Number(endOfBefore.netWorth)) return null;

  const delta = Number(endOfPrev.netWorth) - Number(endOfBefore.netWorth);
  return {
    month: startOfPrevMonth.getMonth() + 1,
    delta,
    pct: (delta / Math.abs(Number(endOfBefore.netWorth))) * 100,
  };
}

/** 今日淨資產 vs 昨日快照 */
export function computeDailyChange(history: HistoryPoint[], currentNetWorth: number) {
  if (history.length === 0) return null;
  const yesterday = taipeiDateFromToday(-1);
  const point = history.find((h) => toTaipeiDateString(h.date) === yesterday);
  if (!point || !Number(point.netWorth)) return null;

  const base = Number(point.netWorth);
  const delta = currentNetWorth - base;
  return { delta, pct: (delta / Math.abs(base)) * 100 };
}

/** 近半年平均月增額，給目標達成預測用；資料太短就回 null（預測沒意義） */
export function computeMonthlyGrowth(history: HistoryPoint[]): number | null {
  if (history.length < 2) return null;
  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const cutoff = Date.now() - 180 * 86_400_000;
  const recent = sorted.filter((point) => new Date(point.date).getTime() >= cutoff);
  const series = recent.length >= 2 ? recent : sorted;

  const first = series[0];
  const last = series[series.length - 1];
  const days = (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86_400_000;
  if (days < 14) return null;

  return ((Number(last.netWorth) - Number(first.netWorth)) / days) * 30.4;
}

/** 自成立以來的年化報酬率（CAGR） */
export function computeInceptionCagr(history: HistoryPoint[], currentNetWorth: number) {
  if (history.length === 0) return null;
  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const first = sorted[0];
  const firstNetWorth = Number(first.netWorth);
  const days = (Date.now() - new Date(first.date).getTime()) / 86_400_000;
  if (!Number.isFinite(firstNetWorth) || firstNetWorth <= 0 || days < 30) return null;

  const years = days / 365;
  const cagr = (Math.pow(currentNetWorth / firstNetWorth, 1 / years) - 1) * 100;
  if (!Number.isFinite(cagr)) return null;
  return { cagr, years, since: first.date };
}

/** 今年至今的淨值變化 + 表現最好／最差的月份 */
export function computeYearReport(
  history: HistoryPoint[],
  monthlyDeltas: { key: string; label: string; delta: number }[]
) {
  if (history.length < 2) return null;
  const year = new Date().getFullYear();
  const yearStart = `${year}-01-01`;
  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const inYear = sorted.filter((point) => toTaipeiDateString(point.date) >= yearStart);
  if (inYear.length < 2) return null;

  const startNetWorth = Number(inYear[0].netWorth);
  const endNetWorth = Number(inYear[inYear.length - 1].netWorth);
  const delta = endNetWorth - startNetWorth;

  let best: (typeof monthlyDeltas)[number] | null = null;
  let worst: (typeof monthlyDeltas)[number] | null = null;
  for (const month of monthlyDeltas) {
    if (!best || month.delta > best.delta) best = month;
    if (!worst || month.delta < worst.delta) worst = month;
  }

  return {
    year,
    delta,
    pct: startNetWorth ? (delta / Math.abs(startNetWorth)) * 100 : null,
    startNetWorth,
    endNetWorth,
    best,
    worst,
  };
}

/** 情境模擬：現有淨值 + 每月加碼，用年金終值公式推算 */
export function computeWhatIf(
  netWorth: number,
  monthly: number,
  years: number,
  annualRatePct: number
) {
  if (years <= 0 || netWorth <= 0) return null;
  const monthlyRate = annualRatePct / 100 / 12;
  const months = Math.round(years * 12);

  const growthOnly = monthlyRate === 0 ? netWorth : netWorth * Math.pow(1 + monthlyRate, months);
  const fromContrib =
    monthlyRate === 0
      ? monthly * months
      : monthly * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);

  return {
    total: growthOnly + fromContrib,
    growthOnly,
    contributed: monthly * months,
    fromContribGrowth: fromContrib - monthly * months,
  };
}

// ─── 近期紀錄 ─────────────────────────────────────────────────────────────

export type ActivityItem = {
  kind: "tx" | "log";
  id: string;
  type: string;
  date: string;
  amount: number | null;
  description: string | null;
  accountName: string | null;
  quantity: number | null;
  price: number | null;
};

/** 金錢異動（transactions）與帳戶異動（activityLogs）合併成一條時間軸 */
export function combineActivity(
  transactions: TransactionRecord[],
  activityLogs: ActivityLogRecord[]
): ActivityItem[] {
  const items: ActivityItem[] = [
    ...transactions.map((tx) => ({
      kind: "tx" as const,
      id: `tx-${tx.id}`,
      type: tx.type,
      date: tx.date,
      amount: tx.amount,
      description: tx.description,
      accountName: tx.account?.name ?? null,
      quantity: tx.quantity,
      price: tx.price,
    })),
    ...activityLogs.map((log) => ({
      kind: "log" as const,
      id: `log-${log.id}`,
      type: log.type,
      date: log.createdAt,
      amount: log.amount,
      description: log.description,
      accountName: null,
      quantity: null,
      price: null,
    })),
  ];
  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ─── 其他 ─────────────────────────────────────────────────────────────────

/** 目標達成預估日期；推不出來就回 null（不顯示，而不是顯示錯的） */
export function computeGoalEta(
  goal: Goal,
  accounts: Account[],
  monthlyGrowth: number | null
): string | null {
  if (goal.progress >= 100) return null;

  let months: number;
  if (goal.type === "DEBT_PAYOFF") {
    // 清償負債的速度跟淨資產整體成長率無關，要用這個帳戶的每月扣款金額推算
    const account = accounts.find((a) => a.id === goal.accountId);
    const monthlyPace = Number(account?.monthlyDeductionAmount ?? 0);
    if (!monthlyPace || monthlyPace <= 0) return null;
    months = Number(goal.remaining ?? 0) / monthlyPace;
  } else {
    if (!monthlyGrowth || monthlyGrowth <= 0) return null;
    months = (Number(goal.targetAmount) - Number(goal.currentAmount)) / monthlyGrowth;
  }

  if (!Number.isFinite(months) || months <= 0 || months > 240) return null;
  const eta = new Date();
  eta.setMonth(eta.getMonth() + Math.ceil(months));
  return `${eta.getFullYear()}/${eta.getMonth() + 1}`;
}

/** 資料健康狀態：最後同步時間與異常筆數 */
export function computeDataHealth(accounts: Account[]) {
  const timestamps = accounts
    .map((a) => a.lastApiSyncAt ?? a.updatedAt)
    .filter(Boolean)
    .map((value) => new Date(value as string).getTime())
    .filter(Number.isFinite);

  return {
    lastSync: timestamps.length ? new Date(Math.max(...timestamps)) : null,
    syncErrors: accounts.filter((a) => a.apiSyncError).length,
  };
}

/** 行事曆：持有中的股票代號（帶上 Yahoo 的市場後綴） */
export function computeHeldStockSymbols(accounts: Account[]): string[] {
  const suffixByCategory: Record<string, string> = {
    TAIWAN_STOCK: ".TW", JAPAN_STOCK: ".T", KOREA_STOCK: ".KS",
  };
  const calendarCategories = ["TAIWAN_STOCK", "US_STOCK", "JAPAN_STOCK", "KOREA_STOCK"];

  const symbols = accounts
    .filter((a) => a.isActive !== false && calendarCategories.includes(a.category) && a.symbol)
    .map((a) => {
      const suffix = suffixByCategory[a.category];
      if (!suffix) return String(a.symbol);
      return `${String(a.symbol).replace(new RegExp(`\\${suffix}$`, "i"), "")}${suffix}`;
    });

  return [...new Set(symbols)];
}

/** 月曆網格：補齊前後空格，每列七天 */
export function buildCalendarWeeks(month: Date): (Date | null)[][] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const startOffset = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells: (Date | null)[] = [
    ...Array<null>(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, monthIndex, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
