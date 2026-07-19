import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Fuse from "fuse.js";
import { ARTICLES, roleAllows, type Article, type ArticleRole } from "@/content/help";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, BookOpen, ThumbsUp, ThumbsDown, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BridgeDownloadPanel from "@/components/kids/BridgeDownloadPanel";

function useUserRole(): ArticleRole {
  const { user } = useAuth();
  const { data: role = "public" } = useQuery<ArticleRole>({
    queryKey: ["help-user-role", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return "public";
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const set = new Set((roles || []).map((r: any) => r.role));
      if (set.has("admin")) return "admin";
      const { data: profile } = await supabase.from("profiles").select("is_staff").eq("user_id", user.id).maybeSingle();
      if (profile?.is_staff) return "staff";
      const { data: leads } = await supabase.from("team_members").select("role").eq("user_id", user.id).eq("role", "team_lead").limit(1);
      if (leads && leads.length) return "team_lead";
      return "member";
    },
  });
  return role;
}

export default function Help() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const role = useUserRole();
  const [query, setQuery] = useState("");

  const visible = useMemo(() => ARTICLES.filter((a) => roleAllows(role, a.role)), [role]);

  const fuse = useMemo(
    () => new Fuse(visible, { keys: ["title", "content", "section"], threshold: 0.35 }),
    [visible],
  );
  const results = query.trim().length >= 2 ? fuse.search(query).map((r) => r.item) : visible;

  const sections = useMemo(() => {
    const map = new Map<string, Article[]>();
    for (const a of results) {
      if (!map.has(a.section)) map.set(a.section, []);
      map.get(a.section)!.push(a);
    }
    return Array.from(map.entries());
  }, [results]);

  const current = slug ? visible.find((a) => a.slug === slug) : null;

  const submitFeedback = useMutation({
    mutationFn: async ({ helpful }: { helpful: boolean }) => {
      if (!current) return;
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("help_feedback").insert({
        article_slug: current.slug,
        helpful,
        user_id: u?.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Thanks for the feedback"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <BookOpen className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight">Help Center</h1>
            <p className="text-muted-foreground">How to use HOTC Volunteer Hub</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {current && (
            <Button variant="ghost" size="sm" onClick={() => navigate("/help")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> All articles
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button variant="default" size="sm" onClick={() => navigate("/dashboard")}>
            Back to app
          </Button>
        </div>
      </div>

      <div className="relative mb-6 max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search help articles..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
        <aside className="space-y-4">
          {sections.map(([sec, items]) => (
            <div key={sec}>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">{sec}</p>
              <ul className="space-y-1">
                {items.map((a) => (
                  <li key={a.slug}>
                    <Link
                      to={`/help/${a.slug}`}
                      className={`block rounded px-2 py-1 text-sm hover:bg-accent ${current?.slug === a.slug ? "bg-accent font-medium" : ""}`}
                    >
                      {a.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {sections.length === 0 && <p className="text-sm text-muted-foreground">No articles match your search.</p>}
        </aside>

        <main>
          <Card>
            <CardContent className="pt-6">
              {current ? (
                <article className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-display prose-headings:tracking-tight prose-h1:text-3xl prose-h2:text-2xl prose-h2:mt-8 prose-h3:text-lg prose-a:text-primary prose-code:text-primary prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-muted prose-pre:text-foreground prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground prose-hr:border-border prose-strong:text-foreground prose-li:my-1">
                  <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{current.section}</Badge>
                    {current.role !== "public" && <Badge variant="secondary">{current.role}</Badge>}
                  </div>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.content}</ReactMarkdown>
                  <div className="mt-8 flex items-center gap-2 not-prose">
                    <span className="text-sm text-muted-foreground">Was this helpful?</span>
                    <Button size="sm" variant="outline" onClick={() => submitFeedback.mutate({ helpful: true })}>
                      <ThumbsUp className="h-3 w-3 mr-1" /> Yes
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => submitFeedback.mutate({ helpful: false })}>
                      <ThumbsDown className="h-3 w-3 mr-1" /> No
                    </Button>
                  </div>
                </article>
              ) : (
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold">Pick a topic from the sidebar</h2>
                  <p className="text-sm text-muted-foreground">
                    Browse by section on the left, or search above. Articles are filtered to your role ({role}).
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {visible.slice(0, 6).map((a) => (
                      <button
                        key={a.slug}
                        onClick={() => navigate(`/help/${a.slug}`)}
                        className="text-left rounded-lg border p-3 hover:bg-accent transition"
                      >
                        <p className="text-xs text-muted-foreground">{a.section}</p>
                        <p className="text-sm font-medium">{a.title}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
