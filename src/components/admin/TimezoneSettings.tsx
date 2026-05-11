import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import {
  COMMON_TIMEZONES,
  DEFAULT_TIMEZONE,
  formatInChurchTz,
  saveChurchTimezone,
  useChurchTimezone,
} from "@/lib/timezone";

export default function TimezoneSettings() {
  const { timezone, isLoading } = useChurchTimezone();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string>(timezone || DEFAULT_TIMEZONE);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    if (timezone) setDraft(timezone);
  }, [timezone]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const save = useMutation({
    mutationFn: () => saveChurchTimezone(draft),
    onSuccess: () => {
      toast.success("Timezone updated. Reloading...");
      queryClient.invalidateQueries({ queryKey: ["church-timezone"] });
      // Soft reload so all already-rendered dates re-format with the new tz.
      setTimeout(() => window.location.reload(), 600);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isDirty = draft !== timezone;
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <CardTitle>Church Timezone</CardTitle>
        </div>
        <CardDescription>
          Used everywhere dates and times are displayed (follow-ups, rosters, attendance,
          logs). Default is Pacific Time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Timezone</Label>
          <Select value={draft} onValueChange={setDraft}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMON_TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
              {!COMMON_TIMEZONES.some((t) => t.value === draft) && (
                <SelectItem value={draft}>{draft}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
          <div>
            <span className="text-muted-foreground">Current church time: </span>
            <span className="font-medium">{formatInChurchTz(now, "EEE, MMM d • h:mm:ss a zzz", draft)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Your browser timezone: {browserTz}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={() => save.mutate()}
            disabled={!isDirty || save.isPending || isLoading}
          >
            {save.isPending ? "Saving..." : "Save timezone"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
