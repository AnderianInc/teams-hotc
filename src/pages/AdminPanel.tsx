import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield } from "lucide-react";
import TeamManagement from "@/components/admin/TeamManagement";
import VolunteerManagement from "@/components/admin/VolunteerManagement";
import ChurchDirectory from "@/components/admin/ChurchDirectory";
import CommunicationsPanel from "@/components/admin/CommunicationsPanel";
import DeletionRequests from "@/components/admin/DeletionRequests";
import FeedbackReview from "@/components/admin/FeedbackReview";
import ChurchRoster from "@/components/admin/ChurchRoster";
import RosterCalendarView from "@/components/admin/RosterCalendarView";
import WeeklyAttendance from "@/components/admin/WeeklyAttendance";
import GroupsManagement from "@/components/admin/GroupsManagement";
import InreachDashboard from "@/components/admin/InreachDashboard";
import BulkImport from "@/components/admin/BulkImport";
import Organogram from "@/components/admin/Organogram";
import StaffRolesManager from "@/components/admin/StaffRolesManager";
import TimezoneSettings from "@/components/admin/TimezoneSettings";
import AdminRolesManager from "@/components/admin/AdminRolesManager";
import BirthdaysPanel from "@/components/admin/BirthdaysPanel";
import ExternalSourcesPanel from "@/components/admin/ExternalSourcesPanel";
import PlannedOutreachPanel from "@/components/admin/PlannedOutreachPanel";
import VolunteerOnboardingPipeline from "@/components/admin/VolunteerOnboardingPipeline";
import AdminDashboard from "@/components/admin/AdminDashboard";

type SubTab = { value: string; label: string };
type Group = { label: string; default: string; subs: SubTab[] };

const GROUPS: Record<string, Group> = {
  dashboard: {
    label: "Dashboard",
    default: "dashboard",
    subs: [],
  },
  teams: {
    label: "Teams",
    default: "teams-teams",
    subs: [
      { value: "teams-teams", label: "Teams" },
      { value: "teams-volunteers", label: "Volunteers" },
      { value: "teams-roster", label: "Roster" },
    ],
  },
  directory: {
    label: "Directory",
    default: "dir-directory",
    subs: [
      { value: "dir-directory", label: "Directory" },
      { value: "dir-attendance", label: "Attendance" },
      { value: "dir-groups", label: "Groups" },
      { value: "dir-birthdays", label: "Birthdays" },
      { value: "dir-inreach", label: "Inreach" },
      { value: "dir-onboarding", label: "Volunteer Onboarding" },
      { value: "dir-outreach", label: "Planned Outreach" },
    ],
  },
  communications: { label: "Communications", default: "communications", subs: [] },
  organogram: { label: "Org Chart", default: "organogram", subs: [] },
  settings: {
    label: "Settings",
    default: "set-general",
    subs: [
      { value: "set-general", label: "General" },
      { value: "set-feedback", label: "Feedback" },
      { value: "set-requests", label: "Requests" },
      { value: "set-sources", label: "External Sources" },
      { value: "set-import", label: "Import" },
    ],
  },
};

function findGroup(tab: string): string {
  for (const [key, g] of Object.entries(GROUPS)) {
    if (tab === key) return key;
    if (g.subs.some((s) => s.value === tab)) return key;
  }
  return "dashboard";
}

export default function AdminPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") || GROUPS.dashboard.default;
  const activeGroup = findGroup(requestedTab);
  const groupDef = GROUPS[activeGroup];
  const activeSub = groupDef.subs.length
    ? (groupDef.subs.find((s) => s.value === requestedTab)?.value ?? groupDef.default)
    : groupDef.default;

  const setTab = (value: string) => setSearchParams({ tab: value });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
          <Shield className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Admin Panel</h1>
          <p className="text-muted-foreground">Manage teams, directory, and settings</p>
        </div>
      </div>

      <Tabs value={activeGroup} onValueChange={(v) => setTab(GROUPS[v].default)} className="w-full">
        <TabsList>
          {Object.keys(GROUPS).map((k) => (
            <TabsTrigger key={k} value={k}>{GROUPS[k].label}</TabsTrigger>
          ))}
        </TabsList>

        {/* Dashboard */}
        <TabsContent value="dashboard"><AdminDashboard /></TabsContent>

        {/* Teams group */}
        <TabsContent value="teams">
          <Tabs value={activeSub} onValueChange={setTab}>
            <TabsList className="bg-muted/50">
              {GROUPS.teams.subs.map((s) => (
                <TabsTrigger key={s.value} value={s.value}>{s.label}</TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="teams-teams"><TeamManagement /></TabsContent>
            <TabsContent value="teams-volunteers"><VolunteerManagement /></TabsContent>
            <TabsContent value="teams-roster">
              <div className="space-y-6">
                <RosterCalendarView />
                <ChurchRoster />
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Directory group */}
        <TabsContent value="directory">
          <Tabs value={activeSub} onValueChange={setTab}>
            <TabsList className="bg-muted/50">
              {GROUPS.directory.subs.map((s) => (
                <TabsTrigger key={s.value} value={s.value}>{s.label}</TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="dir-directory"><ChurchDirectory /></TabsContent>
            <TabsContent value="dir-attendance"><WeeklyAttendance /></TabsContent>
            <TabsContent value="dir-groups"><GroupsManagement /></TabsContent>
            <TabsContent value="dir-birthdays"><BirthdaysPanel /></TabsContent>
            <TabsContent value="dir-inreach"><InreachDashboard /></TabsContent>
            <TabsContent value="dir-onboarding"><VolunteerOnboardingPipeline /></TabsContent>
            <TabsContent value="dir-outreach"><PlannedOutreachPanel /></TabsContent>
          </Tabs>
        </TabsContent>

        {/* Communications */}
        <TabsContent value="communications">
          <CommunicationsPanel />
        </TabsContent>

        {/* Org Chart */}
        <TabsContent value="organogram">
          <div className="space-y-6">
            <StaffRolesManager />
            <Organogram />
          </div>
        </TabsContent>

        {/* Settings group */}
        <TabsContent value="settings">
          <Tabs value={activeSub} onValueChange={setTab}>
            <TabsList className="bg-muted/50">
              {GROUPS.settings.subs.map((s) => (
                <TabsTrigger key={s.value} value={s.value}>{s.label}</TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="set-general">
              <div className="space-y-6">
                <AdminRolesManager />
                <TimezoneSettings />
              </div>
            </TabsContent>
            <TabsContent value="set-feedback"><FeedbackReview /></TabsContent>
            <TabsContent value="set-requests"><DeletionRequests /></TabsContent>
            <TabsContent value="set-sources"><ExternalSourcesPanel /></TabsContent>
            <TabsContent value="set-import"><BulkImport /></TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}
