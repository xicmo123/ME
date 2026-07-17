import Capacitor

// Capacitor 的 iOS bridge 不會用 Objective-C runtime 掃描全部 class 來找插件，
// 只認得兩種來源：capacitor.config.json 的 packageClassList（npm 裝的插件，由
// `npx cap sync` 自動維護）、跟這裡手動 registerPluginType 註冊的。OAuthSessionPlugin
// 是專案內自己寫的本地插件，不在任何 npm 套件裡，`cap sync` 不知道它的存在，所以
// 必須在這裡手動註冊，不然 bridge 找不到它，JS 那邊呼叫就會直接得到
// "plugin is not implemented" 的錯誤。
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginType(OAuthSessionPlugin.self)
    }
}
