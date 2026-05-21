import { useState } from "react";
import EmailComposer from "./EmailComposer";
import EmailLog from "./EmailLog";
import EmailTemplates from "./EmailTemplates";
import SmsComposer from "./SmsComposer";
import SmsLog from "./SmsLog";
import SmsOptInManager from "./SmsOptInManager";
import SmsInbox from "./SmsInbox";
import PendingEmailsPanel from "./PendingEmailsPanel";
import ContactGroups from "./ContactGroups";
import SmsTemplates from "./SmsTemplates";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function CommunicationsPanel() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("compose");
  const [composerKey, setComposerKey] = useState(0);
  const [composerDefaults, setComposerDefaults] = useState<{ subject: string; body: string }>({
    subject: "",
    body: "",
  });
  const [smsComposerKey, setSmsComposerKey] = useState(0);
  const [smsDefaultBody, setSmsDefaultBody] = useState("");

  const handleUseTemplate = (subject: string, bodyHtml: string) => {
    setComposerDefaults({ subject, body: bodyHtml });
    setComposerKey((k) => k + 1);
    setActiveTab("compose");
  };

  const handleUseSmsTemplate = (body: string) => {
    setSmsDefaultBody(body);
    setSmsComposerKey((k) => k + 1);
    setActiveTab("sms");
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="compose">Email</TabsTrigger>
        <TabsTrigger value="sms">Text (SMS)</TabsTrigger>
        <TabsTrigger value="inbox">Inbox</TabsTrigger>
        <TabsTrigger value="pending">Pending</TabsTrigger>
        <TabsTrigger value="groups">Groups</TabsTrigger>
        <TabsTrigger value="log">Email Log</TabsTrigger>
        <TabsTrigger value="sms-log">SMS Log</TabsTrigger>
        <TabsTrigger value="sms-opt-in">SMS Opt-in</TabsTrigger>
        <TabsTrigger value="templates">Templates</TabsTrigger>
      </TabsList>
      <TabsContent value="compose" className="space-y-6">
        <EmailComposer
          key={composerKey}
          defaultSubject={composerDefaults.subject}
          defaultBody={composerDefaults.body}
          onSent={() => queryClient.invalidateQueries({ queryKey: ["email-log"] })}
        />
      </TabsContent>
      <TabsContent value="sms">
        <SmsComposer
          key={smsComposerKey}
          defaultBody={smsDefaultBody}
          onSent={() => queryClient.invalidateQueries({ queryKey: ["sms-log"] })}
        />
      </TabsContent>
      <TabsContent value="inbox">
        <SmsInbox />
      </TabsContent>
      <TabsContent value="pending">
        <PendingEmailsPanel />
      </TabsContent>
      <TabsContent value="groups">
        <ContactGroups />
      </TabsContent>
      <TabsContent value="log">
        <EmailLog />
      </TabsContent>
      <TabsContent value="sms-log">
        <SmsLog />
      </TabsContent>
      <TabsContent value="sms-opt-in">
        <SmsOptInManager />
      </TabsContent>
      <TabsContent value="templates" className="space-y-6">
        <EmailTemplates onUseTemplate={handleUseTemplate} />
        <SmsTemplates onUseTemplate={handleUseSmsTemplate} />
      </TabsContent>
    </Tabs>
  );
}
