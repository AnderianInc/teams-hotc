import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, CalendarPlus, ChevronRight, Trash2, ListOrdered, CalendarDays } from "lucide-react";
import { deleteServiceInstance, useTemplates, useInstances, generateServiceFromTemplate, useInvalidateOoS, type ServiceTemplate } from "@/hooks/useOrderOfService";
import ServiceTemplateEditor from "./ServiceTemplateEditor";

export default function OrderOfServicePanel() {
  const navigate = useNavigate();
  const invalidate = useInvalidateOoS();
  const { data: templates = [], isLoading: loadingT } = useTemplates();
  const { data: instances = [], isLoading: loadingI } = useInstances();
  const [editingTemplate, setEditingTemplate] = useState<ServiceTemplate | null>(null);
  const [newTplOpen, setNewTplOpen] = useState(false);
  const [newTplName, setNewTplName] = useState("");
  const [newTplTime, setNewTplTime] = useState("10:00");
  const [generateOpen, setGenerateOpen] = useState(false);
  const [genTemplateId, setGenTemplateId] = useState<string>("");
  const [genRosterEventId, setGenRosterEventId] = useState<string>("");

  const { data: rosterEvents = [] } = useQuery({
    queryKey: ["oos-master-schedule-events"],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("roster_events")
        .select("id, name, event_date, event_time, roster_event_teams(teams(name))")
        .gte("event_date", today)
        .order("event_date")
        .order("event_time")
        .limit(120);
      if (error) throw error;
      return data || [];
    },
  });

  const availableRosterEvents = rosterEvents.filter((event: any) =>
    !instances.some((instance) => instance.roster_event_id === event.id)
  );

  const createTemplate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("service_templates")
        .insert({
          name: newTplName.trim(),
          default_start_time: newTplTime || null,
          is_active: true,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as ServiceTemplate;
    },
    onSuccess: (tpl) => {
      invalidate();
      setNewTplOpen(false);
      setNewTplName("");
      setEditingTemplate(tpl);
      toast.success("Template created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Template deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteService = useMutation({
    mutationFn: async (id: string) => deleteServiceInstance(id),
    onSuccess: () => {
      invalidate();
      toast.success("Service deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generate = useMutation({
    mutationFn: async () => {
      if (!genTemplateId || !genRosterEventId) throw new Error("Pick a template and scheduled service");
      const event = rosterEvents.find((item: any) => item.id === genRosterEventId);
      if (!event) throw new Error("Scheduled service not found");
      return generateServiceFromTemplate(genTemplateId, event.event_date, {
        rosterEventId: event.id,
        title: event.name,
        startTime: event.event_time,
        createRosterEvent: false,
      });
    },
    onSuccess: (instance) => {
      invalidate();
      setGenerateOpen(false);
      setGenRosterEventId("");
      toast.success("Service created");
      navigate(`/admin/order-of-service/${instance.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-display font-semibold flex items-center gap-2">
          <ListOrdered className="h-5 w-5" /> Order of Service
        </h2>
        <p className="text-sm text-muted-foreground">
          Build reusable templates and attach run-sheets to services from the master schedule.
        </p>
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">
            <CalendarDays className="h-4 w-4 mr-2" /> Upcoming Services
          </TabsTrigger>
          <TabsTrigger value="templates">
            <ListOrdered className="h-4 w-4 mr-2" /> Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setGenerateOpen(true)} disabled={!templates.length}>
              <CalendarPlus className="h-4 w-4 mr-1" /> Create run sheet
            </Button>
          </div>
          {loadingI ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : instances.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No run sheets yet. {templates.length === 0 && "Create a template first."}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-2">
              {instances.map((inst) => (
                <Card
                  key={inst.id}
                  className="cursor-pointer hover:bg-accent/30 transition"
                  onClick={() => navigate(`/admin/order-of-service/${inst.id}`)}
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
                      <Badge variant={inst.status === "published" ? "default" : "secondary"}>
                        {inst.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (confirm(`Delete "${inst.title}"? You can create a fresh run sheet from the template afterward.`)) {
                            deleteService.mutate(inst.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="templates" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setNewTplOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> New template
            </Button>
          </div>
          {loadingT ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : templates.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No templates yet. Create one to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-2">
              {templates.map((tpl) => (
                <Card key={tpl.id}>
                  <CardContent className="py-3 flex items-center justify-between gap-3">
                    <button
                      onClick={() => setEditingTemplate(tpl)}
                      className="text-left flex-1"
                    >
                      <p className="font-medium">{tpl.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {tpl.default_start_time?.slice(0, 5) || "no default time"}
                      </p>
                    </button>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditingTemplate(tpl)}>
                        Edit slots
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Delete "${tpl.name}"? Any services generated from it will keep their slots.`)) {
                            deleteTemplate.mutate(tpl.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* New template dialog */}
      <Dialog open={newTplOpen} onOpenChange={setNewTplOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New service template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={newTplName}
                onChange={(e) => setNewTplName(e.target.value)}
                placeholder="Sunday 10am Main Service"
              />
            </div>
            <div>
              <Label>Default start time</Label>
              <Input type="time" value={newTplTime} onChange={(e) => setNewTplTime(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTplOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createTemplate.mutate()}
              disabled={!newTplName.trim() || createTemplate.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template editor */}
      {editingTemplate && (
        <ServiceTemplateEditor
          template={editingTemplate}
          onClose={() => setEditingTemplate(null)}
        />
      )}

      {/* Generate service */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent>
          <DialogHeader>
          <DialogTitle>Create run sheet from master schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Template</Label>
              <Select value={genTemplateId} onValueChange={setGenTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Scheduled service</Label>
              <Select value={genRosterEventId} onValueChange={setGenRosterEventId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick an admin-created service" />
                </SelectTrigger>
                <SelectContent>
                  {availableRosterEvents.map((event: any) => (
                    <SelectItem key={event.id} value={event.id}>
                      {format(new Date(event.event_date + "T00:00:00"), "MMM d")} · {event.event_time?.slice(0, 5) || "No time"} · {event.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableRosterEvents.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {rosterEvents.length === 0
                    ? "Create services in Teams → Roster → Master Schedule first."
                    : "Every upcoming scheduled service already has a run sheet."}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => generate.mutate()}
              disabled={!genTemplateId || !genRosterEventId || generate.isPending}
            >
              Create run sheet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
