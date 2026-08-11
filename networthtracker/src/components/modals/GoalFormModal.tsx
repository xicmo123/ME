"use client";

import { useState, type FormEvent } from "react";
import { apiSend, toUserMessage } from "@/lib/api";
import { GOAL_ICON_CHOICES } from "@/lib/constants";
import { formatInteger } from "@/lib/format";
import { COLORS, INPUT_CLASS, SECTION_LABEL_CLASS, TEXT_MUTED_CLASS } from "@/lib/theme";
import { Modal } from "@/components/ui/Modal";
import type { Account, Goal, GoalType } from "@/lib/types";

const EMPTY_FORM = { name: "", targetAmount: "", type: "NET_WORTH" as GoalType, accountId: "", emoji: "target" };

export function GoalFormModal({
  open, onClose, editingGoal, accounts, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editingGoal: Goal | null;
  accounts: Account[];
  onSaved: (message: string) => void;
}) {
  // 呼叫端每次開啟都會用新的 key 重新掛載這個元件，所以初始值在這裡算一次就好
  const [form, setForm] = useState(() =>
    editingGoal
      ? {
          name: editingGoal.name,
          targetAmount: String(editingGoal.targetAmount),
          type: editingGoal.type,
          accountId: editingGoal.accountId ?? "",
          emoji: editingGoal.emoji || "target",
        }
      : EMPTY_FORM
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeAccounts = accounts.filter((account) => account.isActive !== false);
  const liabilityAccounts = activeAccounts.filter((account) => account.type === "LIABILITY");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        ...(editingGoal ? { id: editingGoal.id } : {}),
        ...form,
        targetAmount: Number(form.targetAmount),
      };
      await apiSend("/api/goals", editingGoal ? "PUT" : "POST", payload);
      onSaved(editingGoal ? "目標已更新" : "目標已新增");
      onClose();
    } catch (err) {
      setError(toUserMessage(err, "儲存目標失敗，請再試一次"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingGoal ? "編輯目標" : "新增目標"}
      variant="center"
      size="sm"
      dismissOnBackdrop={false}
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        {error && (
          <p className="rounded-lg bg-[#A24936]/10 p-3 text-sm font-medium text-[#A24936]" role="alert">
            {error}
          </p>
        )}

        <div>
          <label className={`mb-2 block ${SECTION_LABEL_CLASS}`} htmlFor="goal-name">目標名稱</label>
          <input
            id="goal-name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="例如：買房頭期款"
            className={INPUT_CLASS}
            required
          />
        </div>

        <fieldset>
          <legend className={`mb-2 block ${SECTION_LABEL_CLASS}`}>圖示</legend>
          <div className="flex flex-wrap gap-2">
            {GOAL_ICON_CHOICES.map(({ key, icon: Icon, label }) => {
              const selected = (form.emoji || "target") === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm({ ...form, emoji: key })}
                  aria-label={label}
                  aria-pressed={selected}
                  className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border transition-colors ${
                    selected ? "" : "border-black/10 dark:border-white/10"
                  }`}
                  style={selected ? { borderColor: COLORS.gold, background: `${COLORS.gold}1A`, color: COLORS.gold } : undefined}
                >
                  <Icon className={`h-4 w-4 ${selected ? "" : TEXT_MUTED_CLASS}`} strokeWidth={2} aria-hidden />
                </button>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label className={`mb-2 block ${SECTION_LABEL_CLASS}`} htmlFor="goal-amount">
            {form.type === "DEBT_PAYOFF" ? "負債總金額 (NT$)" : "目標金額 (NT$)"}
          </label>
          <input
            id="goal-amount"
            type="number"
            inputMode="decimal"
            step="any"
            min="1"
            value={form.targetAmount}
            onChange={(event) => setForm({ ...form, targetAmount: event.target.value })}
            placeholder="例如：3000000"
            className={`${INPUT_CLASS} font-ledger`}
            required
          />
          {form.type === "DEBT_PAYOFF" && (
            <p className={`mt-1.5 text-xs ${TEXT_MUTED_CLASS}`}>
              填入這筆負債最初的總金額，進度會隨著餘額減少而推進，還清時達標。
            </p>
          )}
        </div>

        <div>
          <label className={`mb-2 block ${SECTION_LABEL_CLASS}`} htmlFor="goal-type">目標類型</label>
          <select
            id="goal-type"
            value={form.type}
            onChange={(event) => setForm({ ...form, type: event.target.value as GoalType, accountId: "" })}
            className={INPUT_CLASS}
          >
            <option value="NET_WORTH">累積資產（總淨資產）</option>
            <option value="ACCOUNT">累積資產（特定帳戶）</option>
            <option value="DEBT_PAYOFF">清償負債</option>
          </select>
        </div>

        {form.type === "ACCOUNT" && (
          <div>
            <label className={`mb-2 block ${SECTION_LABEL_CLASS}`} htmlFor="goal-account">選擇帳戶</label>
            <select
              id="goal-account"
              value={form.accountId}
              onChange={(event) => setForm({ ...form, accountId: event.target.value })}
              className={INPUT_CLASS}
              required
            >
              <option value="">請選擇帳戶</option>
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}（NT$ {formatInteger(Number(account.currentValue))}）
                </option>
              ))}
            </select>
          </div>
        )}

        {form.type === "DEBT_PAYOFF" && (
          <div>
            <label className={`mb-2 block ${SECTION_LABEL_CLASS}`} htmlFor="goal-liability">選擇負債帳戶</label>
            <select
              id="goal-liability"
              value={form.accountId}
              onChange={(event) => setForm({ ...form, accountId: event.target.value })}
              className={INPUT_CLASS}
              required
            >
              <option value="">請選擇負債帳戶</option>
              {liabilityAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}（剩餘 NT$ {formatInteger(Number(account.currentValue))}）
                </option>
              ))}
            </select>
            {liabilityAccounts.length === 0 && (
              <p className="mt-1.5 text-xs text-[#A24936]">目前沒有負債帳戶，請先新增一筆負債</p>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 cursor-pointer rounded-lg border border-black/15 py-3 text-sm font-semibold dark:border-white/15 ${TEXT_MUTED_CLASS}`}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 cursor-pointer rounded-lg bg-[#1C1F1A] py-3 text-sm font-semibold text-white disabled:opacity-60 dark:bg-[#B8933C] dark:text-black"
          >
            {saving ? "儲存中…" : "儲存"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
