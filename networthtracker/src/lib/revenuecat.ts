// RevenueCat 代管 Apple 內購的憑證驗證與續訂/取消/退款事件，我們不用自己碰 StoreKit 的簽章驗證。
// 這裡只負責「RevenueCat 說這個使用者現在有沒有 pro，我們就照著把狀態寫回自己的資料庫」。
//
// 前提：Capacitor 端呼叫 Purchases.configure() 時，appUserID 一律帶我們自己的 User.id
// （見 src/lib/native.ts 的 configurePurchases），這樣 RevenueCat 的 app_user_id 才會直接等於
// 我們資料庫的使用者 id，不需要另外維護一份 id 對照表。
//
// RevenueCat 後台要建立一個 identifier 為 "pro" 的 entitlement，掛上月付/年付/買斷三個商品，
// 這裡才抓得到 entitlements["pro"]。

import { prisma } from "@/lib/prisma";
import type { SubscriptionStatus } from "@prisma/client";

const PRO_ENTITLEMENT_ID = "pro";

type RevenueCatEntitlement = {
  expires_date: string | null; // null = 買斷制／不會過期
};

type RevenueCatSubscriber = {
  entitlements: Record<string, RevenueCatEntitlement>;
};

// 用 Secret API Key 向 RevenueCat 拉這個使用者「當下最新、最權威」的訂閱狀態。
// Webhook 事件可能漏收或亂序送達（例如 RENEWAL 比更早的 CANCELLATION 晚到），
// 主動查一次目前狀態，比直接信任單一 webhook 事件內容可靠。
export async function fetchRevenueCatSubscriber(appUserId: string): Promise<RevenueCatSubscriber | null> {
  const secretKey = process.env.REVENUECAT_SECRET_API_KEY;
  if (!secretKey) throw new Error("REVENUECAT_SECRET_API_KEY 未設定");

  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (res.status === 404) return null; // 這個使用者在 RevenueCat 上還沒有任何交易紀錄
  if (!res.ok) throw new Error(`RevenueCat API 回傳 ${res.status}`);
  const data = (await res.json()) as { subscriber: RevenueCatSubscriber };
  return data.subscriber;
}

function resolveProStatus(entitlements: Record<string, RevenueCatEntitlement>): {
  isPro: boolean;
  status: SubscriptionStatus;
  expiresAt: Date | null;
} {
  const pro = entitlements[PRO_ENTITLEMENT_ID];
  if (!pro) return { isPro: false, status: "EXPIRED", expiresAt: null };

  const expiresAt = pro.expires_date ? new Date(pro.expires_date) : null;
  const isActive = !expiresAt || expiresAt.getTime() > Date.now();
  return { isPro: isActive, status: isActive ? "ACTIVE" : "EXPIRED", expiresAt };
}

// webhook handler 跟購買後的立即同步都共用這支，把 RevenueCat 的權威狀態寫回 User 表
export async function applyProStatus(userId: string, entitlements: Record<string, RevenueCatEntitlement>) {
  const { isPro, status, expiresAt } = resolveProStatus(entitlements);
  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionTier: isPro ? "PRO" : "FREE",
      subscriptionStatus: status,
      subscriptionProvider: "apple_iap",
      subscriptionExpiresAt: expiresAt,
    },
  });
}
