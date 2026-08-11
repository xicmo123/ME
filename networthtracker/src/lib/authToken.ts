import { Capacitor } from "@capacitor/core";

// App 版的登入憑證儲存。
//
// 網頁版不會用到這裡：瀏覽器的 httpOnly cookie 由瀏覽器自己保管，前端 JS 讀不到也不該讀。
//
// App 版則不同。UI 是從 binary 載入的（origin 為 capacitor://localhost），打 API 時是跨站
// 請求，WKWebView 的 ITP 會擋掉第三方 cookie，所以 cookie 那條路在 App 裡走不通。改由 App
// 自己保管 token、每次請求帶 Authorization: Bearer。
//
// 存放位置分兩種：
// - App：iOS Keychain（見 ios/App/App/SecureStorePlugin.swift）。憑證等同帳戶存取權，
//   不放 localStorage——那在 App 沙盒裡只是個明文檔案。
// - 網頁：localStorage。網頁版實際上以 cookie 為準，這裡只是讓同一份程式碼在瀏覽器裡
//   不會炸掉；就算被 XSS 讀走，httpOnly cookie 才是真正的憑證。

const STORAGE_KEY = "zeno.auth-token";

// 同一個 session 內重複讀取不必每次都跨橋去問原生層，
// 也讓 apiFetch 能在已載入的情況下同步組出 header。
let cached: string | null = null;
let loaded = false;

function useKeychain(): boolean {
  return Capacitor.isNativePlatform();
}

export async function loadAuthToken(): Promise<string | null> {
  if (loaded) return cached;

  try {
    if (useKeychain()) {
      const { SecureStore } = await import("./secureStorePlugin");
      const { value } = await SecureStore.get({ key: STORAGE_KEY });
      cached = value ?? null;
    } else {
      cached = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
    }
  } catch {
    // 讀不到就當作未登入，使用者重新登入即可——這裡 throw 只會讓整個畫面掛掉
    cached = null;
  }

  loaded = true;
  return cached;
}

export async function saveAuthToken(token: string): Promise<void> {
  cached = token;
  loaded = true;
  try {
    if (useKeychain()) {
      const { SecureStore } = await import("./secureStorePlugin");
      await SecureStore.set({ key: STORAGE_KEY, value: token });
    } else {
      globalThis.localStorage?.setItem(STORAGE_KEY, token);
    }
  } catch {
    // 儲存失敗不該讓登入流程整個炸掉——這次 session 仍可用記憶體中的 token 繼續，
    // 只是下次開 App 要重新登入。
  }
}

export async function clearAuthToken(): Promise<void> {
  cached = null;
  loaded = true;
  try {
    if (useKeychain()) {
      const { SecureStore } = await import("./secureStorePlugin");
      await SecureStore.remove({ key: STORAGE_KEY });
    } else {
      globalThis.localStorage?.removeItem(STORAGE_KEY);
    }
  } catch {
    // 同上，清不掉也不該 throw；記憶體中的已經清掉了。
  }
}

/** 已經載入過就同步回傳，讓 apiFetch 不必為了組 header 多等一次 await。 */
export function peekAuthToken(): string | null {
  return loaded ? cached : null;
}
