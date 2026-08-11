import { registerPlugin } from "@capacitor/core";

// 對應 ios/App/App/SecureStorePlugin.swift——把登入憑證存進 iOS Keychain，
// 而不是 WKWebView 的 localStorage（後者在 App 沙盒裡是明文檔案）。
interface SecureStorePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

export const SecureStore = registerPlugin<SecureStorePlugin>("SecureStore");
