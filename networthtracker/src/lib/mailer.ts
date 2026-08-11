// 寄信（目前只有註冊驗證信）。
//
// SMTP 是「選配」：沒設定環境變數時 isMailerConfigured() 回傳 false，註冊流程會退回
// 「直接標記為已驗證」的舊行為，不會因為少設一組環境變數就讓線上的註冊整個壞掉。
// 一旦補上 SMTP_* 四個變數，驗證信流程就會自動生效，不需要改任何程式碼。
//
// 需要的環境變數：
//   SMTP_HOST、SMTP_PORT、SMTP_USER、SMTP_PASS
//   SMTP_FROM（選填，預設用 SMTP_USER）
//   APP_BASE_URL（驗證連結的網域，已經有了）

import nodemailer, { type Transporter } from "nodemailer";
import { getConfiguredAppOrigin } from "./requestOrigin";

let cachedTransporter: Transporter | null = null;

export function isMailerConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS
  );
}

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;
  const port = Number(process.env.SMTP_PORT);
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 走隱式 TLS，587 走 STARTTLS
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  });
  return cachedTransporter;
}

function renderVerificationEmail(verifyUrl: string): { subject: string; text: string; html: string } {
  return {
    subject: "驗證你的 Zeno 帳號",
    text: [
      "歡迎使用 Zeno。",
      "",
      "請點擊以下連結完成信箱驗證（24 小時內有效）：",
      verifyUrl,
      "",
      "如果這不是你本人的操作，請忽略這封信，你的信箱不會被建立成帳號。",
    ].join("\n"),
    html: `
      <div style="font-family:-apple-system,'PingFang TC','Noto Sans TC',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1C1F1A">
        <p style="font-size:20px;font-weight:700;color:#B8933C;margin:0 0 24px">Zeno</p>
        <p style="font-size:15px;line-height:1.7;margin:0 0 24px">
          歡迎使用 Zeno。請點擊下方按鈕完成信箱驗證，連結 24 小時內有效。
        </p>
        <a href="${verifyUrl}"
           style="display:inline-block;background:#B8933C;color:#241B06;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:8px">
          驗證信箱
        </a>
        <p style="font-size:13px;line-height:1.7;color:#5F6459;margin:24px 0 0">
          如果按鈕無法點擊，請複製這段網址到瀏覽器開啟：<br>
          <span style="word-break:break-all">${verifyUrl}</span>
        </p>
        <p style="font-size:13px;line-height:1.7;color:#5F6459;margin:20px 0 0">
          如果這不是你本人的操作，請忽略這封信，你的信箱不會被建立成帳號。
        </p>
      </div>
    `,
  };
}

/**
 * 寄出註冊驗證信。回傳是否真的寄出去了（SMTP 未設定或寄送失敗都回 false，
 * 呼叫端據此決定要不要退回「直接驗證」的降級行為）。
 */
export async function sendVerificationEmail(to: string, token: string): Promise<boolean> {
  if (!isMailerConfigured()) return false;

  const baseUrl = getConfiguredAppOrigin();
  const verifyUrl = `${baseUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;
  const { subject, text, html } = renderVerificationEmail(verifyUrl);

  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });
    return true;
  } catch (error) {
    // 寄信失敗不該讓註冊整個失敗——使用者已經建立好了，之後可以在設定頁重寄
    console.error("[mailer] 驗證信寄送失敗:", error);
    return false;
  }
}
