// 記憶體版的固定視窗速率限制。
//
// 這個 App 跑在單一長駐 Node process（自架 Mac server，非 serverless），所以模組層級的 Map
// 在整個 process 生命週期內有效，不需要 Redis。若之後搬到多實例環境，把 hit() 換成
// Redis INCR + EXPIRE 即可，呼叫端不用改。

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// 避免長期累積不再使用的 key（例如每個試過一次登入的 IP）把記憶體吃光
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 5 * 60_000;

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * 記一次呼叫並回傳是否放行。
 * @param key    限制的維度，例如 `login:ip:1.2.3.4`
 * @param limit  視窗內允許的次數
 * @param windowMs 視窗長度
 */
export function hit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

/** 登入成功後把該帳號/IP 的失敗計數清掉，正常使用者不會因為之前打錯幾次而被鎖 */
export function reset(key: string): void {
  buckets.delete(key);
}

/**
 * 取得呼叫端 IP。App 透過 Cloudflare Tunnel 進來，真實 IP 在 cf-connecting-ip；
 * 一般反向代理則在 x-forwarded-for 的第一段。都拿不到時回傳 "unknown"——
 * 這種情況下所有匿名流量會共用同一個桶，寧可誤傷也不要完全不限。
 */
export function clientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

// ─── 各處使用的限制設定，集中在這裡方便調整
export const LIMITS = {
  /** 登入：同一 IP 15 分鐘 20 次（一個家庭/辦公室共用 IP 也夠用） */
  loginPerIp: { limit: 20, windowMs: 15 * 60_000 },
  /** 登入：同一 email 15 分鐘 5 次，這是擋線上暴力破解的主力 */
  loginPerAccount: { limit: 5, windowMs: 15 * 60_000 },
  /** 註冊：同一 IP 1 小時 5 次，擋批次建立帳號 */
  registerPerIp: { limit: 5, windowMs: 60 * 60_000 },
  /** 重寄驗證信：同一 email 10 分鐘 3 次 */
  resendVerification: { limit: 3, windowMs: 10 * 60_000 },
} as const;
