import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Mail, MessageSquare, UserPlus, CalendarCheck, Inbox, Activity, Cake } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

type Range = "week" | "month" | "quarter" | "year";

const RANGE_DAYS: Record<Range, number> = {
  week: 7,
  month: 30,
  quarter: 90,
  year: 365,
};

const RANGE_LABEL: Record<Range, string> = {
  week: "This Week",
  month: "This Month",
  quarter: "Last 90 days",
  year: "Last 12 months",
};

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: React.ElementType;
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      className={onClick ? "cursor-pointer transition-colors hover:bg-muted/40 hover:border-primary/40" : ""}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function useDashboardStats(range: Range) {
  return useQuery({
    queryKey: ["admin-dashboard-stats", range],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - RANGE_DAYS[range]);
      const sinceIso = since.toISOString();

      const [
        attendanceRes,
        attendeesRes,
        emailRes,
        smsRes,
        externalRes,
        feedbackRes,
        deletionRes,
        followUpsRes,
        outreachRes,
      ] = await Promise.all([
        supabase
          .from("weekly_attendance")
          .select("status", { count: "exact", head: true })
          .gte("service_date", sinceIso.slice(0, 10))
          .eq("status", "present"),
        supabase
          .from("attendees")
          .select("id", { count: "exact", head: true })
          .gte("created_at", sinceIso),
        supabase
          .from("email_log")
          .select("id", { count: "exact", head: true })
          .gte("created_at", sinceIso),
        supabase
          .from("sms_log")
          .select("id", { count: "exact", head: true })
          .gte("created_at", sinceIso),
        supabase
          .from("external_records")
          .select("id", { count: "exact", head: true })
          .gte("created_at", sinceIso),
        supabase
          .from("feedback")
          .select("id", { count: "exact", head: true })
          .gte("created_at", sinceIso),
        supabase
          .from("account_deletion_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("follow_ups")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("outreach_sequence_runs")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending_approval"),
      ]);

      return {
        attendance: attendanceRes.count ?? 0,
        newAttendees: attendeesRes.count ?? 0,
        emails: emailRes.count ?? 0,
        sms: smsRes.count ?? 0,
        external: externalRes.count ?? 0,
        feedback: feedbackRes.count ?? 0,
        pendingDeletion: deletionRes.count ?? 0,
        pendingFollowUps: followUpsRes.count ?? 0,
        pendingApproval: outreachRes.count ?? 0,
      };
    },
  });
}

export default function AdminDashboard() {
  const [range, setRange] = useState<Range>("week");
  const { data, isLoading } = useDashboardStats(range);
  const navigate = useNavigate();
  const go = (path: string) => () => navigate(path);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-display font-semibold">Overview</h2>
          <p className="text-sm text-muted-foreground">{RANGE_LABEL[range]}</p>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
            <TabsTrigger value="quarter">Quarter</TabsTrigger>
            <TabsTrigger value="year">Year</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Attendance (present)"
          value={isLoading ? "…" : data!.attendance}
          icon={CalendarCheck}
          hint="People marked present"
          onClick={go("/admin?tab=dir-attendance")}
        />
        <StatCard
          label="New people"
          value={isLoading ? "…" : data!.newAttendees}
          icon={UserPlus}
          hint="Added to directory"
          onClick={go("/admin?tab=dir-directory")}
        />
        <StatCard
          label="Emails sent"
          value={isLoading ? "…" : data!.emails}
          icon={Mail}
          onClick={go("/admin?tab=communications&sub=log")}
        />
        <StatCard
          label="SMS sent"
          value={isLoading ? "…" : data!.sms}
          icon={MessageSquare}
          onClick={go("/admin?tab=communications&sub=sms-log")}
        />
        <StatCard
          label="Incoming outreach"
          value={isLoading ? "…" : data!.external}
          icon={Inbox}
          hint="Prayer / visit / interest"
          onClick={go("/team/first-impressions?tab=pipeline")}
        />
        <StatCard
          label="Feedback received"
          value={isLoading ? "…" : data!.feedback}
          icon={Activity}
          onClick={go("/admin?tab=set-feedback")}
        />
        <StatCard
          label="Pending follow-ups"
          value={isLoading ? "…" : data!.pendingFollowUps}
          icon={Users}
          hint="All-time open"
          onClick={go("/team/first-impressions?tab=followups")}
        />
        <StatCard
          label="Awaiting approval"
          value={isLoading ? "…" : data!.pendingApproval}
          icon={Cake}
          hint="Outreach messages queued"
          onClick={go("/admin?tab=dir-outreach&sub=pending")}
        />
      </div>

      {data && data.pendingDeletion > 0 && (
        <Card
          className="border-destructive/40 cursor-pointer hover:bg-destructive/5"
          onClick={() => navigate("/admin?tab=set-requests")}
        >
          <CardHeader>
            <CardTitle className="text-base">Action needed</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {data.pendingDeletion} pending account deletion request{data.pendingDeletion === 1 ? "" : "s"}.
            Review under Settings → Requests.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
