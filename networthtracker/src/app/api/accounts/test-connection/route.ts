export const dynamic = "force-dynamic";
import ccxt from "ccxt";
import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";

// POST /api/accounts/test-connection → 在使用者按下「儲存」之前，先用輕量級的驗證 API 呼叫
// 確認交易所 API Key/Secret（/Passphrase）真的有效，避免打錯 Key 卻要等到背景同步失敗、
// 卡片上出現 apiSyncError 才發現。金鑰只用來做這次驗證呼叫，不會被寫入資料庫。
async function testBinance(apiKey: string, apiSecret: string) {
  const crypto = await import("crypto");
  const timestamp = Date.now();
  const query = `timestamp=${timestamp}`;
  const sig = crypto.default.createHmac("sha256", apiSecret).update(query).digest("hex");
  const r = await fetch(`https://api.binance.com/api/v3/account?${query}&signature=${sig}`, {
    headers: { "X-MBX-APIKEY": apiKey },
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data?.balances) throw new Error(data?.msg || "驗證失敗，請確認 API Key/Secret 是否正確");
}

async function testOkx(apiKey: string, apiSecret: string, passphrase: string) {
  const crypto = await import("crypto");
  const timestamp = new Date().toISOString();
  const requestPath = "/api/v5/account/balance";
  const prehash = `${timestamp}GET${requestPath}`;
  const sign = crypto.default.createHmac("sha256", apiSecret).update(prehash).digest("base64");
  const r = await fetch(`https://www.okx.com${requestPath}`, {
    headers: {
      "OK-ACCESS-KEY": apiKey,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": passphrase,
      "Content-Type": "application/json",
    },
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || data?.code !== "0") throw new Error(data?.msg || "驗證失敗，請確認 API Key/Secret/Passphrase 是否正確");
}

async function testCoinbase(apiKey: string, apiSecret: string) {
  const crypto = await import("crypto");
  const nextUri = "/v2/accounts?limit=1";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sign = crypto.default.createHmac("sha256", apiSecret).update(`${timestamp}GET${nextUri}`).digest("hex");
  const r = await fetch(`https://api.coinbase.com${nextUri}`, {
    headers: {
      "CB-ACCESS-KEY": apiKey,
      "CB-ACCESS-SIGN": sign,
      "CB-ACCESS-TIMESTAMP": timestamp,
      "CB-VERSION": "2023-01-01",
    },
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || data?.errors) throw new Error(data?.errors?.[0]?.message || "驗證失敗，請確認 API Key/Secret 是否正確");
}

async function testBitfinex(apiKey: string, apiSecret: string) {
  const exchange = new ccxt.bitfinex({ apiKey, secret: apiSecret, enableRateLimit: true });
  try {
    await exchange.privatePostAuthRWallets();
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "驗證失敗，請確認 API Key/Secret 是否正確");
  }
}

export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ message: "未登入" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ message: "Invalid JSON payload." }, { status: 400 });

  const { apiSource, apiKey, apiSecret, apiPassphrase } = body as {
    apiSource?: string; apiKey?: string; apiSecret?: string; apiPassphrase?: string;
  };

  const source = (apiSource || "BITFINEX").toUpperCase();
  const trimmedKey = apiKey?.trim() || "";
  const trimmedSecret = apiSecret?.trim() || "";
  const trimmedPassphrase = apiPassphrase?.trim() || "";

  if (!trimmedKey || !trimmedSecret) {
    return NextResponse.json({ message: "請先填寫 API Key 與 API Secret" }, { status: 400 });
  }
  if (source === "OKX" && !trimmedPassphrase) {
    return NextResponse.json({ message: "OKX 需要額外填寫 Passphrase" }, { status: 400 });
  }

  try {
    if (source === "BINANCE") await testBinance(trimmedKey, trimmedSecret);
    else if (source === "OKX") await testOkx(trimmedKey, trimmedSecret, trimmedPassphrase);
    else if (source === "COINBASE") await testCoinbase(trimmedKey, trimmedSecret);
    else await testBitfinex(trimmedKey, trimmedSecret);

    return NextResponse.json({ ok: true, message: "連線成功，API 金鑰有效" });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "連線失敗" }, { status: 400 });
  }
}
