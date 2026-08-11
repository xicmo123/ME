"use client";

// 所有伺服器資料的載入與快取。
//
// 先前這些 state 與 fetcher 全部塞在 page.tsx 的元件本體裡（約 90 個 useState），
// 導致在搜尋框打一個字就會讓整個 App——含五張 recharts 圖表——全部重新 render。
// 抽出來之後，資料層跟呈現層分開，分頁元件只拿自己需要的部分。

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiSend, ApiError } from "@/lib/api";
import type {
  Account, ActivityLogRecord, CalendarEventRecord, CurrentUser,
  Goal, HistoryPoint, SyncStatus, TransactionRecord,
} from "@/lib/types";
import type { ShowToast } from "@/hooks/useToasts";

type LoadState = { accountsLoaded: boolean; historyLoaded: boolean };

export function useAppData(isAuthenticated: boolean, showToast: ShowToast) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogRecord[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventRecord[]>([]);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ accountsLoaded: false, historyLoaded: false });

  // 首次載入才需要跑「套用定期扣款 → 寫入今日快照」這段開機程序，之後的重新整理不用
  const bootstrapped = useRef(false);

  const fetchAccounts = useCallback(async () => {
    const data = await apiGet<Account[]>("/api/accounts");
    setAccounts(data);
  }, []);

  const fetchHistory = useCallback(async () => {
    const data = await apiGet<HistoryPoint[]>("/api/history");
    setHistory(data);
  }, []);

  const fetchTransactions = useCallback(async () => {
    setTransactions(await apiGet<TransactionRecord[]>("/api/transactions"));
  }, []);

  const fetchActivityLogs = useCallback(async () => {
    setActivityLogs(await apiGet<ActivityLogRecord[]>("/api/activity"));
  }, []);

  const fetchGoals = useCallback(async () => {
    setGoals(await apiGet<Goal[]>("/api/goals"));
  }, []);

  const fetchCalendarEvents = useCallback(async () => {
    setCalendarEvents(await apiGet<CalendarEventRecord[]>("/api/calendar-events"));
  }, []);

  const fetchExchangeRate = useCallback(async () => {
    const data = await apiGet<{ rate?: number }>("/api/exchange-rate", { cache: "no-store" });
    if (data?.rate) setExchangeRate(data.rate);
  }, []);

  const fetchSyncStatus = useCallback(async () => {
    setSyncStatus(await apiGet<SyncStatus>("/api/sync-status"));
  }, []);

  /**
   * 重新抓一輪資料。
   * 用 allSettled 讓其中一支掛掉不會連坐其他的；但「資產」與「歷史」是畫面主體，
   * 失敗時要明確告訴使用者現在看到的可能不是最新狀態，而不是靜靜地顯示舊資料。
   */
  const refreshAll = useCallback(
    async (options: { silent?: boolean } = {}) => {
      const [accountsResult, historyResult] = await Promise.all([
        fetchAccounts().then(
          () => ({ ok: true }) as const,
          (error: unknown) => ({ ok: false, error }) as const
        ),
        fetchHistory().then(
          () => ({ ok: true }) as const,
          (error: unknown) => ({ ok: false, error }) as const
        ),
      ]);

      await Promise.allSettled([
        fetchTransactions(),
        fetchActivityLogs(),
        fetchGoals(),
        fetchCalendarEvents(),
        fetchExchangeRate(),
        fetchSyncStatus(),
      ]);

      setLoadState({ accountsLoaded: true, historyLoaded: true });

      if (!options.silent) {
        if (!accountsResult.ok) showToast("資產資料讀取失敗，目前畫面可能不是最新狀態", "error");
        else if (!historyResult.ok) showToast("歷史走勢讀取失敗，請稍後再試", "error");
      }
      return accountsResult.ok && historyResult.ok;
    },
    [
      fetchAccounts, fetchHistory, fetchTransactions, fetchActivityLogs,
      fetchGoals, fetchCalendarEvents, fetchExchangeRate, fetchSyncStatus, showToast,
    ]
  );

  /** 資產金額有變動之後要重抓的那幾支（記帳、新增/編輯資產、封存…） */
  const refreshBalances = useCallback(async () => {
    await Promise.allSettled([
      fetchAccounts(), fetchHistory(), fetchTransactions(), fetchActivityLogs(), fetchGoals(),
    ]);
  }, [fetchAccounts, fetchHistory, fetchTransactions, fetchActivityLogs, fetchGoals]);

  useEffect(() => {
    if (!isAuthenticated || bootstrapped.current) return;
    bootstrapped.current = true;

    void (async () => {
      // 先套用本月到期的定期扣款，之後抓到的帳戶餘額才是最新的
      try {
        const applied = await apiSend<{ processed?: unknown[] }>("/api/recurring/apply", "POST");
        if (applied?.processed?.length) {
          showToast(`已自動記錄 ${applied.processed.length} 筆本月定期扣款`);
        }
      } catch (error) {
        // 這是 Pro 功能，免費使用者會拿到 402，屬預期情況，不用提示
        if (!(error instanceof ApiError && error.isUpgradeRequired)) {
          console.warn("[recurring] 套用定期扣款失敗", error);
        }
      }

      await refreshAll();

      // 每次進入 App 都記錄「今天」的淨資產快照，讓歷史逐日累積
      try {
        await apiGet("/api/history/snapshot");
        await fetchHistory();
      } catch (error) {
        console.warn("[snapshot] 寫入今日快照失敗", error);
      }
    })();
  }, [isAuthenticated, refreshAll, fetchHistory, showToast]);

  // 登出時把資料清乾淨，避免下一個登入的帳號短暫看到上一個人的數字
  useEffect(() => {
    if (isAuthenticated) return;
    bootstrapped.current = false;
    setAccounts([]);
    setHistory([]);
    setTransactions([]);
    setActivityLogs([]);
    setGoals([]);
    setCalendarEvents([]);
    setSyncStatus(null);
    setLoadState({ accountsLoaded: false, historyLoaded: false });
  }, [isAuthenticated]);

  return {
    accounts, history, transactions, activityLogs, goals, calendarEvents,
    exchangeRate, syncStatus,
    accountsLoaded: loadState.accountsLoaded,
    historyLoaded: loadState.historyLoaded,
    fetchAccounts, fetchHistory, fetchGoals, fetchCalendarEvents,
    fetchActivityLogs, fetchSyncStatus, fetchExchangeRate,
    refreshAll, refreshBalances,
  };
}

export type AppData = ReturnType<typeof useAppData>;

/** 登入狀態與目前使用者 */
export function useCurrentUser() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const refreshCurrentUser = useCallback(async () => {
    try {
      const data = await apiGet<{ user: CurrentUser | null }>("/api/auth");
      if (data.user) {
        setCurrentUser(data.user);
        setIsAuthenticated(true);
        return data.user;
      }
    } catch {
      // 401 代表沒登入，是正常狀態，不需要提示
    }
    setCurrentUser(null);
    setIsAuthenticated(false);
    return null;
  }, []);

  useEffect(() => {
    void refreshCurrentUser().finally(() => setAuthChecked(true));
  }, [refreshCurrentUser]);

  return {
    isAuthenticated, setIsAuthenticated,
    currentUser, setCurrentUser,
    authChecked, refreshCurrentUser,
  };
}
