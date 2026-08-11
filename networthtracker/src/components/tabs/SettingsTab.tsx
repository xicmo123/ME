"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, Archive, Bell, ChevronRight, Download, FileText, Fingerprint,
  Infinity as InfinityIcon, LifeBuoy, Lock, LogOut, Moon, RefreshCw, Shield, Sparkles, Sun, TrendingUp,
} from "lucide-react";
import { apiSend } from "@/lib/api";
import { NOTIFY_TYPE_OPTIONS } from "@/lib/constants";
import { HERO_THEMES } from "@/lib/hero-theme";
import {
  getAppVersion, getPurchasePlans, isNative, purchasePlan, restorePurchases, startOAuth,
} from "@/lib/native";
import { COLORS, SECTION_LABEL_CLASS, SURFACE_CLASS, TEXT_MUTED_CLASS, TEXT_PRIMARY_CLASS } from "@/lib/theme";
import { GoogleIcon, AppleIcon } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";
import type { CurrentUser, SyncStatus } from "@/lib/types";
import type { ShowToast } from "@/hooks/useToasts";

const Switch = ({ on }: { on: boolean }) => (
  <span
    className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${
      on ? "bg-[#4F7B5E]" : "bg-black/20 dark:bg-white/25"
    }`}
    aria-hidden
  >
    <span
      className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${
        on ? "translate-x-[19px]" : "translate-x-[3px]"
      }`}
    />
  </span>
);

// 免費額度與走勢區間都調整過，這張表要跟 lib/entitlements.ts 保持一致
const PLAN_COMPARISON: { label: string; free: string; pro: string }[] = [
  { label: "帳戶數量", free: "最多 6 個", pro: "無限" },
  { label: "財務目標", free: "最多 3 個", pro: "無限" },
  { label: "股價更新", free: "手動，一天 3 次", pro: "每 10 分鐘自動" },
  { label: "走勢區間", free: "兩週／六個月", pro: "＋一年／自訂" },
  { label: "大盤比較", free: "—", pro: "✓" },
  { label: "交易所自動同步", free: "—", pro: "✓" },
  { label: "CSV 報表匯出", free: "—", pro: "✓" },
  { label: "定期扣款自動記帳", free: "—", pro: "✓" },
  { label: "情境模擬", free: "—", pro: "✓" },
  { label: "年度報告", free: "—", pro: "✓" },
];

// rcPackageId 對應 RevenueCat 後台 offering 裡的 package identifier。
// $rc_monthly / $rc_annual / $rc_lifetime 是選用「預設方案類型」建立時自動產生的固定識別碼；
// 若後台改用自訂類型，這裡要跟著改，否則會顯示「找不到對應方案」。
//
// 月付與年付掛 7 天免費試用（Introductory Offer），實際的試用設定在 App Store Connect，
// 這裡只負責文案；買斷是一次性購買，沒有試用。
const PRICING_PLANS = [
  { id: "monthly", title: "月付方案", price: "NT$30", period: "／月", rcPackageId: "$rc_monthly", trial: true },
  { id: "yearly", title: "年付方案", price: "NT$300", period: "／年", badge: "省 2 個月", rcPackageId: "$rc_annual", trial: true },
  { id: "lifetime", title: "買斷方案", price: "NT$599", period: "／一次付清", badge: "終身使用", rcPackageId: "$rc_lifetime", trial: false },
] as const;

export type SettingsTabProps = {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  dataHealth: { lastSync: Date | null; syncErrors: number };
  onSyncPrices: () => void;
  syncing: boolean;
  syncStatus: SyncStatus | null;
  exchangeRate: number | null;
  onOpenBackfill: () => void;
  onExportCsv: () => void;
  onToggleBioLock: () => void;
  bioEnabled: boolean;
  notifyEnabled: boolean;
  notifyPrefs: Record<string, boolean>;
  onToggleNotify: () => void;
  onToggleNotifyType: (key: string) => void;
  dailyReminderTime: string;
  onDailyReminderTimeChange: (value: string) => void;
  dailyReminderEnabled: boolean;
  onToggleDailyReminder: () => void;
  showToast: ShowToast;
  currentUser: CurrentUser | null;
  onUnlinkProvider: (provider: "google" | "apple") => void;
  onLogout: () => void;
  onRequestDeleteAccount: () => void;
  onOpenArchived: () => void;
  onOpenYearReport: () => void;
  onPurchaseSuccess: () => Promise<void>;
};

