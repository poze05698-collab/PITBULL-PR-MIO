import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function md5(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("MD5", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return response({ error: "METHOD_NOT_ALLOWED" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cpxSecureHash = Deno.env.get("CPX_SECURE_HASH");

  if (!supabaseUrl || !serviceRoleKey || !cpxSecureHash) {
    return response({ error: "SERVER_CONFIG_ERROR" }, 500);
  }

  const url = new URL(req.url);
  let params = url.searchParams;

  if (req.method === "POST") {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      params = new URLSearchParams();
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && value !== null) params.set(key, String(value));
      }
    } else {
      const text = await req.text();
      if (text) params = new URLSearchParams(text);
    }
  }

  const status = Number(params.get("status"));
  const transId = params.get("trans_id")?.trim();
  const userId = params.get("user_id")?.trim();
  const amount = Number(params.get("amount_local"));
  const receivedHash = params.get("secure_hash")?.trim();

  if (!Number.isInteger(status) || !transId || !userId || !Number.isFinite(amount) || amount <= 0 || !receivedHash) {
    return response({ error: "INVALID_POSTBACK" }, 400);
  }

  const expectedHash = await md5(`${transId}-${cpxSecureHash}`);
  if (receivedHash.toLowerCase() !== expectedHash.toLowerCase()) {
    return response({ error: "INVALID_SIGNATURE" }, 403);
  }

  const parsedUserId = userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  if (!parsedUserId) return response({ error: "INVALID_USER_ID" }, 400);

  if (status !== 1 && status !== 2) return response({ error: "UNSUPPORTED_STATUS" }, 400);

  const amountPoints = Math.round(amount);
  if (Math.abs(amount - amountPoints) > 0.000001) {
    return response({ error: "NON_INTEGER_POINTS" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await admin.rpc("process_cpx_reward", {
    p_event_id: transId,
    p_user_id: userId,
    p_status: status,
    p_amount_points: amountPoints,
    p_payload: Object.fromEntries(params.entries())
  });

  if (error) {
    const code = error.message;
    if (code === "ORIGINAL_REWARD_NOT_FOUND") return response({ error: code }, 409);
    if (code === "INSUFFICIENT_BALANCE_FOR_REVERSAL") return response({ error: code }, 409);
    if (code === "DUPLICATE") return response({ ok: true, result: "DUPLICATE" });
    return response({ error: "REWARD_PROCESSING_FAILED" }, 500);
  }

  const result = Array.isArray(data) ? data[0] : data;
  return response({ ok: true, result: result?.result ?? "PROCESSED", balance: result?.new_balance ?? null });
});
