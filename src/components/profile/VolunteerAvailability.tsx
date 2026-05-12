import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isAfter, isBefore } from "date-fns";
import { CalendarOff, Plus, Trash2, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

interface BlockedDate {
  id: string;
  blocked_date: string; // start
  end_date: string | null;
  reason: string | null;
}

export default function VolunteerAvailability() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<{ from?: Date; to?: Date }>({});
  const [reason, setReason] = useState("");

  const { data: blocked = [], isLoading } = useQuery({
    queryKey: ["volunteer-blocked-dates", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("volunteer_blocked_dates" as any)
        .select("id, blocked_date, end_date, reason")
        .eq("user_id", user!.id)
        .gte("blocked_date", format(new Date(), "yyyy-MM-dd"))
        .order("blocked_date");
      if (error) throw error;
      return (data ?? []) as unknown as BlockedDate[];
    },
  });

  const addBlock = useMutation({
    mutationFn: async () => {
      if (!range.from) throw new Error("Pick a start date");
      const start = range.from;
      const end = range.to ?? range.from;
      if (isAfter(start, end)) throw new Error("End date must be after start date");
      const { error } = await supabase.from("volunteer_blocked_dates" as any).insert({
        user_id: user!.id,
        blocked_date: format(start, "yyyy-MM-dd"),
        end_date: format(end, "yyyy-MM-dd"),
        reason: reason.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setRange({});
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["volunteer-blocked-dates"] });
      toast.success("Dates blocked");
    },
    onError: (e: Error) =>
      toast.error(e.message.includes("duplicate") ? "Range already blocked" : e.message),
  });

  const removeBlock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("volunteer_blocked_dates" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volunteer-blocked-dates"] });
      toast.success("Removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const formatRange = (start: string, end: string | null) => {
    const s = new Date(start + "T00:00");
    const e = new Date((end || start) + "T00:00");
    if (start === (end || start)) return format(s, "EEE, MMM d, yyyy");
    return `${format(s, "MMM d")} → ${format(e, "MMM d, yyyy")}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarOff className="h-5 w-5" />
          Blocked Dates
        </CardTitle>
        <CardDescription>
          Block a single day or a range of days you're unavailable to serve. Team leads see these and avoid scheduling you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
          <div className="space-y-1">
            <Label className="text-xs">Date range</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[280px] justify-start text-left font-normal h-9",
                    !range.from && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {range.from ? (
                    range.to && format(range.to, "yyyy-MM-dd") !== format(range.from, "yyyy-MM-dd")
                      ? `${format(range.from, "MMM d")} → ${format(range.to, "MMM d, yyyy")}`
                      : format(range.from, "PPP")
                  ) : (
                    "Pick a date or range"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={range as any}
                  onSelect={(r: any) => setRange(r || {})}
                  disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                  numberOfMonths={2}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1 flex-1 min-w-[180px]">
            <Label className="text-xs">Reason (optional)</Label>
            <Input
              className="h-9 text-sm"
              placeholder="e.g. Out of town, Family event"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            onClick={() => addBlock.mutate()}
            disabled={!range.from || addBlock.isPending}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Block
          </Button>
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : blocked.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No blocked dates. You're available for any upcoming schedule.
          </p>
        ) : (
          <div className="space-y-2">
            {blocked.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <CalendarOff className="h-4 w-4 text-destructive shrink-0" />
                <span className="font-medium w-56 shrink-0">
                  {formatRange(b.blocked_date, b.end_date)}
                </span>
                <span className="text-muted-foreground text-xs flex-1 truncate">
                  {b.reason || "Unavailable"}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => removeBlock.mutate(b.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
