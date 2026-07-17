// Capacitor 原生殼專用的初始化與輔助函式。
// 在網頁瀏覽器（非 App 包殼）跑的時候，Capacitor.isNativePlatform() 是 false，
// 所有函式都會直接安全地跳過，不影響一般 Web 使用。

import { Capacitor } from "@capacitor/core";

// 跟 capacitor.config.ts 的 server.url 一致——App 的 WKWebView 就是指到這個網域。
const APP_ORIGIN = "https://zeno.zequo.net";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

// Google/Apple 登入：網頁版直接同一頁導頁即可；App 版改用 in-app 瀏覽器（SFSafariViewController）開，
// 不能像網頁版一樣直接 <a href> 導頁——Capacitor 的 WKWebView 只讓 server.url 網域內的導頁留在 App 裡，
// 一旦導去 accounts.google.com 這種外部網域就會被丟到系統 Safari，使用者體感上是「登入了但變成網頁」，
// 而且回不去 App。in-app 瀏覽器走完 OAuth 後，跟主要 WKWebView 共用同一份系統 cookie store，
// 所以 callback 設下的 auth-token 主畫面馬上就讀得到；剩下只需要監聽 App 自訂 URL scheme 把使用者帶回來
// （見下面的 initDeepLinkListener），不需要另外設計一次性換發碼。
export async function startOAuth(provider: "google" | "apple") {
  if (!isNative()) {
    window.location.href = `/api/auth/${provider}`;
    return;
  }
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: `${APP_ORIGIN}/api/auth/${provider}?platform=native` });
}

// App 啟動時呼叫一次：監聽 OAuth in-app 瀏覽器導回 App 自訂 URL scheme（com.zenoworth.app://oauth-callback）
// 的事件——iOS 收到這個 scheme 會自動關閉 in-app 瀏覽器分頁、把 App 帶回前景。把網址上的參數
// （authError / linked）轉貼回主網域，重用既有「讀網址參數」的登入頁邏輯，畫面上的行為就跟網頁版一致。
export function initDeepLinkListener() {
  if (!isNative()) return;
  void (async () => {
    const { App } = await import("@capacitor/app");
    App.addListener("appUrlOpen", (data: { url: string }) => {
      try {
        const opened = new URL(data.url);
        if (`${opened.protocol}//${opened.host}` !== "com.zenoworth.app://oauth-callback") return;
        const target = new URL("/", APP_ORIGIN);
        opened.searchParams.forEach((value, key) => target.searchParams.set(key, value));
        window.location.href = target.toString();
      } catch {
        // 網址格式不對就忽略，不影響其他 App 內操作
      }
    });
  })();
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
