import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ClipboardCheck } from "lucide-react";
import { useInstances } from "@/hooks/useOrderOfService";

export default function OrderOfServiceView() {
  const navigate = useNavigate();
  const { data: instances = [], isLoading } = useInstances();

  // Team members only see published services
  const visible = instances.filter((i) => i.status === "published");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
          <ClipboardCheck className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Order of Service</h1>
          <p className="text-muted-foreground">Upcoming service run-sheets</p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No published services yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {visible.map((inst) => (
            <Card
              key={inst.id}
              className="cursor-pointer hover:bg-accent/30 transition"
              onClick={() => navigate(`/order-of-service/${inst.id}`)}
            >
              <CardContent className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{inst.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(inst.service_date + "T00:00:00"), "EEE, MMM d, yyyy")}
                    {inst.start_time && ` · ${inst.start_time.slice(0, 5)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>published</Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
