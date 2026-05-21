import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Settings2, Bell, Calendar, UserX, Coffee } from "lucide-react";

// app_settings is a key-value store table (key text PK, value jsonb)
async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return data ? (data.value as T) : fallback;
}

async function setSetting(key: string, value: unknown) {
  const { error } = await supabase
    .from("app_settings")
    .upsert([{ key, value: value as any }], { onConflict: "key" });
  if (error) throw error;
}

interface TriggerConfig {
  attendance_drop_enabled: boolean;
  attendance_drop_weeks: number;
  volunteer_inactive_enabled: boolean;
  volunteer_inactive_days: number;
  default_inreach_assignee: string;
  outreach_followup_enabled: boolean;
  outreach_followup_days: number;
  coffee_with_pk_enabled: boolean;
  coffee_with_pk_lead_days: number;
}

const DEFAULTS: TriggerConfig = {
  attendance_drop_enabled: true,
  attendance_drop_weeks: 3,
  volunteer_inactive_enabled: true,
  volunteer_inactive_days: 30,
  default_inreach_assignee: "",
  outreach_followup_enabled: true,
  outreach_followup_days: 3,
  coffee_with_pk_enabled: true,
  coffee_with_pk_lead_days: 1,
};

export default function AutoTriggerSettings() {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<TriggerConfig>(DEFAULTS);

  const { isLoading } = useQuery({
    queryKey: ["auto-trigger-settings"],
    queryFn: async () => {
      const saved = await getSetting<Partial<TriggerConfig>>("inreach_trigger_config", {});
      const merged = { ...DEFAULTS, ...saved };
      setConfig(merged);
      return merged;
    },
  });

  const { data: volunteers = [] } = useQuery({
    queryKey: ["volunteers-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: () => setSetting("inreach_trigger_config", config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-trigger-settings"] });
      toast.success("Trigger settings saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = <K extends keyof TriggerConfig>(key: K, value: TriggerConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">Loading settings…</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="h-4 w-4" />
          Auto-Trigger Settings
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Configure the rules that automatically create inreach and outreach follow-up tasks.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Attendance Drop Trigger */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Attendance Drop</span>
            </div>
            <Switch
              checked={config.attendance_drop_enabled}
              onCheckedChange={(v) => update("attendance_drop_enabled", v)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Create an inreach follow-up when a member misses this many consecutive weeks.
          </p>
          <div className="flex items-center gap-3">
            <Label className="text-xs w-40 shrink-0">Weeks missed before alert</Label>
            <Input
              type="number"
              min={1}
              max={12}
              className="w-24 h-8 text-sm"
              value={config.attendance_drop_weeks}
              disabled={!config.attendance_drop_enabled}
              onChange={(e) => update("attendance_drop_weeks", Number(e.target.value))}
            />
          </div>
        </div>

        <Separator />

        {/* Volunteer Inactive Trigger */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserX className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Volunteer Inactivity</span>
            </div>
            <Switch
              checked={config.volunteer_inactive_enabled}
              onCheckedChange={(v) => update("volunteer_inactive_enabled", v)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Flag a volunteer for team lead review when they have had no roster assignments for this many days.
          </p>
          <div className="flex items-center gap-3">
            <Label className="text-xs w-40 shrink-0">Days without assignment</Label>
            <Input
              type="number"
              min={7}
              max={180}
              className="w-24 h-8 text-sm"
              value={config.volunteer_inactive_days}
              disabled={!config.volunteer_inactive_enabled}
              onChange={(e) => update("volunteer_inactive_days", Number(e.target.value))}
            />
          </div>
        </div>

        <Separator />

        {/* First-Visit Outreach Trigger */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">First-Visit Outreach</span>
            </div>
            <Switch
              checked={config.outreach_followup_enabled}
              onCheckedChange={(v) => update("outreach_followup_enabled", v)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Auto-create an outreach follow-up task when a new first-time visitor is logged.
            The due date will be set this many days after the visit.
          </p>
          <div className="flex items-center gap-3">
            <Label className="text-xs w-40 shrink-0">Days until follow-up due</Label>
            <Input
              type="number"
              min={1}
              max={14}
              className="w-24 h-8 text-sm"
              value={config.outreach_followup_days}
              disabled={!config.outreach_followup_enabled}
              onChange={(e) => update("outreach_followup_days", Number(e.target.value))}
            />
          </div>
        </div>

        <Separator />

        {/* Coffee with P.K Auto-Queue */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Coffee className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Coffee with P.K Follow-up Email</span>
            </div>
            <Switch
              checked={config.coffee_with_pk_enabled}
              onCheckedChange={(v) => update("coffee_with_pk_enabled", v)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            When a new attendee is added with an email, automatically queue the "Coffee with P.K"
            email for admin review in the Pending tab.
          </p>
          <div className="flex items-center gap-3">
            <Label className="text-xs w-40 shrink-0">Days after registration</Label>
            <Input
              type="number"
              min={0}
              max={30}
              className="w-24 h-8 text-sm"
              value={config.coffee_with_pk_lead_days}
              disabled={!config.coffee_with_pk_enabled}
              onChange={(e) => update("coffee_with_pk_lead_days", Number(e.target.value))}
            />
          </div>
        </div>

        <Separator />

        {/* Default Assignee */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Default Inreach Assignee</Label>
          <p className="text-xs text-muted-foreground">
            Auto-triggered inreach tasks will be assigned to this person when no team lead is found.
          </p>
          <Select
            value={config.default_inreach_assignee || "unset"}
            onValueChange={(v) => update("default_inreach_assignee", v === "unset" ? "" : v)}
          >
            <SelectTrigger className="max-w-xs h-8 text-sm">
              <SelectValue placeholder="Select a person…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">None (leave unassigned)</SelectItem>
              {volunteers.filter((v: any) => v.user_id).map((v) => (
                <SelectItem key={v.user_id} value={v.user_id}>
                  {v.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending} size="sm">
          {save.isPending ? "Saving…" : "Save Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
