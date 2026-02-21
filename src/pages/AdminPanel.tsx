import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield } from "lucide-react";
import TeamManagement from "@/components/admin/TeamManagement";
import VolunteerManagement from "@/components/admin/VolunteerManagement";

export default function AdminPanel() {
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

      <Tabs defaultValue="volunteers" className="w-full">
        <TabsList>
          <TabsTrigger value="volunteers">Volunteers</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
        </TabsList>
        <TabsContent value="volunteers">
          <VolunteerManagement />
        </TabsContent>
        <TabsContent value="teams">
          <TeamManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
