// Capacitor 原生殼專用的初始化與輔助函式。
// 在網頁瀏覽器（非 App 包殼）跑的時候，Capacitor.isNativePlatform() 是 false，
// 所有函式都會直接安全地跳過，不影響一般 Web 使用。

import { Capacitor } from "@capacitor/core";

// 跟 capacitor.config.ts 的 server.url 一致——App 的 WKWebView 就是指到這個網域。
const APP_ORIGIN = "https://zeno.zequo.net";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

// Google/Apple 登入：網頁版直接同一頁導頁即可；App 版不能像網頁版一樣直接 <a href> 導頁——
// Capacitor 的 WKWebView 只讓 server.url 網域內的導頁留在 App 裡，一旦導去 accounts.google.com
// 這種外部網域就會被丟到系統 Safari，使用者體感上是「登入了但變成網頁」，而且回不去 App。
//
// 改用 ASWebAuthenticationSession（見 OAuthSessionPlugin.swift）開一個獨立瀏覽情境跑 OAuth，
// callback 命中自訂 URL scheme 時，session 會自動關閉並把整個網址透過 Promise 直接交回這裡——
// 不像 SFSafariViewController 那樣得賭 WebKit 願不願意把伺服器端轉址交給系統處理。
//
// 這個獨立瀏覽情境的 cookie store 跟主 WKWebView 是分開的沙盒，所以：
// - 登入／註冊：callback 帶回一個短效交換碼（exchange），這裡用主 WKWebView 自己發的請求
//   去 /api/auth/native-exchange 換發 auth-token，Set-Cookie 才會進到正確的 cookie store。
// - 綁定既有帳號（link: true）：反過來，要先用主 WKWebView 自己發的請求把「目前是誰登入」
//   換成短效 linkToken 帶給 OAuth 起始網址，讓 callback 認得出要綁定給誰。
export async function startOAuth(provider: "google" | "apple", options: { link?: boolean } = {}) {
  if (!isNative()) {
    window.location.href = `/api/auth/${provider}`;
    return;
  }

  let startUrl = `${APP_ORIGIN}/api/auth/${provider}?platform=native`;
  if (options.link) {
    const res = await fetch(`${APP_ORIGIN}/api/auth/native-link-token`, { credentials: "include" });
    if (!res.ok) return; // 沒登入就沒什麼好綁定的
    const { token } = await res.json();
    startUrl += `&linkToken=${encodeURIComponent(token)}`;
  }

  const { OAuthSession } = await import("./oauthSessionPlugin");
  let result: { url: string };
  try {
    result = await OAuthSession.start({ url: startUrl, callbackUrlScheme: "com.zenoworth.app" });
  } catch (err) {
    // 使用者取消或流程失敗，留在原本畫面即可；但印出來方便接 Safari Web Inspector 排查
    console.error("startOAuth failed", err);
    return;
  }

  const opened = new URL(result.url);
  const exchangeCode = opened.searchParams.get("exchange");
  if (exchangeCode) {
    await fetch(`${APP_ORIGIN}/api/auth/native-exchange`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: exchangeCode }),
    }).catch(() => {});
  }

  const target = new URL("/", APP_ORIGIN);
  opened.searchParams.forEach((value, key) => {
    if (key === "exchange") return;
    target.searchParams.set(key, value);
  });
  window.location.href = target.toString();
}

export async function initNativeShell(isDarkMode: boolean) {
  if (!isNative()) return;

  const [{ StatusBar, Style }, { Keyboard }] = await Promise.all([
    import("@capacitor/status-bar"),
    import("@capacitor/keyboard"),
  ]);

  await applyStatusBarTheme(isDarkMode, StatusBar, Style);

  // 鍵盤彈出時，Capacitor 預設的 body resize 在部分機型會讓底部導覽列被鍵盤蓋住，
  // 改用 Keyboard plugin 的事件，讓輸入焦點捲動到可視範圍。
  Keyboard.addListener("keyboardWillShow", () => {
    const active = document.activeElement as HTMLElement | null;
    active?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

async function applyStatusBarTheme(isDarkMode: boolean, StatusBarCls?: any, StyleCls?: any) {
  if (!isNative()) return;
  const { StatusBar, Style } = StatusBarCls && StyleCls ? { StatusBar: StatusBarCls, Style: StyleCls } : await import("@capacitor/status-bar");
  try {
    await StatusBar.setStyle({ style: isDarkMode ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: isDarkMode ? "#0B0D12" : "#EEF0EC" });
  } catch {
    // 部分 Android/舊版 iOS 不支援 setBackgroundColor，忽略即可
  }
}

export async function setStatusBarTheme(isDarkMode: boolean) {
  await applyStatusBarTheme(isDarkMode);
}

export async function hapticImpact(style: "light" | "medium" | "heavy" = "light") {
  if (!isNative()) return;
  const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
  const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
  await Haptics.impact({ style: map[style] });
}

// Face ID / Touch ID 驗證。回傳是否通過；網頁環境一律回傳 false（呼叫端應先以 isNative() 判斷要不要啟用這功能）。
export async function biometricVerify(reason: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    const check = await BiometricAuth.checkBiometry();
    if (!check.isAvailable) return false;
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: "取消",
      allowDeviceCredential: true, // Face ID 失敗多次後允許改用裝置密碼
      iosFallbackTitle: "使用密碼",
    });
    return true; // authenticate 失敗會 throw，走到這裡代表通過
  } catch {
    return false;
  }
}

