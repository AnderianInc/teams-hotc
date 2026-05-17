import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Circle, Trash2, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useNotifications, AppNotification } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import { AdminTasksPanel } from "./AdminTasksPanel";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const typeLabels: Record<string, string> = {
  follow_up_assigned: "Follow-Up",
  follow_up_overdue: "Overdue",
  roster_assigned: "Roster",
  roster_reminder: "Reminder",
  first_visit_logged: "New Visitor",
  feedback_received: "Feedback",
  deletion_request: "Request",
  inreach_trigger: "Inreach",
  volunteer_inactive: "Inreach",
};

export function NotificationDrawer({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { notifications, unreadCount, isLoading, markRead, markAllRead, clearNotification, clearAll } = useNotifications();

  function handleClick(n: AppNotification) {
    if (!n.read_at) markRead.mutate(n.id);
    if (n.url) {
      navigate(n.url);
      onOpenChange(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-sm flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications
              {unreadCount > 0 && (
                <span className="text-xs font-normal text-muted-foreground">({unreadCount} unread)</span>
              )}
            </SheetTitle>
            {notifications.length > 0 && (
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => markAllRead.mutate()}
                    disabled={markAllRead.isPending}
                  >
                    <CheckCheck className="h-3 w-3 mr-1" />
                    Mark read
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-destructive hover:text-destructive"
                  onClick={() => clearAll.mutate()}
                  disabled={clearAll.isPending}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              </div>
            )}
          </div>
        </SheetHeader>
        <Separator />

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No notifications yet
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn("group relative hover:bg-muted/50 transition-colors", !n.read_at && "bg-primary/5")}
                >
                  <button onClick={() => handleClick(n)} className="w-full text-left px-4 py-3 pr-11">
                  <div className="flex items-start gap-2">
                    {!n.read_at && (
                      <Circle className="h-2 w-2 mt-1.5 shrink-0 fill-primary text-primary" />
                    )}
                    <div className={cn("flex-1 min-w-0", n.read_at && "pl-4")}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-primary">
                          {typeLabels[n.type] || n.type}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm font-medium leading-tight mt-0.5">{n.title}</p>
                      {n.body && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                    </div>
                  </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 h-7 w-7 opacity-60 hover:opacity-100"
                    onClick={() => clearNotification.mutate(n.id)}
                    disabled={clearNotification.isPending}
                    aria-label="Clear notification"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
