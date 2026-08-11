"use client";

import { Fingerprint } from "lucide-react";
import { biometricVerify } from "@/lib/native";
import { BG_CLASS, COLORS, TEXT_MUTED_CLASS, TEXT_PRIMARY_CLASS } from "@/lib/theme";

export function BiometricLockScreen({ onUnlock }: { onUnlock: () => void }) {
  return (
    <main
      className={`flex min-h-screen flex-col items-center justify-center gap-8 p-4 ${BG_CLASS} ${TEXT_PRIMARY_CLASS}`}
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      <img src="/logo.png" alt="Zeno" className="h-24 w-auto object-contain dark:invert dark:brightness-125" />
      <p className={`text-xs font-semibold tracking-[0.25em] ${TEXT_MUTED_CLASS}`}>LOCKED · 已鎖定</p>
      <button
        type="button"
        onClick={() => {
          void biometricVerify("解鎖 Zeno").then((ok) => {
            if (ok) onUnlock();
          });
        }}
        className="flex items-center gap-2.5 rounded-xl px-6 py-3.5 text-sm font-semibold text-black transition-transform active:scale-95"
        style={{ background: COLORS.gold }}
      >
        <Fingerprint className="h-5 w-5" aria-hidden /> 使用 Face ID 解鎖
      </button>
    </main>
  );
}
