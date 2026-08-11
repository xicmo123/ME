"use client";

import { useEffect, useRef } from "react";
import {
  CalendarDays, LayoutDashboard, Plus, Receipt, Settings, Target, TrendingUp, Wallet,
} from "lucide-react";
import { hapticImpact } from "@/lib/native";
import { COLORS, SURFACE_CLASS } from "@/lib/theme";
import type { Tab } from "@/lib/types";

const NAV_ITEMS: { key: Tab; icon: typeof LayoutDashboard; label: string }[] = [
  { key: "overview", icon: LayoutDashboard, label: "總覽" },
  { key: "calendar", icon: CalendarDays, label: "行事曆" },
  { key: "trends", icon: TrendingUp, label: "走勢" },
  { key: "settings", icon: Settings, label: "設定" },
];

export type QuickAction = { key: string; label: string; icon: typeof Plus; run: () => void };

export function BottomNav({
  activeTab,
  onTabChange,
  quickAddOpen,
  onToggleQuickAdd,
  quickActions,
}: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  quickAddOpen: boolean;
  onToggleQuickAdd: (open: boolean) => void;
  quickActions: QuickAction[];
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  // 快速選單也要能用 Esc 關掉，跟其他彈窗行為一致
  useEffect(() => {
    if (!quickAddOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onToggleQuickAdd(false);
    };
    document.addEventListener("keydown", handler);
    menuRef.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    return () => document.removeEventListener("keydown", handler);
  }, [quickAddOpen, onToggleQuickAdd]);

  function selectTab(tab: Tab) {
    void hapticImpact("light");
    onTabChange(tab);
  }

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-black/[0.06] bg-white shadow-[0_-8px_28px_rgba(0,0,0,0.1)] dark:border-white/[0.08] dark:bg-[#12151C]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="主要導覽"
      >
        <div className="mx-auto flex max-w-lg items-center">
          {NAV_ITEMS.slice(0, 2).map((item) => (
            <NavButton key={item.key} item={item} active={activeTab === item.key} onClick={() => selectTab(item.key)} />
          ))}

          <div className="flex w-16 shrink-0 justify-center">
            <button
              type="button"
              onClick={() => {
                void hapticImpact("light");
                onToggleQuickAdd(!quickAddOpen);
              }}
              aria-label="快速新增"
              aria-expanded={quickAddOpen}
              aria-haspopup="menu"
              className={`-mt-7 flex h-14 w-14 items-center justify-center rounded-full border-4 border-[#EEF0EC] text-[#241B06] shadow-[0_10px_22px_-8px_rgba(184,147,60,0.7)] transition-transform active:scale-95 dark:border-[#0B0D12] ${
                quickAddOpen ? "rotate-45" : ""
              }`}
              style={{ background: `linear-gradient(135deg, ${COLORS.goldLight}, ${COLORS.gold})` }}
            >
              <Plus className="h-6 w-6" aria-hidden />
            </button>
          </div>

          {NAV_ITEMS.slice(2).map((item) => (
            <NavButton key={item.key} item={item} active={activeTab === item.key} onClick={() => selectTab(item.key)} />
          ))}
        </div>
      </nav>

      {quickAddOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/30"
            onClick={() => onToggleQuickAdd(false)}
            aria-hidden
          />
          <div
            ref={menuRef}
            role="menu"
            aria-label="快速新增選單"
            className="fixed bottom-28 left-1/2 z-[45] w-60 -translate-x-1/2"
            style={{ marginBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className={`${SURFACE_CLASS} max-h-[60vh] divide-y divide-black/[0.05] overflow-y-auto rounded-[20px] shadow-2xl dark:divide-white/[0.05]`}>
              {quickActions.map(({ key, label, icon: Icon, run }) => (
                <button
                  key={key}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onToggleQuickAdd(false);
                    void hapticImpact("light");
                    run();
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-sm font-semibold transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                >
                  <Icon className="h-4 w-4" style={{ color: COLORS.gold }} aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: { key: Tab; icon: typeof LayoutDashboard; label: string };
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 py-3 transition-colors ${
        active ? "" : "text-[#3D4136] dark:text-[#C7CBBE]"
      }`}
    >
      <Icon className="h-5 w-5" style={active ? { color: COLORS.gold } : undefined} aria-hidden />
      <span className="text-xs font-semibold" style={active ? { color: COLORS.gold } : undefined}>
        {item.label}
      </span>
    </button>
  );
}

/**
 * 快速選單的項目。
 * 先前有六項，其中四項在別的地方已經有入口（各分組的「+新增」、目標的「+新增」、
 * 走勢頁的「+手動補登」），重複的導覽路徑只會讓人不確定哪個才是對的。
 * 這裡收斂成三個「隨手就想做」的動作，其餘留在各自的區塊裡。
 */
export function buildQuickActions(handlers: {
  onBookkeeping: () => void;
  onAddAccount: () => void;
  onAddCalendarEvent: () => void;
}): QuickAction[] {
  return [
    { key: "bookkeeping", label: "記帳", icon: Receipt, run: handlers.onBookkeeping },
    { key: "account", label: "新增資產或負債", icon: Wallet, run: handlers.onAddAccount },
    { key: "calendar", label: "新增行事曆提醒", icon: CalendarDays, run: handlers.onAddCalendarEvent },
  ];
}

export const QUICK_ACTION_ICONS = { Target, Plus };
