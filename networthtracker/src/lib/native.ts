// Capacitor 原生殼專用的初始化與輔助函式。
// 在網頁瀏覽器（非 App 包殼）跑的時候，Capacitor.isNativePlatform() 是 false，
// 所有函式都會直接安全地跳過，不影響一般 Web 使用。

import { Capacitor } from "@capacitor/core";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
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
        title: "Zeno Worth",
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
        title: "Zeno Worth",
        body: ev.title,
        schedule: { at: ev.at },
      })),
    });
  } catch {
    // 通知失敗不影響主流程
  }
}
