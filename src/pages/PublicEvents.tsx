import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, MapPin } from "lucide-react";

export default function PublicEvents() {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["public-events"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("events")
        .select("id, slug, name, description, start_at, location")
        .eq("status", "published").or(`start_at.is.null,start_at.gte.${new Date().toISOString()}`)
        .order("start_at", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto max-w-2xl space-y-4 py-8">
        <h1 className="text-3xl font-display font-bold">Upcoming events</h1>
        <p className="text-muted-foreground">House of Transformation Church</p>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : events.length === 0 ? <p className="text-muted-foreground">No upcoming events right now.</p> : events.map((e) => (
          <Card key={e.id}>
            <CardHeader>
              <CardTitle>{e.name}</CardTitle>
              <CardDescription className="flex flex-wrap gap-3">
                {e.start_at && <span className="inline-flex items-center gap-1"><CalendarDays className="h-4 w-4" />{new Date(e.start_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>}
                {e.location && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{e.location}</span>}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {e.description && <p className="text-sm">{e.description}</p>}
              <Button asChild><Link to={e.slug === "interest-meeting" ? "/interest-meeting" : `/e/${e.slug}`}>Register</Link></Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
