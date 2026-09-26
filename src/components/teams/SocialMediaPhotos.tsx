import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ExternalLink, Trash2, Upload, Video } from "lucide-react";

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/social-media-photos`;

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token}` };
}

function Thumb({ id, mime }: { id: string; mime: string | null }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (mime?.startsWith("video/")) return;
    let url: string | null = null;
    (async () => {
      const res = await fetch(`${FN_URL}?action=thumb&id=${id}`, { headers: await authHeader() });
      if (res.ok) { url = URL.createObjectURL(await res.blob()); setSrc(url); }
    })();
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [id, mime]);
  if (mime?.startsWith("video/")) return <div className="aspect-square bg-muted flex items-center justify-center"><Video className="h-8 w-8 text-muted-foreground" /></div>;
  return src ? <img src={src} alt="" className="aspect-square w-full object-cover" /> : <div className="aspect-square bg-muted animate-pulse" />;
}

export default function SocialMediaPhotos() {
  const qc = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [label, setLabel] = useState("Sunday Service");
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState<string | null>(null);

  const { data: photos = [] } = useQuery({
    queryKey: ["social-media-photos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("social_media_photos").select("*").order("created_at", { ascending: false }).limit(60);
      if (error) throw error;
      const ids = [...new Set((data || []).map((p) => p.uploaded_by).filter(Boolean))] as string[];
      const { data: profs } = ids.length ? await supabase.from("profiles").select("user_id, full_name").in("user_id", ids) : { data: [] };
      const names = new Map((profs || []).map((p) => [p.user_id, p.full_name]));
      return (data || []).map((p) => ({ ...p, uploader: names.get(p.uploaded_by || "") || "" }));
    },
  });

  const upload = async () => {
    if (!files.length) return;
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      setProgress(`Uploading ${i + 1} of ${files.length}…`);
      const fd = new FormData();
      fd.append("file", files[i]); fd.append("date", date); fd.append("label", label); fd.append("caption", caption);
      const res = await fetch(FN_URL, { method: "POST", headers: await authHeader(), body: fd });
      if (res.ok) ok++; else toast.error(`${files[i].name}: ${(await res.json().catch(() => ({}))).error || res.status}`);
    }
    setProgress(null); setFiles([]); setCaption("");
    if (ok) toast.success(`${ok} uploaded to Google Drive`);
    qc.invalidateQueries({ queryKey: ["social-media-photos"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this photo from Google Drive?")) return;
    const res = await fetch(`${FN_URL}?action=delete`, { method: "POST", headers: { ...(await authHeader()), "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (res.ok) { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["social-media-photos"] }); } else toast.error("Delete failed");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Upload photos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1"><Label>Event</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Sunday Service" /></div>
          </div>
          <div className="space-y-1"><Label>Caption (optional)</Label><Input value={caption} onChange={(e) => setCaption(e.target.value)} /></div>
          <label
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center cursor-pointer hover:bg-accent"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); setFiles(Array.from(e.dataTransfer.files)); }}
          >
            <Upload className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm">{files.length ? `${files.length} file(s) selected` : "Tap to choose photos or drag them here"}</span>
            <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
          </label>
          <Button onClick={upload} disabled={!files.length || !!progress} className="w-full">{progress || "Upload to Google Drive"}</Button>
          <p className="text-xs text-muted-foreground">Saved in Google Drive under "HOTC Social Media / {date} {label}". Max 25 MB per file.</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {photos.map((p) => (
          <Card key={p.id} className="overflow-hidden group">
            <Thumb id={p.drive_file_id} mime={p.mime_type} />
            <CardContent className="p-2 space-y-1">
              <p className="text-xs truncate font-medium">{p.caption || p.name}</p>
              <p className="text-xs text-muted-foreground truncate">{p.folder_date} · {p.uploader}</p>
              <div className="flex gap-1">
                {p.web_view_link && <Button asChild size="sm" variant="ghost" className="h-7 px-2"><a href={p.web_view_link} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /></a></Button>}
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => remove(p.drive_file_id)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!photos.length && <p className="text-sm text-muted-foreground col-span-full">No photos yet.</p>}
      </div>
    </div>
  );
}
