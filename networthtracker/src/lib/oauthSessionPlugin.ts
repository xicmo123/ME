import { registerPlugin } from "@capacitor/core";

// 對應 ios/App/App/OAuthSessionPlugin.swift——包一層 ASWebAuthenticationSession，
// 用來取代不可靠的 @capacitor/browser（SFSafariViewController）OAuth 流程
interface OAuthSessionPlugin {
  start(options: { url: string; callbackUrlScheme: string }): Promise<{ url: string }>;
}

export const OAuthSession = registerPlugin<OAuthSessionPlugin>("OAuthSession");
