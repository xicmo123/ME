// 訂閱方案的功能開關與用量上限，集中定義在這裡，避免各 API route 各自寫一份判斷邏輯。
// 目前尚未串金流（Stripe / Apple IAP），User.subscriptionTier 只能靠後台手動調整；
// 之後接上金流時，webhook 只需要更新 User 這幾個欄位，這裡的判斷邏輯不需要改。

import { prisma } from "@/lib/prisma";
import type { SubscriptionStatus, SubscriptionTier } from "@prisma/client";

export type Entitlements = {
  tier: SubscriptionTier;
  isPro: boolean;
  limits: {
    maxAccounts: number | null; // null = 無上限
    maxGoals: number | null;
  };
  features: {
    apiSync: boolean; // 交易所 API 自動同步（Bitfinex/Binance/OKX/Coinbase）
    csvExport: boolean; // CSV 報表匯出
    recurringTransactions: boolean; // 定期扣款自動記帳
  };
};

const FREE_LIMITS: Entitlements["limits"] = { maxAccounts: 20, maxGoals: 3 };
const PRO_LIMITS: Entitlements["limits"] = { maxAccounts: null, maxGoals: null };

const FREE_FEATURES: Entitlements["features"] = {
  apiSync: false,
  csvExport: false,
  recurringTransactions: false,
};
const PRO_FEATURES: Entitlements["features"] = {
  apiSync: true,
  csvExport: true,
  recurringTransactions: true,
};

// ACTIVE/TRIALING 才算有效訂閱；過期日一到，即使 tier 欄位還沒被 webhook 改回 FREE 也視為無效，
// 避免金流那邊 webhook 延遲或漏接時，使用者無限期免費用到付費功能。
function isSubscriptionCurrentlyValid(status: SubscriptionStatus, expiresAt: Date | null): boolean {
  if (status !== "ACTIVE" && status !== "TRIALING") return false;
  if (expiresAt && expiresAt.getTime() < Date.now()) return false;
  return true;
}

export function resolveEntitlements(user: {
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt: Date | null;
}): Entitlements {
  const isPro = user.subscriptionTier === "PRO" && isSubscriptionCurrentlyValid(user.subscriptionStatus, user.subscriptionExpiresAt);
  return {
    tier: isPro ? "PRO" : "FREE",
    isPro,
    limits: isPro ? PRO_LIMITS : FREE_LIMITS,
    features: isPro ? PRO_FEATURES : FREE_FEATURES,
  };
}

export async function getEntitlementsForUser(userId: string): Promise<Entitlements> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true, subscriptionStatus: true, subscriptionExpiresAt: true },
  });
  if (!user) {
    return resolveEntitlements({ subscriptionTier: "FREE", subscriptionStatus: "ACTIVE", subscriptionExpiresAt: null });
  }
  return resolveEntitlements(user);
}
