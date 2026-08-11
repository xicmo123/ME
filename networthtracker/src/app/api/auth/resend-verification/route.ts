export const dynamic = "force-dynamic";
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { isMailerConfigured, sendVerificationEmail } from "@/lib/mailer";
import { hit, LIMITS } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

// POST /api/auth/resend-verification { email }
// 回應一律相同，不透露這個信箱是否存在、是否已驗證（避免被拿來當帳號列舉的探測工具）。
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const rawEmail = (body as { email?: unknown } | null)?.email;
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

  const genericOk = NextResponse.json({ message: "如果這個信箱需要驗證，我們已經重新寄出驗證信" });

  if (!email) return genericOk;
  if (!isMailerConfigured()) return genericOk;

  const limit = hit(`resend:${email}`, LIMITS.resendVerification.limit, LIMITS.resendVerification.windowMs);
  if (!limit.allowed) {
    return NextResponse.json(
      { message: "寄送太頻繁，請稍後再試" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true },
  });
  if (!user || user.emailVerified) return genericOk;

  const token = randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: { verificationToken: token, verificationTokenExpires: new Date(Date.now() + VERIFICATION_TTL_MS) },
  });
  await sendVerificationEmail(email, token);

  return genericOk;
}
