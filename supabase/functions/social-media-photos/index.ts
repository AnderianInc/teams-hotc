import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GW = "https://connector-gateway.lovable.dev/google_drive";
const ROOT_NAME = "HOTC Social Media";
const MAX = 25 * 1024 * 1024;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function gwHeaders(extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
    "X-Connection-Api-Key": Deno.env.get("GOOGLE_DRIVE_API_KEY")!,
    ...extra,
  };
}

async function drive(path: string, init: RequestInit = {}) {
  const res = await fetch(`${GW}${path}`, { ...init, headers: gwHeaders((init.headers as Record<string, string>) || {}) });
  if (!res.ok) throw new Error(`Drive [${res.status}]: ${await res.text()}`);
  return res;
}

async function findOrCreateFolder(name: string, parent?: string) {
  const esc = name.replace(/'/g, "\\'");
  let q = `name='${esc}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  q += parent ? ` and '${parent}' in parents` : ` and 'root' in parents`;
  const r = await drive(`/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`);
  const { files } = await r.json();
  if (files?.length) return files[0].id as string;
  const c = await drive(`/drive/v3/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", ...(parent ? { parents: [parent] } : {}) }),
  });
  return (await c.json()).id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: u } = await admin.auth.getUser(token);
    const user = u?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);
    const [{ data: isAdmin }, { data: isMember }] = await Promise.all([
      admin.rpc("has_role", { _user_id: user.id, _role: "admin" }),
      admin.rpc("is_social_media_member", { _user_id: user.id }),
    ]);
    if (!isAdmin && !isMember) return json({ error: "Only Social Media team members can do this" }, 403);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "thumb") {
      const id = url.searchParams.get("id") || "";
      if (!/^[\w-]+$/.test(id)) return json({ error: "Bad id" }, 400);
      // Prefer Drive's small generated thumbnail over streaming the full original.
      const meta = await drive(`/drive/v3/files/${id}?fields=thumbnailLink,mimeType`);
      const { thumbnailLink } = await meta.json();
      if (thumbnailLink) {
        const t = await fetch(thumbnailLink, { headers: gwHeaders() });
        if (t.ok) {
          return new Response(t.body, {
            headers: { ...corsHeaders, "Content-Type": t.headers.get("Content-Type") || "image/jpeg", "Cache-Control": "private, max-age=3600" },
          });
        }
      }
      // Fallback (e.g. videos without a thumbnail): stream the original.
      const r = await drive(`/drive/v3/files/${id}?alt=media`);
      return new Response(r.body, {
        headers: { ...corsHeaders, "Content-Type": r.headers.get("Content-Type") || "image/jpeg", "Cache-Control": "private, max-age=3600" },
      });
    }

    if (action === "delete") {
      const { id } = await req.json();
      if (typeof id !== "string" || !/^[\w-]+$/.test(id)) return json({ error: "Bad id" }, 400);
      await fetch(`${GW}/drive/v3/files/${id}`, { method: "DELETE", headers: gwHeaders() });
      await admin.from("social_media_photos").delete().eq("drive_file_id", id);
      return json({ ok: true });
    }

    // upload (multipart form)
    const form = await req.formData();
    const file = form.get("file");
    const date = String(form.get("date") || new Date().toISOString().slice(0, 10));
    const label = String(form.get("label") || "").slice(0, 80);
    const caption = String(form.get("caption") || "").slice(0, 500) || null;
    if (!(file instanceof File)) return json({ error: "No file" }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Bad date" }, 400);
    if (file.size > MAX) return json({ error: "File is over 25 MB" }, 400);
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return json({ error: "Only photos or videos" }, 400);

    const root = await findOrCreateFolder(ROOT_NAME);
    const sub = await findOrCreateFolder(label ? `${date} ${label}` : date, root);

    const boundary = "hotc" + crypto.randomUUID();
    const meta = JSON.stringify({ name: file.name, parents: [sub], description: caption ?? undefined });
    const enc = new TextEncoder();
    const body = new Blob([
      enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`),
      new Uint8Array(await file.arrayBuffer()),
      enc.encode(`\r\n--${boundary}--`),
    ]);
    const up = await drive(`/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    const f = await up.json();
    await admin.from("social_media_photos").insert({
      drive_file_id: f.id, name: f.name, mime_type: f.mimeType, web_view_link: f.webViewLink,
      folder_date: date, caption, uploaded_by: user.id,
    });
    return json({ ok: true, file: f });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
