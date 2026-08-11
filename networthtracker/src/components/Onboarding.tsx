"use client";

// 新使用者引導。
//
// 先前登入後直接面對一片空白的總覽，只有一張「先建立你的第一個資產」的卡片——
// 使用者不知道這個 App 打算幫他解決什麼問題，就先被要求輸入財務資料。
// 三頁講清楚「為什麼值得填」，最後一步才引導到新增資產。

import { useState } from "react";
import { ChevronRight, Lock, Target, TrendingUp, Wallet } from "lucide-react";
import { HERO_THEMES } from "@/lib/hero-theme";
import { STORAGE_KEYS } from "@/hooks/usePreferences";
import { BTN_PRIMARY_CLASS, COLORS, TEXT_MUTED_CLASS } from "@/lib/theme";
import { Modal } from "@/components/ui/Modal";

const STEPS = [
  {
    icon: Wallet,
    title: "一個畫面看完全部身家",
    body: "現金、銀行、台美日韓股、加密貨幣、房貸車貸——全部放進同一個淨資產數字裡。手動輸入就能用，不強迫綁定任何金融帳號。",
  },
  {
    icon: TrendingUp,
    title: "每天自動留下一個記錄點",
    body: "Zeno 每天幫你存一筆淨資產快照，時間一長就是一條真實的走勢線。你會第一次看清楚自己到底是在往前，還是原地踏步。",
  },
  {
    icon: Target,
    title: "把目標變成看得到的進度",
    body: "設定買房頭期款、還清車貸之類的目標，Zeno 會依你的實際成長速度推估達成時間，而不是只給你一個數字。",
  },
] as const;

export function Onboarding({
  open,
  onClose,
  onAddFirstAccount,
  isDarkMode,
}: {
  open: boolean;
  onClose: () => void;
  onAddFirstAccount: () => void;
  isDarkMode: boolean;
}) {
  const [step, setStep] = useState(0);
  const hero = HERO_THEMES[isDarkMode ? "noir" : "cream"];
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];
  const Icon = current.icon;

  function finish(thenAddAccount: boolean) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.onboarded, "true");
    } catch {
      // 無痕模式存不下來就算了，下次再看一次引導也不是大問題
    }
    onClose();
    if (thenAddAccount) onAddFirstAccount();
  }

  return (
    <Modal open={open} onClose={() => finish(false)} variant="center" size="sm" dismissOnBackdrop={false}>
      <div className="p-6">
        <div
          className="mb-5 flex h-32 items-center justify-center rounded-[20px]"
          style={{ background: hero.background, color: hero.text, boxShadow: `${hero.shadow}, ${hero.ring}` }}
        >
          <Icon className="h-12 w-12" strokeWidth={1.5} aria-hidden />
        </div>

        <h2 className="font-display text-lg font-bold leading-snug">{current.title}</h2>
        <p className={`mt-2 text-sm leading-relaxed ${TEXT_MUTED_CLASS}`}>{current.body}</p>

        <div className="mt-6 flex items-center justify-center gap-1.5" role="tablist" aria-label="引導步驟">
          {STEPS.map((_, index) => (
            <span
              key={index}
              role="tab"
              aria-selected={index === step}
              aria-label={`第 ${index + 1} 步，共 ${STEPS.length} 步`}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: index === step ? 20 : 6,
                background: index === step ? COLORS.gold : "currentColor",
                opacity: index === step ? 1 : 0.2,
              }}
            />
          ))}
        </div>

        <div className="mt-6 space-y-2.5">
          <button
            type="button"
            onClick={() => (isLast ? finish(true) : setStep((current) => current + 1))}
            className={BTN_PRIMARY_CLASS}
          >
            {isLast ? (
              <span className="flex items-center justify-center gap-1.5">
                建立第一個資產 <ChevronRight className="h-4 w-4" aria-hidden />
              </span>
            ) : (
              "繼續"
            )}
          </button>
          <button
            type="button"
            onClick={() => finish(false)}
            className={`w-full py-2.5 text-sm font-medium ${TEXT_MUTED_CLASS}`}
          >
            {isLast ? "稍後再說" : "略過"}
          </button>
        </div>

        <p className={`mt-4 flex items-center justify-center gap-1.5 text-xs ${TEXT_MUTED_CLASS}`}>
          <Lock className="h-3 w-3" aria-hidden />
          你的財務資料只屬於你，可隨時匯出或永久刪除
        </p>
      </div>
    </Modal>
  );
}

/** 只在「從沒看過引導」且「還沒有任何帳戶」時顯示 */
export function shouldShowOnboarding(accountCount: number): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(STORAGE_KEYS.onboarded) === "true") return false;
  } catch {
    return false;
  }
  return accountCount === 0;
}
