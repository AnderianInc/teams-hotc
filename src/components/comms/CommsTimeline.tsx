import { useQuery } from "@tanstack/react-query";
import { fetchCommsTimeline, type CommsItem } from "@/lib/commsTimeline";
import { Badge } from "@/components/ui/badge";
import { Mail, MessageSquare, Phone, Users, StickyNote, Loader2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  attendeeId?: string | null;
  email?: string | null;
  phone?: string | null;
  limit?: number;
  emptyText?: string;
}

const CHANNEL_ICON = {
  email: Mail,
  sms: MessageSquare,
  call: Phone,
  in_person: Users,
  visit: Users,
  note: StickyNote,
} as const;

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  sequence: "Sequence",
  birthday: "Birthday",
  follow_up: "Follow-up",
  visitor_confirm: "Visitor confirm",
  system: "System",
};

function statusVariant(status?: string | null): "default" | "destructive" | "secondary" | "outline" {
  if (!status) return "outline";
  if (status === "sent" || status === "delivered") return "default";
  if (status === "failed" || status === "bounced") return "destructive";
  return "secondary";
}

function CommsRow({ item }: { item: CommsItem }) {
  const [open, setOpen] = useState(false);
  const Icon = CHANNEL_ICON[item.channel] ?? StickyNote;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-start gap-3 rounded-md p-2 text-left hover:bg-muted/50">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <Icon className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Badge variant="outline" className="capitalize text-[10px]">{item.channel}</Badge>
              <Badge variant="secondary" className="text-[10px]">{SOURCE_LABEL[item.source] ?? item.source}</Badge>
              {item.status && (
                <Badge variant={statusVariant(item.status)} className="text-[10px]">
                  {item.status}
                </Badge>
              )}
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {formatDistanceToNow(new Date(item.ts), { addSuffix: true })}
              </span>
            </div>
            {item.subject && (
              <div className="mt-0.5 truncate text-sm font-medium">{item.subject}</div>
            )}
            {item.preview && (
              <div className="truncate text-xs text-muted-foreground">{item.preview}</div>
            )}
          </div>
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-10 mr-2 mb-2 rounded border bg-muted/30 p-3 text-xs">
          {item.recipient && <div className="mb-1 text-muted-foreground">To: {item.recipient}</div>}
          <div className="text-muted-foreground">Sent {format(new Date(item.ts), "PPp")}</div>
          {item.body && (
            <div
              className="prose prose-sm dark:prose-invert mt-2 max-w-none break-words"
              dangerouslySetInnerHTML={{ __html: item.channel === "email" ? item.body : item.body.replace(/\n/g, "<br/>") }}
            />
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function CommsTimeline({ attendeeId, email, phone, limit, emptyText }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["comms-timeline", attendeeId, email, phone],
    queryFn: () => fetchCommsTimeline({ attendeeId, email, phone }),
    enabled: !!(attendeeId || email || phone),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading communications…
      </div>
    );
  }

  const items = limit ? (data ?? []).slice(0, limit) : (data ?? []);

  if (items.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        {emptyText ?? "No communications on record yet."}
      </div>
    );
  }

  return <div className="space-y-1">{items.map((i) => <CommsRow key={i.id} item={i} />)}</div>;
}
