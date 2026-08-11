// 前端呼叫自家 API 的統一入口。
//
// 先前每個 fetch 都是 `try { ... } catch (e) { }`，一半的錯誤被靜默吞掉——使用者按了
// 沒反應，也沒有任何提示。這裡把「解析 JSON、讀出後端的錯誤訊息、辨識升級提示」統一掉，
// 呼叫端只要 try/catch 一次就能拿到可以直接顯示給使用者看的訊息。

import { loadAuthToken, peekAuthToken } from "./authToken";

export class ApiError extends Error {
  readonly status: number;
  /** 後端用 402 + code:"UPGRADE_REQUIRED" 表示「這是 Pro 功能」 */
  readonly code?: string;
  readonly feature?: string;
  readonly payload?: unknown;

  constructor(message: string, status: number, code?: string, feature?: string, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.feature = feature;
    this.payload = payload;
  }

  get isUpgradeRequired(): boolean {
    return this.status === 402 || this.code === "UPGRADE_REQUIRED";
  }
}

const NETWORK_ERROR_MESSAGE = "連線失敗，請確認網路後再試";

function offlineAwareMessage(): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "目前沒有網路連線，請稍後再試";
  }
  return NETWORK_ERROR_MESSAGE;
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  return response.json().catch(() => null);
}

// App 版的 UI 是從 binary 載入的（origin 為 capacitor://localhost），相對路徑的 /api/... 會打到
// App bundle 自己身上而不是後端，所以要補上絕對網址。網頁版的 base 是空字串，維持相對路徑，
// 行為完全不變。
//
// 這個值在建置時由 NEXT_PUBLIC_API_BASE_URL 決定，不在執行期從遠端抓——如果讓 App 執行期
// 才決定要打哪台伺服器，等於又回到「送審後還能改變行為」的老路，那正是被 5.6 拒絕的原因。
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

function resolveUrl(input: string): string {
  if (!API_BASE_URL || !input.startsWith("/")) return input;
  return `${API_BASE_URL}${input}`;
}

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  // 網頁版靠 httpOnly cookie（credentials: "include" 讓跨站請求也帶上）；
  // App 版 cookie 會被 ITP 擋掉，改帶 Authorization: Bearer。兩者並存互不干擾。
  const token = peekAuthToken() ?? (await loadAuthToken());
  const headers = new Headers(init?.headers);
  if (token && !headers.has("authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(resolveUrl(input), { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError(offlineAwareMessage(), 0);
  }

  const body = await parseBody(response);

  if (!response.ok) {
    const record = (body ?? {}) as { message?: string; code?: string; feature?: string };
    const message =
      record.message ??
      (response.status === 401
        ? "登入狀態已過期，請重新登入"
        : response.status === 429
          ? "操作太頻繁，請稍後再試"
          : "操作失敗，請稍後再試");
    throw new ApiError(message, response.status, record.code, record.feature, body);
  }

  return body as T;
}

export function apiGet<T>(url: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(url, { ...init, method: "GET" });
}

export function apiSend<T>(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown
): Promise<T> {
  return apiFetch<T>(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** 把任何 throw 出來的東西轉成可以顯示給使用者的一句話 */
export function toUserMessage(error: unknown, fallback = "操作失敗，請稍後再試"): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
