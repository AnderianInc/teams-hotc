import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Cake, AlertTriangle, Mail, Save } from "lucide-react";
import { format, addDays, differenceInCalendarDays, setYear, isAfter } from "date-fns";
import { toast } from "sonner";

type Person = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  date_of_birth: string | null;
};

function nextOccurrence(dob: string): Date {
  const d = new Date(dob + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let candidate = setYear(d, today.getFullYear());
  if (isAfter(today, candidate)) candidate = setYear(d, today.getFullYear() + 1);
  return candidate;
}

export default function BirthdaysPanel() {
  const queryClient = useQueryClient();
  const [windowDays, setWindowDays] = useState(30);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: people, isLoading } = useQuery({
    queryKey: ["birthdays-attendees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendees")
        .select("id, first_name, last_name, email, date_of_birth")
        .order("first_name");
      if (error) throw error;
      return (data || []) as Person[];
    },
  });

  const { upcoming, missing, total, withDob } = useMemo(() => {
    const all = people || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const limit = addDays(today, windowDays);

    const withDobList = all.filter((p) => p.date_of_birth);
    const missingList = all.filter((p) => !p.date_of_birth);

    const upcomingList = withDobList
      .map((p) => {
        const next = nextOccurrence(p.date_of_birth!);
        return { person: p, next, daysAway: differenceInCalendarDays(next, today) };
      })
      .filter((x) => x.next <= limit)
      .sort((a, b) => a.next.getTime() - b.next.getTime());

    return {
      upcoming: upcomingList,
      missing: missingList,
      total: all.length,
      withDob: withDobList.length,
    };
  }, [people, windowDays]);

  const completionPct = total ? Math.round((withDob / total) * 100) : 0;

  const saveDob = async (id: string) => {
    const value = edits[id];
    if (!value) return;
    setSavingId(id);
    try {
      const { error } = await supabase
        .from("attendees")
        .update({ date_of_birth: value })
        .eq("id", id);
      if (error) throw error;
      toast.success("Birthday saved");
      setEdits((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
      queryClient.invalidateQueries({ queryKey: ["birthdays-attendees"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Cake className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-display font-bold tracking-tight">Birthdays</h2>
          <p className="text-sm text-muted-foreground">
            Upcoming birthdays and missing date-of-birth records.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Upcoming (next {windowDays} days)</p>
            <p className="text-2xl font-bold">{upcoming.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Missing date of birth</p>
            <p className="text-2xl font-bold text-amber-600">{missing.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Directory completion</p>
            <p className="text-2xl font-bold">{completionPct}%</p>
            <p className="text-xs text-muted-foreground">{withDob} of {total} have DOB</p>
          </CardContent>
        </Card>
      </div>

      {missing.length > 0 && (
        <Card className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              {missing.length} {missing.length === 1 ? "person is" : "people are"} missing a birthday
            </CardTitle>
            <CardDescription>
              Add birthdays so these members get their automated birthday email each year.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[420px] overflow-y-auto">
            {missing.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {p.first_name} {p.last_name}
                  </p>
                  {p.email && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                      <Mail className="h-3 w-3 shrink-0" /> {p.email}
                    </p>
                  )}
                </div>
                <Input
                  type="date"
                  className="h-8 w-[160px]"
                  value={edits[p.id] || ""}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  max={format(new Date(), "yyyy-MM-dd")}
                />
                <Button
                  size="sm"
                  className="h-8"
                  disabled={!edits[p.id] || savingId === p.id}
                  onClick={() => saveDob(p.id)}
                >
                  <Save className="h-3 w-3 mr-1" /> Save
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Cake className="h-4 w-4" /> Upcoming Birthdays
            </CardTitle>
            <CardDescription>Next {windowDays} days</CardDescription>
          </div>
          <div className="flex gap-1">
            {[7, 30, 60, 90].map((d) => (
              <Button
                key={d}
                size="sm"
                variant={windowDays === d ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setWindowDays(d)}
              >
                {d}d
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && upcoming.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No birthdays in the next {windowDays} days.
            </p>
          )}
          {upcoming.map(({ person, next, daysAway }) => (
            <div key={person.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
              <div className="text-center min-w-[44px]">
                <p className="text-xs text-muted-foreground">{format(next, "MMM")}</p>
                <p className="text-lg font-bold leading-none">{format(next, "d")}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {person.first_name} {person.last_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {person.email || "No email on file"}
                </p>
              </div>
              <Badge variant={daysAway === 0 ? "default" : daysAway <= 7 ? "secondary" : "outline"}>
                {daysAway === 0 ? "Today 🎂" : daysAway === 1 ? "Tomorrow" : `in ${daysAway} days`}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
