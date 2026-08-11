"use client";

import { RotateCcw } from "lucide-react";
import type { Toast } from "@/lib/types";

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed left-1/2 z-[60] flex w-full -translate-x-1/2 flex-col items-center gap-2 px-4"
      style={{ top: "max(1rem, calc(env(safe-area-inset-top) + 0.5rem))" }}
      // 提示訊息要讓螢幕閱讀器讀出來，但不該打斷使用者正在做的事
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex max-w-sm items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-lg ${
            toast.kind === "error" ? "bg-[#A24936]" : "bg-[#1C1F1A] dark:bg-[#B8933C] dark:text-black"
          }`}
        >
          <span className="min-w-0">{toast.message}</span>
          {/* 封存這類可復原的操作直接給一顆 Undo，而不是在文字裡叫使用者自己去設定頁找 */}
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                onDismiss(toast.id);
                void toast.undo!.run();
              }}
              className="ml-auto flex shrink-0 items-center gap-1 rounded-md bg-white/20 px-2.5 py-1.5 text-xs font-bold hover:bg-white/30 active:scale-95 transition-all"
            >
              <RotateCcw className="h-3 w-3" />
              {toast.undo.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
