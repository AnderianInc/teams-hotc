// Shared Events engine: schedules an event's admin-defined workflow steps for a lead,
// and renders templates at send time. No message copy or timing lives in code.
export const CHURCH_TZ = "America/Los_Angeles";

function tzParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHURCH_TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => +(parts.find((p) => p.type === t)?.value || "0");
  return { y: g("year"), m: g("month"), d: g("day"), h: g("hour") % 24, min: g("minute") };
}

/** UTC instant for a church-local date (YYYY-MM-DD) at hour:minute. */
export function atChurchTime(dateStr: string, hour: number, minute = 0): Date {
  const guess = new Date(`${dateStr}T12:00:00Z`);
  const p = tzParts(guess);
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - guess.getTime();
  return new Date(Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10), hour, minute) - offset);
}

export function churchDateStr(d: Date): string {
  const p = tzParts(d);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function eventContext(event: any, lead: any, teamNames: string[] = []) {
  const start = event?.start_at ? new Date(event.start_at) : null;
  const date = start
    ? start.toLocaleDateString("en-US", { timeZone: CHURCH_TZ, weekday: "long", month: "long", day: "numeric" })
    : "";
  const time = start
    ? start.toLocaleTimeString("en-US", { timeZone: CHURCH_TZ, hour: "numeric", minute: "2-digit" })
    : "";
  return {
    first_name: lead?.first_name || "",
    last_name: lead?.last_name || "",
    event_name: event?.name || "",
    date,
    time,
    when: date && time ? `${date} at ${time}` : date,
    where: event?.location || "",
    teams: teamNames.length ? `<br/><br/>Teams you're interested in: ${teamNames.join(", ")}` : "",
    teams_list: teamNames.join(", "),
  } as Record<string, string>;
}

export function render(text: string, ctx: Record<string, string>, plain = false) {
  return (text || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
    const v = ctx[k] ?? "";
    return plain ? v.replace(/<br\s*\/?>/gi, "\n") : v;
  });
}

export function stepTime(step: any, event: any, signupAt: Date): Date | null {
  let base: Date;
  if (step.anchor === "event_start") {
    if (!event?.start_at) return null;
    base = new Date(event.start_at);
  } else base = signupAt;
  let t = new Date(base.getTime() + (step.offset_minutes || 0) * 60000);
  if (step.send_at_local_time) {
    const [h, m] = String(step.send_at_local_time).split(":").map(Number);
    t = atChurchTime(churchDateStr(t), h, m || 0);
  }
  return t;
}

/** Queue every active step of the event for this lead. */
export async function queueEventWorkflow(sb: any, event: any, lead: any) {
  const { data: steps } = await sb.from("event_workflow_steps")
    .select("*").eq("event_id", event.id).eq("active", true).order("order_index");
  const now = new Date();
  const rows: any[] = [];
  for (const s of steps ?? []) {
    const recipient = s.channel === "email" ? lead.email : lead.phone;
    if (!recipient) continue;
    if (s.channel === "sms" && !lead.sms_opt_in) continue;
    const templateId = s.channel === "email" ? s.email_template_id : s.sms_template_id;
    if (!templateId) continue;
    let at = stepTime(s, event, now);
    if (!at) continue;
    if (at < now) {
      // Pre-event steps whose moment has passed are skipped; others go now.
      if (s.anchor === "event_start" && s.offset_minutes < 0 && event.start_at && new Date(event.start_at) < now) continue;
      if (s.anchor === "event_start" && s.offset_minutes < 0) { if (now.getTime() - at.getTime() > 6 * 3600000) continue; }
      at = now;
    }
    rows.push({
      lead_id: lead.id, event_id: event.id, step_id: s.id, template_id: templateId,
      step: s.name || `step-${s.order_index}`, channel: s.channel, recipient,
      subject: null, body: "", scheduled_for: at.toISOString(),
      status: s.requires_approval ? "review" : "pending",
    });
  }
  if (rows.length) {
    const { error } = await sb.from("funnel_messages").insert(rows);
    if (error) console.error("queueEventWorkflow insert failed", error);
  }
  return rows.length;
}
