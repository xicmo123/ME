"use client";

import { Crown, Lock, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { GOAL_ICONS } from "@/lib/constants";
import { formatInteger, MASKED_AMOUNT } from "@/lib/format";
import { COLORS, SURFACE_CLASS, TEXT_MUTED_CLASS } from "@/lib/theme";
import type { Goal } from "@/lib/types";

/** 目標進度環：未達標時中間顯示使用者自選的 icon，達標一律換成皇冠 */
export function GoalRing({
  progress,
  size = 34,
  color,
  iconKey,
}: {
  progress: number;
  size?: number;
  color: string;
  iconKey?: string | null;
}) {
  const clamped = Math.max(0, Math.min(100, progress || 0));
  const radius = 13;
  const circumference = 2 * Math.PI * radius;
  const achieved = clamped >= 100;
  const GoalIcon = GOAL_ICONS[iconKey ?? ""] ?? Target;

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`進度 ${Math.round(clamped)}%`}
    >
      <svg width={size} height={size} viewBox="0 0 32 32" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="16" cy="16" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="2.5" />
        <circle
          cx="16" cy="16" r={radius} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - clamped / 100)}
        />
      </svg>
      {achieved ? (
        <Crown className="h-4 w-4" style={{ color }} fill={color} strokeWidth={1.5} aria-hidden />
      ) : (
        <GoalIcon className="h-4 w-4" style={{ color }} strokeWidth={2} aria-hidden />
      )}
    </span>
  );
}

export function GoalList({
  goals,
  lockedGoalIds,
  hideBalance,
  goalEta,
  onCreate,
  onEdit,
  onDelete,
  onLockedClick,
}: {
  goals: Goal[];
  lockedGoalIds: Set<string>;
  hideBalance: boolean;
  goalEta: (goal: Goal) => string | null;
  onCreate: () => void;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  onLockedClick: () => void;
}) {
  return (
    <section aria-label="財務目標" className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <h2 className={`text-xs font-bold uppercase tracking-[0.18em] ${TEXT_MUTED_CLASS}`}>目標</h2>
        <button
          type="button"
          onClick={onCreate}
          className="py-1 text-xs font-semibold underline-offset-2 hover:underline"
          style={{ color: COLORS.gold }}
        >
          + 新增
        </button>
      </div>

      {goals.length === 0 ? (
        <button
          type="button"
          onClick={onCreate}
          className={`flex w-full items-center gap-2 rounded-2xl border-2 border-dashed border-[#B8933C]/60 bg-[#B8933C]/[0.08] px-4 py-3.5 transition-colors hover:border-[#B8933C]/80 hover:text-[#B8933C] dark:bg-[#B8933C]/[0.12] ${TEXT_MUTED_CLASS}`}
        >
          <span className="text-xs font-medium">設定第一個財務目標</span>
          <Plus className="ml-auto h-3.5 w-3.5" aria-hidden />
        </button>
      ) : (
        <ul className={`${SURFACE_CLASS} divide-y divide-black/[0.05] overflow-hidden rounded-[24px] dark:divide-white/[0.05]`}>
          {goals.map((goal) => {
            const locked = lockedGoalIds.has(goal.id);
            const achieved = goal.progress >= 100;
            const accent = achieved ? COLORS.sage : COLORS.gold;
            const eta = goalEta(goal);

            return (
              <li key={goal.id} className={`relative flex items-center gap-3 px-4 py-3.5 ${locked ? "opacity-70" : ""}`}>
                {/* 超過免費上限的目標蓋一層可點擊區塊導去方案頁，但內容維持清晰可讀，
                    使用者才知道被鎖的是哪一筆 */}
                {locked && (
                  <button
                    type="button"
                    onClick={onLockedClick}
                    aria-label={`「${goal.name}」超過免費方案上限，升級 Pro 解鎖`}
                    className="absolute inset-0 z-10 cursor-pointer rounded-[inherit]"
                  />
                )}
                <GoalRing progress={goal.progress} color={accent} iconKey={goal.emoji} />

                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex-1 truncate text-sm font-semibold">{goal.name}</span>
                    <span className="shrink-0 font-ledger text-xs font-bold" style={{ color: accent }}>
                      {achieved ? "✓ 達標" : `${goal.progress}%`}
                    </span>
                    {locked ? (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-bold"
                        style={{ color: COLORS.gold, borderColor: COLORS.gold }}
                      >
                        <Lock className="h-2.5 w-2.5" aria-hidden /> Pro
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onEdit(goal)}
                          aria-label={`編輯目標「${goal.name}」`}
                          className={`-m-1 rounded p-2 ${TEXT_MUTED_CLASS} hover:text-[#B8933C] transition-colors`}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(goal)}
                          aria-label={`刪除目標「${goal.name}」`}
                          className={`-m-1 rounded p-2 ${TEXT_MUTED_CLASS} hover:text-[#A24936] transition-transform active:scale-90`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </>
                    )}
                  </div>

                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.06]">
                    <div
                      className="h-1.5 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, goal.progress)}%`, background: accent }}
                    />
                  </div>

                  <div className={`mt-1 flex flex-wrap items-baseline justify-between gap-x-2 font-ledger text-xs ${TEXT_MUTED_CLASS}`}>
                    <span className="whitespace-nowrap">
                      {hideBalance ? MASKED_AMOUNT : `NT$ ${formatInteger(Number(goal.currentAmount))}`}
                    </span>
                    {achieved ? (
                      <span className="text-[#4F7B5E] dark:text-[#7FAE8F]">已達標</span>
                    ) : (
                      <span className="ml-auto whitespace-nowrap">
                        目標 NT$ {formatInteger(Number(goal.targetAmount))}
                        {eta && <span className="ml-1.5">· 預估 {eta}</span>}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
