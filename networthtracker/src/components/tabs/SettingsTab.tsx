"use client";

import { useState } from "react";
import { Moon, Sun, RefreshCw, TrendingUp, ChevronRight, Download, Fingerprint, Bell, LogOut, AlertTriangle, Crown, X, Archive } from "lucide-react";
import { isNative, startOAuth } from "@/lib/native";
import { GoogleIcon, AppleIcon } from "@/components/icons";
import { HERO_THEMES } from "@/lib/hero-theme";

const Switch = ({ on }: { on: boolean }) => (
  <span className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${on ? "bg-[#4F7B5E]" : "bg-black/15 dark:bg-white/20"}`}>
    <span className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow transform transition-transform ${on ? "translate-x-[19px]" : "translate-x-[3px]"}`} />
  </span>
);

type Entitlements = {
  tier: "FREE" | "PRO";
  isPro: boolean;
  limits: { maxAccounts: number | null; maxGoals: number | null };
  manualSyncLimitPer4Hours?: number | null;
};

type CurrentUser = { email: string; hasGoogle: boolean; hasApple: boolean; hasPassword: boolean; entitlements?: Entitlements } | null;

const PLAN_COMPARISON: { label: string; free: string; pro: string }[] = [
  { label: "帳戶數量", free: "最多 20 個", pro: "無限" },
  { label: "財務目標", free: "最多 3 個", pro: "無限" },
  { label: "股價即時更新", free: "手動同步，每 4 小時最多 3 次", pro: "每 10 分鐘自動更新" },
  { label: "交易所自動同步", free: "—", pro: "✓" },
  { label: "CSV 報表匯出", free: "—", pro: "✓" },
  { label: "定期扣款自動記帳", free: "—", pro: "✓" },
];

const PRICING_PLANS = [
  { id: "monthly", title: "月付方案", price: "NT$30", period: "／月" },
  { id: "yearly", title: "年付方案", price: "NT$300", period: "／年", badge: "省 2 個月" },
  { id: "lifetime", title: "買斷方案", price: "NT$599", period: "／一次付清", badge: "終身使用" },
] as const;

