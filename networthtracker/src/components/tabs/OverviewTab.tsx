"use client";

import { memo, useDeferredValue, useMemo, useState } from "react";
import {
  ChevronRight, Eye, EyeOff, Home, Landmark, Lock, Moon, NotebookText, Plus,
  RefreshCw, Search, Sun, TrendingUp, Wallet, X,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { HERO_THEMES } from "@/lib/hero-theme";
import { CATEGORY_ICONS, categoryLabelMap, symbolRequiredCategories } from "@/lib/constants";
import { filterAccountGroups, type AccountCard, type AccountGroup, type Summary } from "@/lib/derive";
import { formatCompactNumber, formatCurrency, formatInteger, formatMoney, MASKED_AMOUNT } from "@/lib/format";
import {
  CARD_TITLE_CLASS, COLORS, deltaColorForTheme, ICON_BTN_CLASS,
  SURFACE_CLASS, TEXT_MUTED_CLASS, TEXT_PRIMARY_CLASS,
} from "@/lib/theme";
import type { Account, CurrentUser, Goal } from "@/lib/types";
import { GoalList } from "@/components/GoalList";

export type OverviewTabProps = {
  accounts: Account[];
  accountGroups: AccountGroup[];
  goals: Goal[];
  summary: Summary;
  allocation: { rows: { name: string; color: string; value: number }[]; total: number };
  monthlyReport: { month: number; delta: number; pct: number } | null;
  dailyChange: { delta: number; pct: number } | null;
  lockedGoalIds: Set<string>;
  currentUser: CurrentUser | null;
  accountsLoaded: boolean;
  lastSync: Date | null;
  hideBalance: boolean;
  onToggleHideBalance: () => void;
  displayCurrency: "TWD" | "USD";
  onToggleDisplayCurrency: () => void;
  exchangeRate: number | null;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  syncing: boolean;
  onSyncPrices: () => void;
  onOpenActivityLog: () => void;
  onOpenAccountDetail: (card: AccountCard) => void;
  onCreateAccount: (preset: { type: string; category: string; currency?: string }) => void;
  onOpenPlans: () => void;
  onCreateGoal: () => void;
  onEditGoal: (goal: Goal) => void;
  onDeleteGoal: (goal: Goal) => void;
  goalEta: (goal: Goal) => string | null;
};

const todayLabel = () => {
  const now = new Date();
  return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;
};

export function OverviewTab(props: OverviewTabProps) {
  const {
    accounts, accountGroups, goals, summary, allocation, monthlyReport, dailyChange,
    lockedGoalIds, currentUser, accountsLoaded, lastSync, hideBalance, onToggleHideBalance,
    displayCurrency, onToggleDisplayCurrency, exchangeRate, isDarkMode, onToggleDarkMode,
    syncing, onSyncPrices, onOpenActivityLog, onOpenAccountDetail, onCreateAccount,
    onOpenPlans, onCreateGoal, onEditGoal, onDeleteGoal, goalEta,
  } = props;

  const [search, setSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // 搜尋框每打一個字就重算分組會讓輸入變鈍（尤其帳戶多的時候）。
  // useDeferredValue 讓輸入框本身立刻更新，清單過濾則在下一個較低優先度的 render 才跟上。
  const deferredSearch = useDeferredValue(search);
  const visibleGroups = useMemo(
    () => filterAccountGroups(accountGroups, deferredSearch),
    [accountGroups, deferredSearch]
  );

  // 有任何一塊小到看不見時就別加 paddingAngle，否則整個圓環會畫不出來（見下方註解）
  const hasTinySlice = useMemo(
    () => allocation.total > 0 && allocation.rows.some((row) => row.value / allocation.total < 0.01),
    [allocation]
  );

  const heroTheme = HERO_THEMES[isDarkMode ? "noir" : "cream"];
  const netWorthDisplay =
    displayCurrency === "USD" && exchangeRate ? summary.netWorth / exchangeRate : summary.netWorth;
  const digits = String(Math.round(Math.abs(netWorthDisplay))).length;
  // 位數太多時固定字級會被裁掉，改用位數驅動字級
  const heroFontSize =
    digits > 12 ? "clamp(1rem,4.6vw,1.4rem)" : digits > 9 ? "clamp(1.2rem,5.8vw,1.7rem)" : "clamp(1.55rem,7.5vw,2.25rem)";

  return (
    <div className="mx-auto max-w-lg space-y-6 px-5 pb-4 pt-5">
      {/* 問候列 */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[22px] font-bold leading-tight tracking-tight" style={{ color: COLORS.gold }}>
            Zeno
          </h1>
          <p className={`mt-0.5 min-w-0 truncate font-ledger text-xs font-medium tabular-nums ${TEXT_MUTED_CLASS}`}>
            {todayLabel()} · 最近更新{" "}
            {lastSync ? lastSync.toLocaleString("zh-TW", { hour: "2-digit", minute: "2-digit" }) : "尚無"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggleHideBalance}
            aria-label={hideBalance ? "顯示金額" : "隱藏金額"}
            aria-pressed={hideBalance}
            className={`${ICON_BTN_CLASS} ${TEXT_MUTED_CLASS} hover:text-[#B8933C]`}
          >
            {hideBalance ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
          </button>
          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label={isDarkMode ? "切換淺色模式" : "切換深色模式"}
            className={`${ICON_BTN_CLASS} ${TEXT_MUTED_CLASS} hover:text-[#B8933C]`}
          >
            {isDarkMode ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </div>

      {/* 淨資產主卡 */}
      <div
        className="rounded-[28px] p-5 transition-[background,color] duration-300 sm:p-6"
        style={{
          background: heroTheme.background,
          color: heroTheme.text,
          boxShadow: `${heroTheme.shadow}, ${heroTheme.ring}`,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 pt-1.5">
            <span className="truncate text-xs font-bold uppercase tracking-[0.18em]">
              <Wallet className="mr-1 -mt-0.5 inline h-3 w-3" />
              目前淨資產
            </span>
            {monthlyReport && !hideBalance && (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 font-ledger text-xs font-bold"
                style={{ background: heroTheme.chipBtnBg }}
                title={`與上月同期比較（${monthlyReport.month} 月）`}
              >
                {monthlyReport.delta >= 0 ? "+" : "−"}
                {Math.abs(monthlyReport.pct).toFixed(1)}%
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenActivityLog}
              aria-label="近期紀錄"
              className="flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-95"
              style={{ background: heroTheme.chipBtnBg }}
            >
              <NotebookText className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onSyncPrices}
              disabled={syncing}
              aria-label="更新價格"
              className="flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-60"
              style={{ background: heroTheme.chipBtnBg }}
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="mt-1 flex min-w-0 items-baseline gap-2">
          <p className="whitespace-nowrap font-ledger font-bold leading-normal" style={{ fontSize: heroFontSize }}>
            {!accountsLoaded ? (
              <span className="inline-block h-[1em] w-40 max-w-full animate-pulse rounded-md bg-current align-middle opacity-20" />
            ) : hideBalance ? (
              `${displayCurrency === "USD" && exchangeRate ? "US$" : "NT$"} ••••••`
            ) : (
              formatMoney(summary.netWorth, displayCurrency, exchangeRate)
            )}
          </p>
          {dailyChange && !hideBalance && (
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 font-ledger text-xs font-bold"
              style={{ background: heroTheme.chipBtnBg }}
              title="對比昨日淨資產快照"
            >
              {dailyChange.pct >= 0 ? "+" : "−"}
              {Math.abs(dailyChange.pct).toFixed(1)}%
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2 font-ledger text-xs font-bold sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className="min-w-0 max-w-full break-words rounded-full border px-2.5 py-1"
              style={{
                borderColor: `${heroTheme.assetBorder}59`,
                background: `${heroTheme.assetBorder}1A`,
                color: heroTheme.assetBorder,
              }}
            >
              資產 {!accountsLoaded ? "…" : hideBalance ? MASKED_AMOUNT : formatMoney(summary.totalAssets, displayCurrency, exchangeRate)}
            </span>
            <button
              type="button"
              onClick={onToggleDisplayCurrency}
              disabled={!exchangeRate}
              className="w-fit max-w-full shrink-0 rounded-full border px-2.5 py-1 text-left transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              style={
                displayCurrency === "USD"
                  ? { borderColor: heroTheme.toggleActiveBg, background: heroTheme.toggleActiveBg, color: heroTheme.toggleActiveText }
                  : { borderColor: heroTheme.toggleIdleBorder, background: heroTheme.toggleIdleBg, color: heroTheme.toggleIdleText }
              }
            >
              {displayCurrency === "USD" ? "US$ 檢視中" : `USD/TWD ${exchangeRate?.toFixed(2) || "—"}`}
            </button>
          </div>
          <span
            className="w-fit max-w-full shrink-0 break-words rounded-full border px-2.5 py-1"
            style={{
              borderColor: `${heroTheme.liabilityBorder}59`,
              background: `${heroTheme.liabilityBorder}1A`,
              color: heroTheme.liabilityBorder,
            }}
          >
            負債 {!accountsLoaded ? "…" : hideBalance ? MASKED_AMOUNT : formatMoney(summary.totalLiabilities, displayCurrency, exchangeRate)}
          </span>
        </div>
      </div>

      {/* 資產配置 */}
      {allocation.rows.length > 1 && (
        <section className={`${SURFACE_CLASS} rounded-[24px] p-5`} aria-label="資產配置">
          <p className={`${CARD_TITLE_CLASS} mb-3`}>資產配置</p>
          <div className="flex items-center gap-5">
            <div className="h-[84px] w-[84px] shrink-0" aria-hidden>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  {/* paddingAngle 只在每一塊都有可見角度時才加。
                      配置極端偏斜時（例如某一項佔 99.9%，其餘趨近 0%），每個微小扇形仍會被
                      切走一份 padding，recharts 會算出退化的路徑，結果是整個圓環都不見。 */}
                  <Pie
                    data={allocation.rows}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={26}
                    outerRadius={41}
                    paddingAngle={hasTinySlice ? 0 : 2}
                    strokeWidth={0}
                    isAnimationActive={false}
                  >
                    {allocation.rows.map((row) => (
                      <Cell key={row.name} fill={row.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="min-w-0 flex-1 space-y-1.5">
              {allocation.rows.map((row) => (
                <li key={row.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.color }} />
                  <span className="truncate font-medium">{row.name}</span>
                  <span className="ml-auto shrink-0 font-ledger font-semibold">
                    {((row.value / allocation.total) * 100).toFixed(1)}%
                  </span>
                  {!hideBalance && (
                    <span className={`shrink-0 text-right font-ledger text-xs ${TEXT_MUTED_CLASS}`}>
                      {formatCompactNumber(row.value)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 目標 */}
      <GoalList
        goals={goals}
        lockedGoalIds={lockedGoalIds}
        hideBalance={hideBalance}
        goalEta={goalEta}
        onCreate={onCreateGoal}
        onEdit={onEditGoal}
        onDelete={onDeleteGoal}
        onLockedClick={onOpenPlans}
      />

      {/* 帳戶 */}
      <div className="flex items-center justify-between px-1">
        <h2 className={`text-xs font-bold uppercase tracking-[0.18em] ${TEXT_MUTED_CLASS}`}>帳戶</h2>
        {currentUser?.entitlements && !currentUser.entitlements.isPro && currentUser.entitlements.limits.maxAccounts != null && (
          <span className={`font-ledger text-xs ${TEXT_MUTED_CLASS}`}>
            {accounts.length}/{currentUser.entitlements.limits.maxAccounts}
          </span>
        )}
      </div>

      {accounts.length > 0 && (
        <div className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 ${SURFACE_CLASS}`}>
          <Search className={`h-4 w-4 shrink-0 ${TEXT_MUTED_CLASS}`} aria-hidden />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜尋帳戶、代號或分類"
            aria-label="搜尋帳戶"
            className={`min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#5F6459] dark:placeholder:text-[#9AA093] ${TEXT_PRIMARY_CLASS}`}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="清除搜尋"
              className={`-m-1 rounded p-2 ${TEXT_MUTED_CLASS} hover:text-[#B8933C]`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {accounts.length === 0 && <EmptyAccountsCard onCreateAccount={onCreateAccount} />}

      {accounts.length > 0 && visibleGroups.length === 0 && (
        <div className={`${SURFACE_CLASS} rounded-2xl p-5 text-center`}>
          <p className={`text-sm ${TEXT_MUTED_CLASS}`}>找不到符合「{deferredSearch}」的帳戶</p>
        </div>
      )}

      {visibleGroups.map((group) => (
        <AccountGroupSection
          key={group.title}
          group={group}
          collapsed={!deferredSearch && Boolean(collapsedGroups[group.title])}
          onToggleCollapse={() =>
            setCollapsedGroups((current) => ({ ...current, [group.title]: !current[group.title] }))
          }
          hideBalance={hideBalance}
          isDarkMode={isDarkMode}
          onOpenAccountDetail={onOpenAccountDetail}
          onAdd={() =>
            onCreateAccount({
              type: group.defaultType,
              category: group.defaultCategory,
              currency:
                group.defaultCategory === "TAIWAN_STOCK" ? "TWD"
                : group.defaultCategory === "US_STOCK" || group.defaultCategory === "CRYPTO" ? "USD"
                : undefined,
            })
          }
        />
      ))}
    </div>
  );
}

// ─── 分組區塊 ─────────────────────────────────────────────────────────────

const AccountGroupSection = memo(function AccountGroupSection({
  group,
  collapsed,
  onToggleCollapse,
  hideBalance,
  isDarkMode,
  onOpenAccountDetail,
  onAdd,
}: {
  group: AccountGroup;
  collapsed: boolean;
  onToggleCollapse: () => void;
  hideBalance: boolean;
  isDarkMode: boolean;
  onOpenAccountDetail: (card: AccountCard) => void;
  onAdd: () => void;
}) {
  const isLiability = group.title === "負債總額";

  return (
    <section className="space-y-2.5" aria-label={group.title}>
      <div className="flex items-baseline justify-between gap-2 px-1">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex min-w-0 items-center gap-2 py-1 text-left transition-transform active:scale-[0.99]"
          aria-expanded={!collapsed}
        >
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${collapsed ? "" : "rotate-90"}`}
            style={{ color: group.color }}
            aria-hidden
          />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: group.color }} aria-hidden />
          <h3 className={`font-display ${CARD_TITLE_CLASS}`}>{group.title}</h3>
          <span className={`font-ledger text-xs ${TEXT_MUTED_CLASS}`}>{group.cards.length} 項</span>
        </button>
        <div className="flex shrink-0 items-baseline gap-3">
          <span className={`font-ledger text-xs font-semibold ${isLiability ? "text-[#A24936]" : ""}`}>
            {hideBalance ? MASKED_AMOUNT : `NT$ ${formatInteger(group.total)}`}
          </span>
          <button
            type="button"
            onClick={onAdd}
            className="py-1 text-xs font-semibold underline-offset-2 hover:underline"
            style={{ color: COLORS.gold }}
          >
            + 新增
          </button>
        </div>
      </div>

      {/* 垂直清單。
          先前是每組一條水平捲動的卡片貨架，一次只看得到 1.8 張卡——但財務 App 的核心動作
          就是「快速掃過去比較哪個多哪個少」，水平捲動正好把這件事變難，所以才需要再補一個
          「查看全部」彈窗來救。改成垂直清單之後那個彈窗也就不需要了。 */}
      {!collapsed && (
        <ul className={`${SURFACE_CLASS} divide-y divide-black/[0.05] overflow-hidden rounded-[20px] dark:divide-white/[0.05]`}>
          {group.cards.map((card) => (
            <li key={card.id}>
              <AccountRow
                card={card}
                groupColor={group.color}
                isLiability={isLiability}
                hideBalance={hideBalance}
                isDarkMode={isDarkMode}
                onOpen={() => onOpenAccountDetail(card)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});

// ─── 單一帳戶列 ───────────────────────────────────────────────────────────

const AccountRow = memo(function AccountRow({
  card,
  groupColor,
  isLiability,
  hideBalance,
  isDarkMode,
  onOpen,
}: {
  card: AccountCard;
  groupColor: string;
  isLiability: boolean;
  hideBalance: boolean;
  isDarkMode: boolean;
  onOpen: () => void;
}) {
  const CategoryIcon = CATEGORY_ICONS[card.category] ?? Wallet;
  const isStock = symbolRequiredCategories.includes(card.category as never);
  const dayChangeColor = deltaColorForTheme(card.dayChangePct, isDarkMode);
  const title = card.title.replace(/\.TW$/i, "");

  // 第二行只放「右邊金額看不出來的資訊」。
  // 先前現金帳戶會顯示「現金 · 餘額 2,300,000」，而右邊本來就寫著 NT$ 2,300,000——
  // 同一個數字講兩次，還把真正有用的資訊（銀行名稱）擠到被截斷。
  const meta = (() => {
    if (isStock) {
      return [`持有 ${formatCurrency(card.quantity)} 股`, card.subtitle].filter(Boolean).join(" · ");
    }
    if (card.account.type === "LIABILITY") {
      const term =
        card.account.loanTermMonths != null
          ? `已繳 ${card.account.paidInstallments ?? 0}/${card.account.loanTermMonths} 期`
          : null;
      return [categoryLabelMap[card.category], term].filter(Boolean).join(" · ");
    }
    // 現金／銀行：銀行名稱比「現金」這個分類標籤有資訊量，有就優先顯示
    return card.subtitle || categoryLabelMap[card.category];
  })();

  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative flex w-full items-center gap-3 py-3.5 pl-5 pr-4 text-left transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: groupColor }} aria-hidden />
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `${groupColor}1A`, color: groupColor }}
        aria-hidden
      >
        <CategoryIcon className="h-4 w-4" strokeWidth={2} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold">{title}</span>
          {card.account.isLocked && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] font-bold"
              style={{ color: COLORS.gold, borderColor: COLORS.gold }}
            >
              <Lock className="h-2.5 w-2.5" aria-hidden /> Pro
            </span>
          )}
        </span>
        <span className={`mt-0.5 block truncate text-xs ${TEXT_MUTED_CLASS}`}>{meta}</span>
        {card.account.isApiConnected && card.account.apiSyncError && (
          <span className="mt-0.5 block text-xs font-semibold text-[#A24936]">⚠️ API 已過期，點此重新設定</span>
        )}
      </span>

      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className={`font-ledger text-sm font-bold ${isLiability ? "text-[#A24936]" : ""}`}>
          {hideBalance ? MASKED_AMOUNT : `NT$ ${formatInteger(card.currentValue)}`}
        </span>
        {isStock && card.dayChangePct != null && (
          <span
            className="rounded-full px-1.5 py-0.5 font-ledger text-xs font-bold"
            style={{ color: dayChangeColor, background: `${dayChangeColor}1A` }}
          >
            {card.dayChangePct >= 0 ? "+" : ""}
            {card.dayChangePct.toFixed(1)}%
          </span>
        )}
      </span>

      <ChevronRight className={`h-4 w-4 shrink-0 ${TEXT_MUTED_CLASS}`} aria-hidden />
    </button>
  );
});

// ─── 空狀態 ───────────────────────────────────────────────────────────────

function EmptyAccountsCard({
  onCreateAccount,
}: {
  onCreateAccount: (preset: { type: string; category: string; currency?: string }) => void;
}) {
  const presets = [
    { label: "現金或銀行帳戶", icon: Landmark, type: "ASSET", category: "BANK_ACCOUNT", currency: "TWD", hint: "適合薪資帳戶、活存、現金" },
    { label: "股票持倉", icon: TrendingUp, type: "ASSET", category: "TAIWAN_STOCK", currency: "TWD", hint: "輸入代號與持有股數" },
    { label: "房貸或其他負債", icon: Home, type: "LIABILITY", category: "MORTGAGE", currency: "TWD", hint: "把負債納入淨資產計算" },
  ];

  return (
    <div className={`${SURFACE_CLASS} rounded-2xl p-5`}>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#B8933C]/15 text-[#B8933C]">
          <Wallet className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold">先建立你的第一個資產</h3>
          <p className={`mt-1 text-xs leading-relaxed ${TEXT_MUTED_CLASS}`}>
            選一個最容易開始的類型，Zeno 會先幫你帶好欄位；之後再慢慢補股票、貸款與目標。
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-2">
        {presets.map(({ label, icon: Icon, type, category, currency, hint }) => (
          <button
            key={label}
            type="button"
            onClick={() => onCreateAccount({ type, category, currency })}
            className="flex w-full items-center gap-3 rounded-xl border border-black/[0.06] bg-black/[0.015] p-3 text-left transition-colors hover:border-[#B8933C]/40 hover:bg-[#B8933C]/[0.06] dark:border-white/[0.07] dark:bg-white/[0.025] dark:hover:bg-[#B8933C]/[0.10]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#B8933C]/12 text-[#B8933C]" aria-hidden>
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{label}</span>
              <span className={`block text-xs ${TEXT_MUTED_CLASS}`}>{hint}</span>
            </span>
            <ChevronRight className={`h-4 w-4 shrink-0 ${TEXT_MUTED_CLASS}`} aria-hidden />
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onCreateAccount({ type: "ASSET", category: "CASH" })}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg px-5 py-3 text-sm font-semibold text-black transition-transform active:scale-95"
        style={{ background: COLORS.gold }}
      >
        <Plus className="h-4 w-4" aria-hidden /> 自訂新增
      </button>
    </div>
  );
}
