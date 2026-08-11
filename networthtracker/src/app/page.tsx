"use client";

// 這一頁只做三件事：組合 hooks、持有「哪個彈窗開著」的狀態、把資料與 callback 傳給分頁元件。
//
// 先前它是一個 3,377 行、約 90 個 useState 的單一元件——在搜尋框打一個字就會讓整個 App
// （含五張 recharts 圖表）重新 render。計算邏輯現在在 lib/derive.ts，資料在 hooks/，
// 呈現在 components/tabs/，這裡剩下的只有協調。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { AlertTriangle, Archive, RefreshCw } from "lucide-react";

import { apiGet, apiSend, ApiError, toUserMessage } from "@/lib/api";
import { clearAuthToken } from "@/lib/authToken";
import { BG_CLASS, TEXT_PRIMARY_CLASS } from "@/lib/theme";
import {
  buildAccountGroups, buildChartSeries, combineActivity, computeAllocation, computeCostBasis,
  computeDailyChange, computeDataHealth, computeGoalEta, computeHeldStockSymbols,
  computeMonthlyDeltas, computeMonthlyGrowth, computeMonthlyReport, computeSummary,
  computeYearReport, type AccountCard,
} from "@/lib/derive";
import { EVENT_TYPE_META } from "@/lib/constants";
import {
  biometricVerify, configurePurchases, hapticImpact, initNativeShell, isNative,
  maybeRequestReview, scheduleDailyReminder, setStatusBarTheme, syncEventReminders,
} from "@/lib/native";
import { STORAGE_KEYS, usePreferences } from "@/hooks/usePreferences";
import { useAppData, useCurrentUser } from "@/hooks/useAppData";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useToasts } from "@/hooks/useToasts";
import type { Account, CalendarEventRecord, Goal, StockEvent, Tab } from "@/lib/types";

import { AuthScreen } from "@/components/AuthScreen";
import { BiometricLockScreen } from "@/components/BiometricLockScreen";
import { BottomNav, buildQuickActions } from "@/components/BottomNav";
import { Onboarding, shouldShowOnboarding } from "@/components/Onboarding";
import { ToastStack } from "@/components/ToastStack";
import { ConfirmModal } from "@/components/ui/Modal";
import { CalendarTab } from "@/components/tabs/CalendarTab";
import { OverviewTab } from "@/components/tabs/OverviewTab";
import { SettingsTab } from "@/components/tabs/SettingsTab";
import { TrendsTab, type Timeframe } from "@/components/tabs/TrendsTab";
import { AccountDetailModal } from "@/components/modals/AccountDetailModal";
import { AccountFormModal } from "@/components/modals/AccountFormModal";
import { GoalFormModal } from "@/components/modals/GoalFormModal";
import {
  BookkeepingModal, CalendarEventModal, HistoryBackfillModal,
} from "@/components/modals/QuickEntryModals";
import {
  ActivityLogModal, ArchivedAccountsModal, ChartExpandModal, CustomEventDetailModal,
  DowngradeAlertModal, StockEventDetailModal, YearReportModal,
} from "@/components/modals/MiscModals";
import type { NetWorthChartProps } from "@/components/charts/NetWorthChart";

type AccountPreset = { type: string; category: string; currency?: string };
type DeleteTarget =
  | { kind: "account"; account: Account }
  | { kind: "goal"; goal: Goal }
  | { kind: "archived"; id: string; name: string }
  | { kind: "user" };

