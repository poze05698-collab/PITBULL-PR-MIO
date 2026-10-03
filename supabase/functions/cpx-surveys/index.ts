import { createHash } from "node:crypto";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return response({ error: "AUTH_REQUIRED" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const cpxAppId = Deno.env.get("CPX_APP_ID");
    const cpxSecureHash = Deno.env.get("CPX_SECURE_HASH");

    if (!supabaseUrl || !serviceRoleKey) {
      return response({ error: "SERVER_CONFIG_ERROR" }, 500);
    }

    if (!cpxAppId || !cpxSecureHash) {
      return response({ error: "CPX_NOT_CONFIGURED" }, 503);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.slice("Bearer ".length);
    const { data: userData, error: userError } = await admin.auth.getUser(token);

    if (userError || !userData.user) {
      return response({ error: "AUTH_INVALID" }, 401);
    }

    const user = userData.user;
    const extUserId = user.id;

    const url = new URL("https://live-api.cpx-research.com/api/get-surveys.php");

    url.searchParams.set("app_id", cpxAppId);
    url.searchParams.set("ext_user_id", extUserId);
    url.searchParams.set("output_method", "api");
    url.searchParams.set("limit", "12");

    // CPX recommends MD5(ext_user_id + "-" + security_hash).
    url.searchParams.set(
      "secure_hash",
      md5(extUserId + "-" + cpxSecureHash)
    );

    // Send the real browser/device user-agent when available.
    url.searchParams.set(
      "user_agent",
      req.headers.get("user-agent") ?? ""
    );

    // The app currently operates in Brazil. Supplying the country improves
    // survey localization and gives CPX an explicit country signal.
    url.searchParams.set("main_info", "true");
    url.searchParams.set("user_country_code", "BR");

    // CPX requires the user's IP for localization and fraud detection.
    // Prefer the platform/CDN-provided client IP and fall back safely.
    const ip =
      req.headers.get("cf-connecting-ip")?.trim() ||
      req.headers.get("x-real-ip")?.trim() ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "";

    if (ip) {
      url.searchParams.set("ip_user", ip);
    }

    if (user.email) {
      url.searchParams.set("email", user.email);
    }

    const cpxResponse = await fetch(url);

    if (!cpxResponse.ok) {
      return response({ error: "CPX_REQUEST_FAILED" }, 502);
    }

    const payload = await cpxResponse.json();

    if (payload?.status !== "success") {
      return response({
        error: "CPX_RESPONSE_ERROR",
        count: Number(payload?.count_returned_surveys ?? 0)
      }, 502);
    }

    const surveys = Array.isArray(payload.surveys) ? payload.surveys : [];

    return response({
      provider: "CPX Research",
      count: surveys.length,
      surveys: surveys.map((survey: Record<string, unknown>) => ({
        external_id: String(survey.id),
        title: "Pesquisa CPX • " + String(survey.loi ?? "?") + " min",
        reward: Number(survey.payout ?? 0),
        estimated_minutes: Number(survey.loi ?? 0) || null,
        url:
          typeof survey.href_new === "string"
            ? survey.href_new
            : typeof survey.href === "string"
              ? survey.href
              : null
      }))
    });
  } catch (error) {
    console.error("cpx-surveys error:", error);
    return response({ error: "INTERNAL_ERROR" }, 500);
  }
});

function md5(value: string): string {
  return createHash("md5").update(value).digest("hex");
}
