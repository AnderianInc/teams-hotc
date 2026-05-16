import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles } from "lucide-react";
import AttendeeList from "./AttendeeList";
import FollowUpList from "./FollowUpList";
import QRCodeDisplay from "./QRCodeDisplay";
import OutreachPipeline from "./OutreachPipeline";


export default function FirstImpressionsDashboard() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent">
          <Sparkles className="h-5 w-5 text-accent-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">First Impressions</h1>
          <p className="text-muted-foreground">Welcome & follow-up with church visitors and members</p>
        </div>
      </div>

      <IncomingExternal />

      <Tabs defaultValue="attendees" className="w-full">
        <TabsList>
          <TabsTrigger value="attendees">Visitors & Members</TabsTrigger>
          <TabsTrigger value="followups">Follow-Ups</TabsTrigger>
          <TabsTrigger value="pipeline">Outreach Pipeline</TabsTrigger>
          <TabsTrigger value="qrcode">QR Code</TabsTrigger>
        </TabsList>
        <TabsContent value="attendees">
          <AttendeeList />
        </TabsContent>
        <TabsContent value="followups">
          <FollowUpList />
        </TabsContent>
        <TabsContent value="pipeline">
          <OutreachPipeline />
        </TabsContent>
        <TabsContent value="qrcode">
          <QRCodeDisplay />
        </TabsContent>
      </Tabs>
    </div>
  );
}
