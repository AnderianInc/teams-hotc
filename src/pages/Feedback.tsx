import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMyTeams } from "@/hooks/useTeams";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, MessageSquare } from "lucide-react";

const CATEGORIES = [
  { value: "praise", label: "Praise" },
  { value: "suggestion", label: "Suggestion" },
  { value: "issue", label: "Issue" },
  { value: "other", label: "Other" },
];

export default function Feedback() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: memberships } = useMyTeams();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("suggestion");
  const [teamId, setTeamId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const { data: myFeedback, refetch } = useQuery({
    queryKey: ["my-feedback", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);

    const { error } = await supabase
      .from("feedback" as any)
      .insert({
        user_id: user.id,
        team_id: teamId || null,
        category,
        subject,
        message,
      } as any);

    if (error) {
      toast({ title: "Error", description: "Failed to submit feedback.", variant: "destructive" });
    } else {
      toast({ title: "Feedback Sent", description: "Thank you! An admin will review your feedback." });
      setSubject("");
      setMessage("");
      setCategory("suggestion");
      setTeamId("");
      refetch();
    }
    setSubmitting(false);
  };

  const statusColor = (status: string) => {
    if (status === "resolved") return "default";
    return "secondary";
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold tracking-tight">Feedback</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Submit Feedback</CardTitle>
          <CardDescription>Share your thoughts, suggestions, or concerns with the admin team.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>On behalf of team (optional)</Label>
                <Select value={teamId} onValueChange={(v) => setTeamId(v === "personal" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Personal feedback" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Personal</SelectItem>
                    {memberships?.map((m) => (
                      <SelectItem key={m.team_id} value={m.team_id}>{m.teams.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} required placeholder="Brief summary" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} required rows={4} placeholder="Share your feedback in detail..." />
            </div>

            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Submit Feedback
            </Button>
          </form>
        </CardContent>
      </Card>

      {myFeedback && myFeedback.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">My Feedback History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {myFeedback.map((fb: any) => (
              <div key={fb.id} className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{fb.subject}</span>
                  <Badge variant={statusColor(fb.status)} className="text-xs">{fb.status}</Badge>
                  <Badge variant="outline" className="text-xs">{fb.category}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{fb.message}</p>
                {fb.admin_response && (
                  <div className="mt-2 rounded bg-muted p-2 text-sm">
                    <span className="font-medium">Admin response:</span> {fb.admin_response}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{new Date(fb.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
