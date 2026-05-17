import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ClipboardCheck, ShieldAlert, Inbox, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  onNavigate?: () => void;
}

interface TaskRow {
  key: string;
  icon: React.ElementType;
  label: string;
  count: number;
  url: string;
  tone?: "warning" | "destructive" | "default";
}

export function AdminTasksPanel({ onNavigate }: Props) {
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();

  const { data } = useQuery({
    queryKey: ["admin-pending-tasks", user?.id],
    enabled: !!user && isAdmin,
    refetchInterval: 60_000,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [approvals, overdueFu, pendingFu, deletions, externalPending] = await Promise.all([
        supabase.from("outreach_sequence_runs").select("id", { count: "exact", head: true }).eq("status", "pending_approval"),
        supabase.from("follow_ups").select("id", { count: "exact", head: true }).eq("status", "pending").lt("due_date", today),
        supabase.from("follow_ups").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("account_deletion_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("external_records").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
      ]);
      return {
        approvals: approvals.count ?? 0,
        overdueFu: overdueFu.count ?? 0,
        pendingFu: pendingFu.count ?? 0,
        deletions: deletions.count ?? 0,
        externalPending: externalPending.count ?? 0,
      };
    },
  });

  if (!isAdmin || !data) return null;

  const rows: TaskRow[] = [
    { key: "approvals", icon: ClipboardCheck, label: "Outreach awaiting approval", count: data.approvals, url: "/admin?tab=dir-outreach", tone: "warning" },
    { key: "overdue", icon: AlertTriangle, label: "Overdue follow-ups", count: data.overdueFu, url: "/team/first-impressions", tone: "destructive" },
    { key: "pending", icon: Clock, label: "Open follow-ups", count: data.pendingFu, url: "/team/first-impressions" },
    { key: "externalPending", icon: Inbox, label: "Incoming needs review", count: data.externalPending, url: "/team/first-impressions", tone: "warning" },
    { key: "deletions", icon: ShieldAlert, label: "Account deletion requests", count: data.deletions, url: "/admin?tab=set-requests", tone: "destructive" },
  ].filter((r) => r.count > 0);

  if (rows.length === 0) return null;

  return (
    <div className="px-4 py-3 border-b bg-muted/20">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Pending Tasks
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => {
          const tone =
            r.tone === "destructive"
              ? "text-destructive"
              : r.tone === "warning"
              ? "text-warning"
              : "text-primary";
          return (
            <button
              key={r.key}
              onClick={() => { navigate(r.url); onNavigate?.(); }}
              className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-background text-left transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <r.icon className={`h-4 w-4 shrink-0 ${tone}`} />
                <span className="text-sm truncate">{r.label}</span>
              </div>
              <span className={`text-xs font-semibold tabular-nums ${tone}`}>{r.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
