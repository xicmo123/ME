"use client";

// 存在 localStorage 的使用者偏好。
// 先前這些散在 page.tsx 的一個大 useEffect 裡，讀取／寫入的 key 字串重複出現多次。

import { useCallback, useEffect, useState } from "react";

export const STORAGE_KEYS = {
  hideBalance: "networth-hide-balance",
  displayCurrency: "networth-display-currency",
  notifyEnabled: "networth-event-notify",
  notifyPrefs: "networth-event-notify-prefs",
  bioLock: "networth-bio-lock",
  dailyReminderEnabled: "networth-daily-reminder-enabled",
  dailyReminderTime: "networth-daily-reminder-time",
  lastTier: "zeno-last-tier",
  onboarded: "zeno-onboarded",
  legacyDarkMode: "networth-dark-mode",
} as const;

export type NotifyPrefs = Record<string, boolean>;

const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  EARNINGS: true, EX_DIVIDEND: true, DIVIDEND_PAY: true, CALENDAR_EVENT: true,
};

function readLocal(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Safari 無痕模式會直接 throw，偏好存不下來不該讓整個 App 掛掉
  }
}

export function usePreferences() {
  const [hydrated, setHydrated] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState<"TWD" | "USD">("TWD");
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyPrefs, setNotifyPrefs] = useState<NotifyPrefs>(DEFAULT_NOTIFY_PREFS);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [dailyReminderEnabled, setDailyReminderEnabled] = useState(false);
  const [dailyReminderTime, setDailyReminderTime] = useState("21:00");

  // 只在掛載後讀 localStorage，避免 SSR/CSR 內容不一致造成 hydration 警告
  useEffect(() => {
    setHideBalance(readLocal(STORAGE_KEYS.hideBalance) === "true");
    if (readLocal(STORAGE_KEYS.displayCurrency) === "USD") setDisplayCurrency("USD");

    const savedNotify = readLocal(STORAGE_KEYS.notifyEnabled) === "true";
    setNotifyEnabled(savedNotify);

    const savedPrefsRaw = readLocal(STORAGE_KEYS.notifyPrefs);
    if (savedPrefsRaw) {
      try {
        setNotifyPrefs({ ...DEFAULT_NOTIFY_PREFS, ...(JSON.parse(savedPrefsRaw) as NotifyPrefs) });
      } catch {
        setNotifyPrefs(DEFAULT_NOTIFY_PREFS);
      }
    } else {
      // 舊版只有單一總開關，沿用其狀態初始化各類別偏好
      setNotifyPrefs({
        EARNINGS: savedNotify, EX_DIVIDEND: savedNotify,
        DIVIDEND_PAY: savedNotify, CALENDAR_EVENT: savedNotify,
      });
    }

    setBioEnabled(readLocal(STORAGE_KEYS.bioLock) === "true");
    setDailyReminderEnabled(readLocal(STORAGE_KEYS.dailyReminderEnabled) === "true");
    const savedTime = readLocal(STORAGE_KEYS.dailyReminderTime);
    if (savedTime) setDailyReminderTime(savedTime);

    setHydrated(true);
  }, []);

  const toggleHideBalance = useCallback(() => {
    setHideBalance((current) => {
      const next = !current;
      writeLocal(STORAGE_KEYS.hideBalance, String(next));
      return next;
    });
  }, []);

  const toggleDisplayCurrency = useCallback(() => {
    setDisplayCurrency((current) => {
      const next = current === "TWD" ? "USD" : "TWD";
      writeLocal(STORAGE_KEYS.displayCurrency, next);
      return next;
    });
  }, []);

  const persistBioEnabled = useCallback((next: boolean) => {
    setBioEnabled(next);
    writeLocal(STORAGE_KEYS.bioLock, String(next));
  }, []);

  const persistNotify = useCallback((enabled: boolean, prefs: NotifyPrefs) => {
    setNotifyEnabled(enabled);
    setNotifyPrefs(prefs);
    writeLocal(STORAGE_KEYS.notifyEnabled, String(enabled));
    writeLocal(STORAGE_KEYS.notifyPrefs, JSON.stringify(prefs));
  }, []);

  // 每日提醒的排程由呼叫端負責，這裡只管持久化
  useEffect(() => {
    if (!hydrated) return;
    writeLocal(STORAGE_KEYS.dailyReminderEnabled, String(dailyReminderEnabled));
    writeLocal(STORAGE_KEYS.dailyReminderTime, dailyReminderTime);
  }, [hydrated, dailyReminderEnabled, dailyReminderTime]);

  return {
    hydrated,
    hideBalance, toggleHideBalance,
    displayCurrency, toggleDisplayCurrency,
    notifyEnabled, notifyPrefs, persistNotify,
    bioEnabled, persistBioEnabled,
    dailyReminderEnabled, setDailyReminderEnabled,
    dailyReminderTime, setDailyReminderTime,
  };
}

export type Preferences = ReturnType<typeof usePreferences>;
