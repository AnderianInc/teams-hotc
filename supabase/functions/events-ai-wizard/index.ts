// AI setup wizard: turns a plain-language description into a draft event
// (details, form settings, workflow steps and message copy). Nothing is saved here;
// the admin reviews the draft in the app before creating it.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { streamText } from "npm:ai";
import { z } from "npm:zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-lovable-aig-run-id",
  "Access-Control-Expose-Headers": "X-Lovable-AIG-Run-ID",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Draft = z.object({
  name: z.string(),
  description: z.string(),
  lead_type: z.enum(["general", "visit", "interest", "prayer"]),
  start_at_local: z.string().nullable(),
  location: z.string().nullable(),
  form_config: z.object({
    require_last_name: z.boolean(), require_email: z.boolean(), require_phone: z.boolean(),
    show_team_picker: z.boolean(), show_message: z.boolean(), show_sms_consent: z.boolean(),
    custom_questions: z.array(z.object({ label: z.string(), required: z.boolean() })),
  }),
  steps: z.array(z.object({
    name: z.string(), channel: z.enum(["email", "sms"]),
    anchor: z.enum(["signup", "event_start"]), offset_minutes: z.number().int(),
    send_at_local_time: z.string().nullable(),
    subject: z.string().nullable(), body: z.string(),
  })),
});

const INSTRUCTIONS = `You help a church (House of Transformation Church, "HOTC") set up event registrations and follow-up messages.
Return ONLY a json object (no markdown) with keys: name, description, lead_type ("general"|"visit"|"interest"|"prayer"),
start_at_local ("YYYY-MM-DDTHH:MM" Pacific time or null), location (string or null),
form_config {require_last_name, require_email, require_phone, show_team_picker, show_message, show_sms_consent, custom_questions:[{label, required}]},
steps: [{name, channel ("email"|"sms"), anchor ("signup"|"event_start"), offset_minutes (negative = before event), send_at_local_time ("HH:MM" or null), subject (email only, else null), body}].
Use placeholders {{first_name}}, {{event_name}}, {{when}}, {{where}}, {{date}}, {{time}}. Emails may use <br/> for line breaks. Texts under 300 characters, warm, and signed "— HOTC".
Typical flow: confirmation email + text right after signup, reminder the day before, nudge an hour before, thank-you/we-missed-you after. Use show_team_picker only for volunteer interest events.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Please sign in." }, 401);
    const [{ data: isAdmin }, { data: isFi }] = await Promise.all([
      userClient.rpc("has_role", { _user_id: u.user.id, _role: "admin" }),
      userClient.rpc("is_first_impressions_member", { _user_id: u.user.id }),
    ]);
    if (!isAdmin && !isFi) return json({ error: "Not allowed." }, 403);

    const parsed = z.object({ prompt: z.string().trim().min(5).max(3000) }).safeParse(await req.json());
    if (!parsed.success) return json({ error: "Describe the event in a sentence or two." }, 400);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured." }, 500);
    let runId: string | undefined = req.headers.get("X-Lovable-AIG-Run-ID") || undefined;
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const h = new Headers(init?.headers);
        if (runId) h.set("X-Lovable-AIG-Run-ID", runId);
        const r = await fetch(input, { ...init, headers: h });
        runId ??= r.headers.get("X-Lovable-AIG-Run-ID") || undefined;
        if (!r.ok) {
          const t = await r.clone().text();
          throw Object.assign(new Error(t || `AI error ${r.status}`), { status: r.status });
        }
        return r;
      },
    });
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    const result = streamText({
      model: provider.responses("openai/gpt-6-astra"),
      instructions: INSTRUCTIONS,
      messages: [{ role: "user", content: `Today is ${today}. Build the event draft as json for: ${parsed.data.prompt}` }],
      abortSignal: req.signal,
      providerOptions: {
        openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] },
      },
    });
    let text = "";
    try {
      text = await result.text;
    } catch (e: any) {
      const status = e?.status || e?.statusCode || 502;
      const msg = status === 402 ? "AI credits have run out. Add credits in Settings → Plans & credits."
        : status === 429 ? "The AI is busy — try again in a minute." : "The AI couldn't draft this event.";
      return json({ error: msg }, status === 402 || status === 429 || status === 403 ? status : 502);
    }
    const match = text.match(/\{[\s\S]*\}/);
    const draft = match ? Draft.safeParse(JSON.parse(match[0])) : null;
    if (!draft?.success) return json({ error: "The AI reply wasn't usable — try rephrasing your description." }, 502);
    const res = json({ draft: draft.data });
    if (runId) res.headers.set("X-Lovable-AIG-Run-ID", runId);
    return res;
  } catch (e) {
    console.error("events-ai-wizard", e);
    return json({ error: "Something went wrong." }, 500);
  }
});