export default function HomePage() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const isDarkMode = mounted && resolvedTheme === "dark";

  const { toasts, showToast, dismissToast } = useToasts();
  const prefs = usePreferences();
  const { isAuthenticated, setIsAuthenticated, currentUser, setCurrentUser, authChecked, refreshCurrentUser } =
    useCurrentUser();
  const data = useAppData(isAuthenticated, showToast);

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [bioLocked, setBioLocked] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);

  // 彈窗狀態
  const [accountForm, setAccountForm] = useState<{ open: boolean; editing: Account | null; preset: AccountPreset | null }>(
    { open: false, editing: null, preset: null }
  );
  const [goalForm, setGoalForm] = useState<{ open: boolean; editing: Goal | null }>({ open: false, editing: null });
  const [detailCard, setDetailCard] = useState<{ card: AccountCard; groupColor: string } | null>(null);
  const [showBookkeeping, setShowBookkeeping] = useState(false);
  const [showCalendarEventForm, setShowCalendarEventForm] = useState(false);
  const [showBackfill, setShowBackfill] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showYearReport, setShowYearReport] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedStockEvent, setSelectedStockEvent] = useState<StockEvent | null>(null);
  const [selectedCustomEvent, setSelectedCustomEvent] = useState<CalendarEventRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedChart, setExpandedChart] = useState<Omit<NetWorthChartProps, "heightClass"> | null>(null);
  const [downgradeAlert, setDowngradeAlert] = useState<
    { accounts: { id: string; name: string; type: string }[]; goals: { id: string; name: string }[] } | null
  >(null);

  // 走勢頁
  const [timeframe, setTimeframe] = useState<Timeframe>("day");
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null);

  // 行事曆
  const [stockEvents, setStockEvents] = useState<StockEvent[]>([]);
  const [stockEventsLoading, setStockEventsLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // ─── 衍生資料 ───────────────────────────────────────────────────────────

  const summary = useMemo(() => computeSummary(data.accounts), [data.accounts]);
  const allocation = useMemo(() => computeAllocation(data.accounts), [data.accounts]);
  const costBasis = useMemo(() => computeCostBasis(data.transactions), [data.transactions]);
  const accountGroups = useMemo(() => buildAccountGroups(data.accounts, costBasis), [data.accounts, costBasis]);
  const monthlyReport = useMemo(() => computeMonthlyReport(data.history), [data.history]);
  const dailyChange = useMemo(() => computeDailyChange(data.history, summary.netWorth), [data.history, summary.netWorth]);
  const monthlyGrowth = useMemo(() => computeMonthlyGrowth(data.history), [data.history]);
  const monthlyDeltas = useMemo(() => computeMonthlyDeltas(data.history), [data.history]);
  const yearReport = useMemo(() => computeYearReport(data.history, monthlyDeltas), [data.history, monthlyDeltas]);
  const dataHealth = useMemo(() => computeDataHealth(data.accounts), [data.accounts]);
  const activityItems = useMemo(
    () => combineActivity(data.transactions, data.activityLogs),
    [data.transactions, data.activityLogs]
  );
  const chartData = useMemo(
    () => buildChartSeries(data.history, timeframe, summary.netWorth, customRange),
    [data.history, timeframe, summary.netWorth, customRange]
  );
  const heldStockSymbols = useMemo(() => computeHeldStockSymbols(data.accounts), [data.accounts]);

  // 目標本身不影響金額計算，鎖定純粹是顯示層面，在前端算即可
  const lockedGoalIds = useMemo(() => {
    const max = currentUser?.entitlements?.limits.maxGoals;
    if (max == null) return new Set<string>();
    return new Set(data.goals.slice(max).map((goal) => goal.id));
  }, [data.goals, currentUser]);

  const goalEta = useCallback(
    (goal: Goal) => computeGoalEta(goal, data.accounts, monthlyGrowth),
    [data.accounts, monthlyGrowth]
  );

  // ─── 初始化 ─────────────────────────────────────────────────────────────

  useEffect(() => {
    setMounted(true);

    // 舊版把深色模式存在 networth-dark-mode，改用 next-themes 後做一次性搬遷
    try {
      const legacy = window.localStorage.getItem(STORAGE_KEYS.legacyDarkMode);
      if (legacy !== null) {
        setTheme(legacy === "true" ? "dark" : "light");
        window.localStorage.removeItem(STORAGE_KEYS.legacyDarkMode);
      }
    } catch {
      // localStorage 不可用時沿用系統設定即可
    }

    // OAuth／驗證信回跳會帶訊息參數，讀完就清掉網址
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("authError");
    const verified = params.get("verified");
    if (oauthError) setAuthError(oauthError);
    if (verified) setAuthNotice("信箱驗證完成，歡迎使用 Zeno");
    if (oauthError || verified || params.get("linked")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [setTheme]);

  // 同步原生外殼（狀態列）主題
  const nativeShellReady = useRef(false);
  useEffect(() => {
    if (!mounted || resolvedTheme === undefined) return;
    const dark = resolvedTheme === "dark";
    if (!nativeShellReady.current) {
      nativeShellReady.current = true;
      void initNativeShell(dark);
    } else {
      void setStatusBarTheme(dark);
    }
  }, [mounted, resolvedTheme]);

  // 沒有 webhook 通知降級，只能靠比對「上次看到的方案」跟這次抓到的方案來偵測 Pro→Free
  const [justDowngraded, setJustDowngraded] = useState(false);

  // 登入後：設定 RevenueCat、偵測降級、決定要不要跑引導
  useEffect(() => {
    if (!currentUser) return;
    void configurePurchases(currentUser.id);

    const nowIsPro = Boolean(currentUser.entitlements?.isPro);
    try {
      const prevTier = window.localStorage.getItem(STORAGE_KEYS.lastTier);
      window.localStorage.setItem(STORAGE_KEYS.lastTier, nowIsPro ? "PRO" : "FREE");
      if (prevTier === "PRO" && !nowIsPro) setJustDowngraded(true);
    } catch {
      // 偵測不到降級不影響主要功能
    }
  }, [currentUser]);

  const downgradeShown = useRef(false);
  useEffect(() => {
    if (!justDowngraded || downgradeShown.current) return;
    if (data.accounts.length === 0 && data.goals.length === 0) return;
    downgradeShown.current = true;

    const lockedAccounts = data.accounts
      .filter((account) => account.isLocked)
      .map((account) => ({ id: account.id, name: account.name, type: account.type }));
    const lockedGoals = data.goals
      .filter((goal) => lockedGoalIds.has(goal.id))
      .map((goal) => ({ id: goal.id, name: goal.name }));

    if (lockedAccounts.length > 0 || lockedGoals.length > 0) {
      setDowngradeAlert({ accounts: lockedAccounts, goals: lockedGoals });
    }
  }, [justDowngraded, data.accounts, data.goals, lockedGoalIds]);

  useEffect(() => {
    if (!isAuthenticated || !data.accountsLoaded) return;
    if (shouldShowOnboarding(data.accounts.length)) setShowOnboarding(true);
  }, [isAuthenticated, data.accountsLoaded, data.accounts.length]);

  // Face ID：開啟 App 時要求解鎖，且切到背景再回來要重新驗證
  useEffect(() => {
    if (!prefs.hydrated || !prefs.bioEnabled || !isNative() || !isAuthenticated) return;
    setBioLocked(true);
    void biometricVerify("解鎖 Zeno").then((ok) => {
      if (ok) setBioLocked(false);
    });
  }, [prefs.hydrated, prefs.bioEnabled, isAuthenticated]);

  useEffect(() => {
    if (!prefs.bioEnabled || !isNative()) return;
    const handler = () => {
      if (document.hidden) setBioLocked(true);
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [prefs.bioEnabled]);

  // 行事曆事件：只在切到行事曆分頁時才抓
  useEffect(() => {
    if (activeTab !== "calendar" || heldStockSymbols.length === 0) return;
    setStockEventsLoading(true);
    void apiGet<{ events?: StockEvent[] }>(`/api/stock-events?symbols=${encodeURIComponent(heldStockSymbols.join(","))}`)
      .then((result) => setStockEvents(result.events ?? []))
      .catch(() => setStockEvents([]))
      .finally(() => setStockEventsLoading(false));
  }, [activeTab, heldStockSymbols]);

  // 本地通知：股票事件前一天提醒，自建事件時間一到提醒
  useEffect(() => {
    if (!mounted) return;
    const upcoming: { id: number; title: string; at: Date }[] = [];
    const now = new Date();
    const horizon = new Date(now.getTime() + 30 * 86_400_000);

    const hashId = (key: string) => {
      let hash = 0;
      for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
      return Math.abs(hash) || 1;
    };

    for (const event of stockEvents) {
      if (!prefs.notifyPrefs[event.type]) continue;
      const eventDay = new Date(`${event.date.slice(0, 10)}T00:00:00`);
      if (Number.isNaN(eventDay.getTime()) || eventDay <= now || eventDay > horizon) continue;
      const at = new Date(eventDay.getTime() - 4 * 3_600_000); // 前一天 20:00
      if (at <= now) continue;
      const title = `明天：${event.name || event.symbol} ${EVENT_TYPE_META[event.type]?.label ?? ""}`;
      upcoming.push({ id: hashId(`${event.date}|${title}`), title, at });
    }

    if (prefs.notifyPrefs.CALENDAR_EVENT) {
      for (const event of data.calendarEvents) {
        const at = new Date(event.eventAt);
        if (Number.isNaN(at.getTime()) || at <= now || at > horizon) continue;
        upcoming.push({ id: hashId(`calendar|${event.id}`), title: event.title, at });
      }
    }

    void syncEventReminders(upcoming, prefs.notifyEnabled);
  }, [mounted, prefs.notifyEnabled, prefs.notifyPrefs, stockEvents, data.calendarEvents]);

  useEffect(() => {
    if (!prefs.hydrated) return;
    const [hour, minute] = prefs.dailyReminderTime.split(":").map(Number);
    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      void scheduleDailyReminder(hour, minute, prefs.dailyReminderEnabled);
    }
  }, [prefs.hydrated, prefs.dailyReminderEnabled, prefs.dailyReminderTime]);

  // ─── 動作 ───────────────────────────────────────────────────────────────

  const handleRefresh = useCallback(async () => {
    await data.refreshAll({ silent: true });
    void hapticImpact("light");
  }, [data]);

  const pull = usePullToRefresh(scrollRef, handleRefresh, isAuthenticated && !bioLocked);

  const openPlans = useCallback(() => {
    setActiveTab("settings");
    setDetailCard(null);
  }, []);

  async function handleSyncPrices() {
    setSyncing(true);
    try {
      const result = await apiGet<{ throttled?: boolean }>("/api/test-fetch-prices");
      if (result?.throttled) {
        showToast("剛更新過，請稍後再試");
        return;
      }
      await apiGet("/api/history/snapshot").catch(() => {});
      await data.refreshAll({ silent: true });
      showToast("已更新最新價格");
    } catch (error) {
      if (error instanceof ApiError && error.isUpgradeRequired) {
        showToast(error.message, "error");
        void data.fetchSyncStatus().catch(() => {});
        return;
      }
      showToast(toUserMessage(error, "更新失敗，價格來源暫時無法使用"), "error");
    } finally {
      setSyncing(false);
    }
  }

  async function handleExportCsv() {
    try {
      // 先用 fetch 拿內容，這樣 402（非 Pro）才有機會顯示升級訊息，
      // 而不是讓瀏覽器直接下載一個 JSON 錯誤檔
      const response = await fetch("/api/export/csv");
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        showToast(body?.message ?? "匯出失敗，請稍後再試", "error");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `zeno-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      showToast("已匯出 CSV");
    } catch {
      showToast("匯出失敗，請確認網路連線", "error");
    }
  }

  async function handleLogout() {
    await apiSend("/api/auth", "DELETE").catch(() => {});
    // 後端只清得掉 cookie；App 版的憑證存在自己這邊，要一併清掉，
    // 否則下次開 App 會用一個已經「登出」的 token 直接進到已登入狀態。
    await clearAuthToken();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setActiveTab("overview");
  }

  async function handleUnlinkProvider(provider: "google" | "apple") {
    try {
      await apiSend(`/api/auth/${provider}`, "DELETE");
      await refreshCurrentUser();
      showToast(`已取消綁定 ${provider === "google" ? "Google" : "Apple"}`);
    } catch (error) {
      // 先前這裡用瀏覽器原生 alert()，在 WKWebView 裡會跳出帶網域名稱的系統對話框，很出戲
      showToast(toUserMessage(error, "取消綁定失敗"), "error");
    }
  }

  async function handleToggleBioLock() {
    if (!isNative()) {
      showToast("生物辨識需在 iOS App 中使用", "error");
      return;
    }
    if (prefs.bioEnabled) {
      prefs.persistBioEnabled(false);
      showToast("已關閉 Face ID 解鎖");
      return;
    }
    const ok = await biometricVerify("開啟 Face ID 解鎖");
    if (ok) {
      prefs.persistBioEnabled(true);
      showToast("已開啟 Face ID 解鎖");
    } else {
      showToast("驗證未通過，未開啟", "error");
    }
  }

  function handleToggleNotify() {
    if (!isNative()) {
      showToast("通知需在 iOS App 中使用", "error");
      return;
    }
    const next = !prefs.notifyEnabled;
    prefs.persistNotify(next, {
      EARNINGS: next, EX_DIVIDEND: next, DIVIDEND_PAY: next, CALENDAR_EVENT: next,
    });
    showToast(next ? "已開啟事件提醒" : "已關閉事件提醒");
  }

  function handleToggleNotifyType(key: string) {
    if (!isNative()) {
      showToast("通知需在 iOS App 中使用", "error");
      return;
    }
    const nextPrefs = { ...prefs.notifyPrefs, [key]: !prefs.notifyPrefs[key] };
    prefs.persistNotify(Object.values(nextPrefs).some(Boolean), nextPrefs);
  }

  /** 封存資產。可復原的操作直接在 toast 上給 Undo，不要叫使用者自己去設定頁找 */
  async function archiveAccount(account: Account) {
    try {
      await apiSend(`/api/accounts/${account.id}`, "DELETE");
      await data.refreshBalances();
      showToast(`已封存「${account.name}」`, {
        undo: {
          label: "復原",
          run: async () => {
            try {
              await apiSend(`/api/accounts/${account.id}`, "PATCH", { action: "restore" });
              await data.refreshBalances();
              showToast(`已復原「${account.name}」`);
            } catch (error) {
              showToast(toUserMessage(error, "復原失敗"), "error");
            }
          },
        },
      });
    } catch (error) {
      showToast(toUserMessage(error, "封存失敗，請再試一次"), "error");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === "account") {
        setDeleteTarget(null);
        setDetailCard(null);
        await archiveAccount(deleteTarget.account);
      } else if (deleteTarget.kind === "goal") {
        await apiSend(`/api/goals?id=${deleteTarget.goal.id}`, "DELETE");
        await data.fetchGoals();
        showToast(`已刪除「${deleteTarget.goal.name}」`);
        setDeleteTarget(null);
      } else if (deleteTarget.kind === "archived") {
        await apiSend(`/api/accounts/${deleteTarget.id}?permanent=true`, "DELETE");
        await data.fetchActivityLogs().catch(() => {});
        showToast(`已永久刪除「${deleteTarget.name}」`);
        setDeleteTarget(null);
        setShowArchived(false);
      } else {
        await apiSend("/api/user/me", "DELETE");
        setIsAuthenticated(false);
        setCurrentUser(null);
        setDeleteTarget(null);
      }
    } catch (error) {
      showToast(toUserMessage(error, "操作失敗，請再試一次"), "error");
    } finally {
      setDeleting(false);
    }
  }

  // ─── 畫面 ───────────────────────────────────────────────────────────────

  if (!mounted || !authChecked) {
    return <div className={`min-h-screen ${BG_CLASS}`} aria-busy="true" />;
  }

  if (!isAuthenticated) {
    return (
      <AuthScreen
        initialError={authError}
        initialNotice={authNotice}
        onAuthenticated={async () => {
          await refreshCurrentUser();
        }}
      />
    );
  }

  if (bioLocked) {
    return <BiometricLockScreen onUnlock={() => setBioLocked(false)} />;
  }

  const quickActions = buildQuickActions({
    onBookkeeping: () => setShowBookkeeping(true),
    onAddAccount: () => setAccountForm({ open: true, editing: null, preset: null }),
    onAddCalendarEvent: () => setShowCalendarEventForm(true),
  });

  return (
    <div
      className={`flex h-screen flex-col overflow-hidden ${BG_CLASS} ${TEXT_PRIMARY_CLASS}`}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* 下拉更新指示器 */}
      <div
        className="pointer-events-none absolute left-1/2 z-20 flex -translate-x-1/2 items-center justify-center transition-opacity"
        style={{
          top: `calc(env(safe-area-inset-top) + ${Math.max(0, pull.pullDistance - 28)}px)`,
          opacity: pull.progress,
        }}
        aria-hidden={!pull.refreshing}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md dark:bg-[#151923]">
          <RefreshCw
            className={`h-4 w-4 ${pull.refreshing ? "animate-spin" : ""}`}
            style={{
              color: pull.armed ? "#B8933C" : undefined,
              transform: pull.refreshing ? undefined : `rotate(${pull.progress * 270}deg)`,
            }}
          />
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-32" style={{ overscrollBehaviorY: "contain" }}>
        {activeTab === "overview" && (
          <OverviewTab
            accounts={data.accounts}
            accountGroups={accountGroups}
            goals={data.goals}
            summary={summary}
            allocation={allocation}
            monthlyReport={monthlyReport}
            dailyChange={dailyChange}
            lockedGoalIds={lockedGoalIds}
            currentUser={currentUser}
            accountsLoaded={data.accountsLoaded}
            lastSync={dataHealth.lastSync}
            hideBalance={prefs.hideBalance}
            onToggleHideBalance={prefs.toggleHideBalance}
            displayCurrency={prefs.displayCurrency}
            onToggleDisplayCurrency={prefs.toggleDisplayCurrency}
            exchangeRate={data.exchangeRate}
            isDarkMode={isDarkMode}
            onToggleDarkMode={() => setTheme(isDarkMode ? "light" : "dark")}
            syncing={syncing}
            onSyncPrices={handleSyncPrices}
            onOpenActivityLog={() => setShowActivityLog(true)}
            onOpenAccountDetail={(card) => {
              const group = accountGroups.find((item) => item.cards.some((entry) => entry.id === card.id));
              setDetailCard({ card, groupColor: group?.color ?? "#B8933C" });
            }}
            onCreateAccount={(preset) => setAccountForm({ open: true, editing: null, preset })}
            onOpenPlans={openPlans}
            onCreateGoal={() => setGoalForm({ open: true, editing: null })}
            onEditGoal={(goal) => setGoalForm({ open: true, editing: goal })}
            onDeleteGoal={(goal) => setDeleteTarget({ kind: "goal", goal })}
            goalEta={goalEta}
          />
        )}

        {activeTab === "calendar" && (
          <CalendarTab
            stockEvents={stockEvents}
            calendarEvents={data.calendarEvents}
            loading={stockEventsLoading}
            hasHoldings={heldStockSymbols.length > 0}
            onCreateEvent={() => setShowCalendarEventForm(true)}
            onOpenStockEvent={setSelectedStockEvent}
            onOpenCustomEvent={setSelectedCustomEvent}
          />
        )}

        {activeTab === "trends" && (
          <TrendsTab
            history={data.history}
            chartData={chartData}
            netWorth={summary.netWorth}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
            historyLoaded={data.historyLoaded}
            hideBalance={prefs.hideBalance}
            isDarkMode={isDarkMode}
            currentUser={currentUser}
            onOpenBackfill={() => setShowBackfill(true)}
            onOpenPlans={openPlans}
            onExpandChart={setExpandedChart}
          />
        )}

        {activeTab === "settings" && (
          <SettingsTab
            isDarkMode={isDarkMode}
            onToggleDarkMode={() => setTheme(isDarkMode ? "light" : "dark")}
            dataHealth={dataHealth}
            onSyncPrices={handleSyncPrices}
            syncing={syncing}
            syncStatus={data.syncStatus}
            exchangeRate={data.exchangeRate}
            onOpenBackfill={() => setShowBackfill(true)}
            onExportCsv={handleExportCsv}
            onToggleBioLock={handleToggleBioLock}
            bioEnabled={prefs.bioEnabled}
            notifyEnabled={prefs.notifyEnabled}
            notifyPrefs={prefs.notifyPrefs}
            onToggleNotify={handleToggleNotify}
            onToggleNotifyType={handleToggleNotifyType}
            dailyReminderTime={prefs.dailyReminderTime}
            onDailyReminderTimeChange={prefs.setDailyReminderTime}
            dailyReminderEnabled={prefs.dailyReminderEnabled}
            onToggleDailyReminder={() => prefs.setDailyReminderEnabled((current) => !current)}
            showToast={showToast}
            currentUser={currentUser}
            onUnlinkProvider={handleUnlinkProvider}
            onLogout={handleLogout}
            onRequestDeleteAccount={() => setDeleteTarget({ kind: "user" })}
            onOpenArchived={() => setShowArchived(true)}
            onOpenYearReport={() => setShowYearReport(true)}
            onPurchaseSuccess={async () => {
              await refreshCurrentUser();
              await data.refreshAll({ silent: true });
            }}
          />
        )}
      </div>

      <BottomNav
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          scrollRef.current?.scrollTo({ top: 0 });
        }}
        quickAddOpen={quickAddOpen}
        onToggleQuickAdd={setQuickAddOpen}
        quickActions={quickActions}
      />

      {/* ── 彈窗 ── */}

      {/* 表單類彈窗只在開啟時掛載：每次開啟都是一個全新的元件實例，
          表單初始值直接在 useState 的 initializer 算好，不需要在 effect 裡再重設一次。 */}
      {accountForm.open && (
        <AccountFormModal
          open
          onClose={() => setAccountForm({ open: false, editing: null, preset: null })}
          editingAccount={accountForm.editing}
          preset={accountForm.preset}
          accounts={data.accounts}
          currentUser={currentUser}
          onSaved={async (message) => {
            await data.refreshBalances();
            showToast(message);
            void maybeRequestReview("account-saved");
          }}
          onOpenPlans={() => {
            setAccountForm({ open: false, editing: null, preset: null });
            openPlans();
          }}
        />
      )}

      {goalForm.open && (
        <GoalFormModal
          open
          onClose={() => setGoalForm({ open: false, editing: null })}
          editingGoal={goalForm.editing}
          accounts={data.accounts}
          onSaved={async (message) => {
            await data.fetchGoals();
            showToast(message);
          }}
        />
      )}

      <AccountDetailModal
        card={detailCard?.card ?? null}
        groupColor={detailCard?.groupColor ?? "#B8933C"}
        accounts={data.accounts}
        hideBalance={prefs.hideBalance}
        isDarkMode={isDarkMode}
        onClose={() => setDetailCard(null)}
        onEdit={(account) => {
          setDetailCard(null);
          setAccountForm({ open: true, editing: account, preset: null });
        }}
        onArchive={(account) => setDeleteTarget({ kind: "account", account })}
        onOpenPlans={openPlans}
      />

      {showBookkeeping && (
        <BookkeepingModal
          open
          onClose={() => setShowBookkeeping(false)}
          accounts={data.accounts}
          onSaved={async (message) => {
            await data.refreshBalances();
            showToast(message);
          }}
        />
      )}

      {showCalendarEventForm && (
        <CalendarEventModal
          open
          onClose={() => setShowCalendarEventForm(false)}
          onSaved={async (message) => {
            await data.fetchCalendarEvents();
            showToast(message);
          }}
        />
      )}

      {showBackfill && (
        <HistoryBackfillModal
          open
          onClose={() => setShowBackfill(false)}
          onSaved={async (message) => {
            await data.fetchHistory();
            showToast(message);
          }}
        />
      )}

      <ActivityLogModal
        open={showActivityLog}
        onClose={() => setShowActivityLog(false)}
        items={activityItems}
        hideBalance={prefs.hideBalance}
      />

      <YearReportModal
        open={showYearReport}
        onClose={() => setShowYearReport(false)}
        report={yearReport}
        isDarkMode={isDarkMode}
        onShared={showToast}
      />

      <ArchivedAccountsModal
        open={showArchived}
        onClose={() => setShowArchived(false)}
        onChanged={async (message) => {
          await data.refreshBalances();
          showToast(message);
        }}
        onRequestPermanentDelete={(account) => setDeleteTarget({ kind: "archived", ...account })}
      />

      <StockEventDetailModal event={selectedStockEvent} onClose={() => setSelectedStockEvent(null)} />

      <CustomEventDetailModal
        event={selectedCustomEvent}
        onClose={() => setSelectedCustomEvent(null)}
        onDeleted={async (message) => {
          await data.fetchCalendarEvents();
          showToast(message);
        }}
      />

      <ChartExpandModal open={expandedChart !== null} onClose={() => setExpandedChart(null)} chartProps={expandedChart} />

      <DowngradeAlertModal alert={downgradeAlert} onClose={() => setDowngradeAlert(null)} onOpenPlans={openPlans} />

      <Onboarding
        open={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onAddFirstAccount={() => setAccountForm({ open: true, editing: null, preset: null })}
        isDarkMode={isDarkMode}
      />

      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        pending={deleting}
        icon={
          deleteTarget?.kind === "account"
            ? <Archive className="h-6 w-6" aria-hidden />
            : <AlertTriangle className="h-6 w-6" aria-hidden />
        }
        title={
          deleteTarget?.kind === "goal" ? "刪除目標"
          : deleteTarget?.kind === "account" ? "封存資產"
          : deleteTarget?.kind === "archived" ? "永久刪除帳戶"
          : "刪除帳號"
        }
        description={
          deleteTarget?.kind === "goal"
            ? `確定要刪除「${deleteTarget.goal.name}」嗎？此操作無法復原。`
            : deleteTarget?.kind === "account"
              ? `確定要封存「${deleteTarget.account.name}」嗎？歷史紀錄會保留，封存後仍可復原。`
              : deleteTarget?.kind === "archived"
                ? `確定要永久刪除「${deleteTarget.name}」嗎？所有相關交易紀錄將一併刪除，此操作無法復原。`
                : "此操作將永久刪除你的帳號及所有資產、歷史記錄，無法復原。"
        }
        confirmLabel={deleteTarget?.kind === "account" ? "確認封存" : "確認刪除"}
        pendingLabel={deleteTarget?.kind === "account" ? "封存中…" : "刪除中…"}
        tone={deleteTarget?.kind === "account" ? "brand" : "danger"}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
