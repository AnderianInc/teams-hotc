import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, Trash2, CalendarDays, Save } from "lucide-react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface AvailWindow {
  id?: string;
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  available: boolean;
  notes: string;
}

const emptyWindow = (): AvailWindow => ({
  day_of_week: 0,
  start_time: "09:00",
  end_time: "13:00",
  available: true,
  notes: "",
});

export default function VolunteerAvailability() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── Availability windows ──────────────────────────────────────────────────
  const { data: windows = [], isLoading: loadingWindows } = useQuery({
    queryKey: ["volunteer-availability", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("volunteer_availability")
        .select("*")
        .eq("user_id", user!.id)
        .order("day_of_week");
      if (error) throw error;
      return data as AvailWindow[];
    },
    enabled: !!user,
  });

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<AvailWindow>(emptyWindow());

  const addWindow = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from as any)("volunteer_availability").insert({
        user_id: user!.id,
        day_of_week: draft.day_of_week,
        start_time: draft.start_time || null,
        end_time: draft.end_time || null,
        available: draft.available,
        notes: draft.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setAdding(false);
      setDraft(emptyWindow());
      queryClient.invalidateQueries({ queryKey: ["volunteer-availability"] });
      toast.success("Availability saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeWindow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("volunteer_availability").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["volunteer-availability"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Scheduling preferences ────────────────────────────────────────────────
  const { data: prefs, isLoading: loadingPrefs } = useQuery({
    queryKey: ["schedule-prefs", user?.id],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("volunteer_schedule_prefs")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data as { max_shifts_month: number | null; notes: string | null } | null;
    },
    enabled: !!user,
  });

  const [maxShifts, setMaxShifts] = useState<string>("");
  const [prefNotes, setPrefNotes] = useState<string>("");
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  if (!prefsLoaded && !loadingPrefs && prefs !== undefined) {
    setMaxShifts(prefs?.max_shifts_month?.toString() ?? "");
    setPrefNotes(prefs?.notes ?? "");
    setPrefsLoaded(true);
  }

  const savePrefs = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: user!.id,
        max_shifts_month: maxShifts ? Number(maxShifts) : null,
        notes: prefNotes.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await (supabase.from as any)("volunteer_schedule_prefs")
        .upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule-prefs"] });
      toast.success("Preferences saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          Scheduling & Availability
        </CardTitle>
        <CardDescription>
          Let your team lead know when you're available to serve and how many shifts you can take each month.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Availability Windows */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Availability Windows</p>
            {!adding && (
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Window
              </Button>
            )}
          </div>

          {loadingWindows ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : windows.length === 0 && !adding ? (
            <p className="text-xs text-muted-foreground italic">No availability windows set. Add one to let your team lead know when you're free.</p>
          ) : (
            <div className="space-y-2">
              {windows.map((w) => (
                <div key={w.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                  <Badge variant={w.available ? "default" : "destructive"} className="shrink-0 text-xs">
                    {w.available ? "Available" : "Blocked"}
                  </Badge>
                  <span className="font-medium w-24 shrink-0">
                    {w.day_of_week !== null ? DAYS[w.day_of_week] : "Any day"}
                  </span>
                  <span className="text-muted-foreground">
                    {w.start_time && w.end_time ? `${w.start_time} – ${w.end_time}` : "All day"}
                  </span>
                  {w.notes && <span className="text-muted-foreground text-xs truncate flex-1">{w.notes}</span>}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => w.id && removeWindow.mutate(w.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {adding && (
            <div className="border rounded-md p-3 space-y-3 bg-muted/30">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Day</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                    value={draft.day_of_week ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, day_of_week: e.target.value === "" ? null : Number(e.target.value) }))}
                  >
                    <option value="">Any day</option>
                    {DAYS.map((day, i) => (
                      <option key={i} value={i}>{day}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <div className="flex items-center gap-2 pt-1.5">
                    <Switch
                      checked={draft.available}
                      onCheckedChange={(v) => setDraft((d) => ({ ...d, available: v }))}
                    />
                    <span className="text-sm">{draft.available ? "Available" : "Blocked"}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input
                    type="time"
                    className="h-8 text-sm"
                    value={draft.start_time}
                    onChange={(e) => setDraft((d) => ({ ...d, start_time: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input
                    type="time"
                    className="h-8 text-sm"
                    value={draft.end_time}
                    onChange={(e) => setDraft((d) => ({ ...d, end_time: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes (optional)</Label>
                <Input
                  className="h-8 text-sm"
                  placeholder="e.g. Available after 10am only"
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => addWindow.mutate()} disabled={addWindow.isPending}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setDraft(emptyWindow()); }}>Cancel</Button>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Scheduling Preferences */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Scheduling Preferences</p>
          <div className="space-y-1 max-w-xs">
            <Label className="text-xs">Max shifts per month</Label>
            <Input
              type="number"
              min={0}
              max={20}
              className="h-8 text-sm w-28"
              placeholder="e.g. 2"
              value={maxShifts}
              onChange={(e) => setMaxShifts(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes for your team lead</Label>
            <Textarea
              rows={2}
              className="text-sm"
              placeholder="e.g. I prefer morning services, can't serve during school holidays"
              value={prefNotes}
              onChange={(e) => setPrefNotes(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={() => savePrefs.mutate()} disabled={savePrefs.isPending}>
            <Save className="h-3.5 w-3.5 mr-1" />
            {savePrefs.isPending ? "Saving…" : "Save Preferences"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
