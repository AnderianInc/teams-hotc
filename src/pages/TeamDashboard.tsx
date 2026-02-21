import { useParams, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMyTeams } from "@/hooks/useTeams";
import KidsCheckIn from "@/components/kids/KidsCheckIn";

export default function TeamDashboard() {
  const { slug } = useParams<{ slug: string }>();
  const { isAdmin } = useAuth();
  const { data: memberships, isLoading } = useMyTeams();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const membership = memberships?.find((m) => m.teams.slug === slug);

  if (!membership && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // Render team-specific content
  if (slug === "childrens-ministry") {
    return <KidsCheckIn />;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-display font-bold tracking-tight">
        {membership?.teams.name || slug}
      </h1>
      <p className="text-muted-foreground">
        Team features coming soon. This team's tools will appear here.
      </p>
    </div>
  );
}
