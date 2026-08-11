"use client";

// 其餘幾個唯讀／輕量的彈窗：股票事件明細、自建事件明細、近期紀錄、年度報告、
// 已封存帳戶、降級提醒、走勢圖展開。

import { useEffect, useState } from "react";
import { Archive, Lock, RotateCcw, Trash2 } from "lucide-react";
import { apiGet, apiSend, toUserMessage } from "@/lib/api";
import { ACTIVITY_META, BENCHMARKS, EVENT_TYPE_META } from "@/lib/constants";
import { HERO_THEMES } from "@/lib/hero-theme";
import { formatInteger, formatPct, MASKED_AMOUNT } from "@/lib/format";
import {
  BTN_PRIMARY_CLASS, COLORS, deltaColorForTheme, SURFACE_CLASS, TEXT_MUTED_CLASS, TEXT_PRIMARY_CLASS,
} from "@/lib/theme";
import { Modal } from "@/components/ui/Modal";
import { NetWorthChart, type NetWorthChartProps } from "@/components/charts/NetWorthChart";
import type { ActivityItem } from "@/lib/derive";
import type { Account, CalendarEventRecord, StockEvent } from "@/lib/types";

// ─── 股票事件明細 ─────────────────────────────────────────────────────────

export function StockEventDetailModal({
  event, onClose,
}: {
  event: StockEvent | null;
  onClose: () => void;
}) {
  if (!event) return null;
  const meta = EVENT_TYPE_META[event.type];
  const showDividend = event.type === "DIVIDEND_PAY" || event.type === "EX_DIVIDEND";

  return (
    <Modal open onClose={onClose} size="sm" title={`${event.symbol} · ${event.name}`}>
      <div className="space-y-4 p-5">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{ background: `${meta.color}1F`, color: meta.color }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} aria-hidden />
          <span className="text-xs font-semibold">{meta.label}</span>
        </span>

        <div>
          <p className={`text-xs ${TEXT_MUTED_CLASS}`}>日期</p>
          <p className="mt-0.5 font-ledger text-sm font-bold">
            {new Date(event.date).toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>

        {showDividend && (
          <div>
            <p className={`text-xs ${TEXT_MUTED_CLASS}`}>每股配息</p>
            {event.amountPerShare != null ? (
              <>
                <p className="mt-0.5 font-ledger text-lg font-bold">{event.amountPerShare.toFixed(2)}</p>
                {event.amountPerShareIsAnnualized && (
                  <p className={`mt-1 text-xs ${TEXT_MUTED_CLASS}`}>
                    此為年化配息金額，非單次配發金額，實際單次配息以官方公告為準
                  </p>
                )}
              </>
            ) : (
              <p className="mt-0.5 text-sm">尚未公告</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── 自建行事曆事件明細（可刪除） ─────────────────────────────────────────

export function CustomEventDetailModal({
  event, onClose, onDeleted,
}: {
  event: CalendarEventRecord | null;
  onClose: () => void;
  onDeleted: (message: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [event]);

  if (!event) return null;
  const meta = EVENT_TYPE_META.CUSTOM;

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await apiSend(`/api/calendar-events/${event!.id}`, "DELETE");
      onDeleted("已刪除行事曆事件");
      onClose();
    } catch (err) {
      setError(toUserMessage(err, "刪除失敗，請再試一次"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="sm" title={event.title}>
      <div className="space-y-4 p-5">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{ background: `${meta.color}1F`, color: meta.color }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} aria-hidden />
          <span className="text-xs font-semibold">{meta.label}</span>
        </span>

        <div>
          <p className={`text-xs ${TEXT_MUTED_CLASS}`}>時間</p>
          <p className="mt-0.5 font-ledger text-sm font-bold">
            {new Date(event.eventAt).toLocaleString("zh-TW", {
              year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
            })}
          </p>
        </div>

        {error && <p className="text-sm font-medium text-[#A24936]" role="alert">{error}</p>}

        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="w-full rounded-lg border border-[#A24936]/40 py-3 text-sm font-semibold text-[#A24936] transition-colors hover:bg-[#A24936]/5 disabled:opacity-50"
        >
          {deleting ? "刪除中…" : "刪除事件"}
        </button>
      </div>
    </Modal>
  );
}

// ─── 近期紀錄 ─────────────────────────────────────────────────────────────

export function ActivityLogModal({
  open, onClose, items, hideBalance,
}: {
  open: boolean;
  onClose: () => void;
  items: ActivityItem[];
  hideBalance: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} size="sm" title="近期紀錄">
      <div className="p-5">
        {items.length === 0 ? (
          <p className={`py-6 text-center text-sm ${TEXT_MUTED_CLASS}`}>還沒有任何紀錄</p>
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.05]">
            {items.slice(0, 30).map((item) => {
              const meta = ACTIVITY_META[item.type] ?? { label: item.type, sign: "" as const, color: COLORS.warmGrey };
              const primary = item.description || item.accountName || "—";
              const secondary = item.description && item.accountName ? item.accountName : null;

              return (
                <li key={item.id} className="flex items-center gap-3 py-3">
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold"
                    style={{ color: meta.color, background: `${meta.color}1A` }}
                  >
                    {meta.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{primary}</p>
                    <p className={`truncate text-xs ${TEXT_MUTED_CLASS}`}>
                      {String(item.date).slice(0, 10)}
                      {secondary && <span> · {secondary}</span>}
                      {item.type === "AUTO_DEDUCTION" && item.price != null && (
                        <span>
                          {" "}· 本金 {formatInteger(Number(item.quantity ?? 0))} · 利息 {formatInteger(Number(item.price))}
                        </span>
                      )}
                    </p>
                  </div>
                  {item.amount != null && (
                    <span className="shrink-0 font-ledger text-xs font-bold" style={{ color: meta.color }}>
                      {hideBalance ? MASKED_AMOUNT : `${meta.sign}NT$ ${formatInteger(Number(item.amount))}`}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

// ─── 年度報告 ─────────────────────────────────────────────────────────────

export type YearReport = {
  year: number;
  delta: number;
  pct: number | null;
  startNetWorth: number;
  endNetWorth: number;
  best: { label: string; delta: number } | null;
  worst: { label: string; delta: number } | null;
};

export function YearReportModal({
  open, onClose, report, isDarkMode, onShared,
}: {
  open: boolean;
  onClose: () => void;
  report: YearReport | null;
  isDarkMode: boolean;
  onShared: (message: string) => void;
}) {
  const hero = HERO_THEMES[isDarkMode ? "noir" : "cream"];

  async function handleShare() {
    if (!report) return;
    const text = `${report.year} 年度報告 · 淨資產${report.delta >= 0 ? "成長" : "減少"} NT$ ${formatInteger(
      Math.abs(report.delta)
    )}${report.pct !== null ? `（${formatPct(report.pct)}）` : ""} · 來自 Zeno`;

    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // 使用者取消分享，靜默處理
        return;
      }
    }
    await navigator.clipboard.writeText(text).catch(() => {});
    onShared("已複製摘要文字");
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" title={`${report?.year ?? new Date().getFullYear()} 年度報告`}>
      {report ? (
        <div className="space-y-4 p-5">
          <div
            className="relative overflow-hidden rounded-[20px] p-5"
            style={{ background: hero.background, color: hero.text, boxShadow: `${hero.shadow}, ${hero.ring}` }}
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-80">{report.year} 淨資產變化</p>
            <p className="mt-2 font-ledger text-2xl font-bold">
              {report.delta >= 0 ? "+" : "−"}NT$ {formatInteger(Math.abs(report.delta))}
            </p>
            {report.pct !== null && <p className="mt-1 text-sm font-semibold">{formatPct(report.pct)}</p>}
            <div className="mt-4 flex items-center gap-4 font-ledger text-xs opacity-85">
              <span>年初 NT$ {formatInteger(report.startNetWorth)}</span>
              <span>目前 NT$ {formatInteger(report.endNetWorth)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className={`${SURFACE_CLASS} rounded-xl border border-black/[0.06] p-3 dark:border-white/[0.06]`}>
              <p className={`text-xs ${TEXT_MUTED_CLASS}`}>表現最好的月份</p>
              {report.best ? (
                <>
                  <p className="mt-1 text-sm font-bold">{report.best.label}</p>
                  <p
                    className="font-ledger text-xs font-semibold"
                    style={{ color: deltaColorForTheme(report.best.delta, isDarkMode) }}
                  >
                    +NT$ {formatInteger(report.best.delta)}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm">—</p>
              )}
            </div>
            <div className={`${SURFACE_CLASS} rounded-xl border border-black/[0.06] p-3 dark:border-white/[0.06]`}>
              <p className={`text-xs ${TEXT_MUTED_CLASS}`}>表現最弱的月份</p>
              {report.worst ? (
                <>
                  <p className="mt-1 text-sm font-bold">{report.worst.label}</p>
                  <p
                    className="font-ledger text-xs font-semibold"
                    style={{ color: deltaColorForTheme(report.worst.delta, isDarkMode) }}
                  >
                    {report.worst.delta >= 0 ? "+" : "−"}NT$ {formatInteger(Math.abs(report.worst.delta))}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm">—</p>
              )}
            </div>
          </div>

          <button type="button" onClick={handleShare} className={BTN_PRIMARY_CLASS}>
            分享
          </button>
        </div>
      ) : (
        <div className="p-5">
          <p className={`text-sm ${TEXT_MUTED_CLASS}`}>今年的走勢資料還不夠，累積幾筆之後再回來看看。</p>
        </div>
      )}
    </Modal>
  );
}

// ─── 已封存帳戶 ───────────────────────────────────────────────────────────

export function ArchivedAccountsModal({
  open, onClose, onChanged, onRequestPermanentDelete,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: (message: string) => void;
  onRequestPermanentDelete: (account: { id: string; name: string }) => void;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    void apiGet<Account[]>("/api/accounts?archived=true")
      .then(setAccounts)
      .catch((err) => setError(toUserMessage(err, "讀取已封存帳戶失敗")))
      .finally(() => setLoading(false));
  }, [open]);

  async function handleRestore(account: Account) {
    setRestoringId(account.id);
    try {
      await apiSend(`/api/accounts/${account.id}`, "PATCH", { action: "restore" });
      setAccounts((current) => current.filter((item) => item.id !== account.id));
      onChanged(`已復原「${account.name}」`);
    } catch (err) {
      setError(toUserMessage(err, "復原失敗，請再試一次"));
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <Archive className="h-4 w-4" aria-hidden /> 已封存帳戶
        </span>
      }
    >
      <div className="p-5">
        {loading ? (
          <p className={`py-6 text-center text-sm ${TEXT_MUTED_CLASS}`}>載入中…</p>
        ) : error ? (
          <p className="py-6 text-center text-sm text-[#A24936]" role="alert">{error}</p>
        ) : accounts.length === 0 ? (
          <p className={`py-6 text-center text-sm ${TEXT_MUTED_CLASS}`}>目前沒有已封存的帳戶</p>
        ) : (
          <>
            <p className={`mb-3 text-xs ${TEXT_MUTED_CLASS}`}>
              封存滿 60 天的帳戶及其歷史紀錄會被永久刪除，如需保留請及早復原。
            </p>
            <ul className="space-y-2">
              {accounts.map((account) => (
                <li
                  key={account.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-black/10 p-3 dark:border-white/10"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{account.name}</p>
                    <p className={`text-xs ${TEXT_MUTED_CLASS}`}>
                      {account.type === "LIABILITY" ? "負債" : "資產"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRestore(account)}
                      disabled={restoringId === account.id}
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-xs font-semibold transition-colors hover:border-[#4F7B5E] hover:text-[#4F7B5E] disabled:opacity-50 dark:border-white/10"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden />
                      {restoringId === account.id ? "復原中…" : "復原"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRequestPermanentDelete({ id: account.id, name: account.name })}
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-xs font-semibold transition-colors hover:border-[#A24936] hover:text-[#A24936] dark:border-white/10"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden />
                      刪除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}

// ─── 降級提醒 ─────────────────────────────────────────────────────────────

export function DowngradeAlertModal({
  alert, onClose, onOpenPlans,
}: {
  alert: { accounts: { id: string; name: string; type: string }[]; goals: { id: string; name: string }[] } | null;
  onClose: () => void;
  onOpenPlans: () => void;
}) {
  if (!alert) return null;
  const total = alert.accounts.length + alert.goals.length;

  return (
    <Modal open onClose={onClose} variant="center" size="md">
      <div className="p-6">
        <div className="mb-4 flex items-start gap-4">
          <div className="shrink-0 rounded-xl bg-[#B8933C]/10 p-2">
            <Lock className="h-6 w-6" style={{ color: COLORS.gold }} aria-hidden />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold" style={{ color: COLORS.gold }}>
              方案已降級為免費版
            </h3>
            {/* 講清楚金額仍然計入——這是降級後最容易被誤會成「資料不見了」的地方 */}
            <p className={`mt-1 text-sm leading-relaxed ${TEXT_MUTED_CLASS}`}>
              以下 {total} 筆資料超過免費方案上限，已無法編輯或自動同步。
              <span className="font-semibold">金額仍然完整計入你的淨資產</span>，不會影響任何數字。
            </p>
          </div>
        </div>

        <ul className="mb-5 max-h-48 divide-y divide-black/5 overflow-y-auto rounded-lg border border-black/10 dark:divide-white/5 dark:border-white/10">
          {alert.accounts.map((account) => (
            <li key={account.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
              <span className={TEXT_PRIMARY_CLASS}>{account.name}</span>
              <span className={`text-xs ${TEXT_MUTED_CLASS}`}>{account.type === "LIABILITY" ? "負債" : "資產"}</span>
            </li>
          ))}
          {alert.goals.map((goal) => (
            <li key={goal.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
              <span className={TEXT_PRIMARY_CLASS}>{goal.name}</span>
              <span className={`text-xs ${TEXT_MUTED_CLASS}`}>目標</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenPlans();
            }}
            className="w-full cursor-pointer rounded-lg py-3 text-sm font-semibold text-white transition-transform active:scale-[0.97]"
            style={{ backgroundColor: COLORS.gold }}
          >
            升級 Pro 解鎖
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`w-full cursor-pointer py-2.5 text-sm font-medium ${TEXT_MUTED_CLASS}`}
          >
            知道了
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── 走勢圖展開 ───────────────────────────────────────────────────────────

export function ChartExpandModal({
  open, onClose, chartProps,
}: {
  open: boolean;
  onClose: () => void;
  chartProps: Omit<NetWorthChartProps, "heightClass"> | null;
}) {
  if (!chartProps) return null;
  return (
    <Modal open={open} onClose={onClose} size="lg" title="走勢比較">
      <div className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS.gold }} aria-hidden />
            你的淨值
          </span>
          {chartProps.activeBenchmarks.map((key) => (
            <span key={key} className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: BENCHMARKS[key].color }} aria-hidden />
              {BENCHMARKS[key].label}
            </span>
          ))}
        </div>
        <NetWorthChart {...chartProps} heightClass="h-[55vh]" />
      </div>
    </Modal>
  );
}