// Apple 內購走 RevenueCat 代管，商品/entitlement 設定在 RevenueCat 後台，這裡只是薄薄一層
// wrapper，呼叫端（SettingsTab）不用直接碰 Capacitor plugin。appUserID 一律帶我們自己的
// User.id，這樣 RevenueCat 的 app_user_id 才會直接對應到資料庫的使用者，見 src/lib/revenuecat.ts。
export async function configurePurchases(userId: string) {
  if (!isNative()) return;
  const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (!apiKey) { console.error("NEXT_PUBLIC_REVENUECAT_IOS_API_KEY 未設定"); return; }
  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    await Purchases.configure({ apiKey, appUserID: userId });
  } catch (err) {
    console.error("configurePurchases failed", err);
  }
}

export type PurchasePlan = { identifier: string; title: string; priceString: string; raw: any };

// 回傳 RevenueCat 後台目前 offering 裡的方案列表，給升級畫面渲染用；identifier 對應到 RevenueCat
// 的 package identifier（例如 $rc_monthly / $rc_annual / 自訂的 lifetime），跟畫面上的方案卡片配對
export async function getPurchasePlans(): Promise<PurchasePlan[] | null> {
  if (!isNative()) return null;
  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return null;
    const packages = current.availablePackages ?? [];
    return packages.map((p: any) => ({ identifier: p.identifier, title: p.product.title, priceString: p.product.priceString, raw: p }));
  } catch (err) {
    console.error("getPurchasePlans failed", err);
    return null;
  }
}

// 實際跳出 Apple 的購買確認框。回傳 true 代表購買成功；使用者自己取消時回傳 false，不當成錯誤；
// 其他失敗（付款方式被拒等）則往外拋，讓呼叫端顯示錯誤訊息
export async function purchasePlan(pkg: any): Promise<boolean> {
  if (!isNative()) return false;
  const { Purchases } = await import("@revenuecat/purchases-capacitor");
  try {
    await Purchases.purchasePackage({ aPackage: pkg });
    return true;
  } catch (err: any) {
    if (err?.userCancelled) return false;
    throw err;
  }
}

// 換過裝置、或重灌 App 之後找回已購買的內容
export async function restorePurchases(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { customerInfo } = await Purchases.restorePurchases();
    return Boolean(customerInfo?.entitlements?.active?.["pro"]);
  } catch (err) {
    console.error("restorePurchases failed", err);
    return false;
  }
}

// 每日記帳提醒用的固定通知 id，跟行事曆事件的 hash id 分開，避免互相覆蓋
const DAILY_REMINDER_NOTIFICATION_ID = 999_000_001;

// 每天固定時間推播一次「記得記帳」，跟任何行事曆事件無關；enabled=false 或重新設定時間都會先取消舊排程再視情況重排
export async function scheduleDailyReminder(hour: number, minute: number, enabled: boolean) {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: [{ id: DAILY_REMINDER_NOTIFICATION_ID }] });
    if (!enabled) return;

    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return;

    await LocalNotifications.schedule({
      notifications: [{
        id: DAILY_REMINDER_NOTIFICATION_ID,
        title: "Zeno",
        body: "記帳囉！今天花了多少、賺了多少，隨手記一下。",
        schedule: { on: { hour, minute }, repeats: true, allowWhileIdle: true },
      }],
    });
  } catch {
    // 通知失敗不影響主流程
  }
}

// 同步行事曆事件的本地提醒：先清掉先前排的，再依 enabled 重新排程（iOS 上限 64 個 pending，保守排 32 個）
export async function syncEventReminders(events: { id: number; title: string; at: Date }[], enabled: boolean) {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }
    if (!enabled || events.length === 0) return;

    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return;

    const upcoming = [...events].sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 32);
    await LocalNotifications.schedule({
      notifications: upcoming.map((ev) => ({
        id: ev.id,
        title: "Zeno",
        body: ev.title,
        schedule: { at: ev.at },
      })),
    });
  } catch {
    // 通知失敗不影響主流程
  }
}
