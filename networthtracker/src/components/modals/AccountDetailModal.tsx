"use client";

// 點一列帳戶後開的明細。
//
// 這取代了先前的「查看全部」分組彈窗：垂直清單本身已經看得到所有項目，
// 真正需要彈窗的是「這一筆的完整資訊 + 編輯／封存」，而不是再列一次清單。
// 順帶把先前 12px 的鉛筆／封存小圖示換成正常大小的按鈕。

import { Archive, Lock, Pencil } from "lucide-react";
import { CATEGORY_ICONS, categoryLabelMap, symbolRequiredCategories } from "@/lib/constants";
import { formatCurrency, formatInteger, MASKED_AMOUNT } from "@/lib/format";
import { COLORS, deltaColorForTheme, TEXT_MUTED_CLASS } from "@/lib/theme";
import { Modal } from "@/components/ui/Modal";
import type { AccountCard } from "@/lib/derive";
import type { Account } from "@/lib/types";

export function AccountDetailModal({
  card, groupColor, accounts, hideBalance, isDarkMode, onClose, onEdit, onArchive, onOpenPlans,
}: {
  card: AccountCard | null;
  groupColor: string;
  accounts: Account[];
  hideBalance: boolean;
  isDarkMode: boolean;
  onClose: () => void;
  onEdit: (account: Account) => void;
  onArchive: (account: Account) => void;
  onOpenPlans: () => void;
}) {
  if (!card) return null;

  const account = card.account;
  const CategoryIcon = CATEGORY_ICONS[card.category] ?? Archive;
  const isStock = symbolRequiredCategories.includes(card.category as never);
  const isLiability = account.type === "LIABILITY";
  const title = card.title.replace(/\.TW$/i, "");
  const deductFrom = account.deductFromAccountId
    ? accounts.find((item) => item.id === account.deductFromAccountId)?.name ?? "已刪除帳戶"
    : null;

  const rows: { label: string; value: string; color?: string }[] = [];

  if (isStock) {
    rows.push({ label: "持有數量", value: `${formatCurrency(card.quantity)} 股` });
    if (card.currentPrice) rows.push({ label: "現價", value: formatCurrency(card.currentPrice), color: COLORS.gold });
    if (card.avgCost != null) rows.push({ label: "平均成本", value: formatCurrency(card.avgCost) });
    if (card.costChangePct != null) {
      rows.push({
        label: "報酬率",
        value: `${card.costChangePct >= 0 ? "+" : ""}${card.costChangePct.toFixed(2)}%`,
        color: deltaColorForTheme(card.costChangePct, isDarkMode),
      });
    }
    if (card.dayChangePct != null) {
      rows.push({
        label: "今日漲跌",
        value: `${card.dayChangePct >= 0 ? "+" : ""}${card.dayChangePct.toFixed(2)}%`,
        color: deltaColorForTheme(card.dayChangePct, isDarkMode),
      });
    }
  } else {
    rows.push({ label: isLiability && account.loanStartDate ? "貸款總額" : "餘額", value: formatInteger(card.quantity) });
  }

  rows.push({ label: "幣別", value: account.currency });

  if (isLiability) {
    if (account.interestRate != null) rows.push({ label: "年利率", value: `${account.interestRate}%` });
    if (account.loanTermMonths != null) {
      rows.push({ label: "還款進度", value: `已繳 ${account.paidInstallments ?? 0} / ${account.loanTermMonths} 期` });
    }
    if (account.monthlyDeductionAmount != null) {
      rows.push({ label: "每月扣款", value: `NT$ ${formatInteger(account.monthlyDeductionAmount)}` });
    }
    if (deductFrom && account.deductionDate != null) {
      rows.push({ label: "自動扣款", value: `每月 ${account.deductionDate} 日從「${deductFrom}」` });
    }
  }

  if (account.lastApiSyncAt) {
    rows.push({
      label: "最近同步",
      value: new Date(account.lastApiSyncAt).toLocaleString("zh-TW", {
        month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
      }),
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={
        <span className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ background: `${groupColor}1A`, color: groupColor }}
            aria-hidden
          >
            <CategoryIcon className="h-4 w-4" strokeWidth={2} />
          </span>
          <span className="min-w-0 truncate">{title}</span>
        </span>
      }
      subtitle={
        <span className={TEXT_MUTED_CLASS}>
          {categoryLabelMap[card.category]}
          {card.subtitle && card.subtitle !== card.title && ` · ${card.subtitle}`}
        </span>
      }
    >
      <div className="space-y-5 p-5">
        <div>
          <p className={`text-xs ${TEXT_MUTED_CLASS}`}>目前價值</p>
          <p className={`mt-1 font-ledger text-2xl font-bold ${isLiability ? "text-[#A24936]" : ""}`}>
            {hideBalance ? MASKED_AMOUNT : `NT$ ${formatInteger(card.currentValue)}`}
          </p>
        </div>

        {account.isLocked && (
          <div className="rounded-xl border border-[#B8933C]/30 bg-[#B8933C]/[0.08] p-3.5">
            <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: COLORS.gold }}>
              <Lock className="h-3.5 w-3.5" aria-hidden /> 這筆超過免費方案上限
            </p>
            {/* 明確講清楚「金額仍然計入」——先前鎖定會把金額排除在淨值外，
                使用者看到偏低的數字會以為資料掉了 */}
            <p className={`mt-1 text-xs leading-relaxed ${TEXT_MUTED_CLASS}`}>
              金額仍然完整計入你的淨資產，只是無法編輯或自動同步。升級 Pro 即可解鎖。
            </p>
            <button
              type="button"
              onClick={onOpenPlans}
              className="mt-2.5 text-xs font-semibold underline underline-offset-2"
              style={{ color: COLORS.gold }}
            >
              查看方案
            </button>
          </div>
        )}

        {account.isApiConnected && account.apiSyncError && (
          <div className="rounded-xl border border-[#A24936]/30 bg-[#A24936]/[0.06] p-3.5">
            <p className="text-sm font-semibold text-[#A24936]">API 同步失敗</p>
            <p className={`mt-1 text-xs leading-relaxed ${TEXT_MUTED_CLASS}`}>{account.apiSyncError}</p>
          </div>
        )}

        <dl className="divide-y divide-black/[0.05] dark:divide-white/[0.05]">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className={`text-xs ${TEXT_MUTED_CLASS}`}>{row.label}</dt>
              <dd className="font-ledger text-sm font-semibold" style={row.color ? { color: row.color } : undefined}>
                {hideBalance && row.label !== "幣別" && row.label !== "還款進度" && row.label !== "自動扣款" && row.label !== "最近同步"
                  ? MASKED_AMOUNT
                  : row.value}
              </dd>
            </div>
          ))}
        </dl>

        {!account.isLocked && (
          <div className="flex gap-3 border-t border-black/[0.06] pt-4 dark:border-white/[0.06]">
            <button
              type="button"
              onClick={() => onEdit(account)}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-black/15 py-3 text-sm font-semibold transition-transform active:scale-[0.97] hover:border-[#B8933C] hover:text-[#B8933C] dark:border-white/15"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden /> 編輯
            </button>
            <button
              type="button"
              onClick={() => onArchive(account)}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#A24936]/40 py-3 text-sm font-semibold text-[#A24936] transition-transform active:scale-[0.97] hover:bg-[#A24936]/5"
            >
              <Archive className="h-3.5 w-3.5" aria-hidden /> 封存
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
