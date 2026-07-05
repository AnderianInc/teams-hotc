import { useParams, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMyTeams, useAllTeams } from "@/hooks/useTeams";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Baby, Users, Sparkles, LogOut, BookOpen } from "lucide-react";
import KidsSetupGuide from "@/components/kids/KidsSetupGuide";
import KidsCheckIn from "@/components/kids/KidsCheckIn";
import KidsCheckOut from "@/components/kids/KidsCheckOut";
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

  // Children's Ministry: tabs for App (Kids Check-In) + Volunteers
  if (slug === "childrens-ministry" && team) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">{team.name}</h1>
          <p className="text-muted-foreground mt-1">Ministry dashboard</p>
        </div>
        <Tabs defaultValue="app" className="w-full">
          <TabsList>
            <TabsTrigger value="app">
              <Baby className="h-4 w-4 mr-2" />
              Check-In
            </TabsTrigger>
            <TabsTrigger value="checkout">
              <LogOut className="h-4 w-4 mr-2" />
              Check-Out
            </TabsTrigger>
            <TabsTrigger value="volunteers">
              <Users className="h-4 w-4 mr-2" />
              Volunteers
            </TabsTrigger>
            <TabsTrigger value="guide">
              <BookOpen className="h-4 w-4 mr-2" />
              Setup & Guide
            </TabsTrigger>
          </TabsList>
          <TabsContent value="app">
            <KidsCheckIn />
          </TabsContent>
          <TabsContent value="checkout">
            <KidsCheckOut />
          </TabsContent>
          <TabsContent value="volunteers">
            <VolunteerTeamDashboard teamId={team.id} teamName={team.name} teamSlug={team.slug} hideHeader />
          </TabsContent>
          <TabsContent value="guide">
            <KidsSetupGuide />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  if (slug === "first-impressions" && team) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">{team.name}</h1>
          <p className="text-muted-foreground mt-1">Ministry dashboard</p>
        </div>
        <Tabs defaultValue="app" className="w-full">
          <TabsList>
            <TabsTrigger value="app">
              <Sparkles className="h-4 w-4 mr-2" />
              Visitors & Follow-Ups
            </TabsTrigger>
            <TabsTrigger value="volunteers">
              <Users className="h-4 w-4 mr-2" />
              Volunteers
            </TabsTrigger>
          </TabsList>
          <TabsContent value="app">
            <FirstImpressionsDashboard />
          </TabsContent>
          <TabsContent value="volunteers">
            <VolunteerTeamDashboard teamId={team.id} teamName={team.name} teamSlug={team.slug} hideHeader />
          </TabsContent>
        </Tabs>
      </div>
    );
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
