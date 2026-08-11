"use client";

import { useCallback, useRef, useState } from "react";
import type { Toast, ToastKind } from "@/lib/types";

const DEFAULT_DURATION_MS = 2800;
// 帶 Undo 的提示要多留一點時間，2.8 秒不夠使用者反應過來並按下去
const UNDOABLE_DURATION_MS = 6000;

export type ShowToastOptions = {
  kind?: ToastKind;
  undo?: { label: string; run: () => void | Promise<void> };
};

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, options: ShowToastOptions | ToastKind = {}) => {
      // 舊呼叫端是 showToast(msg, "error")，保留這個形式免得改動面過大
      const normalized: ShowToastOptions = typeof options === "string" ? { kind: options } : options;
      const kind = normalized.kind ?? "success";
      const id = Date.now() + Math.random();

      setToasts((current) => [...current, { id, message, kind, undo: normalized.undo }]);

      const duration = normalized.undo ? UNDOABLE_DURATION_MS : DEFAULT_DURATION_MS;
      timers.current.set(
        id,
        setTimeout(() => dismissToast(id), duration)
      );
      return id;
    },
    [dismissToast]
  );

  return { toasts, showToast, dismissToast };
}

export type ShowToast = ReturnType<typeof useToasts>["showToast"];
