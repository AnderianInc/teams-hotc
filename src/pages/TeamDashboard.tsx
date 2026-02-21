import { useParams, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMyTeams, useAllTeams } from "@/hooks/useTeams";
import KidsCheckIn from "@/components/kids/KidsCheckIn";
import FirstImpressionsDashboard from "@/components/first-impressions/FirstImpressionsDashboard";
import VolunteerTeamDashboard from "@/components/teams/VolunteerTeamDashboard";

export default function TeamDashboard() {
  const { slug } = useParams<{ slug: string }>();
  const { isAdmin } = useAuth();
  const { data: memberships, isLoading: loadingMemberships } = useMyTeams();
  const { data: allTeams, isLoading: loadingTeams } = useAllTeams();

  if (loadingMemberships || loadingTeams) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const membership = memberships?.find((m) => m.teams.slug === slug);
  const team = allTeams?.find((t) => t.slug === slug);

  if (!membership && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // Route to team-specific modules
  if (slug === "childrens-ministry") {
    return <KidsCheckIn />;
  }

  if (slug === "first-impressions") {
    return <FirstImpressionsDashboard />;
  }

  // All other teams get the volunteer dashboard with members + roster
  if (team) {
    return <VolunteerTeamDashboard teamId={team.id} teamName={team.name} teamSlug={team.slug} />;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-display font-bold tracking-tight">{slug}</h1>
      <p className="text-muted-foreground">Team not found.</p>
    </div>
  );
}
