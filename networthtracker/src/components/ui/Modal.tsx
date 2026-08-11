"use client";

// 全站共用的對話框。
//
// 先前 12 個彈窗各自手寫 `fixed inset-0`，一致缺少 role/aria、Escape 關閉、focus trap、
// 背景鎖捲動與點遮罩關閉——在 iOS 上最明顯的症狀是「彈窗開著，背後的頁面還在跟著滾」。
// 這裡一次做掉，各處只要描述內容。

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { MODAL_SURFACE_CLASS, TEXT_MUTED_CLASS } from "@/lib/theme";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 同時開多層彈窗時，只有最後關閉的那一層可以把 body 的捲動還原 */
let scrollLockCount = 0;

function lockBodyScroll(): () => void {
  if (scrollLockCount === 0) {
    const scrollBarGap = window.innerWidth - document.documentElement.clientWidth;
    document.body.dataset.prevOverflow = document.body.style.overflow;
    document.body.dataset.prevPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    // 桌面瀏覽器隱藏捲軸會讓版面往右跳，補上等寬的 padding 抵銷
    if (scrollBarGap > 0) document.body.style.paddingRight = `${scrollBarGap}px`;
  }
  scrollLockCount += 1;

  return () => {
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) {
      document.body.style.overflow = document.body.dataset.prevOverflow ?? "";
      document.body.style.paddingRight = document.body.dataset.prevPaddingRight ?? "";
      delete document.body.dataset.prevOverflow;
      delete document.body.dataset.prevPaddingRight;
    }
  };
}

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  /** 標題文字；傳了才會顯示標題列與關閉鈕 */
  title?: ReactNode;
  /** 標題下方的一行補充（例如分組總額） */
  subtitle?: ReactNode;
  children: ReactNode;
  /** bottom-sheet：手機由下方滑入、桌面置中；center：兩者都置中（表單類用這個比較穩） */
  variant?: "sheet" | "center";
  size?: "sm" | "md" | "lg";
  /** 關掉點遮罩關閉，用在刪除確認這種需要明確選擇的場合 */
  dismissOnBackdrop?: boolean;
  contentClassName?: string;
};

const SIZE_CLASS: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  variant = "sheet",
  size = "sm",
  dismissOnBackdrop = true,
  contentClassName = "",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      // Focus trap：不擋住 Tab 就會跑到彈窗背後的元素上，鍵盤與 VoiceOver 使用者會迷路
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const releaseScroll = lockBodyScroll();
    document.addEventListener("keydown", handleKeyDown, true);

    // 讓焦點進到彈窗：優先給第一個可聚焦元素，沒有就給面板本身
    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (firstFocusable ?? panel)?.focus({ preventScroll: true });

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      releaseScroll();
      restoreFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  const alignment = variant === "sheet" ? "items-end sm:items-center" : "items-center";
  const radius = variant === "sheet" ? "rounded-t-2xl sm:rounded-2xl" : "rounded-2xl";

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-black/50 ${alignment} ${variant === "center" ? "p-4" : ""}`}
      onMouseDown={(event) => {
        // 只有真的按在遮罩上才關；從面板內部拖曳到遮罩放開不該關閉
        if (dismissOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`w-full ${SIZE_CLASS[size]} max-h-[88vh] flex flex-col ${MODAL_SURFACE_CLASS} ${radius} shadow-2xl outline-none ${contentClassName}`}
        style={{ paddingBottom: variant === "sheet" ? "env(safe-area-inset-bottom)" : undefined }}
      >
        {title && (
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/[0.07] dark:border-white/[0.07] p-5">
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-base font-semibold">
                {title}
              </h2>
              {subtitle && <div className="mt-0.5 text-xs">{subtitle}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="關閉"
              className={`-m-1 shrink-0 rounded-lg p-2.5 ${TEXT_MUTED_CLASS} hover:text-[#B8933C] transition-colors`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}

/** 刪除／封存這類需要二次確認的對話框，樣式與行為統一 */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  pendingLabel,
  pending = false,
  tone = "danger",
  icon,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  pending?: boolean;
  tone?: "danger" | "brand";
  icon: ReactNode;
}) {
  const accent = tone === "danger" ? "#A24936" : "#B8933C";
  return (
    <Modal open={open} onClose={onClose} variant="center" size="sm" dismissOnBackdrop={!pending}>
      <div className="p-6">
        <div className="mb-5 flex items-start gap-4">
          <div className="shrink-0 rounded-xl p-2" style={{ background: `${accent}1A`, color: accent }}>
            {icon}
          </div>
          <div>
            <h3 className="font-display text-base font-semibold" style={{ color: accent }}>
              {title}
            </h3>
            <p className={`mt-1 text-sm leading-relaxed ${TEXT_MUTED_CLASS}`}>{description}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className={`flex-1 rounded-lg border border-black/15 py-3 text-sm font-semibold dark:border-white/15 ${TEXT_MUTED_CLASS} cursor-pointer active:scale-[0.97] transition-transform disabled:opacity-50`}
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="flex-1 rounded-lg py-3 text-sm font-semibold text-white cursor-pointer active:scale-[0.97] transition-transform disabled:opacity-60"
            style={{ background: accent }}
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
