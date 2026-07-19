import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import kidsSetup from "@/content/help/articles/kids-setup.md?raw";
import BridgeDownloadPanel from "./BridgeDownloadPanel";

export default function KidsSetupGuide() {
  const { user } = useAuth();
  const [purging, setPurging] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .rpc("has_role", { _user_id: user.id, _role: "admin" as any })
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  const purgeOld = async () => {
    if (!confirm("Delete all check-in records older than 30 days?")) return;
    setPurging(true);
    try {
      const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
      const { error, count } = await supabase
        .from("check_ins")
        .delete({ count: "exact" })
        .lt("checked_in_at", cutoff);
      if (error) throw error;
      toast.success(`Purged ${count ?? 0} old check-in records`);
    } catch (e: any) {
      toast.error(e.message || "Purge failed");
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="space-y-4">
      <BridgeDownloadPanel />
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <Badge variant="outline">Setup guide</Badge>
            </div>
            <div className="flex gap-2">
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={purgeOld} disabled={purging}>
                  <Trash2 className="h-3 w-3 mr-1" />
                  {purging ? "Purging…" : "Purge >30d check-ins"}
                </Button>
              )}
              <Button asChild size="sm" variant="outline">
                <Link to="/help/kids-setup">
                  Open in Help Center <ExternalLink className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          </div>
          <article className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{kidsSetup}</ReactMarkdown>
          </article>
        </CardContent>
      </Card>
    </div>
  );
}
