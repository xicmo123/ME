import Foundation
import Capacitor
import AuthenticationServices

// SFSafariViewController（@capacitor/browser 用的元件）在把導頁交還給 App 這件事上不可靠：
// OAuth callback 是伺服器端的 302/303 轉址到自訂 URL scheme，不是使用者直接點擊連結，
// WebKit 不保證每次都會把這種轉址交給系統處理、切回 App——常見的結果是卡在瀏覽器畫面，
// 使用者已經登入完成，但回不去 App。
//
// ASWebAuthenticationSession 是 Apple 專門為「App 內開瀏覽器走 OAuth、走完自動關閉並把
// callback 網址帶回 App」這個情境設計的 API，callback 命中會直接透過 completion handler
// 把整個網址（含 query string）交回來，不依賴 WebKit 對未知 scheme 的即興處理。
//
// ⚠️ 維護注意：這是專案自己寫的本地插件，不是 npm 套件，Capacitor 的 iOS bridge
// 不會自動掃描 runtime 找到它——它只認 ios/App/App/capacitor.config.json 的
// packageClassList（這份清單一般由 `npx cap sync` 依 node_modules 自動產生，不知道
// 本地插件的存在）。所以每次跑過 `npx cap sync ios` 之後，都要回去檢查
// packageClassList 有沒有把 "OAuthSessionPlugin" 洗掉，沒有的話要手動加回去，
// 不然 bridge 找不到這個插件，JS 呼叫會直接得到 "plugin is not implemented"。
@objc(OAuthSessionPlugin)
public class OAuthSessionPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "OAuthSessionPlugin"
    public let jsName = "OAuthSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)
    ]

    // 要保留 strong reference，不然 session 物件會在 start() 還沒跑完就被釋放掉
    private var session: ASWebAuthenticationSession?

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return self.bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    @objc func start(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("Missing or invalid url")
            return
        }
        guard let scheme = call.getString("callbackUrlScheme") else {
            call.reject("Missing callbackUrlScheme")
            return
        }

        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { callbackURL, error in
                if let error = error {
                    let nsError = error as NSError
                    if nsError.domain == ASWebAuthenticationSessionErrorDomain,
                       nsError.code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                        call.reject("cancelled")
                    } else {
                        call.reject(error.localizedDescription)
                    }
                    return
                }
                guard let callbackURL = callbackURL else {
                    call.reject("No callback URL")
                    return
                }
                call.resolve(["url": callbackURL.absoluteString])
            }
            session.presentationContextProvider = self
            // 要跟系統 Safari 共用登入態（例如使用者已經在 Safari 登過 Google），關掉 ephemeral
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            // start() 回傳 false 代表沒能顯示（例如 presentationAnchor 拿不到有效 window）：
            // 這種情況 completion handler 不會被呼叫，一定要自己 reject，不然 JS 那邊的 promise
            // 會永遠 pending，畫面上就是「點了沒反應」
            if !session.start() {
                call.reject("Failed to start authentication session")
                self.session = nil
            }
        }
    }
}
