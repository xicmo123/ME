// OAuth 登入時「這個 Google/Apple 身分對應到哪個帳號」的共用判斷。
//
// ── 為什麼不能用 email 自動合併 ──
// 先前 Google/Apple callback 都是「找不到 providerId 就用 email 找既有帳號並自動掛上去」，
// 加上註冊時直接把 emailVerified 設成 true（完全沒寄驗證信），組合起來是一個帳號接管漏洞：
//
//   攻擊者用 victim@gmail.com + 自己的密碼註冊
//     → 受害者之後用 Google 登入
//     → 系統用 email 找到攻擊者的帳號，把 googleId 掛上去
//     → 兩人共用同一個帳號，攻擊者看得到受害者的全部資產
//
// 修法：**有密碼的帳號一律不自動合併**，要求先用密碼登入再到設定頁綁定（這也是多數服務的作法）。
// 只有「沒有密碼」的帳號才允許自動接上——那種帳號本來就只能靠 OAuth 進入，而兩邊
// provider 都已經驗證過是同一個信箱，等於同一個人，不存在搶先註冊的問題。

import { prisma } from "@/lib/prisma";

export type OAuthProvider = "google" | "apple";

type ResolveResult = { ok: true; userId: string } | { ok: false; message: string };

const PROVIDER_LABEL: Record<OAuthProvider, string> = { google: "Google", apple: "Apple" };

export async function resolveOAuthLogin(
  provider: OAuthProvider,
  providerAccountId: string,
  email: string
): Promise<ResolveResult> {
  const idField = provider === "google" ? "googleId" : "appleId";
  const normalizedEmail = email.trim().toLowerCase();

  const byProviderId = await prisma.user.findUnique({
    where: provider === "google" ? { googleId: providerAccountId } : { appleId: providerAccountId },
    select: { id: true },
  });
  if (byProviderId) return { ok: true, userId: byProviderId.id };

  const byEmail = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, passwordHash: true },
  });

  if (byEmail) {
    if (byEmail.passwordHash) {
      return {
        ok: false,
        message: `此信箱已使用密碼註冊，請先用密碼登入，再到設定頁綁定 ${PROVIDER_LABEL[provider]}`,
      };
    }
    // 沒有密碼 → 這個帳號只能靠 OAuth 進入，且兩邊 provider 都驗證過同一個信箱，接上是安全的
    const linked = await prisma.user.update({
      where: { id: byEmail.id },
      data: { [idField]: providerAccountId, emailVerified: true },
      select: { id: true },
    });
    return { ok: true, userId: linked.id };
  }

  const created = await prisma.user.create({
    data: { email: normalizedEmail, [idField]: providerAccountId, emailVerified: true },
    select: { id: true },
  });
  return { ok: true, userId: created.id };
}
