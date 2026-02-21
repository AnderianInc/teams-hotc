import { useAuth } from "@/hooks/useAuth";
import { useMyTeams } from "@/hooks/useTeams";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { Baby, Music, Monitor, Coffee, HandHelping, Sparkles, LayoutDashboard } from "lucide-react";

const teamIcons: Record<string, React.ElementType> = {
  "childrens-ministry": Baby,
  worship: Music,
  "media-production": Monitor,
  "java-team": Coffee,
  ushers: HandHelping,
  "first-impressions": Sparkles,
};

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const { data: memberships, isLoading } = useMyTeams();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">
          Welcome back{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ""}
        </h1>
        <p className="text-muted-foreground mt-1">
          {isAdmin ? "You have admin access to all teams." : "Select a team to get started."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {memberships?.map((m) => {
          const Icon = teamIcons[m.teams.slug] || LayoutDashboard;
          return (
            <Card
              key={m.team_id}
              className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/30 hover:-translate-y-0.5"
              onClick={() => navigate(`/team/${m.teams.slug}`)}
            >
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent">
                  <Icon className="h-5 w-5 text-accent-foreground" />
                </div>
                <CardTitle className="text-lg">{m.teams.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {m.teams.description || "No description"}
                </p>
                <span className="mt-2 inline-block rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground capitalize">
                  {m.role.replace("_", " ")}
                </span>
              </CardContent>
            </Card>
          );
        })}
        {(!memberships || memberships.length === 0) && (
          <Card className="col-span-full">
            <CardContent className="py-12 text-center text-muted-foreground">
              You haven't been assigned to any teams yet. Contact your admin.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
