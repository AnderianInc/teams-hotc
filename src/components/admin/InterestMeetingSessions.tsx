import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { CalendarPlus, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";

type Session = {
  id: string;
  session_date: string;
  start_time: string | null;
  location: string | null;
  notes: string | null;
  is_active: boolean;
};

export default function InterestMeetingSessions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["interest-meeting-sessions-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interest_meeting_sessions")
        .select("*")
        .order("session_date", { ascending: true });
      if (error) throw error;
      return data as Session[];
    },
  });

  const addSession = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("interest_meeting_sessions").insert({
        session_date: date,
        start_time: time || null,
        location: location || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDate(""); setTime(""); setLocation("");
      toast({ title: "Session added" });
      queryClient.invalidateQueries({ queryKey: ["interest-meeting-sessions-admin"] });
    },
    onError: (e: any) => toast({ title: "Could not add session", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("interest_meeting_sessions")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["interest-meeting-sessions-admin"] }),
  });

  const removeSession = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("interest_meeting_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Session removed" });
      queryClient.invalidateQueries({ queryKey: ["interest-meeting-sessions-admin"] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarPlus className="h-5 w-5" /> Interest Meeting Dates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          These dates appear on the public Interest Meeting form. Deactivate a date to hide it.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Time</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="space-y-1 flex-1 min-w-[160px]">
            <Label>Location</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Conference room"
            />
          </div>
          <Button disabled={!date || addSession.isPending} onClick={() => addSession.mutate()}>
            Add Date
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-4">No meeting dates yet.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-medium text-sm">
                    {format(parseISO(s.session_date), "EEE, MMM d, yyyy")}
                  </span>
                  {s.start_time && (
                    <span className="text-sm text-muted-foreground">{s.start_time.slice(0, 5)}</span>
                  )}
                  {s.location && (
                    <span className="text-sm text-muted-foreground truncate">{s.location}</span>
                  )}
                  {!s.is_active && <Badge variant="secondary">hidden</Badge>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={s.is_active}
                    onCheckedChange={(v) => toggleActive.mutate({ id: s.id, is_active: v })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeSession.mutate(s.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