export function SettingsTab({
  surface,
  sectionLabel,
  textMuted,
  textPrimary,
  gold,
  isDarkMode,
  toggleDarkMode,
  dataHealth,
  handleSyncPrices,
  syncing,
  syncStatus,
  exchangeRate,
  setShowHistoryForm,
  handleExportCsv,
  handleToggleBioLock,
  bioEnabled,
  notifyExpanded,
  setNotifyExpanded,
  notifyEnabled,
  notifyPrefs,
  handleToggleNotify,
  handleToggleNotifyType,
  dailyReminderTime,
  setDailyReminderTime,
  dailyReminderEnabled,
  setDailyReminderEnabled,
  showToast,
  currentUser,
  googleUnlinking,
  handleGoogleUnlink,
  appleUnlinking,
  handleAppleUnlink,
  handleLogout,
  setShowDeleteConfirm,
  handleOpenArchivedAccounts,
}: {
  surface: string;
  sectionLabel: string;
  textMuted: string;
  textPrimary: string;
  gold: string;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  dataHealth: { lastSync: Date | null; syncErrors: number };
  handleSyncPrices: () => void;
  syncing: boolean;
  syncStatus: { limit: number | null; used: number; remaining: number | null; resetAt: string | null } | null;
  exchangeRate: number | null;
  setShowHistoryForm: (v: boolean) => void;
  handleExportCsv: () => void;
  handleToggleBioLock: () => void;
  bioEnabled: boolean;
  notifyExpanded: boolean;
  setNotifyExpanded: (updater: (v: boolean) => boolean) => void;
  notifyEnabled: boolean;
  notifyPrefs: Record<string, boolean>;
  handleToggleNotify: () => void;
  handleToggleNotifyType: (key: string) => void;
  dailyReminderTime: string;
  setDailyReminderTime: (v: string) => void;
  dailyReminderEnabled: boolean;
  setDailyReminderEnabled: (updater: (v: boolean) => boolean) => void;
  showToast: (message: string, kind?: "success" | "error") => void;
  currentUser: CurrentUser;
  googleUnlinking: boolean;
  handleGoogleUnlink: () => void;
  appleUnlinking: boolean;
  handleAppleUnlink: () => void;
  handleLogout: () => void;
  setShowDeleteConfirm: (v: boolean) => void;
  handleOpenArchivedAccounts: () => void;
}) {
  const [showPlanDetails, setShowPlanDetails] = useState(false);
  const isPro = currentUser?.entitlements?.isPro ?? false;
  const heroTheme = isDarkMode ? "noir" : "cream";
  const hero = HERO_THEMES[heroTheme];

  const syncOutOfQuota = syncStatus?.remaining === 0;
  const syncResetLabel = (() => {
    if (!syncStatus?.resetAt) return null;
    const diffMs = new Date(syncStatus.resetAt).getTime() - Date.now();
    if (diffMs <= 0) return "隨時";
    const totalMinutes = Math.ceil(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours} 小時 ${minutes} 分後` : `${minutes} 分後`;
  })();

  function handleSelectPlan(planTitle: string) {
    showToast(`${planTitle}付款功能即將推出，敬請期待`, "success");
  }

  return (
    <div className="px-5 pt-5 pb-4 max-w-lg mx-auto space-y-4">
      <div className="pb-2">
        <h2 className="font-display text-[22px] font-bold tracking-tight">設定</h2>
      </div>
      <button
        onClick={() => setShowPlanDetails(true)}
        className="w-full text-left relative overflow-hidden rounded-[24px] p-5 transition-transform active:scale-[0.99] cursor-pointer"
        style={{ background: hero.background, color: hero.text, boxShadow: `${hero.shadow}, ${hero.ring}` }}
      >
        <Crown className="absolute -right-3 -bottom-3 h-24 w-24 opacity-[0.12]" style={{ color: hero.text }} />
        <div className="relative flex items-center gap-2 mb-2">
          <span className="font-display text-base font-bold tracking-tight">Zeno</span>
          <span className="font-mono-ledger text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: hero.chipBtnBg }}>PRO</span>
        </div>
        <p className="relative text-[15px] font-bold leading-snug max-w-[85%]">
          {isPro ? "你已解鎖 Zeno Pro，感謝支持！" : "升級成 Zeno Pro 版"}
        </p>
        <p className="relative text-xs opacity-75 mt-1 max-w-[80%] leading-relaxed">
          {isPro ? "所有進階功能已完整開放，持續優化中" : "無限帳戶、無限目標，完整掌控你的資產"}
        </p>
        <div className="relative flex items-center gap-1 mt-3.5 text-xs font-semibold">
          <span>{isPro ? "查看方案內容" : "查看方案與升級選項"}</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </div>
      </button>
      <div className={`${surface} rounded-2xl overflow-hidden`}>
        <div className="px-4 py-2 border-b border-black/[0.06] dark:border-white/[0.06]">
          <p className={sectionLabel}>外觀</p>
        </div>
        <button onClick={toggleDarkMode} className="w-full flex items-center justify-between p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
          <div className="flex items-center gap-3">
            {isDarkMode ? <Moon className="h-4 w-4" style={{ color: gold }} /> : <Sun className="h-4 w-4" style={{ color: gold }} />}
            <span className="text-sm font-medium">{isDarkMode ? "深色模式" : "淺色模式"}</span>
          </div>
          <Switch on={!isDarkMode} />
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
        <button onClick={handleSyncPrices} disabled={syncing || syncOutOfQuota} className="w-full flex items-center justify-between p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] disabled:opacity-50 disabled:hover:bg-transparent transition-colors">
          <div className="flex items-center gap-3">
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} style={{ color: gold }} />
            <div className="text-left">
              <span className="text-sm font-medium block">更新價格</span>
              {!isPro && (
                <span className={`text-[11px] ${textMuted}`}>
                  {syncOutOfQuota
                    ? `已用完本次額度，${syncResetLabel ?? "稍後"}恢復`
                    : syncStatus?.remaining != null
                      ? `剩餘次數：${syncStatus.remaining}/${syncStatus.limit} 次（每 4 小時重置）`
                      : `免費方案每 4 小時最多手動同步 ${currentUser?.entitlements?.manualSyncLimitPer4Hours ?? 3} 次；升級 Pro 享每 10 分鐘自動更新`}
                </span>
              )}
            </div>
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
        <div className="border-t border-black/[0.06] dark:border-white/[0.06]">
          <button onClick={handleOpenArchivedAccounts} className="w-full flex items-center justify-between p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-3">
              <Archive className="h-4 w-4" style={{ color: gold }} />
              <span className="text-sm font-medium">已封存帳戶</span>
            </div>
            <ChevronRight className={`h-4 w-4 ${textMuted}`} />
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
          {isNative() ? <Switch on={bioEnabled} /> : <span className={`text-xs font-bold ${textMuted}`}>APP ONLY</span>}
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
              {isNative() ? <Switch on={dailyReminderEnabled} /> : <span className={`text-xs font-bold ${textMuted}`}>APP ONLY</span>}
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
              <button type="button" onClick={() => startOAuth("google")} className="text-xs font-semibold" style={{ color: gold }}>綁定</button>
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
              <button type="button" onClick={() => startOAuth("apple")} className="text-xs font-semibold" style={{ color: gold }}>綁定</button>
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
          <p className="text-xs font-bold tracking-[0.18em] uppercase text-[#A24936]">危險操作</p>
        </div>
        <button onClick={() => setShowDeleteConfirm(true)} className="w-full flex items-center p-4 gap-3 hover:bg-[#A24936]/5 transition-colors">
          <AlertTriangle className="h-4 w-4 text-[#A24936]" />
          <span className="text-sm font-medium text-[#A24936]">刪除帳號與所有資料</span>
        </button>
      </div>
      <p className={`text-center text-xs ${textMuted} pb-2`}>Zeno · 版本 1.0</p>

      {showPlanDetails && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className={`w-full sm:max-w-sm ${surface} sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto`}>
            <div className="flex items-center justify-between p-5 border-b border-black/[0.06] dark:border-white/[0.06] sticky top-0 bg-inherit">
              <div className="flex items-center gap-2">
                <Crown className="h-4 w-4" style={{ color: gold }} />
                <h3 className="font-display text-base font-semibold">方案內容</h3>
              </div>
              <button onClick={() => setShowPlanDetails(false)} className={`p-1.5 ${textMuted} hover:text-[#1C1F1A] dark:hover:text-white`}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div
                className="relative overflow-hidden rounded-[20px] p-4"
                style={{ background: hero.background, color: hero.text, boxShadow: `${hero.shadow}, ${hero.ring}` }}
              >
                <Crown className="absolute -right-3 -bottom-3 h-20 w-20 opacity-[0.12]" style={{ color: hero.text }} />
                <div className="relative flex items-center gap-2 mb-1.5">
                  <span className="font-display text-sm font-bold tracking-tight">Zeno</span>
                  <span className="font-mono-ledger text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: hero.chipBtnBg }}>PRO</span>
                </div>
                <p className="relative text-sm font-bold">{isPro ? "你已經是 Zeno Pro 版" : "升級成 Zeno Pro 版"}</p>
                <p className="relative text-xs opacity-75 mt-0.5">{isPro ? "感謝支持，所有進階功能已解鎖" : "無限帳戶、無限目標，完整掌控你的資產"}</p>
              </div>

              <div>
                <p className={`${sectionLabel} mb-2`}>方案比較</p>
                <div className={`${surface} border border-black/[0.06] dark:border-white/[0.06] rounded-xl overflow-hidden`}>
                  <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-4 py-2 border-b border-black/[0.06] dark:border-white/[0.06]">
                    <span className={`text-xs font-bold ${textMuted}`} />
                    <span className={`text-xs font-bold ${textMuted} text-center`}>免費版</span>
                    <span className="text-xs font-bold text-center" style={{ color: gold }}>PRO 版</span>
                  </div>
                  {PLAN_COMPARISON.map((row, i) => (
                    <div key={row.label} className={`grid grid-cols-[1fr_auto_auto] gap-x-3 px-4 py-2.5 items-center ${i > 0 ? "border-t border-black/[0.05] dark:border-white/[0.05]" : ""}`}>
                      <span className="text-sm">{row.label}</span>
                      <span className={`text-xs font-mono-ledger text-center w-14 ${textMuted}`}>{row.free}</span>
                      <span className="text-xs font-mono-ledger text-center w-14 font-semibold" style={{ color: row.pro === "✓" ? "#4F7B5E" : gold }}>{row.pro}</span>
                    </div>
                  ))}
                </div>
              </div>

              {!isPro && (
                <div>
                  <p className={`${sectionLabel} mb-2`}>升級方案</p>
                  <div className="space-y-2">
                    {PRICING_PLANS.map((plan) => (
                      <button
                        key={plan.id}
                        onClick={() => handleSelectPlan(plan.title)}
                        className="w-full flex items-center justify-between p-4 rounded-xl border border-black/10 dark:border-white/10 hover:border-[#B8933C] transition-colors text-left"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{plan.title}</span>
                            {"badge" in plan && plan.badge && (
                              <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: `${gold}1A`, color: gold }}>{plan.badge}</span>
                            )}
                          </div>
                          <span className={`text-xs ${textMuted}`}>升級後立即解鎖所有 Pro 功能</span>
                        </div>
                        <span className="font-mono-ledger text-sm font-bold whitespace-nowrap">
                          {plan.price}<span className={`text-xs font-normal ${textMuted}`}>{plan.period}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
