import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMyTeams, useAllTeams } from "@/hooks/useTeams";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Baby, Users, Sparkles, LogOut, BookOpen, Lock, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 space-y-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Access restricted</h2>
              <p className="text-sm text-muted-foreground mt-1">
                You don't have access to this team. Ask an admin to add you to the{" "}
                {team?.name ?? "team"} to view Check-In, Register, and other tools.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link to="/dashboard">
                <Home className="h-4 w-4 mr-2" />
                Back to home
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
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
