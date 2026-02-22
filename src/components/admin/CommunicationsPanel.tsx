import EmailComposer from "./EmailComposer";
import EmailLog from "./EmailLog";
import EmailTemplates from "./EmailTemplates";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function CommunicationsPanel() {
  const queryClient = useQueryClient();

  return (
    <Tabs defaultValue="compose" className="w-full">
      <TabsList>
        <TabsTrigger value="compose">Compose</TabsTrigger>
        <TabsTrigger value="log">Email Log</TabsTrigger>
        <TabsTrigger value="templates">Templates</TabsTrigger>
      </TabsList>
      <TabsContent value="compose" className="space-y-6">
        <EmailComposer onSent={() => queryClient.invalidateQueries({ queryKey: ["email-log"] })} />
      </TabsContent>
      <TabsContent value="log">
        <EmailLog />
      </TabsContent>
      <TabsContent value="templates">
        <EmailTemplates />
      </TabsContent>
    </Tabs>
  );
}
