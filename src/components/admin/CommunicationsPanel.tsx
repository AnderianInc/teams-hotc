import EmailComposer from "./EmailComposer";
import EmailLog from "./EmailLog";
import { useQueryClient } from "@tanstack/react-query";

export default function CommunicationsPanel() {
  const queryClient = useQueryClient();

  return (
    <div className="space-y-6">
      <EmailComposer onSent={() => queryClient.invalidateQueries({ queryKey: ["email-log"] })} />
      <EmailLog />
    </div>
  );
}
