import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function base64UrlEncode(data: ArrayBuffer | string): string {
  let bytes: Uint8Array;
  if (typeof data === "string") {
    bytes = new TextEncoder().encode(data);
  } else {
    bytes = new Uint8Array(data);
  }
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64UrlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const b64 = padded + "=".repeat(padLen);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function createVapidJWT(endpoint: string, privateKeyJwk: JsonWebKey, subject: string): Promise<string> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;

  const header = base64UrlEncode(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = base64UrlEncode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 43200,
    sub: subject,
  }));

  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function sendWebPush(subscription: { endpoint: string; p256dh: string; auth: string }, notification: { title: string; body?: string; url?: string; type?: string }) {
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  const vapidPrivateKeyJwk = Deno.env.get("VAPID_PRIVATE_KEY_JWK");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");

  if (!vapidSubject || !vapidPrivateKeyJwk || !vapidPublicKey) {
    console.warn("VAPID env vars not configured — skipping web push");
    return;
  }

  const privateKeyJwk: JsonWebKey = JSON.parse(vapidPrivateKeyJwk);
  const jwt = await createVapidJWT(subscription.endpoint, privateKeyJwk, vapidSubject);

  // Encode the notification payload (without RFC 8291 encryption — SW shows fallback text)
  // For a payload-free push (just a wake signal), send an empty body.
  // The SW will show the notification data from the in-app notifications table via the title/body hint in headers.
  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt},k=${vapidPublicKey}`,
      TTL: "86400",
      "Content-Type": "application/octet-stream",
      Urgency: "normal",
    },
    // Empty body push — SW fetches notification details from DB on wake-up
    body: new Uint8Array(0),
  });

  if (!res.ok && res.status !== 201) {
    const text = await res.text();
    console.error("Web push failed:", res.status, text);
  }
}

async function sendEmailFallback(
  supabase: ReturnType<typeof createClient>,
  recipientId: string,
  notification: { title: string; body?: string },
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("user_id", recipientId)
    .single();

  if (!profile?.email) return;

  try {
    await supabase.functions.invoke("send-email", {
      body: {
        to: profile.email,
        to_name: profile.full_name,
        subject: notification.title,
        text: notification.body || notification.title,
        html: `<p>${notification.body || notification.title}</p><p><a href="https://teams.hotc.life">Open HOTC Teams</a></p>`,
      },
    });
  } catch (err) {
    console.error("Email fallback failed:", err);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const {
      recipient_id,
      type,
      title,
      body,
      data = {},
      url,
      high_priority = false,
    } = await req.json();

    if (!recipient_id || !type || !title) {
      return new Response(JSON.stringify({ error: "recipient_id, type, and title are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Persist in-app notification
    const { error: insertError } = await supabase.from("notifications").insert({
      recipient_id,
      type,
      title,
      body: body || null,
      data,
      url: url || null,
    });
    if (insertError) throw insertError;

    // 2. Look up push subscriptions
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", recipient_id);

    if (subs && subs.length > 0) {
      await Promise.allSettled(
        subs.map((sub: any) => sendWebPush(sub, { title, body, url, type })),
      );
    } else if (high_priority) {
      // No push subscription — fall back to email for high-priority alerts
      await sendEmailFallback(supabase, recipient_id, { title, body });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("notify error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
