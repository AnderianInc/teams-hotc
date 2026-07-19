// Public download endpoint for print-bridge binaries.
// Redirects to a short-lived signed URL from the private storage bucket.
//
// GET /functions/v1/bridge-download?platform=win        → hotc-print-bridge-win.exe
// GET /functions/v1/bridge-download?platform=macos-arm64
// GET /functions/v1/bridge-download?platform=macos-intel
// GET /functions/v1/bridge-download?platform=linux
// GET /functions/v1/bridge-download?manifest=1          → version.json contents

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BUCKET = "print-bridge";

const PLATFORM_FILES: Record<string, string> = {
  "win": "hotc-print-bridge-win.exe",
  "macos-arm64": "hotc-print-bridge-macos-arm64.zip",
  "macos-intel": "hotc-print-bridge-macos-intel.zip",
  "linux": "hotc-print-bridge-linux.zip",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Manifest endpoint — returns version.json as JSON (or 404 if not uploaded yet)
  if (url.searchParams.get("manifest") === "1") {
    const { data, error } = await supabase.storage.from(BUCKET).download("latest/version.json");
    if (error || !data) {
      return new Response(JSON.stringify({ error: "no manifest yet" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(await data.text(), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
    });
  }

  const platform = url.searchParams.get("platform");
  const filename = platform ? PLATFORM_FILES[platform] : null;
  if (!filename) {
    return new Response(JSON.stringify({ error: "invalid platform", valid: Object.keys(PLATFORM_FILES) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(`latest/${filename}`, 300, { download: filename });

  if (error || !data?.signedUrl) {
    return new Response(JSON.stringify({ error: "file not available yet", filename }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return Response.redirect(data.signedUrl, 302);
});
