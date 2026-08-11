"use client";

// 三個「快速輸入」彈窗：記帳、新增行事曆事件、手動補登走勢。
// 共通點是都很短、都是單一表單、送出後只要 refresh 一次。

import { useState, type FormEvent } from "react";
import { apiSend, toUserMessage } from "@/lib/api";
import { todayInTaipei } from "@/lib/date";
import { BTN_PRIMARY_CLASS, COLORS, INPUT_CLASS, SECTION_LABEL_CLASS, TEXT_MUTED_CLASS } from "@/lib/theme";
import { Modal } from "@/components/ui/Modal";
import type { Account } from "@/lib/types";

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-lg bg-[#A24936]/10 p-3 text-sm font-medium text-[#A24936]" role="alert">
      {message}
    </p>
  );
}

// ─── 記帳 ─────────────────────────────────────────────────────────────────

export function BookkeepingModal({
  open, onClose, accounts, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  onSaved: (message: string) => void;
}) {
  // 日期預設為台北的今天。先前用 UTC 日期，台北凌晨 0~8 點會預設成昨天，
  // 而且 max 也是昨天——等於那段時間根本記不了今天的帳。
  const today = todayInTaipei();
  const [form, setForm] = useState({
    description: "", amount: "", type: "WITHDRAWAL" as "WITHDRAWAL" | "DEPOSIT", accountId: "", date: today,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cashAccounts = accounts.filter(
    (account) => account.isActive && ["CASH", "BANK_ACCOUNT"].includes(account.category)
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiSend("/api/transactions", "POST", { ...form, amount: Number(form.amount) });
      onSaved("記帳成功");
      onClose();
    } catch (err) {
      setError(toUserMessage(err, "記帳失敗，請再試一次"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="記帳" size="sm" dismissOnBackdrop={false}>
      <form onSubmit={handleSubmit} className="space-y-5 p-5">
        <ErrorText message={error} />

        <div className="flex overflow-hidden rounded-xl border border-black/[0.08] dark:border-white/[0.08]" role="group" aria-label="收支類型">
          {(["WITHDRAWAL", "DEPOSIT"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setForm({ ...form, type: key })}
              aria-pressed={form.type === key}
              className="flex-1 py-3 text-sm font-semibold transition-colors"
              style={form.type === key ? { background: COLORS.gold, color: "#241B06" } : undefined}
            >
              {key === "WITHDRAWAL" ? "支出" : "收入"}
            </button>
          ))}
        </div>

        <div>
          <label className={`mb-2 block ${SECTION_LABEL_CLASS}`} htmlFor="bk-description">說明</label>
          <input
            id="bk-description" type="text" placeholder="例如：午餐、薪水"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label className={`mb-2 block ${SECTION_LABEL_CLASS}`} htmlFor="bk-amount">金額 (NT$)</label>
          <input
            id="bk-amount" type="number" inputMode="decimal" step="any" min="0" placeholder="例如：150"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
            className={`${INPUT_CLASS} font-ledger`}
            required
          />
        </div>

        <div>
          <label className={`mb-2 block ${SECTION_LABEL_CLASS}`} htmlFor="bk-account">
            {form.type === "WITHDRAWAL" ? "扣款帳戶" : "存入帳戶"}
          </label>
          <select
            id="bk-account"
            value={form.accountId}
            onChange={(event) => setForm({ ...form, accountId: event.target.value })}
            className={INPUT_CLASS}
            required
          >
            <option value="" disabled>請選擇現金／銀行帳戶</option>
            {cashAccounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
          {cashAccounts.length === 0 && (
            <p className="mt-1.5 text-xs text-[#A24936]">還沒有現金或銀行帳戶，請先新增一個才能記帳</p>
          )}
        </div>

        <div>
          <label className={`mb-2 block ${SECTION_LABEL_CLASS}`} htmlFor="bk-date">日期</label>
          <input
            id="bk-date" type="date" max={today}
            value={form.date}
            onChange={(event) => setForm({ ...form, date: event.target.value })}
            className={`${INPUT_CLASS} font-ledger`}
            required
          />
        </div>

        <button type="submit" disabled={saving || cashAccounts.length === 0} className={BTN_PRIMARY_CLASS}>
          {saving ? "處理中…" : "確認記帳"}
        </button>
      </form>
    </Modal>
  );
}

// ─── 新增行事曆事件 ───────────────────────────────────────────────────────

export function CalendarEventModal({
  open, onClose, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState(() => ({ title: "", date: todayInTaipei(), time: "09:00" }));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) return;
    setError(null);
    setSaving(true);
    try {
      const eventAt = new Date(`${form.date}T${form.time}:00`).toISOString();
      await apiSend("/api/calendar-events", "POST", { title: form.title.trim(), eventAt });
      onSaved("已新增行事曆事件");
      onClose();
    } catch (err) {
      setError(toUserMessage(err, "新增行事曆失敗"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="新增行事曆" size="sm" dismissOnBackdrop={false}>
      <form onSubmit={handleSubmit} className="space-y-5 p-5">
        <ErrorText message={error} />

        <div>
          <label className={`mb-2 block ${SECTION_LABEL_CLASS}`} htmlFor="ce-title">事件名稱</label>
          <input
            id="ce-title" type="text" placeholder="例如：房租繳款、保單續繳"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            className={INPUT_CLASS}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`mb-2 block ${SECTION_LABEL_CLASS}`} htmlFor="ce-date">日期</label>
            <input
              id="ce-date" type="date" value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
              className={`${INPUT_CLASS} font-ledger`}
              required
            />
          </div>
          <div>
            <label className={`mb-2 block ${SECTION_LABEL_CLASS}`} htmlFor="ce-time">時間</label>
            <input
              id="ce-time" type="time" value={form.time}
              onChange={(event) => setForm({ ...form, time: event.target.value })}
              className={`${INPUT_CLASS} font-ledger`}
              required
            />
          </div>
        </div>

        <p className={`text-xs ${TEXT_MUTED_CLASS}`}>
          若已在設定頁開啟「行事曆通知」，時間一到會發送 App 通知提醒你。
        </p>

        <button type="submit" disabled={saving} className={BTN_PRIMARY_CLASS}>
          {saving ? "處理中…" : "新增事件"}
        </button>
      </form>
    </Modal>
  );
}

// ─── 手動補登走勢 ─────────────────────────────────────────────────────────

export function HistoryBackfillModal({
  open, onClose, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const today = todayInTaipei();
  const [form, setForm] = useState({ date: "", netWorth: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.date || form.netWorth === "") return;
    setError(null);
    setSaving(true);
    try {
      await apiSend("/api/history", "POST", form);
      onSaved("已補登該日淨資產");
      onClose();
    } catch (err) {
      setError(toUserMessage(err, "補登失敗，請再試一次"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="手動補登走勢" size="sm" dismissOnBackdrop={false}>
      <form onSubmit={handleSubmit} className="space-y-5 p-5">
        <ErrorText message={error} />

        <div>
          <label className={`mb-2 block ${SECTION_LABEL_CLASS}`} htmlFor="hb-date">選擇日期</label>
          <input
            id="hb-date" type="date" max={today} value={form.date}
            onChange={(event) => setForm({ ...form, date: event.target.value })}
            className={`${INPUT_CLASS} font-ledger`}
            required
          />
        </div>

        <div>
          <label className={`mb-2 block ${SECTION_LABEL_CLASS}`} htmlFor="hb-networth">該日淨資產 (NT$)</label>
          <input
            id="hb-networth" type="number" inputMode="decimal" placeholder="例如：50000"
            value={form.netWorth}
            onChange={(event) => setForm({ ...form, netWorth: event.target.value })}
            className={`${INPUT_CLASS} font-ledger`}
            required
          />
        </div>

        <button type="submit" disabled={saving} className={BTN_PRIMARY_CLASS}>
          {saving ? "處理中…" : "確認補登"}
        </button>
      </form>
    </Modal>
  );
}