export function SettingsTab(props: SettingsTabProps) {
  const {
    isDarkMode, onToggleDarkMode, dataHealth, onSyncPrices, syncing, syncStatus, exchangeRate,
    onOpenBackfill, onExportCsv, onToggleBioLock, bioEnabled, notifyEnabled, notifyPrefs,
    onToggleNotify, onToggleNotifyType, dailyReminderTime, onDailyReminderTimeChange,
    dailyReminderEnabled, onToggleDailyReminder, showToast, currentUser, onUnlinkProvider,
    onLogout, onRequestDeleteAccount, onOpenArchived, onOpenYearReport, onPurchaseSuccess,
  } = props;

  const [showPlans, setShowPlans] = useState(false);
  const [notifyExpanded, setNotifyExpanded] = useState(false);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [version, setVersion] = useState("—");

  const isPro = currentUser?.entitlements?.isPro ?? false;
  const hero = HERO_THEMES[isDarkMode ? "noir" : "cream"];
  const native = isNative();

  useEffect(() => {
    void getAppVersion().then(setVersion);
  }, []);

  const syncOutOfQuota = syncStatus?.remaining === 0;

  // 額度用完時每分鐘更新一次倒數。
  // 先前是在 render 裡直接呼叫 Date.now()——除了是不純的 render，實際效果也是「倒數不會動」，
  // 使用者盯著一個永遠寫著「3 小時 20 分後」的字串，直到某次重新 render 才跳一次。
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!syncOutOfQuota || !syncStatus?.resetAt) return;
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [syncOutOfQuota, syncStatus?.resetAt]);

  const syncResetLabel = (() => {
    if (!syncStatus?.resetAt) return null;
    const diffMs = new Date(syncStatus.resetAt).getTime() - now;
    if (diffMs <= 0) return "隨時";
    const totalMinutes = Math.ceil(diffMs / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours} 小時 ${minutes} 分後` : `${minutes} 分後`;
  })();

  async function handleSelectPlan(plan: (typeof PRICING_PLANS)[number]) {
    if (!native) {
      showToast("請在 App 內購買，網頁版暫不支援", "error");
      return;
    }
    if (purchasingId) return;

    setPurchasingId(plan.id);
    try {
      const plans = await getPurchasePlans();
      const pkg = plans?.find((item) => item.identifier === plan.rcPackageId);
      if (!pkg) {
        showToast("目前找不到這個方案，請稍後再試", "error");
        return;
      }
      const purchased = await purchasePlan(pkg.raw);
      if (!purchased) return; // 使用者自己取消，不算錯誤

      await apiSend("/api/purchases/sync", "POST");
      showToast("升級成功，感謝支持！");
      await onPurchaseSuccess();
      setShowPlans(false);
    } catch {
      showToast("購買失敗，請稍後再試", "error");
    } finally {
      setPurchasingId(null);
    }
  }

  async function handleRestorePurchases() {
    if (!native) {
      showToast("請在 App 內操作", "error");
      return;
    }
    const restored = await restorePurchases();
    if (!restored) {
      showToast("沒有找到可還原的購買紀錄", "error");
      return;
    }
    await apiSend("/api/purchases/sync", "POST").catch(() => {});
    await onPurchaseSuccess();
    showToast("已還原購買紀錄");
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-5 pb-4 pt-5">
      <div className="pb-2">
        <h1 className="font-display text-[22px] font-bold tracking-tight">設定</h1>
      </div>

      {/* 方案卡 */}
      <button
        type="button"
        onClick={() => setShowPlans(true)}
        className="relative w-full cursor-pointer overflow-hidden rounded-[24px] p-5 pb-6 text-left transition-transform active:scale-[0.99]"
        style={{ background: hero.background, color: hero.text, boxShadow: `${hero.shadow}, ${hero.ring}` }}
      >
        <div
          className="pointer-events-none absolute -left-12 -top-20 h-64 w-64 rounded-full"
          style={{ background: `radial-gradient(circle, #4F7B5E${isDarkMode ? "4D" : "38"} 0%, transparent 68%)` }}
          aria-hidden
        />
        <div className="relative mb-2.5 flex items-center gap-2">
          <span className="font-display text-lg font-bold tracking-tight">Zeno</span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ background: hero.plusBg, color: hero.plusText }}
          >
            PRO
          </span>
        </div>
        <p className="relative max-w-[72%] text-[15px] font-bold leading-snug">
          {isPro ? "你已解鎖 Zeno Pro，感謝支持！" : "升級成 Zeno Pro 版"}
        </p>
        <p className="relative mt-1 max-w-[68%] text-xs leading-relaxed opacity-80">
          {isPro ? "所有進階功能已完整開放，持續優化中" : "無限帳戶、無限目標，前 7 天免費試用"}
        </p>
        <span className="relative mt-3.5 flex items-center gap-1 text-xs font-semibold">
          {isPro ? "查看方案內容" : "查看方案與升級選項"}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="pointer-events-none absolute bottom-5 right-5" aria-hidden>
          <InfinityIcon className="h-10 w-16" style={{ color: hero.text }} strokeWidth={2.5} />
          <Sparkles
            className="absolute -right-1.5 -top-2.5 h-4 w-4"
            style={{ color: hero.text }}
            strokeWidth={2}
            fill={hero.text}
            fillOpacity={0.85}
          />
        </div>
      </button>

      {/* 外觀 */}
      <Section title="外觀">
        <Row onClick={onToggleDarkMode}>
          <RowLabel
            icon={isDarkMode ? Moon : Sun}
            title="深色模式"
          />
          <Switch on={isDarkMode} />
        </Row>
      </Section>

      {/* 資料 */}
      <Section title="資料">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: dataHealth.syncErrors ? COLORS.brick : COLORS.sage }}
              aria-hidden
            />
            <div>
              <span className="block text-sm font-medium">資料健康狀態</span>
              <span className={`text-xs ${TEXT_MUTED_CLASS}`}>
                {dataHealth.lastSync
                  ? `最近更新 ${dataHealth.lastSync.toLocaleString("zh-TW", {
                      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
                    })}`
                  : "尚無同步紀錄"}
              </span>
            </div>
          </div>
          <span
            className={`text-xs font-semibold ${
              dataHealth.syncErrors ? "text-[#A24936]" : "text-[#4F7B5E] dark:text-[#7FAE8F]"
            }`}
          >
            {dataHealth.syncErrors ? `${dataHealth.syncErrors} 筆異常` : "正常"}
          </span>
        </div>

        <Row onClick={onSyncPrices} disabled={syncing || syncOutOfQuota}>
          <RowLabel
            icon={RefreshCw}
            iconClassName={syncing ? "animate-spin" : undefined}
            title="更新價格"
            subtitle={
              isPro
                ? undefined
                : syncOutOfQuota
                  ? `已用完本次額度，${syncResetLabel ?? "稍後"}恢復`
                  : syncStatus?.remaining != null
                    ? `剩餘次數：${syncStatus.remaining}/${syncStatus.limit} 次（24 小時後重置）`
                    : `免費方案一天最多同步 ${currentUser?.entitlements?.manualSyncLimitPerDay ?? 3} 次`
            }
          />
          <span className={`shrink-0 font-ledger text-xs ${TEXT_MUTED_CLASS}`}>
            {syncing ? "更新中…" : `USD/TWD ${exchangeRate?.toFixed(2) || "—"}`}
          </span>
        </Row>

        <Row onClick={onOpenBackfill}>
          <RowLabel icon={TrendingUp} title="手動補登走勢" />
          <ChevronRight className={`h-4 w-4 ${TEXT_MUTED_CLASS}`} aria-hidden />
        </Row>

        <Row onClick={onExportCsv}>
          <RowLabel icon={Download} title="匯出 CSV 報表" subtitle="資產清單＋歷史＋交易紀錄" />
          {isPro ? (
            <ChevronRight className={`h-4 w-4 ${TEXT_MUTED_CLASS}`} aria-hidden />
          ) : (
            <Lock className={`h-3.5 w-3.5 ${TEXT_MUTED_CLASS}`} aria-hidden />
          )}
        </Row>

        <Row onClick={() => (isPro ? onOpenYearReport() : setShowPlans(true))}>
          <RowLabel icon={FileText} title="年度報告" />
          {isPro ? (
            <ChevronRight className={`h-4 w-4 ${TEXT_MUTED_CLASS}`} aria-hidden />
          ) : (
            <Lock className={`h-3.5 w-3.5 ${TEXT_MUTED_CLASS}`} aria-hidden />
          )}
        </Row>

        <Row onClick={onOpenArchived}>
          <RowLabel icon={Archive} title="已封存帳戶" />
          <ChevronRight className={`h-4 w-4 ${TEXT_MUTED_CLASS}`} aria-hidden />
        </Row>
      </Section>

      {/* 安全與提醒 */}
      <Section title="安全與提醒">
        <Row onClick={onToggleBioLock} disabled={!native}>
          <RowLabel icon={Fingerprint} title="Face ID 解鎖" subtitle="開啟後進入 App 需先驗證" />
          {native ? <Switch on={bioEnabled} /> : <AppOnlyBadge />}
        </Row>

        <Row onClick={() => native && setNotifyExpanded((current) => !current)} disabled={!native}>
          <RowLabel
            icon={Bell}
            title="事件提醒通知"
            subtitle="財報、除息、配息前一天提醒；行事曆事件於時間到時提醒"
          />
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`text-xs font-semibold ${
                notifyEnabled ? "text-[#4F7B5E] dark:text-[#7FAE8F]" : TEXT_MUTED_CLASS
              }`}
            >
              {native ? `${Object.values(notifyPrefs).filter(Boolean).length}/4 已開啟` : ""}
            </span>
            {native ? (
              <ChevronRight
                className={`h-3.5 w-3.5 ${TEXT_MUTED_CLASS} transition-transform ${notifyExpanded ? "rotate-90" : ""}`}
                aria-hidden
              />
            ) : (
              <AppOnlyBadge />
            )}
          </div>
        </Row>

        {notifyExpanded && native && (
          <div className="border-t border-black/[0.06] dark:border-white/[0.06]">
            <button
              type="button"
              onClick={onToggleNotify}
              className="flex w-full items-center justify-between py-3.5 pl-11 pr-4 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
            >
              <span className="text-sm">{notifyEnabled ? "全部關閉" : "全部開啟"}</span>
              <Switch on={notifyEnabled} />
            </button>
            {NOTIFY_TYPE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => onToggleNotifyType(option.key)}
                className="flex w-full items-center justify-between border-t border-black/[0.05] py-3.5 pl-11 pr-4 text-left transition-colors hover:bg-black/[0.02] dark:border-white/[0.05] dark:hover:bg-white/[0.02]"
              >
                <span className="text-sm">{option.label}</span>
                <Switch on={Boolean(notifyPrefs[option.key])} />
              </button>
            ))}
          </div>
        )}

        <div
          className={`flex items-center justify-between gap-3 border-t border-black/[0.06] p-4 dark:border-white/[0.06] ${
            native ? "" : "opacity-50"
          }`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <Bell className="h-4 w-4 shrink-0" style={{ color: COLORS.gold }} aria-hidden />
            <div className="min-w-0 text-left">
              <span className="block text-sm font-medium">每日記帳提醒</span>
              <span className={`text-xs ${TEXT_MUTED_CLASS}`}>每天固定時間提醒你記帳</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <label className="sr-only" htmlFor="daily-reminder-time">提醒時間</label>
            <input
              id="daily-reminder-time"
              type="time"
              value={dailyReminderTime}
              onChange={(event) => onDailyReminderTimeChange(event.target.value)}
              disabled={!native}
              className="border-b border-black/20 bg-transparent py-1 font-ledger text-sm disabled:opacity-40 dark:border-white/20"
            />
            <button
              type="button"
              onClick={onToggleDailyReminder}
              disabled={!native}
              aria-label="每日記帳提醒"
              aria-pressed={dailyReminderEnabled}
              className="p-1"
            >
              {native ? <Switch on={dailyReminderEnabled} /> : <AppOnlyBadge />}
            </button>
          </div>
        </div>
      </Section>

      {/* 帳號 */}
      <Section title="帳號">
        {currentUser && (
          <div className="border-b border-black/[0.06] p-4 dark:border-white/[0.06]">
            <p className="text-sm font-medium">{currentUser.email}</p>
            {!currentUser.emailVerified && (
              <p className="mt-0.5 text-xs font-semibold text-[#A24936]">信箱尚未驗證</p>
            )}
          </div>
        )}

        <ProviderRow
          icon={<GoogleIcon className="h-4 w-4" />}
          label="Google 帳號"
          linked={Boolean(currentUser?.hasGoogle)}
          canUnlink={Boolean(currentUser?.hasPassword)}
          onLink={() => startOAuth("google", { link: true })}
          onUnlink={() => onUnlinkProvider("google")}
        />
        <ProviderRow
          icon={<AppleIcon className={`h-4 w-4 ${TEXT_PRIMARY_CLASS}`} />}
          label="Apple 帳號"
          linked={Boolean(currentUser?.hasApple)}
          canUnlink={Boolean(currentUser?.hasPassword)}
          onLink={() => startOAuth("apple", { link: true })}
          onUnlink={() => onUnlinkProvider("apple")}
        />

        <Row onClick={onLogout}>
          <span className="flex items-center gap-3">
            <LogOut className="h-4 w-4 text-[#A24936]" aria-hidden />
            <span className="text-sm font-medium text-[#A24936]">登出</span>
          </span>
        </Row>
      </Section>

      {/* 關於 */}
      <Section title="關於">
        <LinkRow href="/support" icon={LifeBuoy} label="說明與意見回饋" />
        <LinkRow href="/privacy" icon={Shield} label="隱私權政策" />
        <LinkRow href="/terms" icon={FileText} label="服務條款" />
      </Section>

      <div className="overflow-hidden rounded-2xl border border-[#A24936]/25 bg-[#A24936]/[0.03]">
        <div className="border-b border-[#A24936]/15 px-4 py-2">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#A24936]">危險操作</p>
        </div>
        <button
          type="button"
          onClick={onRequestDeleteAccount}
          className="flex w-full items-center gap-3 p-4 transition-colors hover:bg-[#A24936]/5"
        >
          <AlertTriangle className="h-4 w-4 text-[#A24936]" aria-hidden />
          <span className="text-sm font-medium text-[#A24936]">刪除帳號與所有資料</span>
        </button>
      </div>

      <p className={`pb-2 text-center text-xs ${TEXT_MUTED_CLASS}`}>Zeno · 版本 {version}</p>

      {/* 方案內容 */}
      <Modal open={showPlans} onClose={() => setShowPlans(false)} size="sm" title="方案內容">
        <div className="space-y-5 p-5">
          <div
            className="relative overflow-hidden rounded-[20px] p-4"
            style={{ background: hero.background, color: hero.text, boxShadow: `${hero.shadow}, ${hero.ring}` }}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span className="font-display text-sm font-bold tracking-tight">Zeno</span>
              <span className="font-ledger text-[11px] font-bold uppercase tracking-[0.2em] opacity-80">Pro</span>
            </div>
            <p className="text-sm font-bold">{isPro ? "你已經是 Zeno Pro 版" : "升級成 Zeno Pro 版"}</p>
            <p className="mt-0.5 text-xs opacity-80">
              {isPro ? "感謝支持，所有進階功能已解鎖" : "無限帳戶、無限目標，完整掌控你的資產"}
            </p>
          </div>

          <div>
            <p className={`${SECTION_LABEL_CLASS} mb-2`}>方案比較</p>
            <div className={`${SURFACE_CLASS} overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.06]`}>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b border-black/[0.06] px-4 py-2 dark:border-white/[0.06]">
                <span />
                <span className={`w-20 text-center text-xs font-bold ${TEXT_MUTED_CLASS}`}>免費版</span>
                <span className="w-20 text-center text-xs font-bold" style={{ color: COLORS.gold }}>PRO 版</span>
              </div>
              {PLAN_COMPARISON.map((row, index) => (
                <div
                  key={row.label}
                  className={`grid grid-cols-[1fr_auto_auto] items-center gap-x-3 px-4 py-2.5 ${
                    index > 0 ? "border-t border-black/[0.05] dark:border-white/[0.05]" : ""
                  }`}
                >
                  <span className="text-sm">{row.label}</span>
                  <span className={`w-20 text-center text-xs ${TEXT_MUTED_CLASS}`}>{row.free}</span>
                  <span
                    className="w-20 text-center text-xs font-semibold"
                    style={{ color: row.pro === "✓" ? COLORS.sage : COLORS.gold }}
                  >
                    {row.pro}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {!isPro && (
            <div>
              <p className={`${SECTION_LABEL_CLASS} mb-2`}>升級方案</p>
              <div className="space-y-2">
                {PRICING_PLANS.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => handleSelectPlan(plan)}
                    disabled={purchasingId !== null}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-black/10 p-4 text-left transition-colors hover:border-[#B8933C] disabled:opacity-50 dark:border-white/10"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{plan.title}</span>
                        {"badge" in plan && plan.badge && (
                          <span
                            className="rounded px-1.5 py-0.5 text-xs font-bold"
                            style={{ background: `${COLORS.gold}1A`, color: COLORS.gold }}
                          >
                            {plan.badge}
                          </span>
                        )}
                        {plan.trial && (
                          <span
                            className="rounded px-1.5 py-0.5 text-xs font-bold"
                            style={{ background: `${COLORS.sage}1A`, color: COLORS.sage }}
                          >
                            7 天免費
                          </span>
                        )}
                      </div>
                      <span className={`text-xs ${TEXT_MUTED_CLASS}`}>
                        {purchasingId === plan.id
                          ? "處理中…"
                          : plan.trial
                            ? "先免費試用 7 天，期間可隨時取消"
                            : "一次付清，永久解鎖所有 Pro 功能"}
                      </span>
                    </div>
                    <span className="shrink-0 whitespace-nowrap font-ledger text-sm font-bold">
                      {plan.price}
                      <span className={`text-xs font-normal ${TEXT_MUTED_CLASS}`}>{plan.period}</span>
                    </span>
                  </button>
                ))}
              </div>
              <p className={`mt-3 text-xs leading-relaxed ${TEXT_MUTED_CLASS}`}>
                訂閱將自動續期，可在 App Store 帳號設定中隨時取消；試用期結束前 24 小時取消即不會被扣款。
              </p>
              <button
                type="button"
                onClick={handleRestorePurchases}
                className="mt-3 w-full py-2 text-center text-xs font-semibold underline-offset-2 hover:underline"
                style={{ color: COLORS.gold }}
              >
                還原購買紀錄
              </button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ─── 小元件 ───────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${SURFACE_CLASS} overflow-hidden rounded-2xl`} aria-label={title}>
      <div className="border-b border-black/[0.06] px-4 py-2 dark:border-white/[0.06]">
        <p className={SECTION_LABEL_CLASS}>{title}</p>
      </div>
      {children}
    </section>
  );
}

function Row({
  onClick, disabled, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-3 border-t border-black/[0.06] p-4 text-left transition-colors first:border-t-0 hover:bg-black/[0.02] disabled:opacity-50 disabled:hover:bg-transparent dark:border-white/[0.06] dark:hover:bg-white/[0.02]"
    >
      {children}
    </button>
  );
}

function RowLabel({
  icon: Icon, iconClassName, title, subtitle,
}: {
  icon: typeof Bell;
  iconClassName?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Icon className={`h-4 w-4 shrink-0 ${iconClassName ?? ""}`} style={{ color: COLORS.gold }} aria-hidden />
      <span className="min-w-0 text-left">
        <span className="block text-sm font-medium">{title}</span>
        {subtitle && <span className={`block text-xs ${TEXT_MUTED_CLASS}`}>{subtitle}</span>}
      </span>
    </span>
  );
}

function AppOnlyBadge() {
  return <span className={`shrink-0 text-xs font-bold ${TEXT_MUTED_CLASS}`}>APP ONLY</span>;
}

function ProviderRow({
  icon, label, linked, canUnlink, onLink, onUnlink,
}: {
  icon: React.ReactNode;
  label: string;
  linked: boolean;
  canUnlink: boolean;
  onLink: () => void;
  onUnlink: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-black/[0.06] p-4 dark:border-white/[0.06]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0">{icon}</span>
        <div className="min-w-0">
          <span className="block text-sm font-medium">{label}</span>
          <span className={`text-xs ${TEXT_MUTED_CLASS}`}>{linked ? "已綁定" : "尚未綁定"}</span>
        </div>
      </div>
      {linked ? (
        canUnlink ? (
          <button
            type="button"
            onClick={onUnlink}
            className={`shrink-0 py-1 text-xs font-semibold ${TEXT_MUTED_CLASS} hover:text-[#A24936] transition-colors`}
          >
            取消綁定
          </button>
        ) : (
          <span className={`shrink-0 text-xs ${TEXT_MUTED_CLASS}`} title="這是你唯一的登入方式，無法解除綁定">
            唯一登入方式
          </span>
        )
      ) : (
        <button
          type="button"
          onClick={onLink}
          className="shrink-0 py-1 text-xs font-semibold"
          style={{ color: COLORS.gold }}
        >
          綁定
        </button>
      )}
    </div>
  );
}

function LinkRow({ href, icon: Icon, label }: { href: string; icon: typeof Bell; label: string }) {
  return (
    <a
      href={href}
      className="flex w-full items-center justify-between border-t border-black/[0.06] p-4 transition-colors first:border-t-0 hover:bg-black/[0.02] dark:border-white/[0.06] dark:hover:bg-white/[0.02]"
    >
      <span className="flex items-center gap-3">
        <Icon className="h-4 w-4" style={{ color: COLORS.gold }} aria-hidden />
        <span className="text-sm font-medium">{label}</span>
      </span>
      <ChevronRight className={`h-4 w-4 ${TEXT_MUTED_CLASS}`} aria-hidden />
    </a>
  );
}
