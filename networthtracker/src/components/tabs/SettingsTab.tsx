import { Moon, Sun, RefreshCw, TrendingUp, ChevronRight, Download, Fingerprint, Bell, LogOut, AlertTriangle } from "lucide-react";
import { isNative } from "@/lib/native";
import { GoogleIcon, AppleIcon } from "@/components/icons";

const Switch = ({ on }: { on: boolean }) => (
  <span className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${on ? "bg-[#4F7B5E]" : "bg-black/15 dark:bg-white/20"}`}>
    <span className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow transform transition-transform ${on ? "translate-x-[19px]" : "translate-x-[3px]"}`} />
  </span>
);

type CurrentUser = { email: string; hasGoogle: boolean; hasApple: boolean; hasPassword: boolean } | null;

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
}) {
  return (
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
  );
}
