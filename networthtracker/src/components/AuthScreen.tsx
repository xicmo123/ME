"use client";

import { useState, type FormEvent } from "react";
import { Bell, Eye, EyeOff, Fingerprint, Lock, Target, TrendingUp } from "lucide-react";
import { apiSend, ApiError, toUserMessage } from "@/lib/api";
import { startOAuth } from "@/lib/native";
import { saveAuthToken } from "@/lib/authToken";
import { GoogleIcon, AppleIcon } from "@/components/icons";
import {
  BG_CLASS, BTN_PRIMARY_CLASS, COLORS, INPUT_CLASS, SECTION_LABEL_CLASS,
  SURFACE_CLASS, TEXT_MUTED_CLASS, TEXT_PRIMARY_CLASS,
} from "@/lib/theme";

export function AuthScreen({
  initialError,
  initialNotice,
  onAuthenticated,
}: {
  initialError?: string;
  initialNotice?: string;
  onAuthenticated: () => void | Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(initialError ?? "");
  const [notice, setNotice] = useState(initialNotice ?? "");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setNeedsVerification(false);
    setLoading(true);
    try {
      const result = await apiSend<{ message?: string; requiresVerification?: boolean; token?: string }>(
        "/api/auth",
        "POST",
        { action: mode, email, password }
      );
      if (result?.requiresVerification) {
        setNotice(result.message ?? "註冊成功，請到信箱點擊驗證連結後登入");
        setMode("login");
        setPassword("");
        return;
      }
      // App 版收不到 httpOnly cookie（前端跑在 capacitor://localhost，跨站 cookie 會被擋），
      // 憑證改由 body 帶回來自己保管。網頁版也存著沒有壞處，實際仍以 cookie 為準。
      if (result?.token) await saveAuthToken(result.token);
      await onAuthenticated();
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED") setNeedsVerification(true);
      setError(toUserMessage(err, "登入失敗，請稍後再試"));
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    setResending(true);
    setError("");
    try {
      const result = await apiSend<{ message?: string }>("/api/auth/resend-verification", "POST", { email });
      setNotice(result?.message ?? "已重新寄出驗證信");
      setNeedsVerification(false);
    } catch (err) {
      setError(toUserMessage(err, "重寄失敗，請稍後再試"));
    } finally {
      setResending(false);
    }
  }

  return (
    <main
      className={`flex min-h-screen items-center justify-center p-4 ${BG_CLASS} ${TEXT_PRIMARY_CLASS}`}
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="grid w-full max-w-4xl items-center gap-5 md:grid-cols-[1fr_390px]">
        <section className="hidden md:block">
          <p className={SECTION_LABEL_CLASS}>PRIVATE NET WORTH COMMAND CENTER</p>
          <h1 className="font-display mt-4 max-w-xl text-[42px] font-bold leading-tight tracking-tight">
            用一個乾淨的畫面，掌握資產、負債、目標與同步狀態。
          </h1>
          <p className={`mt-4 max-w-lg text-sm leading-7 ${TEXT_MUTED_CLASS}`}>
            Zeno 把現金、銀行帳戶、股票、虛擬貨幣與貸款放在同一個資產視角裡。你可以手動記錄，也可以在需要時連接資料來源。
          </p>
          <div className="mt-7 grid max-w-xl grid-cols-3 gap-3">
            {[
              { icon: Lock, label: "資料歸你", text: "可手動輸入，不強迫串接" },
              { icon: TrendingUp, label: "看見趨勢", text: "追蹤淨值與配置變化" },
              { icon: Target, label: "對齊目標", text: "把資產進度變成行動" },
            ].map(({ icon: Icon, label, text }) => (
              <div key={label} className={`${SURFACE_CLASS} rounded-2xl p-4`}>
                <Icon className="h-4 w-4" style={{ color: COLORS.gold }} aria-hidden />
                <p className="mt-3 text-sm font-bold">{label}</p>
                <p className={`mt-1 text-xs leading-5 ${TEXT_MUTED_CLASS}`}>{text}</p>
              </div>
            ))}
          </div>
        </section>

        <div className={`flex w-full flex-col items-center p-6 ${SURFACE_CLASS} rounded-[24px]`}>
          <img src="/logo.png" alt="Zeno" className="mb-3 h-20 w-auto object-contain dark:invert dark:brightness-125" />
          <p className={`mb-2 text-xs font-semibold tracking-[0.25em] ${TEXT_MUTED_CLASS}`}>
            {mode === "login" ? "SIGN IN · 登入帳號" : "REGISTER · 建立帳號"}
          </p>
          <p className={`mb-5 text-center text-xs leading-5 ${TEXT_MUTED_CLASS}`}>
            集中追蹤資產與負債，登入後同步你的私人財務工作台。
          </p>

          <form onSubmit={handleSubmit} className="w-full space-y-4">
            <div>
              <label className={`mb-2 block ${SECTION_LABEL_CLASS}`} htmlFor="auth-email">電子郵件</label>
              <input
                id="auth-email" type="email" autoComplete="email" value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="your@email.com" className={INPUT_CLASS} required
              />
            </div>
            <div>
              <label className={`mb-2 block ${SECTION_LABEL_CLASS}`} htmlFor="auth-password">
                密碼{mode === "register" ? "（至少 8 字元）" : ""}
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className={`${INPUT_CLASS} pr-11`}
                  required
                  minLength={mode === "register" ? 8 : 1}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "隱藏密碼" : "顯示密碼"}
                  className={`absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center ${TEXT_MUTED_CLASS} hover:text-[#B8933C] transition-colors`}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            </div>

            {notice && (
              <p className="rounded-lg bg-[#4F7B5E]/10 p-3 text-center text-sm font-medium text-[#4F7B5E] dark:text-[#7FAE8F]" role="status">
                {notice}
              </p>
            )}
            {error && (
              <div className="rounded-lg bg-[#A24936]/10 p-3 text-center" role="alert">
                <p className="text-sm font-medium text-[#A24936]">{error}</p>
                {needsVerification && (
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resending}
                    className="mt-1.5 text-xs font-semibold underline underline-offset-2 disabled:opacity-50"
                    style={{ color: COLORS.gold }}
                  >
                    {resending ? "寄送中…" : "重新寄送驗證信"}
                  </button>
                )}
              </div>
            )}

            <button type="submit" disabled={loading} className={`mt-2 ${BTN_PRIMARY_CLASS}`}>
              {loading ? "處理中…" : mode === "login" ? "登入" : "建立帳號"}
            </button>
          </form>

          <div className="my-4 flex w-full items-center gap-3">
            <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
            <span className={`text-xs ${TEXT_MUTED_CLASS}`}>或</span>
            <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
          </div>

          <button
            type="button"
            onClick={() => startOAuth("google")}
            className={`flex w-full items-center justify-center gap-2.5 rounded-lg border border-black/15 py-3.5 text-sm font-semibold transition-colors hover:bg-black/[0.02] dark:border-white/15 dark:hover:bg-white/[0.02] ${TEXT_PRIMARY_CLASS}`}
          >
            <GoogleIcon className="h-4 w-4" />
            使用 Google {mode === "login" ? "登入" : "註冊"}
          </button>

          <button
            type="button"
            onClick={() => startOAuth("apple")}
            className={`mt-2.5 flex w-full items-center justify-center gap-2.5 rounded-lg border border-black/15 py-3.5 text-sm font-semibold transition-colors hover:bg-black/[0.02] dark:border-white/15 dark:hover:bg-white/[0.02] ${TEXT_PRIMARY_CLASS}`}
          >
            <AppleIcon className="h-4 w-4" />
            使用 Apple {mode === "login" ? "登入" : "註冊"}
          </button>

          <div className="mt-4 grid w-full grid-cols-3 gap-2">
            {[
              { icon: Fingerprint, label: "Face ID" },
              { icon: Bell, label: "提醒" },
              { icon: Lock, label: "隱私" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-black/[0.03] px-2 py-2 text-xs font-semibold dark:bg-white/[0.04]"
              >
                <Icon className="h-3.5 w-3.5" style={{ color: COLORS.gold }} aria-hidden />
                <span>{label}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
              setNotice("");
              setNeedsVerification(false);
            }}
            className={`mt-5 py-1 text-xs ${TEXT_MUTED_CLASS} hover:text-[#B8933C] transition-colors`}
          >
            {mode === "login" ? "還沒有帳號？ 立即註冊" : "已有帳號？ 返回登入"}
          </button>
        </div>
      </div>
    </main>
  );
}
