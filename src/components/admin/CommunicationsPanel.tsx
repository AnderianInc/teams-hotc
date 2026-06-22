import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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

const VALID_SUBS = new Set(["compose", "sms", "inbox", "pending", "groups", "log", "sms-log", "sms-opt-in", "templates"]);

export default function CommunicationsPanel() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const subParam = searchParams.get("sub");
  const [activeTab, setActiveTab] = useState(subParam && VALID_SUBS.has(subParam) ? subParam : "compose");

  useEffect(() => {
    if (subParam && VALID_SUBS.has(subParam) && subParam !== activeTab) {
      setActiveTab(subParam);
    }
  }, [subParam]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const next = new URLSearchParams(searchParams);
    next.set("sub", value);
    setSearchParams(next, { replace: true });
  };

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
