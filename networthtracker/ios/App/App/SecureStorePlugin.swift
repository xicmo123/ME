import Foundation
import Capacitor
import Security

// 登入憑證的原生儲存。
//
// App 的前端現在是從 binary 載入的（origin capacitor://localhost），打 API 時屬於跨站請求，
// WKWebView 的 ITP 會擋掉第三方 cookie，所以憑證必須由 App 自己保管、每次請求帶 Bearer。
//
// 保管在哪裡有差別：WKWebView 的 localStorage 只是 App 沙盒裡的一個明文檔案，裝置被越獄或
// 透過備份取出檔案系統時可以直接讀到。這是資產管理 App，憑證等同帳戶存取權，所以放 Keychain。
//
// kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly：
// - AfterFirstUnlock —— 開機後第一次解鎖過就可讀，背景重新整理/推播喚醒時仍能用。
// - ThisDeviceOnly —— 不隨 iCloud Keychain 或 iTunes 備份轉移到其他裝置。
//   憑證是綁這台裝置的登入狀態，跟著備份跑到別台機器沒有意義，而且擴大暴露面。
//
// ⚠️ 維護注意：這是專案自己寫的本地插件，跟 OAuthSessionPlugin 一樣，
// `npx cap sync ios` 會依 node_modules 重新產生 ios/App/App/capacitor.config.json 的
// packageClassList，把本地插件洗掉。每次 sync 後都要確認 "SecureStorePlugin" 還在，
// 不然 JS 端呼叫會得到 "plugin is not implemented"。
@objc(SecureStorePlugin)
public class SecureStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureStorePlugin"
    public let jsName = "SecureStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    private let service = "com.zenoworth.app.credentials"

    private func query(for key: String) -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("Missing key")
            return
        }

        var lookup = query(for: key)
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &item)

        // 找不到不是錯誤，就是還沒登入過
        if status == errSecItemNotFound {
            call.resolve(["value": NSNull()])
            return
        }
        guard status == errSecSuccess,
              let data = item as? Data,
              let value = String(data: data, encoding: .utf8) else {
            call.reject("Keychain read failed (status \(status))")
            return
        }
        call.resolve(["value": value])
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let value = call.getString("value") else {
            call.reject("Missing key or value")
            return
        }
        guard let data = value.data(using: .utf8) else {
            call.reject("Value is not valid UTF-8")
            return
        }

        // SecItemAdd 遇到既有項目會回 errSecDuplicateItem，所以先刪再寫，
        // 讓「寫入」的語意單純是覆蓋。
        SecItemDelete(query(for: key) as CFDictionary)

        var insert = query(for: key)
        insert[kSecValueData as String] = data
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(insert as CFDictionary, nil)
        guard status == errSecSuccess else {
            call.reject("Keychain write failed (status \(status))")
            return
        }
        call.resolve()
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("Missing key")
            return
        }
        let status = SecItemDelete(query(for: key) as CFDictionary)
        // 本來就不存在也算清除成功——登出流程不該因為沒東西可刪而失敗
        guard status == errSecSuccess || status == errSecItemNotFound else {
            call.reject("Keychain delete failed (status \(status))")
            return
        }
        call.resolve()
    }
}
