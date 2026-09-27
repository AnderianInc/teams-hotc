import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Music, Plus, X } from "lucide-react";

export interface SongItem {
  title: string;
  leader_name?: string;
  leader_profile_id?: string | null;
  key?: string;
}

export const MUSIC_KEYS = [
  "C", "C#", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B",
  "Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm",
];

/** Normalize legacy text[] songs + new song_items into one list. */
export function toSongItems(items: unknown, songs?: string[] | null): SongItem[] {
  if (Array.isArray(items) && items.length) {
    return items
      .filter((i: any) => i && typeof i.title === "string")
      .map((i: any) => ({ title: i.title, leader_name: i.leader_name || "", leader_profile_id: i.leader_profile_id || null, key: i.key || "" }));
  }
  return (songs || []).filter(Boolean).map((title) => ({ title, leader_name: "", key: "" }));
}

export function cleanSongItems(items: SongItem[]): SongItem[] {
  return items
    .map((i) => ({ ...i, title: i.title.trim(), leader_name: (i.leader_name || "").trim(), key: (i.key || "").trim() }))
    .filter((i) => i.title);
}

export function SongListDisplay({ items, compact }: { items: SongItem[]; compact?: boolean }) {
  if (!items.length) return null;
  return (
    <ol className={`space-y-0.5 ${compact ? "mt-1" : "mt-2"}`}>
      {items.map((s, i) => (
        <li key={i} className="flex items-start gap-1.5 text-xs">
          <span className="text-muted-foreground tabular-nums w-4 shrink-0 text-right">{i + 1}.</span>
          <span className="min-w-0">
            <span className="font-medium text-foreground">{s.title}</span>
            {(s.leader_name || s.key) && (
              <span className="text-muted-foreground">
                {s.leader_name && <> — led by {s.leader_name}</>}
                {s.leader_name && s.key && " · "}
                {!s.leader_name && s.key && " — "}
                {s.key && <>Key: <span className="font-semibold text-foreground">{s.key}</span></>}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

function useDirectoryNames() {
  return useQuery({
    queryKey: ["song-leader-names"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").order("full_name").limit(1000);
      return (data || []).filter((p: any) => p.full_name) as { id: string; full_name: string }[];
    },
  });
}

/**
 * Editor with local draft state. Commits on blur / add / remove.
 * pendingRef prevents stale props from overwriting the draft mid-save.
 */
export function SongListEditor({ items, onChange }: { items: SongItem[]; onChange: (items: SongItem[]) => void }) {
  const [draft, setDraft] = useState<SongItem[]>(items);
  const [isEditing, setIsEditing] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const pendingRef = useRef<string | null>(null);
  const { data: people = [] } = useDirectoryNames();
  const incomingStr = JSON.stringify(items);

  useEffect(() => {
    if (pendingRef.current !== null) {
      if (incomingStr === pendingRef.current) pendingRef.current = null;
      return;
    }
    if (isEditing) return;
    setDraft(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingStr, isEditing]);

  const emit = (next: SongItem[]) => {
    const cleaned = cleanSongItems(next);
    if (JSON.stringify(cleaned) === incomingStr) return;
    pendingRef.current = JSON.stringify(cleaned);
    onChange(cleaned);
  };

  const withLeaderId = (item: SongItem): SongItem => {
    const match = people.find((p) => p.full_name.toLowerCase() === (item.leader_name || "").trim().toLowerCase());
    return { ...item, leader_profile_id: match?.id ?? null };
  };

  const update = (idx: number, patch: Partial<SongItem>) =>
    setDraft((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const commitDraft = () => {
    setIsEditing(false);
    emit(draft.map(withLeaderId));
  };

  const add = () => {
    const t = newTitle.trim();
    if (!t) return;
    const next = [...draft, { title: t, leader_name: "", key: "" }];
    setDraft(next);
    setNewTitle("");
    emit(next);
  };

  const remove = (idx: number) => {
    const next = draft.filter((_, i) => i !== idx);
    setDraft(next);
    emit(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Music className="h-4 w-4" /> Songs
      </div>
      <datalist id="song-leader-options">
        {people.map((p) => <option key={p.id} value={p.full_name} />)}
      </datalist>
      <datalist id="song-key-options">
        {MUSIC_KEYS.map((k) => <option key={k} value={k} />)}
      </datalist>
      {draft.length > 0 && (
        <div className="space-y-1.5">
          <div className="hidden sm:grid grid-cols-[1.25rem_1fr_10rem_4.5rem_2rem] gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span />
            <span>Title</span>
            <span>Leading</span>
            <span>Key</span>
            <span />
          </div>
          {draft.map((s, idx) => (
            <div key={idx} className="grid grid-cols-[1.25rem_1fr_2rem] sm:grid-cols-[1.25rem_1fr_10rem_4.5rem_2rem] gap-2 items-center">
              <span className="text-xs text-muted-foreground text-right tabular-nums">{idx + 1}.</span>
              <Input className="h-8" value={s.title} placeholder="Song title"
                onFocus={() => setIsEditing(true)} onBlur={commitDraft}
                onChange={(e) => update(idx, { title: e.target.value })} />
              <Button variant="ghost" size="sm" className="h-8 px-2 sm:hidden" onClick={() => remove(idx)}>
                <X className="h-4 w-4" />
              </Button>
              <Input className="h-8 col-start-2 sm:col-start-auto" list="song-leader-options" value={s.leader_name || ""} placeholder="Leader"
                onFocus={() => setIsEditing(true)} onBlur={commitDraft}
                onChange={(e) => update(idx, { leader_name: e.target.value })} />
              <Input className="h-8 col-start-2 sm:col-start-auto" list="song-key-options" value={s.key || ""} placeholder="Key"
                onFocus={() => setIsEditing(true)} onBlur={commitDraft}
                onChange={(e) => update(idx, { key: e.target.value })} />
              <Button variant="ghost" size="sm" className="h-8 px-2 hidden sm:inline-flex" onClick={() => remove(idx)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input className="h-8" placeholder="Add a song title" value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button size="sm" variant="outline" onClick={add} disabled={!newTitle.trim()}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}
