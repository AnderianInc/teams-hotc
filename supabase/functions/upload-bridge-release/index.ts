// Token-guarded upload endpoint for print-bridge binaries.
// Called by GitHub Actions after building a tagged release.
//
// POST /functions/v1/upload-bridge-release?filename=hotc-print-bridge-win.exe
//   headers: x-upload-token: <BRIDGE_UPLOAD_TOKEN>, content-type: application/octet-stream
//   body: raw binary
//
// Also accepts POST /functions/v1/upload-bridge-release?manifest=1 with a JSON
// body { tag, released_at, notes_url } to write latest/version.json.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BUCKET = "print-bridge";
const ALLOWED_FILES = new Set([
  "hotc-print-bridge-win.exe",
  "hotc-print-bridge-macos-arm64.zip",
  "hotc-print-bridge-macos-intel.zip",
  "hotc-print-bridge-linux.zip",
  "version.json",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const expected = Deno.env.get("BRIDGE_UPLOAD_TOKEN");
  const provided = req.headers.get("x-upload-token");
  if (!expected || !provided || provided !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const isManifest = url.searchParams.get("manifest") === "1";
  const filename = isManifest ? "version.json" : url.searchParams.get("filename");
  if (!filename || !ALLOWED_FILES.has(filename)) {
    return new Response(JSON.stringify({ error: "invalid filename" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = new Uint8Array(await req.arrayBuffer());
  const contentType = isManifest
    ? "application/json"
    : (req.headers.get("content-type") || "application/octet-stream");

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`latest/${filename}`, body, { contentType, upsert: true });

  if (error) {
    console.error("upload failed", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, path: `latest/${filename}` }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
