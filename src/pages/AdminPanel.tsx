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

export default function AdminPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "volunteers";

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
          <Shield className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Admin Panel</h1>
          <p className="text-muted-foreground">Manage teams, volunteers, and settings</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="flex-wrap">
          <TabsTrigger value="volunteers">Volunteers</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="directory">Directory</TabsTrigger>
          <TabsTrigger value="communications">Communications</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
        </TabsList>
        <TabsContent value="volunteers">
          <VolunteerManagement />
        </TabsContent>
        <TabsContent value="teams">
          <TeamManagement />
        </TabsContent>
        <TabsContent value="roster">
          <div className="space-y-6">
            <RosterCalendarView />
            <ChurchRoster />
          </div>
        </TabsContent>
        <TabsContent value="attendance">
          <WeeklyAttendance />
        </TabsContent>
        <TabsContent value="directory">
          <ChurchDirectory />
        </TabsContent>
        <TabsContent value="communications">
          <CommunicationsPanel />
        </TabsContent>
        <TabsContent value="feedback">
          <FeedbackReview />
        </TabsContent>
        <TabsContent value="requests">
          <DeletionRequests />
        </TabsContent>
      </Tabs>
    </div>
  );
}
