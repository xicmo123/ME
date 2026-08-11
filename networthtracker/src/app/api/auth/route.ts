export const dynamic = "force-dynamic";
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authenticatedJson, getUserIdFromRequest, clearAuthCookie } from "@/lib/auth";
import { resolveEntitlements } from "@/lib/entitlements";
import { isMailerConfigured, sendVerificationEmail } from "@/lib/mailer";
import { clientIp, hit, reset, LIMITS } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  // 不做嚴格的 RFC 驗證，擋掉明顯不是信箱的輸入即可
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ user: null }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, emailVerified: true, createdAt: true,
      googleId: true, appleId: true, passwordHash: true,
      subscriptionTier: true, subscriptionStatus: true, subscriptionExpiresAt: true,
    },
  });
  if (!user) return NextResponse.json({ user: null }, { status: 401 });

  const { googleId, appleId, passwordHash, subscriptionTier, subscriptionStatus, subscriptionExpiresAt, ...rest } = user;
  return NextResponse.json({
    user: {
      ...rest,
      hasGoogle: !!googleId,
      hasApple: !!appleId,
      hasPassword: !!passwordHash,
      entitlements: resolveEntitlements({ subscriptionTier, subscriptionStatus, subscriptionExpiresAt }),
    },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Invalid request" }, { status: 400 });
  }

  const { action, password } = body as { action?: string; password?: string };
  const email = normalizeEmail((body as { email?: unknown }).email);
  if (!email || !password) return NextResponse.json({ message: "請填寫有效的郵箱和密碼" }, { status: 400 });

  const ip = clientIp(request);

  if (action === "register") return handleRegister(email, password, ip);
  if (action === "login") return handleLogin(email, password, ip);
  return NextResponse.json({ message: "Unknown action" }, { status: 400 });
}

async function handleRegister(email: string, password: string, ip: string) {
  // 擋批次建立帳號：同一 IP 一小時最多 5 次
  const ipLimit = hit(`register:ip:${ip}`, LIMITS.registerPerIp.limit, LIMITS.registerPerIp.windowMs);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { message: "註冊次數過於頻繁，請稍後再試" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } }
    );
  }

  if (password.length < 8) return NextResponse.json({ message: "密碼至少需要 8 個字元" }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ message: "此郵箱已被註冊" }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 12);

  // SMTP 有設定就走真正的驗證流程；沒設定則維持舊的「直接視為已驗證」，
  // 避免因為少一組環境變數就讓線上註冊整個不能用。
  const requiresVerification = isMailerConfigured();
  const verificationToken = requiresVerification ? randomBytes(32).toString("hex") : null;

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      emailVerified: !requiresVerification,
      verificationToken,
      verificationTokenExpires: verificationToken ? new Date(Date.now() + VERIFICATION_TTL_MS) : null,
    },
  });

  if (verificationToken) {
    const sent = await sendVerificationEmail(email, verificationToken);
    if (!sent) {
      // 信寄不出去卻把人擋在門外是最糟的組合，退回可登入狀態並記錄下來
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true, verificationToken: null, verificationTokenExpires: null },
      });
    } else {
      return NextResponse.json(
        { message: "註冊成功，請到信箱點擊驗證連結後登入", requiresVerification: true },
        { status: 201 }
      );
    }
  }

  return authenticatedJson(
    { message: "註冊成功", user: { id: user.id, email: user.email } },
    user.id,
    { status: 201 }
  );
}

async function handleLogin(email: string, password: string, ip: string) {
  const ipKey = `login:ip:${ip}`;
  const accountKey = `login:account:${email}`;

  // 兩個維度都限：IP 擋分散式撒網，email 擋針對單一帳號的暴力破解
  const ipLimit = hit(ipKey, LIMITS.loginPerIp.limit, LIMITS.loginPerIp.windowMs);
  const accountLimit = hit(accountKey, LIMITS.loginPerAccount.limit, LIMITS.loginPerAccount.windowMs);
  if (!ipLimit.allowed || !accountLimit.allowed) {
    const retryAfter = Math.max(ipLimit.retryAfterSeconds, accountLimit.retryAfterSeconds);
    return NextResponse.json(
      { message: `嘗試次數過多，請於 ${Math.ceil(retryAfter / 60)} 分鐘後再試` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    return NextResponse.json({ message: "郵箱或密碼錯誤" }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return NextResponse.json({ message: "郵箱或密碼錯誤" }, { status: 401 });

  if (!user.emailVerified) {
    return NextResponse.json(
      { message: "請先到信箱點擊驗證連結後再登入", code: "EMAIL_NOT_VERIFIED" },
      { status: 403 }
    );
  }

  // 登入成功就把失敗計數清掉，正常使用者不會因為之前打錯幾次而被鎖在門外
  reset(accountKey);

  return authenticatedJson({ message: "登入成功", user: { id: user.id, email: user.email } }, user.id);
}

export async function DELETE() {
  const response = NextResponse.json({ message: "已登出" });
  clearAuthCookie(response);
  return response;
}
